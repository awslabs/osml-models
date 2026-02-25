#  Copyright 2023-2026 Amazon.com, Inc. or its affiliates.

import os
from concurrent.futures import ThreadPoolExecutor
from secrets import token_hex
from typing import Dict, List, Optional

import cv2
import numpy as np
import orjson
import torch
from flask import Response, request
from osgeo import gdal
from PIL import Image

from aws.osml.models import (
    build_flask_app,
    build_logger,
    detect_to_feature,
    parse_custom_attributes,
    setup_server,
    simulate_model_latency,
)

# SAM3 model imports - these require the sam3 package to be installed
try:
    from sam3.model.sam3_image_processor import Sam3Processor
    from sam3.model_builder import build_sam3_image_model
except ImportError as e:
    raise ImportError(
        "SAM3 model dependencies not found. Please install the sam3 package. "
        "See https://github.com/facebookresearch/sam3 for installation instructions."
    ) from e

# Enable exceptions for GDAL
gdal.UseExceptions()

# Create logger instance
logger = build_logger()

# Create our default flask app
app = build_flask_app(logger)

# Optional ENV configurations
CONFIDENCE_THRESHOLD = float(os.environ.get("CONFIDENCE_THRESHOLD", "0.1"))
TEXT_PROMPT = os.environ.get("DEFAULT_TEXT_PROMPT", "objects")
MODEL_NAME = os.environ.get("MODEL_NAME", "sam3")
ONTOLOGY_VERSION = os.environ.get("ONTOLOGY_VERSION", "1.0.0")
CHECKPOINT_PATH = os.environ.get("CHECKPOINT_PATH", None)
if not CHECKPOINT_PATH:
    raise ValueError(
        "CHECKPOINT_PATH environment variable is required. "
        "Please provide the path to the SAM3 checkpoint file (e.g., /opt/checkpoint/sam3.pt). "
        "The checkpoint file must be provided before deployment."
    )
# Enable torch.compile by default for GPU instances (can be disabled with ENABLE_TORCH_COMPILE=false)
ENABLE_TORCH_COMPILE = (
    os.environ.get("ENABLE_TORCH_COMPILE", "true" if torch.cuda.is_available() else "false").lower() == "true"
)
# Mixed precision: "fp16", "bf16", or "fp32" (default: "bf16" for A100/H100, "fp16" for others, "fp32" to disable)
MIXED_PRECISION = os.environ.get("MIXED_PRECISION", "bf16" if torch.cuda.is_available() else "fp32").lower()
# GPU pre-warming: enable with PREWARM_GPU=true (default: true for GPU instances)
PREWARM_GPU = os.environ.get("PREWARM_GPU", "true" if torch.cuda.is_available() else "false").lower() == "true"
# Torch compile mode: "reduce-overhead" (default, faster), "max-autotune" (slower compile, fastest runtime), or "default"
TORCH_COMPILE_MODE = os.environ.get("TORCH_COMPILE_MODE", "reduce-overhead")
# Number of worker threads for parallel mask-to-polygon conversion (default: number of CPU cores, min 1, max 8)
try:
    import multiprocessing

    MAX_WORKERS = min(max(int(os.environ.get("MASK_POLYGON_WORKERS", multiprocessing.cpu_count())), 1), 8)
except (ImportError, ValueError):
    MAX_WORKERS = 4

# Pre-computed format strings for common log messages (reduces string operations during inference)
LOG_FMT_UNEXPECTED_4D_MASK = "Unexpected 4D mask shape: {}, expected (N, 1, H, W)"
LOG_FMT_UNEXPECTED_MASK_SHAPE = "Unexpected mask shape: {}, expected (N, H, W) or (N, 1, H, W)"
LOG_FMT_MASK_NORMALIZATION_FAILED = "Mask normalization failed: expected 3D tensor, got shape {}"
LOG_FMT_SHAPE_MISMATCH = "Shape mismatch: non_empty_mask has {} elements, expected {}"
LOG_FMT_GPU_FILTERING_FAILED = "GPU filtering failed: {}. Masks shape: {}, num_detections: {}"
RESPONSE_FMT_UNSUPPORTED_BANDS = "Unsupported number of bands: {}"
RESPONSE_FMT_PROCESSING_ERROR = "Unable to process request: {}"
# Pre-computed format strings for ValueError messages
VALUE_ERROR_FMT_CANNOT_PROCESS_MASKS = "Cannot process masks with shape {}"
VALUE_ERROR_FMT_MASK_NORMALIZATION_FAILED = "Mask shape normalization failed: {}"
VALUE_ERROR_FMT_BOOLEAN_MASK_MISMATCH = "Boolean mask shape mismatch: {} vs expected ({},)"

