"""
Logging Configuration for Geometric Alpha
"""

import logging
import sys
from pathlib import Path
from datetime import datetime


def setup_logging(
    level: str = "INFO",
    log_file: Path = None,
    format_string: str = None
) -> logging.Logger:
    """
    Configure logging for the application.

    Args:
        level: Logging level (DEBUG, INFO, WARNING, ERROR)
        log_file: Optional file to write logs to
        format_string: Custom format string

    Returns:
        Root logger
    """
    format_string = format_string or (
        "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
    )

    # Create formatter
    formatter = logging.Formatter(format_string, datefmt="%Y-%m-%d %H:%M:%S")

    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level.upper()))

    # Remove existing handlers
    root_logger.handlers = []

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    # File handler (optional)
    if log_file:
        log_file.parent.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(log_file)
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)

    return root_logger


def get_logger(name: str) -> logging.Logger:
    """Get a logger for a specific module."""
    return logging.getLogger(name)
