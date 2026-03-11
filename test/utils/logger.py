# Copyright 2026 Amazon.com, Inc. or its affiliates.

import logging

from pythonjsonlogger.jsonlogger import JsonFormatter


def configure_logger(
    logger: logging.Logger, log_level: int, log_formatter: logging.Formatter = None, log_filter: logging.Filter = None
) -> logging.Logger:
    """
    Configure a given logger with the provided parameters.

    :param logger: An instance of the Logger to configure
    :param log_level: The log level to set
    :param log_formatter: The log formatter to set on all handlers
    :param log_filter: Log filter to apply to the logger

    :return: The configured logger instance
    """
    logger.setLevel(log_level)

    stream_handler_exists = any(isinstance(handler, logging.StreamHandler) for handler in logger.handlers)

    if not stream_handler_exists:
        stream_handler = logging.StreamHandler()
        logger.addHandler(stream_handler)

    for handler in logger.handlers:
        handler.setFormatter(log_formatter)

    if log_filter:
        logger.addFilter(log_filter)

    logger.propagate = False

    return logger


def get_logger(name: str = __name__, level: int = logging.INFO) -> logging.Logger:
    """
    Configures the logging setup for AWS Lambda.

    :param name: The name of the logger.
    :param level: The logging level to be used if no other handler is already configured. Default is INFO.

    :returns: The configured logger instance.
    """
    lambda_logger = logging.getLogger(name)
    root_logger = logging.getLogger()

    if root_logger.hasHandlers():
        root_logger.setLevel(level)
    else:
        logging.basicConfig(level=level)

    return lambda_logger


formatter = JsonFormatter(fmt="%(asctime)s %(name)s %(levelname)s %(message)s", datefmt="%Y-%m-%dT%H:%M:%S")

logger = configure_logger(logger=get_logger(), log_level=logging.INFO, log_formatter=formatter)
