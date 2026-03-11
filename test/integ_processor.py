# Copyright 2026 Amazon.com, Inc. or its affiliates.

"""Lambda handler for OSML Models integration tests using pytest."""

from typing import Any, Dict

import pytest

from .processor_base import ProcessorBase
from .utils.logger import logger


class TestResultCollector:
    """Simple pytest plugin to collect test results in memory."""

    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.skipped = 0
        self.total = 0

    def pytest_runtest_logreport(self, report):
        """Called for each test phase (setup, call, teardown)."""
        if report.when == "call":
            self.total += 1
            if report.passed:
                self.passed += 1
            elif report.failed:
                self.failed += 1
            elif report.skipped:
                self.skipped += 1


class ModelEndpointTestProcessor(ProcessorBase):
    """Processor for running OSML Models integration tests in Lambda using pytest."""

    def __init__(self, event: Dict[str, Any]):
        """
        Initialize the processor with the Lambda event.

        :param event: The Lambda event dictionary
        """
        self.event = event

    def process_sync(self) -> Dict[str, Any]:
        """
        Process the test execution using pytest synchronously.

        :returns: A response indicating the status of the test execution
        """
        logger.info("Running OSML Models integration tests with pytest")

        collector = TestResultCollector()

        exit_code = pytest.main(
            [
                "-vv",
                "--tb=long",
                "--log-cli-level=INFO",
                "-p",
                "no:cacheprovider",
                "test/integration/test_model_endpoint.py",
            ],
            plugins=[collector],
        )

        success_pct = (collector.passed / collector.total * 100) if collector.total > 0 else 0.0

        logger.info("\nTest Summary\n-------------------------------------")
        logger.info(
            f"    Tests: {collector.total}, Passed: {collector.passed}, "
            f"Failed: {collector.failed}, Success: {success_pct:.2f}%"
        )

        if exit_code == 0:
            return self.success_message(f"All {collector.total} integration tests passed")
        else:
            return self.failure_message(Exception(f"{collector.failed} of {collector.total} integration tests failed"))


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    The AWS Lambda handler function to execute integration tests.

    :param event: The event payload
    :param context: The Lambda execution context (unused)
    :return: The response from the ModelEndpointTestProcessor
    """
    processor = ModelEndpointTestProcessor(event)
    return processor.process_sync()