# Detect the device to use for inference
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# Log GPU information
if torch.cuda.is_available():
    app.logger.warning("CUDA is available - GPU acceleration enabled")
    app.logger.warning(f"CUDA version: {torch.version.cuda}, PyTorch version: {torch.__version__}")
    app.logger.warning(f"Number of CUDA devices: {torch.cuda.device_count()}")
    for i in range(torch.cuda.device_count()):
        gpu_memory = torch.cuda.get_device_properties(i).total_memory / 1024**3
        app.logger.warning(f"CUDA device {i}: {torch.cuda.get_device_name(i)} ({gpu_memory:.2f} GB)")
    app.logger.warning(f"Using CUDA device: {torch.cuda.current_device()}")
else:
    app.logger.warning("GPU NOT FOUND - Running in CPU mode (significantly slower)")

# Initialize SAM3 model and processor (loaded once at startup)
app.logger.warning(f"Loading SAM3 model on device: {DEVICE}")

# Find BPE vocabulary file
BPE_PATH = None
possible_bpe_paths = [
    "/opt/conda/envs/osml_model_sam3/lib/python3.12/site-packages/assets/bpe_simple_vocab_16e6.txt.gz",
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "..", "assets", "bpe_simple_vocab_16e6.txt.gz"),
]
for path in possible_bpe_paths:
    if os.path.exists(path):
        BPE_PATH = path
        app.logger.warning(f"Found BPE vocabulary at: {BPE_PATH}")
        break

if not BPE_PATH:
    app.logger.warning("BPE vocabulary file not found in expected locations, SAM3 will try to use default path")

app.logger.warning(f"Using checkpoint: {CHECKPOINT_PATH}")
if BPE_PATH:
    model = build_sam3_image_model(device=DEVICE, checkpoint_path=CHECKPOINT_PATH, load_from_HF=False, bpe_path=BPE_PATH)
else:
    model = build_sam3_image_model(device=DEVICE, checkpoint_path=CHECKPOINT_PATH, load_from_HF=False)
model = model.to(DEVICE)

# Set model to evaluation mode for inference (disables dropout, batch norm updates, etc.)
model.eval()

# Enable PyTorch optimizations for faster inference
if DEVICE == "cuda":
    # Enable cuDNN benchmarking for consistent input sizes (faster convolutions)
    torch.backends.cudnn.benchmark = True
    # Enable TensorFloat-32 (TF32) for faster matrix operations on Ampere+ GPUs
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True
    app.logger.warning("CUDA optimizations enabled: cuDNN benchmark mode, TF32 enabled")

# Compile model for PyTorch 2.0+ (can provide 20-30% speedup)
if ENABLE_TORCH_COMPILE:
    try:
        if hasattr(torch, "compile") and DEVICE == "cuda":
            app.logger.warning(f"Compiling model with torch.compile() (mode={TORCH_COMPILE_MODE}) for optimization...")
            model = torch.compile(model, mode=TORCH_COMPILE_MODE)
            app.logger.warning("Model compiled successfully with torch.compile()")
        elif DEVICE == "cpu":
            app.logger.warning("torch.compile() is typically only beneficial for GPU inference. Skipping compilation.")
        else:
            app.logger.warning("torch.compile() not available in this PyTorch version. Skipping compilation.")
    except Exception as e:
        app.logger.warning(f"torch.compile() failed: {e}. Continuing without compilation.")

