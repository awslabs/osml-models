#  Copyright 2025 Amazon.com, Inc. or its affiliates.

"""Detectron2 configuration module for building detection on high-resolution drone imagery.

This configuration uses the ResNet-101_DC backbone for improved receptive field and spatial detail,
with performance optimizations for AWS p3.2xlarge or similar environments.
"""

from detectron2 import model_zoo
from detectron2.config import get_cfg


def build_config():
    """Set up Detectron2 config optimized for 2048×2048 tile inputs using R_101_DC5 backbone.

    Returns:
        Configured Detectron2 config object
    """
    # -----------------------------
    # Config: Faster R-CNN R101-DC5 (better for small objects than FPN R50)
    # -----------------------------
    cfg = get_cfg()
    cfg.merge_from_file(model_zoo.get_config_file("COCO-Detection/faster_rcnn_R_50_FPN_3x.yaml"))
    cfg.DATASETS.TRAIN = "ships_sar"
    cfg.DATASETS.TEST = ()
    cfg.DATALOADER.NUM_WORKERS = 2
    cfg.MODEL.WEIGHTS = model_zoo.get_checkpoint_url("COCO-Detection/faster_rcnn_R_50_FPN_3x.yaml")
    cfg.SOLVER.IMS_PER_BATCH = 10
    cfg.SOLVER.BASE_LR = 0.00025
    cfg.SOLVER.MAX_ITER = 1000
    cfg.SOLVER.STEPS = []
    cfg.MODEL.ROI_HEADS.BATCH_SIZE_PER_IMAGE = 512  # faster, and good enough for this dataset (default: 512)
    cfg.MODEL.ROI_HEADS.NUM_CLASSES = 1
    cfg.MODEL.ROI_HEADS.SCORE_THRESH_TEST = 0.75

    return cfg
