#  Copyright 2025 Amazon.com, Inc. or its affiliates.

import os


class ModelEndpointIntegTestConfig:
    def __init__(self, s3_bucket: str, s3_key: str):
        # SageMaker Endpoint
        self.endpoint_name = os.getenv("ENDPOINT_NAME")
        if not self.endpoint_name:
            raise ValueError("ENDPOINT_NAME environment variable must be set")

        # S3
        self.test_bucket = s3_bucket
        self.test_object_key = s3_key

        # Expected test results
        self.expected_feature_type = "FeatureCollection"
        self.min_expected_features = 1  # We expect at least 1 aircraft detection in 2_planes.tiff