# Enable mixed precision inference for faster GPU inference (FP16/BF16)
if DEVICE == "cuda" and MIXED_PRECISION in ["fp16", "bf16"]:
    try:
        if MIXED_PRECISION == "bf16":
            # BF16 is preferred on A100/H100 GPUs (better numerical stability)
            if torch.cuda.is_bf16_supported():
                app.logger.warning("Mixed precision enabled: BF16 (bfloat16) via torch.autocast")
            else:
                app.logger.warning("BF16 not supported on this GPU, falling back to FP16")
                MIXED_PRECISION = "fp16"
        else:  # fp16
            app.logger.warning("Mixed precision enabled: FP16 (float16) via torch.autocast")
    except Exception as e:
        app.logger.warning(f"Mixed precision setup failed: {e}. Continuing with FP32.")
        MIXED_PRECISION = "fp32"

processor = Sam3Processor(model, device=DEVICE, confidence_threshold=CONFIDENCE_THRESHOLD)

# Verify model is on the expected device
actual_device = next(model.parameters()).device
actual_device_str = str(actual_device)
expected_device_normalized = DEVICE if DEVICE == "cpu" else "cuda"
actual_device_normalized = actual_device_str if actual_device_str == "cpu" else "cuda"

if actual_device_normalized != expected_device_normalized:
    app.logger.warning(f"Model device mismatch! Expected {DEVICE}, but model is on {actual_device_str}")
else:
    app.logger.warning(f"Model successfully loaded on device: {actual_device_str}")

app.logger.warning("SAM3 model loaded successfully")

# GPU pre-warming: Run a dummy inference to initialize CUDA kernels
if PREWARM_GPU and DEVICE == "cuda":
    try:
        app.logger.warning("Pre-warming GPU with dummy inference...")
        # Create a small dummy image (224x224 RGB)
        dummy_image = Image.new("RGB", (224, 224), color=(128, 128, 128))
        with torch.inference_mode():
            if MIXED_PRECISION in ["fp16", "bf16"]:
                dtype = torch.bfloat16 if MIXED_PRECISION == "bf16" else torch.float16
                with torch.autocast(device_type="cuda", dtype=dtype, enabled=True):
                    dummy_state = processor.set_image(dummy_image)
                    dummy_output = processor.set_text_prompt("objects", dummy_state)
            else:
                dummy_state = processor.set_image(dummy_image)
                dummy_output = processor.set_text_prompt("objects", dummy_state)
        torch.cuda.empty_cache()
        app.logger.warning("GPU pre-warming completed successfully")
    except Exception as e:
        app.logger.warning(f"GPU pre-warming failed: {e}. Continuing without pre-warming.")


