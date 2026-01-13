# OSML Models

This package provides a production-ready implementation of the **SAM3 (Segment Anything Model 3)** model for deployment on AWS SageMaker. SAM3 is a state-of-the-art vision model from Meta AI that performs text-prompted object detection and segmentation on geospatial imagery.

## Features

* **Text-Prompted Detection**: Use natural language prompts to detect and segment objects (e.g., "cars", "buildings", "aircraft")
* **GeoJSON Output**: Returns detections in GeoJSON format compatible with geospatial workflows
* **GPU Optimized**: Includes PyTorch optimizations (torch.compile, mixed precision) for fast inference
* **SageMaker Compatible**: Ready-to-deploy container with SageMaker endpoint support
* **Production Ready**: Includes CDK infrastructure for secure, scalable deployments on AWS

## Table of Contents

* [Quick Start](#quick-start)
* [Prerequisites](#prerequisites)
* [Installation](#installation)
* [Model Configuration](#model-configuration)
* [Local Development](#local-development)
* [CDK Deployment](#cdk-deployment)
* [API Reference](#api-reference)
* [Support & Feedback](#support--feedback)
* [Resources](#resources)
* [License](#license)

## Quick Start

### 1. Set Up Hugging Face Access

Before downloading the model checkpoint, you'll need a Hugging Face account and access to the SAM3 model:

**Create a Hugging Face Account** (if you don't have one):

1. Visit [Hugging Face](https://huggingface.co/) and click "Sign Up"
2. Create an account using your email or sign in with GitHub/Google
3. Verify your email address

**Request Access to SAM3 Model**:

1. Navigate to the [SAM3 model page](https://huggingface.co/facebook/sam3)
2. If the model is gated (requires access approval), click the **"Request Access"** button
3. Agree to share your contact information with Meta AI
4. Wait for approval (this may be automatic or require manual approval)
5. You'll receive a notification once access is granted

**Generate an Access Token** (for CLI downloads):

1. Go to your [Access Tokens settings](https://huggingface.co/settings/tokens)
2. Click **"New Token"**
3. Give it a name (e.g., "osml-models") and select **"Read"** role
4. Copy the token and store it securely
5. Authenticate the CLI: `hf auth login` (or set `HF_TOKEN` environment variable)

**Additional Resources**:

* [Hugging Face Sign Up](https://huggingface.co/join)
* [SAM3 Model Page](https://huggingface.co/facebook/sam3)
* [Access Tokens Documentation](https://huggingface.co/docs/hub/security-tokens)
* [Gated Models Documentation](https://huggingface.co/docs/hub/models-gated)

### 2. Download Model Checkpoint

SAM3 requires the model checkpoint file (~3GB) to be downloaded to the `assets/` directory:

```bash
# Create assets directory if it doesn't exist
mkdir -p assets

# Download checkpoint file from Hugging Face
# Option 1: Using hf CLI (recommended - works in conda environments)
# First authenticate: hf login (or set HF_TOKEN environment variable)
pip install huggingface-hub
hf download facebook/sam3 sam3.pt --local-dir ./assets

# Option 2: Using Python API (requires authentication token)
# Set HF_TOKEN environment variable or use huggingface-cli login
python -c "from huggingface_hub import hf_hub_download; import shutil; import os; token = os.environ.get('HF_TOKEN'); file = hf_hub_download(repo_id='facebook/sam3', filename='sam3.pt', token=token); shutil.copy(file, './assets/sam3.pt'); print('✓ Downloaded sam3.pt')"

# Option 3: Direct download using wget (may require authentication for gated models)
# For gated models, you'll need to include your token in the URL or use cookies
wget --header="Authorization: Bearer YOUR_HF_TOKEN" https://huggingface.co/facebook/sam3/resolve/main/sam3.pt -O ./assets/sam3.pt

# Option 4: Direct download using curl (macOS alternative)
curl -L -H "Authorization: Bearer YOUR_HF_TOKEN" https://huggingface.co/facebook/sam3/resolve/main/sam3.pt -o ./assets/sam3.pt
```

**Note**: The BPE vocabulary file (`bpe_simple_vocab_16e6.txt.gz`) is automatically downloaded during the Docker build process, so you don't need to download it manually. The checkpoint file (`sam3.pt`) must be downloaded before building the container.

**Authentication Note**: If you encounter authentication errors when downloading, make sure you've:

1. Created a Hugging Face account
2. Requested and received access to the SAM3 model
3. Authenticated using `hf login` or set the `HF_TOKEN` environment variable

### 3. Build the Container

```bash
docker build . -t osml-models:sam3 -f docker/Dockerfile.sam3
```

### 3. Run the Container

```bash
docker run -p 8080:8080 \
  -v $(pwd)/assets/sam3.pt:/opt/checkpoint/sam3.pt \
  -e DEFAULT_TEXT_PROMPT="objects" \
  -e CONFIDENCE_THRESHOLD=0.6 \
  --gpus all \
  osml-models:sam3
```

### 4. Test the Endpoint

```bash
# Health check
curl http://localhost:8080/ping

# Run inference
curl --request POST \
  --data-binary "@path/to/your/image.tiff" \
  http://localhost:8080/invocations
```

## Prerequisites

* **Docker** with GPU support (for local testing)
* **NVIDIA GPU** with CUDA 12.6+ support (recommended)
* **Python 3.12+** (for local development)
* **AWS Account** (for CDK deployment)
* **SAM3 Checkpoint File** (~3GB) - Download from [Hugging Face](https://huggingface.co/facebook/sam3) (see [Quick Start](#quick-start) for instructions)

## Installation

### Clone the Repository

```bash
git clone https://github.com/awslabs/osml-models.git
cd osml-models
```

### Install Python Dependencies

For local development:

```bash
pip install .
```

This will install all required dependencies including SAM3, OpenCV, and Pillow.

## Model Configuration

The SAM3 model can be configured via environment variables:

### Required Configuration

| Variable          | Description                  | Example                   |
| ----------------- | ---------------------------- | ------------------------- |
| `CHECKPOINT_PATH` | Path to SAM3 checkpoint file | `/opt/checkpoint/sam3.pt` |

**Note**: The checkpoint file **must** be provided before the container starts. The container will fail to start if the checkpoint is not found at the specified path.

### Optional Configuration

|Variable|Default|Description|
|---|---|---|
|`DEFAULT_TEXT_PROMPT`|`"objects"`|Default text prompt for detection|
|`CONFIDENCE_THRESHOLD`|`0.6`|Minimum confidence score for detections (0.0-1.0)|
|`ENABLE_TORCH_COMPILE`|`true` (GPU) / `false` (CPU)|Enable PyTorch compilation for faster inference|
|`MIXED_PRECISION`|`bf16` (GPU) / `fp32` (CPU)|Precision mode: `fp16`, `bf16`, or `fp32`|
|`TORCH_COMPILE_MODE`|`reduce-overhead`|Compilation mode: `reduce-overhead`, `max-autotune`, or `default`|
|`PREWARM_GPU`|`true` (GPU) / `false` (CPU)|Run dummy inference to warm up GPU|

### Text Prompts

Text prompts can be provided in two ways:

1. **Via Request Header** (per-request):

   ```bash
   curl --request POST \
     --header "X-Amzn-SageMaker-Custom-Attributes: text_prompt=cars" \
     --data-binary "@image.tiff" \
     http://localhost:8080/invocations
   ```

2. **Via Environment Variable** (default for all requests):

   ```bash
   docker run -e DEFAULT_TEXT_PROMPT="buildings" ...
   ```

## Local Development

### Building the Container

**Prerequisites**: Before building, ensure you have downloaded the model checkpoint file to the `assets/` directory (see [Quick Start](#quick-start) for download instructions):

* `assets/sam3.pt` - Model checkpoint file (~3GB)

**Note**: The BPE vocabulary file is automatically downloaded during the Docker build process, so you don't need to download it manually.

```bash
# Basic build
docker build . -t osml-models:sam3 -f docker/Dockerfile.sam3

# Build with custom Python version
docker build . -t osml-models:sam3 \
  -f docker/Dockerfile.sam3 \
  --build-arg PYTHON_VERSION=3.12
```

**Note**: The Docker build will fail if the checkpoint file (`sam3.pt`) is not present in the `assets/` directory. The BPE vocabulary file is automatically downloaded during the build process.

### Running Locally

**With GPU Support** (recommended):

```bash
docker run -p 8080:8080 \
  -v $(pwd)/assets/sam3.pt:/opt/checkpoint/sam3.pt \
  -e DEFAULT_TEXT_PROMPT="objects" \
  -e CONFIDENCE_THRESHOLD=0.6 \
  --gpus all \
  osml-models:sam3
```

**CPU Only** (slower, for testing):

```bash
docker run -p 8080:8080 \
  -v $(pwd)/assets/sam3.pt:/opt/checkpoint/sam3.pt \
  -e DEFAULT_TEXT_PROMPT="objects" \
  -e ENABLE_TORCH_COMPILE=false \
  -e MIXED_PRECISION=fp32 \
  osml-models:sam3
```

### Providing the Checkpoint File

The checkpoint file must be available at `/opt/checkpoint/sam3.pt` inside the container. If you've downloaded it to the `assets/` directory as instructed, you can provide it in several ways:

1. **Volume Mount** (recommended for local development):

   ```bash
   -v $(pwd)/assets/sam3.pt:/opt/checkpoint/sam3.pt
   ```

2. **Copy into Container**:

   ```bash
   docker cp assets/sam3.pt <container_id>:/opt/checkpoint/sam3.pt
   ```

3. **For SageMaker**: Upload to S3 and mount as a volume or copy during container startup

### Testing the Endpoint

```bash
# Health check
curl http://localhost:8080/ping

# Run inference with default prompt
curl --request POST \
  --data-binary "@test_image.tiff" \
  http://localhost:8080/invocations

# Run inference with custom prompt
curl --request POST \
  --header "X-Amzn-SageMaker-Custom-Attributes: text_prompt=aircraft" \
  --data-binary "@test_image.tiff" \
  http://localhost:8080/invocations
```

### Expected Response Format

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[x1, y1], [x2, y2], ...]]
      },
      "properties": {
        "imageBBox": [x_min, y_min, x_max, y_max],
        "featureClasses": [{"iri": "objects", "score": 0.95}],
        "modelMetadata": {
          "modelName": "sam3",
          "ontologyName": "objects",
          "ontologyVersion": "1.0.0"
        }
      }
    }
  ]
}
```

## CDK Deployment

For production deployments on AWS, this project includes AWS CDK infrastructure code that deploys the SAM3 model as a SageMaker endpoint with proper networking, security, and monitoring.

### CDK Quick Start

```bash
cd cdk
npm install
cp bin/deployment/deployment.json.example bin/deployment/deployment.json
# Edit deployment.json with your AWS account details
npm run build
npm test
cdk deploy --all
```

### What Gets Deployed

The CDK application deploys:

* **SageMaker Endpoint**: Real-time inference endpoint for the SAM3 model
* **VPC and Networking**: Secure network configuration with private subnets
* **IAM Roles**: Least-privilege execution roles for SageMaker
* **Security Groups**: Network security rules for endpoint access
* **Container Management**: Automated container build and deployment to ECR

### Key Features

* **Flexible Configuration**: Deploy with existing VPC or create new infrastructure
* **Security Validation**: Integrated CDK-Nag checks for AWS best practices
* **Build Options**: Build container from source or pull from registry
* **GPU Support**: Configured for GPU instances (ml.g4dn.xlarge or ml.g5.xlarge) for optimal performance
* **Infrastructure as Code**: Version-controlled, repeatable deployments

### CDK Documentation

For detailed deployment instructions, configuration options, and troubleshooting, see the [CDK README](cdk/README.md).

Key topics covered:

* [Configuration Options](cdk/README.md#configuration) - Account, network, and model endpoint settings
* [Deployment Instructions](cdk/README.md#deployment-instructions) - Step-by-step deployment guide
* [Security Best Practices](cdk/README.md#security--best-practices) - IAM, networking, and compliance
* [Troubleshooting](cdk/README.md#troubleshooting) - Common issues and solutions

### Integration Testing

The OSML Models package includes comprehensive integration testing infrastructure that validates the deployed SageMaker endpoint.

For detailed information on configuring integration test infrastructure, see the [Integration Testing section](cdk/README.md#integration-testing) in the CDK Deployment Guide.

Running the integration tests:

1. Deploy the infrastructure with integration tests enabled (see [CDK Deployment Guide](cdk/README.md))
2. Run the integration test script: `bash scripts/model_endpoint_integ.sh`
3. Review test results and logs

## API Reference

### Endpoints

#### `GET /ping`

Health check endpoint. Returns HTTP 200 if the service is healthy.

**Response**: Empty body with HTTP 200 status

#### `POST /invocations`

Model inference endpoint. Accepts image data and returns GeoJSON detections.

**Request**:

* **Body**: Binary image data (TIFF, JPEG, PNG supported)
* **Content-Type**: `image/tiff`, `image/jpeg`, or `image/png`
* **Headers** (optional): `X-Amzn-SageMaker-Custom-Attributes: text_prompt=your prompt`

**Response**: GeoJSON FeatureCollection

**Example**:

```bash
curl --request POST \
  --header "Content-Type: image/tiff" \
  --header "X-Amzn-SageMaker-Custom-Attributes: text_prompt=cars" \
  --data-binary "@image.tiff" \
  http://localhost:8080/invocations
```

### Custom Attributes

Custom attributes can be passed via the `X-Amzn-SageMaker-Custom-Attributes` header:

* `text_prompt=<prompt>`: Override the default text prompt for this request
  * Example: `text_prompt=cars` or `text_prompt=detect%20buildings` (URL encoded)
* `mock_latency_mean=<ms>`: Simulate latency (for testing)
* `mock_latency_std=<ms>`: Standard deviation for latency simulation

## Documentation

You can generate API documentation using Sphinx:

```bash
tox -e docs
```

Once generated, open the documentation in your browser:

```text
file://[full path to osml-models repository root]/.tox/docs/tmp/html/index.html
```

## Support & Feedback

To post feedback, submit feature ideas, or report bugs, please use the [Issues](https://github.com/aws-labs/osml-models/issues) section of this GitHub repo.

If you are interested in contributing to OversightML Model Runner, see the [CONTRIBUTING](CONTRIBUTING.md) guide.

## Resources

* [SAM3 Model Repository](https://github.com/facebookresearch/sam3) - Official SAM3 implementation
* [SAM3 on Hugging Face](https://huggingface.co/facebook/sam3) - Model checkpoint and documentation
* [OSML Documentation](https://github.com/awslabs/osml) - OversightML project documentation

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information on security issue reporting.

## License

This library is licensed under the Apache 2.0 License. See [LICENSE](LICENSE).
