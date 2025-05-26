import logging
import os
import sys

def setup_logging(log_level=logging.INFO, log_file=None):
    """
    Set up logging configuration for the application
    
    Args:
        log_level: Logging level (default: INFO)
        log_file: Optional log file path
        
    Returns:
        Configured logger instance
    """
    # Create logger if it doesn't exist
    logger = logging.getLogger("file_processor")
    logger.setLevel(log_level)
    
    # Remove existing handlers to prevent duplicate logs
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
    
    # Create console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)
    
    # Create formatter
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    console_handler.setFormatter(formatter)
    
    # Add console handler to logger
    logger.addHandler(console_handler)
    
    # Add file handler if specified
    if log_file:
        file_handler = logging.FileHandler(log_file)
        file_handler.setLevel(log_level)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    
    return logger
