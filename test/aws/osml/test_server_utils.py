#  Copyright 2023-2026 Amazon.com, Inc. or its affiliates.

import logging
import unittest
from unittest.mock import patch

from flask import Flask

from aws.osml.models.server_utils import (
    build_flask_app,
    build_logger,
    detect_to_feature,
    parse_custom_attributes,
    setup_server,
    simulate_model_latency,
)


class TestServerUtils(unittest.TestCase):
    @patch("sys.stdout")  # Patch stdout to prevent actual writing to console
    def test_build_logger(self, mock_stdout):
        # Test default logger creation
        logger = build_logger()
        self.assertIsInstance(logger, logging.Logger)
        self.assertEqual(logger.level, logging.WARN)
        self.assertTrue(logger.hasHandlers())

        # Test logger with custom log level
        logger = build_logger(logging.DEBUG)
        self.assertEqual(logger.level, logging.DEBUG)

    @patch("sys.stdout")  # Patch stdout to prevent actual writing to console
    def test_build_logger_creates_handlers(self, mock_stdout):
        # Test build_logger creates handlers when logger doesn't have any
        # Get the same logger that build_logger uses and clear its handlers
        logger_name = "aws.osml.models.server_utils"
        existing_logger = logging.getLogger(logger_name)
        existing_logger.handlers.clear()
        logging.root.handlers.clear()

        # Ensure logger has no handlers
        self.assertFalse(existing_logger.hasHandlers())

        # Call build_logger - should create handlers (lines 34-38)
        logger = build_logger()
        # Should now have handlers
        self.assertTrue(logger.hasHandlers())
        self.assertEqual(logger.level, logging.WARN)

    @patch("waitress.serve")
    def test_setup_server(self, mock_serve):
        # Test that setup_server correctly configures and starts the Waitress server
        app = Flask(__name__)
        setup_server(app)

        mock_serve.assert_called_once_with(
            app,
            host="0.0.0.0",
            port=8080,
            threads=16,
            channel_timeout=120,
            connection_limit=100,
            clear_untrusted_proxy_headers=True,
        )

    def test_build_flask_app(self):
        # Mock the logger
        logger = build_logger()

        # Build the Flask app with the mock logger
        app = build_flask_app(logger)

        self.assertIsInstance(app, Flask)
        self.assertEqual(app.logger.level, logger.level)
        self.assertEqual(len(app.logger.handlers), len(logger.handlers))
        for handler in logger.handlers:
            self.assertIn(handler, app.logger.handlers)

    @patch("aws.osml.models.server_utils.json_logging._current_framework", None)
    @patch("aws.osml.models.server_utils.json_logging.init_flask")
    def test_build_flask_app_with_json_logging_init(self, mock_init_flask):
        # Test that json_logging.init_flask is called when _current_framework is None
        logger = build_logger()
        app = build_flask_app(logger)
        self.assertIsInstance(app, Flask)
        mock_init_flask.assert_called_once_with(enable_json=True)

    @patch("aws.osml.models.server_utils.json_logging._current_framework", "flask")
    @patch("aws.osml.models.server_utils.json_logging.init_flask")
    def test_build_flask_app_without_json_logging_init(self, mock_init_flask):
        # Test that json_logging.init_flask is NOT called when _current_framework is already set
        logger = build_logger()
        app = build_flask_app(logger)
        self.assertIsInstance(app, Flask)
        mock_init_flask.assert_not_called()

    def test_detect_to_feature_without_mask(self):
        # Test detect_to_feature with bbox only (no mask)
        bbox = [10.0, 20.0, 30.0, 40.0]
        feature = detect_to_feature(bbox)

        self.assertEqual(feature["type"], "Feature")
        self.assertIsNone(feature["geometry"])
        self.assertIn("id", feature)
        self.assertEqual(len(feature["id"]), 32)  # token_hex(16) produces 32 char hex string
        self.assertEqual(feature["properties"]["imageBBox"], bbox)
        self.assertEqual(feature["properties"]["imageGeometry"], {"type": "Point", "coordinates": [0.0, 0.0]})
        self.assertEqual(feature["properties"]["featureClasses"], [{"iri": "sample_object", "score": 1.0}])
        self.assertIn("image_id", feature["properties"])

    def test_detect_to_feature_with_mask(self):
        # Test detect_to_feature with bbox and mask
        bbox = [10.0, 20.0, 30.0, 40.0]
        mask = [[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0]]
        feature = detect_to_feature(bbox, fixed_object_mask=mask)

        self.assertEqual(feature["type"], "Feature")
        self.assertEqual(feature["properties"]["imageGeometry"], {"type": "Polygon", "coordinates": [mask]})

    def test_detect_to_feature_with_custom_params(self):
        # Test detect_to_feature with custom detection_score and detection_type
        bbox = [10.0, 20.0, 30.0, 40.0]
        feature = detect_to_feature(bbox, detection_score=0.85, detection_type="object")

        self.assertEqual(feature["properties"]["featureClasses"], [{"iri": "object", "score": 0.85}])

    def test_parse_custom_attributes_no_header(self):
        # Test parse_custom_attributes when header is not present
        with Flask(__name__).test_request_context():
            attributes = parse_custom_attributes()
            self.assertEqual(attributes, {})

    def test_parse_custom_attributes_empty_header(self):
        # Test parse_custom_attributes when header is empty
        with Flask(__name__).test_request_context(headers={"X-Amzn-SageMaker-Custom-Attributes": ""}):
            attributes = parse_custom_attributes()
            self.assertEqual(attributes, {})

    def test_parse_custom_attributes_simple(self):
        # Test parse_custom_attributes with simple key=value pairs
        with Flask(__name__).test_request_context(headers={"X-Amzn-SageMaker-Custom-Attributes": "key1=value1,key2=value2"}):
            attributes = parse_custom_attributes()
            self.assertEqual(attributes, {"key1": "value1", "key2": "value2"})

    def test_parse_custom_attributes_with_url_encoding(self):
        # Test parse_custom_attributes with URL-encoded values
        with Flask(__name__).test_request_context(
            headers={"X-Amzn-SageMaker-Custom-Attributes": "text_prompt=sport%20cars,key=value"}
        ):
            attributes = parse_custom_attributes()
            self.assertEqual(attributes, {"text_prompt": "sport cars", "key": "value"})

    def test_parse_custom_attributes_with_spaces(self):
        # Test parse_custom_attributes with spaces around keys/values
        with Flask(__name__).test_request_context(
            headers={"X-Amzn-SageMaker-Custom-Attributes": " key1 = value1 , key2 = value2 "}
        ):
            attributes = parse_custom_attributes()
            self.assertEqual(attributes, {"key1": "value1", "key2": "value2"})

    def test_parse_custom_attributes_invalid_format(self):
        # Test parse_custom_attributes with invalid format (no = sign)
        with Flask(__name__).test_request_context(
            headers={"X-Amzn-SageMaker-Custom-Attributes": "invalid_format,key=value"}
        ):
            attributes = parse_custom_attributes()
            # Should skip invalid pairs and return valid ones
            self.assertEqual(attributes, {"key": "value"})

    @patch("aws.osml.models.server_utils.parse_custom_attributes")
    def test_simulate_model_latency_no_mean(self, mock_parse):
        # Test simulate_model_latency when mock_latency_mean is not present
        mock_parse.return_value = {}
        with Flask(__name__).test_request_context():
            simulate_model_latency()
            # Should return early without sleeping

    @patch("aws.osml.models.server_utils.parse_custom_attributes")
    @patch("aws.osml.models.server_utils.time.sleep")
    def test_simulate_model_latency_with_mean_only(self, mock_sleep, mock_parse):
        # Test simulate_model_latency with only mock_latency_mean (std defaults to 10% of mean)
        mock_parse.return_value = {"mock_latency_mean": "100"}
        with Flask(__name__).test_request_context():
            simulate_model_latency()
            # Should sleep with calculated std (10% of 100 = 10)
            mock_sleep.assert_called_once()
            # Verify sleep was called with a non-negative value
            call_args = mock_sleep.call_args[0][0]
            self.assertGreaterEqual(call_args, 0)

    @patch("aws.osml.models.server_utils.parse_custom_attributes")
    @patch("aws.osml.models.server_utils.time.sleep")
    def test_simulate_model_latency_with_mean_and_std(self, mock_sleep, mock_parse):
        # Test simulate_model_latency with both mock_latency_mean and mock_latency_std
        mock_parse.return_value = {"mock_latency_mean": "200", "mock_latency_std": "50"}
        with Flask(__name__).test_request_context():
            simulate_model_latency()
            mock_sleep.assert_called_once()
            call_args = mock_sleep.call_args[0][0]
            self.assertGreaterEqual(call_args, 0)

    @patch("aws.osml.models.server_utils.parse_custom_attributes")
    @patch("aws.osml.models.server_utils.time.sleep")
    def test_simulate_model_latency_invalid_value(self, mock_sleep, mock_parse):
        # Test simulate_model_latency with invalid mock_latency_mean value
        mock_parse.return_value = {"mock_latency_mean": "invalid"}
        with Flask(__name__).test_request_context():
            simulate_model_latency()
            # Should handle ValueError/TypeError and return without sleeping
            mock_sleep.assert_not_called()

    @patch("aws.osml.models.server_utils.parse_custom_attributes")
    @patch("aws.osml.models.server_utils.time.sleep")
    def test_simulate_model_latency_negative_result(self, mock_sleep, mock_parse):
        # Test simulate_model_latency ensures non-negative latency
        mock_parse.return_value = {"mock_latency_mean": "10", "mock_latency_std": "100"}
        with Flask(__name__).test_request_context():
            # Mock random.gauss to return negative value
            with patch("aws.osml.models.server_utils.random.gauss", return_value=-50):
                simulate_model_latency()
                # Should clamp to 0 and sleep with 0
                mock_sleep.assert_called_once_with(0.0)


if __name__ == "__main__":
    unittest.main()
