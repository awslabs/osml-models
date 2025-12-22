#  Copyright 2023-2025 Amazon.com, Inc. or its affiliates.

import logging
import unittest
from unittest.mock import patch

from flask import Flask

from aws.osml.models.server_utils import build_flask_app, build_logger, setup_server


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

    @patch("waitress.serve")
    def test_setup_server(self, mock_serve):
        # Test that setup_server correctly configures and starts the Waitress server
        app = Flask(__name__)
        setup_server(app)

        mock_serve.assert_called_once_with(app, host="0.0.0.0", port=8080, clear_untrusted_proxy_headers=True)

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


if __name__ == "__main__":
    unittest.main()
