# Copyright 2026 Amazon.com, Inc. or its affiliates.

"""Integration tests for the OSML Models SageMaker endpoint."""

import json
import os

import boto3
import pytest


@pytest.fixture(scope="module")
def sagemaker_client():
    """Create a SageMaker Runtime client."""
    return boto3.client("sagemaker-runtime", region_name=os.environ.get("AWS_REGION", "us-west-2"))


@pytest.fixture(scope="module")
def endpoint_name():
    """Resolve the SageMaker endpoint name from SSM parameter."""
    ssm_param = os.environ.get("ENDPOINT_SSM_PARAM")
    assert ssm_param, "ENDPOINT_SSM_PARAM environment variable must be set"

    ssm = boto3.client("ssm", region_name=os.environ.get("AWS_REGION", "us-west-2"))
    response = ssm.get_parameter(Name=ssm_param)
    name = response["Parameter"]["Value"]
    assert name, f"SSM parameter {ssm_param} returned empty value"
    return name


@pytest.fixture(scope="module")
def s3_client():
    """Create an S3 client."""
    return boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-west-2"))


@pytest.fixture(scope="module")
def test_image_bytes(s3_client):
    """Download the test image from S3 and return its bytes."""
    account_id = boto3.client("sts").get_caller_identity()["Account"]
    bucket_name = f"osml-models-test-imagery-{account_id}"

    response = s3_client.list_objects_v2(Bucket=bucket_name, MaxKeys=1)
    assert "Contents" in response and len(response["Contents"]) > 0, f"No test images found in {bucket_name}"

    key = response["Contents"][0]["Key"]
    obj = s3_client.get_object(Bucket=bucket_name, Key=key)
    return obj["Body"].read()


class TestModelEndpoint:
    """Integration tests for the SAM3 SageMaker endpoint."""

    def test_endpoint_health(self, sagemaker_client, endpoint_name):
        """Verify the endpoint is in service."""
        sm_client = boto3.client("sagemaker", region_name=os.environ.get("AWS_REGION", "us-west-2"))
        response = sm_client.describe_endpoint(EndpointName=endpoint_name)
        assert (
            response["EndpointStatus"] == "InService"
        ), f"Endpoint {endpoint_name} is not InService: {response['EndpointStatus']}"

    def test_invoke_endpoint_default_prompt(self, sagemaker_client, endpoint_name, test_image_bytes):
        """Invoke the endpoint with default text prompt and validate GeoJSON response."""
        response = sagemaker_client.invoke_endpoint(
            EndpointName=endpoint_name,
            ContentType="image/tiff",
            Body=test_image_bytes,
        )

        body = json.loads(response["Body"].read().decode("utf-8"))

        # Validate GeoJSON FeatureCollection structure
        assert body["type"] == "FeatureCollection", f"Expected FeatureCollection, got {body.get('type')}"
        assert "features" in body, "Response missing 'features' key"
        assert isinstance(body["features"], list), "Features must be a list"

    def test_invoke_endpoint_custom_prompt(self, sagemaker_client, endpoint_name, test_image_bytes):
        """Invoke the endpoint with a custom text prompt via custom attributes."""
        response = sagemaker_client.invoke_endpoint(
            EndpointName=endpoint_name,
            ContentType="image/tiff",
            Body=test_image_bytes,
            CustomAttributes="text_prompt=aircraft",
        )

        body = json.loads(response["Body"].read().decode("utf-8"))

        # Validate GeoJSON structure
        assert body["type"] == "FeatureCollection"
        assert "features" in body
        assert isinstance(body["features"], list)

    def test_feature_structure(self, sagemaker_client, endpoint_name, test_image_bytes):
        """Validate the structure of returned GeoJSON features."""
        response = sagemaker_client.invoke_endpoint(
            EndpointName=endpoint_name,
            ContentType="image/tiff",
            Body=test_image_bytes,
            CustomAttributes="text_prompt=aircraft",
        )

        body = json.loads(response["Body"].read().decode("utf-8"))

        assert body is not None, "Response body is None"
        assert body["type"] == "FeatureCollection"
        assert "features" in body
        assert isinstance(body["features"], list)

        # The test image (2_planes.tiff) should produce detections with "aircraft" prompt
        # If features are returned, validate their structure
        if len(body["features"]) > 0:
            feature = body["features"][0]
            assert feature["type"] == "Feature", "Each feature must have type 'Feature'"
            assert "id" in feature, "Feature must have an id"

            # geometry is null per detect_to_feature() — actual geometry is in properties.imageGeometry
            assert (
                feature["geometry"] is None
            ), "Top-level geometry should be None (actual geometry is in properties.imageGeometry)"

            props = feature["properties"]
            assert "featureClasses" in props, "Properties must have featureClasses"
            assert isinstance(props["featureClasses"], list), "featureClasses must be a list"
            assert len(props["featureClasses"]) > 0, "featureClasses must not be empty"
            assert "iri" in props["featureClasses"][0], "featureClass must have iri"
            assert "score" in props["featureClasses"][0], "featureClass must have score"

            assert "imageBBox" in props, "Properties must have imageBBox"
            assert isinstance(props["imageBBox"], list), "imageBBox must be a list"
            assert len(props["imageBBox"]) == 4, "imageBBox must have 4 elements [x0, y0, x1, y1]"

            assert "imageGeometry" in props, "Properties must have imageGeometry"
            assert props["imageGeometry"]["type"] in ["Polygon", "Point"], "imageGeometry must be Polygon or Point"

            assert "modelMetadata" in props, "Properties must have modelMetadata"
            assert props["modelMetadata"]["modelName"] == "sam3", "modelName must be sam3"
