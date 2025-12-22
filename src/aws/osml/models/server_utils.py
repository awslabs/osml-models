#  Copyright 2023-2025 Amazon.com, Inc. or its affiliates.

import logging
import os
import sys

import json_logging
from flask import Flask
from osgeo import gdal

# Enable exceptions for GDAL
gdal.UseExceptions()


def build_logger(level: int = logging.WARN) -> logging.Logger:
    """
    Utility function to create and configure a logger that outputs logs in JSON format.

    :param level: Logging level (default: logging.WARN).
    :return: Configured logger instance.
    """

    # Create a logger at the given level
    logger = logging.getLogger(__name__)

    # Ensure no duplicate handlers
    if not logger.hasHandlers():
        # Create a handler that writes to sys.stdout
        handler = logging.StreamHandler(sys.stdout)

        # Add the handler to the logger
        logger.addHandler(handler)
        logging.root.addHandler(handler)

    logger.setLevel(level)
    return logger


def setup_server(app: Flask):
    """
    The assumption is that this script will be the ENTRYPOINT for the inference
    container. SageMaker will launch the container with the "serve" argument. We
    also have the option of using multiple models from this single container;
    only one model will be active at a time (i.e., this is not a Multi Model Server),
    so it can be selected by name using the "model" parameter.

    :param app: The flask application to set up
    :return: None
    """
    port = int(os.getenv("SAGEMAKER_BIND_TO_PORT", 8080))

    # Log all arguments in a single log message
    app.logger.debug(f"Initializing OSML Model Flask server on port {port}!")

    # Start the simple web application server using Waitress.
    # Flask's app.run() is only intended to be used in development
    #  mode, so this provides a solution for hosting the application.
    from waitress import serve

    serve(app, host="0.0.0.0", port=port, clear_untrusted_proxy_headers=True)


def build_flask_app(logger: logging.Logger) -> Flask:
    """
    Create a Flask app and configure it to use the provided logger.
    The logger will output logs in JSON format and write to sys.stdout.

    :param logger: The logger to use with the application
    :return: Configured Flask app instance.
    """
    # Create a Flask app instance
    app = Flask(__name__)

    # Clear default Flask log handlers
    app.logger.handlers.clear()

    # Add the provided logger's handlers to the Flask app logger
    for handler in logger.handlers:
        app.logger.addHandler(handler)

    # Ensure the Flask app logger uses the same logging level as the custom logger
    app.logger.setLevel(logger.level)

    if json_logging._current_framework is None:
        json_logging.init_flask(enable_json=True)

    return app
