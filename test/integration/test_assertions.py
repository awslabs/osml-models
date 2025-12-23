#  Copyright 2025 Amazon.com, Inc. or its affiliates.

from typing import Any, Dict


def assert_valid_geojson_response(response: Dict[str, Any]) -> None:
    """
    Assert that the response is a valid GeoJSON FeatureCollection.

    :param response: The response dictionary to validate
    :raises AssertionError: If the response is not valid
    """
    assert "type" in response, "Response must contain 'type' field"
    assert response["type"] == "FeatureCollection", f"Expected type 'FeatureCollection', got '{response['type']}'"
    assert "features" in response, "Response must contain 'features' field"
    assert isinstance(response["features"], list), "Features must be a list"


def assert_contains_detections(response: Dict[str, Any], min_detections: int = 1) -> None:
    """
    Assert that the response contains at least the minimum number of detections.

    :param response: The response dictionary to validate
    :param min_detections: Minimum number of expected detections
    :raises AssertionError: If the response doesn't contain enough detections
    """
    features = response.get("features", [])
    num_features = len(features)
    assert num_features >= min_detections, f"Expected at least {min_detections} detection(s), got {num_features}"


def assert_valid_feature_properties(response: Dict[str, Any]) -> None:
    """
    Assert that each feature in the response has valid properties.

    :param response: The response dictionary to validate
    :raises AssertionError: If any feature has invalid properties
    """
    features = response.get("features", [])
    for i, feature in enumerate(features):
        assert "geometry" in feature, f"Feature {i} must contain 'geometry' field"
        assert "properties" in feature, f"Feature {i} must contain 'properties' field"
        assert "type" in feature, f"Feature {i} must contain 'type' field"
        assert feature["type"] == "Feature", f"Feature {i} type must be 'Feature', got '{feature['type']}'"

        # Check for expected properties
        properties = feature["properties"]
        assert "featureClasses" in properties, f"Feature {i} must contain 'featureClasses' property"
        assert isinstance(properties["featureClasses"], list), f"Feature {i} 'featureClasses' must be a list"
        assert len(properties["featureClasses"]) > 0, f"Feature {i} must have at least one feature class"

        # Validate feature class structure
        for j, feature_class in enumerate(properties["featureClasses"]):
            assert "iri" in feature_class, f"Feature {i} class {j} must contain 'iri' field"
            assert "score" in feature_class, f"Feature {i} class {j} must contain 'score' field"
            assert isinstance(feature_class["score"], (int, float)), f"Feature {i} class {j} score must be numeric"