def process_gdal_image_to_rgb(gdal_dataset: gdal.Dataset) -> np.ndarray:
    """
    Process a GDAL dataset into a uint8 RGB numpy array suitable for PIL Image.
    Handles different band counts, data types, value ranges, and NoData values.

    This function is more generic than the original implementation and handles:
    - Different band counts (1, 3, 4+ bands)
    - Different data types (uint8, uint16, float32, float64)
    - Different value ranges (0-255, 0-65535, normalized 0-1, etc.)
    - NoData values (masks them to black/0)

    :param gdal_dataset: GDAL dataset object
    :return: uint8 numpy array with shape (height, width, 3) in RGB format
    """
    num_bands = gdal_dataset.RasterCount

    # Read all bands as array (shape: (bands, height, width) or (height, width) for single band)
    all_bands = gdal_dataset.ReadAsArray()

    # Handle 2D array (single band grayscale)
    if all_bands.ndim == 2:
        all_bands = all_bands[np.newaxis, :, :]  # Add channel dimension: (1, H, W)

    # Ensure we have at least 3 channels for RGB
    if num_bands >= 3:
        # Take first 3 bands (RGB)
        image_array = all_bands[:3, :, :]
    elif num_bands == 1:
        # Replicate single band to RGB
        image_array = np.repeat(all_bands, 3, axis=0)
    else:
        raise ValueError(f"Unsupported number of bands: {num_bands}")

    # Handle NoData values - mask them to 0
    # Check each band for NoData value and mask accordingly
    for band_idx in range(min(3, num_bands)):
        band_num = band_idx + 1
        band = gdal_dataset.GetRasterBand(band_num)
        nodata_value = band.GetNoDataValue()

        if nodata_value is not None:
            # Mask NoData pixels to 0 for this band
            # Use appropriate comparison based on data type
            band_data = image_array[band_idx, :, :]
            if np.issubdtype(band_data.dtype, np.floating):
                # For float types, use np.isclose for comparison
                nodata_mask = np.isclose(band_data, nodata_value, rtol=1e-5, atol=1e-8)
            else:
                # For integer types, use exact equality
                nodata_mask = band_data == nodata_value
            image_array[band_idx, nodata_mask] = 0

    # Determine data type and normalize/scale to uint8 (0-255)
    dtype = image_array.dtype

    if dtype == np.uint8:
        # Already in correct range, just ensure contiguous
        image_array = np.ascontiguousarray(image_array, dtype=np.uint8)
    elif dtype in [np.uint16, np.int16]:
        # Scale from 0-65535 (or -32768 to 32767) to 0-255
        if dtype == np.int16:
            # Handle signed int16: shift to 0-65535 range first
            image_array = image_array.astype(np.float32) - np.iinfo(np.int16).min
        # Normalize to 0-1 then scale to 0-255
        max_val = np.iinfo(dtype).max
        image_array = (image_array.astype(np.float32) / max_val * 255).clip(0, 255).astype(np.uint8)
    elif dtype in [np.float32, np.float64]:
        # Check if data is normalized (0-1 range) or raw values
        max_val = image_array.max()
        min_val = image_array.min()

        if max_val <= 1.0 and min_val >= 0.0:
            # Normalized data (0-1 range) - scale to 0-255
            image_array = (image_array * 255).clip(0, 255).astype(np.uint8)
        elif max_val <= 255.0 and min_val >= 0.0:
            # Already in 0-255 range but float - just cast
            image_array = image_array.clip(0, 255).astype(np.uint8)
        else:
            # Raw float values - normalize to 0-1 then scale to 0-255
            # Use per-band normalization to preserve relative intensities
            for band_idx in range(3):
                band_data = image_array[band_idx, :, :]
                band_min = band_data.min()
                band_max = band_data.max()
                if band_max > band_min:
                    # Normalize this band
                    image_array[band_idx, :, :] = ((band_data - band_min) / (band_max - band_min) * 255).clip(0, 255)
                else:
                    # Constant band
                    image_array[band_idx, :, :] = 0
            image_array = image_array.astype(np.uint8)
    else:
        # Unknown type - try to cast to uint8 (may cause issues)
        app.logger.warning(f"Unknown data type {dtype}, attempting direct cast to uint8")
        image_array = np.ascontiguousarray(image_array, dtype=np.uint8)

    # Transpose from (channels, height, width) to (height, width, channels) for PIL
    image_array = np.transpose(image_array, (1, 2, 0))

    # Ensure C-contiguous for PIL
    if not image_array.flags["C_CONTIGUOUS"]:
        image_array = np.ascontiguousarray(image_array)

    return image_array


