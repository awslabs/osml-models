# Copyright 2026 Amazon.com, Inc. or its affiliates.

"""Base processor class for test Lambda handlers."""

from typing import Any, Dict


class ProcessorBase:
    """Base class for test processors with common response methods."""

    @staticmethod
    def success_message(message: str) -> Dict[str, Any]:
        """
        Generate a success response message.

        :param message: Success message text
        :return: Response dictionary
        """
        return {"status": "success", "message": message}

    @staticmethod
    def failure_message(error: Exception) -> Dict[str, Any]:
        """
        Generate a failure response message.

        :param error: Exception that occurred
        :return: Response dictionary
        """
        return {
            "status": "failure",
            "error": str(error),
            "error_type": type(error).__name__,
        }
