#  Copyright 2025 Amazon.com, Inc. or its affiliates.

import json
import logging
import traceback
from collections import Counter
from enum import Enum, auto
from typing import Dict

import boto3

from .test_assertions import (
    assert_contains_detections,
    assert_valid_feature_properties,
    assert_valid_geojson_response,
)
from .test_config import ModelEndpointIntegTestConfig


class AutoStringEnum(Enum):
    """
    A class used to represent an Enum where the value of the Enum member is the same as the name of the Enum member.
    """

    @staticmethod
    def _generate_next_value_(name, start, count, last_values) -> str:
        """
        Function to iterate through the Enum members.

        :param: name: Name of the Enum member.
        :param: start: Initial integer to start with.
        :param: count: Number of existing members.
        :param: last_values: List of values for existing members.

        :return: The next value of the enumeration which is the same as the name.
        """
        return name


class TestResult(str, AutoStringEnum):
    """
    Provides enumeration of test result.

    :cvar PASSED: Test passed.
    :cvar FAILED: Test failed.
    """

    PASSED = auto()
    FAILED = auto()


class TestModelEndpoint:
    def __init__(self, test_config: ModelEndpointIntegTestConfig):
        self.config: ModelEndpointIntegTestConfig = test_config
        self.sagemaker_runtime = boto3.client("sagemaker-runtime")
        self.s3_client = boto3.client("s3")
        self.test_results = {}

    def run_integ_test(self) -> None:
        logging.info("Running Model Endpoint integration tests")
        self.test_endpoint_invocation()
        self.test_response_format()
        self.test_detection_count()
        self.test_feature_properties()
        test_summary = self._pretty_print_test_results(self.test_results)
        if TestResult.FAILED in [res["result"] for res in self.test_results.values()]:
            raise Exception(test_summary)
        logging.info(test_summary)

    def test_endpoint_invocation(self) -> None:
        """Test that the SageMaker endpoint can be invoked successfully."""
        try:
            logging.info("Test endpoint invocation")

            # Download the test image from S3
            response = self.s3_client.get_object(Bucket=self.config.test_bucket, Key=self.config.test_object_key)
            image_data = response["Body"].read()

            # Invoke the SageMaker endpoint
            response = self.sagemaker_runtime.invoke_endpoint(
                EndpointName=self.config.endpoint_name, ContentType="application/octet-stream", Body=image_data
            )

            # Parse the response
            response_body = response["Body"].read().decode("utf-8")
            self.inference_result = json.loads(response_body)

            logging.info(f"Endpoint invocation successful. Response: {json.dumps(self.inference_result, indent=2)}")
            self.test_results["Endpoint Invocation"] = {"result": TestResult.PASSED}
        except Exception as err:
            logging.info(f"\tFailed. {err}")
            logging.error(traceback.print_exception(err))
            self.test_results["Endpoint Invocation"] = {
                "result": TestResult.FAILED,
                "message": self._get_exception_summary(err),
            }
            # Store empty result to prevent subsequent tests from failing
            self.inference_result = {"type": "FeatureCollection", "features": []}

    def test_response_format(self) -> None:
        """Test that the response is a valid GeoJSON FeatureCollection."""
        try:
            logging.info("Test response format")
            assert_valid_geojson_response(self.inference_result)
            self.test_results["Response Format"] = {"result": TestResult.PASSED}
        except Exception as err:
            logging.info(f"\tFailed. {err}")
            logging.error(traceback.print_exception(err))
            self.test_results["Response Format"] = {
                "result": TestResult.FAILED,
                "message": self._get_exception_summary(err),
            }

    def test_detection_count(self) -> None:
        """Test that the response contains the expected number of detections."""
        try:
            logging.info("Test detection count")
            assert_contains_detections(self.inference_result, min_detections=self.config.min_expected_features)
            num_detections = len(self.inference_result.get("features", []))
            logging.info(f"Found {num_detections} detection(s)")
            self.test_results["Detection Count"] = {"result": TestResult.PASSED}
        except Exception as err:
            logging.info(f"\tFailed. {err}")
            logging.error(traceback.print_exception(err))
            self.test_results["Detection Count"] = {
                "result": TestResult.FAILED,
                "message": self._get_exception_summary(err),
            }

    def test_feature_properties(self) -> None:
        """Test that each feature has valid properties."""
        try:
            logging.info("Test feature properties")
            assert_valid_feature_properties(self.inference_result)
            self.test_results["Feature Properties"] = {"result": TestResult.PASSED}
        except Exception as err:
            logging.info(f"\tFailed. {err}")
            logging.error(traceback.print_exception(err))
            self.test_results["Feature Properties"] = {
                "result": TestResult.FAILED,
                "message": self._get_exception_summary(err),
            }

    @staticmethod
    def _pretty_print_test_results(test_results: Dict[str, TestResult]) -> str:
        max_key_length = max([len(k) for k in test_results.keys()])
        sorted_results = dict(sorted(test_results.items(), key=lambda x: x[0].lower()))
        test_counter = Counter([res["result"] for res in test_results.values()])
        results_str = "\nTest Summary\n-------------------------------------\n"
        for k, v in sorted_results.items():
            result = v["result"]
            if result is TestResult.PASSED:
                results_str += f"{k.ljust(max_key_length + 5)}{result.value}\n"
            elif result is TestResult.FAILED:
                results_str += f"{k.ljust(max_key_length + 5)}{result.value} - {v['message']}\n"
        n_tests = len(test_results)
        passed = test_counter[TestResult.PASSED]
        failed = test_counter[TestResult.FAILED]
        success = passed / n_tests * 100
        results_str += f"    Tests: {n_tests}, Passed: {passed}, Failed: {failed}, Success: {success:.2f}%"
        return results_str

    @staticmethod
    def _get_exception_summary(err: Exception) -> str:
        tb = traceback.extract_tb(err.__traceback__)
        err_name = type(err).__name__
        if tb:
            location = f"...{tb[-1].filename.split('test/')[-1]}, {tb[-1].name}, line {tb[-1].lineno}"
            return f"{err_name}:{str(err)} in {location}: {tb[-1].line}"
        else:
            return f"{err_name}:{str(err)}"