def mask_to_polygon(mask: np.ndarray) -> Optional[List[List[float]]]:
    """
    Convert a binary mask to polygon coordinates using OpenCV.

    :param mask: Binary mask array (H, W) with values 0 or 1, or boolean
    :return: List of polygon coordinates [[x1, y1], [x2, y2], ...] or None if no contours found
    """
    # Normalize mask shape
    if mask.ndim > 2:
        mask = mask.squeeze()
    if mask.ndim != 2 or mask.sum() == 0:
        return None

    mask_uint8 = (mask.astype(np.uint8) * 255) if mask.dtype == bool else mask.astype(np.uint8)
    contours, _ = cv2.findContours(mask_uint8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    largest_contour = max(contours, key=cv2.contourArea)

    if len(largest_contour) <= 3:
        return None

    polygon = (largest_contour.reshape(-1, 2) + 0.5).astype(np.float32).tolist()
    if len(polygon) >= 3 and polygon[0] != polygon[-1]:
        polygon.append(polygon[0])

    return polygon if len(polygon) >= 3 else None


def sam3_outputs_to_geojson(
    masks: torch.Tensor, boxes: torch.Tensor, scores: torch.Tensor, detection_type: str = "object"
) -> Dict:
    """
    Convert SAM3 model outputs to GeoJSON FeatureCollection format.

    :param masks: Boolean masks tensor (N, H, W) or (N, 1, H, W) - will be normalized to (N, H, W)
    :param boxes: Bounding boxes tensor (N, 4) in [x0, y0, x1, y1] format
    :param scores: Confidence scores tensor (N,)
    :param detection_type: Class name for detections
    :return: GeoJSON FeatureCollection dictionary
    """
    features = []

    num_detections = len(scores)

    # Handle masks tensor shape: SAM3 may return (N, 1, H, W) or (N, H, W)
    if masks.ndim == 4:
        if masks.shape[1] == 1:
            masks = masks.squeeze(1)
        else:
            app.logger.warning(LOG_FMT_UNEXPECTED_4D_MASK.format(masks.shape))
            # Try to handle: if last two dims are spatial, squeeze middle dims
            if masks.shape[-2] == masks.shape[-1]:
                masks = masks[:, 0, :, :]
    elif masks.ndim == 2:
        masks = masks.unsqueeze(0)
    elif masks.ndim != 3:
        app.logger.error(LOG_FMT_UNEXPECTED_MASK_SHAPE.format(masks.shape))
        raise ValueError(VALUE_ERROR_FMT_CANNOT_PROCESS_MASKS.format(masks.shape))

    # Verify masks is now 3D: (N, H, W)
    if masks.ndim != 3:
        app.logger.error(LOG_FMT_MASK_NORMALIZATION_FAILED.format(masks.shape))
        raise ValueError(VALUE_ERROR_FMT_MASK_NORMALIZATION_FAILED.format(masks.shape))

    # Filter empty masks on GPU before CPU transfer
    if DEVICE == "cuda" and num_detections > 0:
        try:
            mask_sums = masks.sum(dim=(1, 2))
            non_empty_mask = mask_sums > 0

            if non_empty_mask.shape[0] != num_detections:
                app.logger.error(LOG_FMT_SHAPE_MISMATCH.format(non_empty_mask.shape[0], num_detections))
                raise ValueError(VALUE_ERROR_FMT_BOOLEAN_MASK_MISMATCH.format(non_empty_mask.shape, num_detections))

            if non_empty_mask.any():
                masks = masks[non_empty_mask]
                boxes = boxes[non_empty_mask]
                scores = scores[non_empty_mask]
                num_detections = len(scores)
            else:
                num_detections = 0

            if num_detections == 0:
                return {"type": "FeatureCollection", "features": []}
        except Exception as e:
            app.logger.error(LOG_FMT_GPU_FILTERING_FAILED.format(e, masks.shape, num_detections))
            app.logger.warning("Falling back to CPU processing due to GPU filtering error")

    # Batch transfer all tensors to CPU for processing
    if DEVICE == "cuda":
        torch.cuda.synchronize()

    # Transfer all tensors to CPU (tuple unpacking groups the operations)
    boxes_cpu, scores_cpu, masks_cpu = boxes.cpu(), scores.cpu(), masks.cpu()

    # Convert to Python/numpy formats after transfer (avoids multiple GPU-CPU syncs)
    scores_list = scores_cpu.tolist()
    boxes_list = boxes_cpu.tolist()
    masks_numpy = masks_cpu.numpy()

    # Parallelize mask-to-polygon conversion for better CPU utilization
    if num_detections > 2:
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            polygons = list(executor.map(mask_to_polygon, masks_numpy))
    else:
        polygons = [mask_to_polygon(masks_numpy[i]) for i in range(num_detections)]

    # Build features from the converted polygons
    for i in range(num_detections):
        bbox = boxes_list[i]
        score = scores_list[i]
        polygon = polygons[i]

        feature = detect_to_feature(
            fixed_object_bbox=bbox, fixed_object_mask=polygon, detection_score=score, detection_type=detection_type
        )
        feature["properties"]["modelMetadata"] = {
            "modelName": MODEL_NAME,
            "ontologyName": TEXT_PROMPT,
            "ontologyVersion": ONTOLOGY_VERSION,
        }

        features.append(feature)

    return {"type": "FeatureCollection", "features": features}


@app.route("/ping", methods=["GET"])
def healthcheck() -> Response:
    """
    Health check endpoint for SageMaker.

    :return: Response: Status code (200) indicates all is well
    """
    app.logger.debug("Responding to health check")
    return Response(response="\n", status=200)


@app.route("/invocations", methods=["POST"])
def predict() -> Response:
    """
    Model invocation endpoint for the model container's REST API.
    The binary payload (image) is taken from the request, parsed, and
    processed by SAM3 to return detections in GeoJSON format.

    Text prompt can be provided via:
    - CustomAttributes header: "text_prompt=your prompt here" or "text_prompt=detect%20cars"
      (URL encoding is supported for spaces and special characters)
    - Defaults to DEFAULT_TEXT_PROMPT env variable or "objects"

    Example SageMaker invoke_endpoint call:
        sm_runtime.invoke_endpoint(
            EndpointName='your-endpoint',
            Body=image_data,
            ContentType='image/jpeg',
            CustomAttributes='text_prompt=cars'
        )

    :return: Response: Contains the GeoJSON results or an error status
    """
    # Simulate model latency if custom attributes are provided
    simulate_model_latency()

    # Parse custom attributes to get text prompt
    custom_attrs = parse_custom_attributes()
    text_prompt = custom_attrs.get("text_prompt", TEXT_PROMPT)

    temp_ds_name = "/vsimem/" + token_hex(16)
    gdal_dataset = None
    try:
        # Load the image from the request memory buffer
        image_data = request.get_data()
        gdal.FileFromMemBuffer(temp_ds_name, image_data)

        try:
            gdal_dataset = gdal.Open(temp_ds_name)
        except RuntimeError:
            app.logger.warning("Unable to parse image from request using GDAL")
            return Response(response="Unable to parse image from request!", status=400)

        # Read image data using GDAL and convert to PIL Image
        # Use generic band processing function that handles NoData, data types, and value ranges
        try:
            image_array = process_gdal_image_to_rgb(gdal_dataset)
        except ValueError as e:
            app.logger.warning(f"Band processing error: {e}")
            return Response(response=str(e), status=400)

        pil_image = Image.fromarray(image_array, mode="RGB")

        # Run SAM3 inference
        with torch.inference_mode():
            if DEVICE == "cuda" and MIXED_PRECISION in ["fp16", "bf16"]:
                dtype = torch.bfloat16 if MIXED_PRECISION == "bf16" else torch.float16
                with torch.autocast(device_type="cuda", dtype=dtype, enabled=True):
                    inference_state = processor.set_image(pil_image)
                    output = processor.set_text_prompt(text_prompt, inference_state)
            else:
                inference_state = processor.set_image(pil_image)
                output = processor.set_text_prompt(text_prompt, inference_state)

        # Extract outputs
        masks = output["masks"]
        boxes = output["boxes"]
        scores = output["scores"]

        # Convert to GeoJSON
        geojson_feature_collection = sam3_outputs_to_geojson(masks, boxes, scores, detection_type=text_prompt)

        return Response(
            response=orjson.dumps(geojson_feature_collection).decode("utf-8"), status=200, mimetype="application/json"
        )

    except Exception as err:
        app.logger.warning("Image could not be processed by the SAM3 model server.", exc_info=True)
        app.logger.warning(str(err))
        return Response(response=RESPONSE_FMT_PROCESSING_ERROR.format(str(err)), status=500)
    finally:
        if gdal_dataset is not None:
            if temp_ds_name is not None:
                gdal.Unlink(temp_ds_name)
            del gdal_dataset


# pragma: no cover
if __name__ == "__main__":
    setup_server(app)
