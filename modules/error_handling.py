# error_handling.py

import time
import logging
import random
import functools
from typing import Callable, Any, Optional, Dict, List, Type, Union

logger = logging.getLogger(__name__)

class RetryableError(Exception):
    """Base class for errors that can be retried"""
    pass

class MemoryError(RetryableError):
    """Error related to memory issues that can be addressed with reduced memory settings"""
    pass

class NetworkError(RetryableError):
    """Error related to network issues that can be retried"""
    pass

class TimeoutError(RetryableError):
    """Error related to timeout issues that can be retried"""
    pass

class PermissionError(RetryableError):
    """Error related to permission issues that might be solvable"""
    pass

class ErrorHandler:
    """
    Utility class for handling errors with exponential backoff, 
    customizable retry policies, and detailed logging.
    """
    
    @staticmethod
    def retry_with_backoff(func: Callable, 
                          max_attempts: int = 5, 
                          base_delay: float = 1.0,
                          max_delay: float = 60.0,
                          jitter: bool = True,
                          retry_exceptions: Optional[List[Type[Exception]]] = None,
                          on_retry: Optional[Callable[[Exception, int, float], None]] = None) -> Any:
        """
        Execute a function with exponential backoff retry logic.
        
        Args:
            func: Function to execute with retries
            max_attempts: Maximum number of retry attempts
            base_delay: Initial delay between retries (in seconds)
            max_delay: Maximum delay between retries (in seconds)
            jitter: Whether to add randomness to the delay to prevent thundering herd
            retry_exceptions: List of exception types to retry. If None, retries all.
            on_retry: Callback function to execute before retrying
            
        Returns:
            The result of the function execution
            
        Raises:
            The last exception if all retry attempts fail
        """
        retry_exceptions = retry_exceptions or [Exception]
        last_exception = None
        
        for attempt in range(1, max_attempts + 1):
            try:
                return func()
            except tuple(retry_exceptions) as e:
                last_exception = e
                
                if attempt == max_attempts:
                    logger.error(f"Max retry attempts ({max_attempts}) reached. Last error: {e}")
                    raise
                
                # Calculate delay with exponential backoff
                delay = min(base_delay * (2 ** (attempt - 1)), max_delay)
                
                # Add jitter to avoid thundering herd problems
                if jitter:
                    delay = delay * (0.5 + random.random())
                
                logger.warning(f"Attempt {attempt}/{max_attempts} failed with error: {e}. "
                              f"Retrying in {delay:.2f}s...")
                
                # Execute on_retry callback if provided
                if on_retry:
                    try:
                        on_retry(e, attempt, delay)
                    except Exception as cb_error:
                        logger.warning(f"Error in retry callback: {cb_error}")
                
                time.sleep(delay)
    
    @staticmethod
    def retry_decorator(max_attempts: int = 5, 
                        base_delay: float = 1.0,
                        max_delay: float = 60.0,
                        jitter: bool = True,
                        retry_exceptions: Optional[List[Type[Exception]]] = None,
                        on_retry: Optional[Callable[[Exception, int, float], None]] = None) -> Callable:
        """
        Decorator that applies exponential backoff retry logic to a function.
        
        Args:
            max_attempts: Maximum number of retry attempts
            base_delay: Initial delay between retries (in seconds)
            max_delay: Maximum delay between retries (in seconds)
            jitter: Whether to add randomness to the delay
            retry_exceptions: List of exception types to retry. If None, retries all.
            on_retry: Callback function to execute before retrying
            
        Returns:
            Decorated function with retry logic
        """
        def decorator(func):
            @functools.wraps(func)
            def wrapper(*args, **kwargs):
                def attempt_func():
                    return func(*args, **kwargs)
                
                return ErrorHandler.retry_with_backoff(
                    attempt_func,
                    max_attempts=max_attempts,
                    base_delay=base_delay,
                    max_delay=max_delay,
                    jitter=jitter,
                    retry_exceptions=retry_exceptions,
                    on_retry=on_retry
                )
            
            return wrapper
        
        return decorator
    
    @staticmethod
    def classify_error(error: Exception) -> Dict[str, Any]:
        """
        Classify an error to determine its type and potential recovery strategies.
        
        Args:
            error: The exception to classify
            
        Returns:
            Dictionary with error classification details
        """
        error_str = str(error).lower()
        error_type = type(error).__name__
        
        # Initialize classification result
        result = {
            "error_type": error_type,
            "error_message": str(error),
            "category": "general",
            "retryable": False,
            "recovery_strategy": None
        }
        
        # Classify based on error message patterns
        if "memory" in error_str or "allocation" in error_str or "out of memory" in error_str:
            result["category"] = "memory"
            result["retryable"] = True
            result["recovery_strategy"] = "reduce_memory_usage"
            
        elif "timeout" in error_str or "timed out" in error_str:
            result["category"] = "timeout"
            result["retryable"] = True
            result["recovery_strategy"] = "increase_timeout"
            
        elif "permission" in error_str or "access" in error_str:
            result["category"] = "permissions"
            result["retryable"] = False  # Permissions usually need manual intervention
            result["recovery_strategy"] = "check_permissions"
            
        elif "network" in error_str or "connection" in error_str or "unreachable" in error_str:
            result["category"] = "network"
            result["retryable"] = True
            result["recovery_strategy"] = "retry_with_backoff"
            
        elif "not found" in error_str or "no such file" in error_str:
            result["category"] = "not_found"
            result["retryable"] = False
            result["recovery_strategy"] = "check_path"
            
        elif "corrupt" in error_str or "invalid" in error_str or "malformed" in error_str:
            result["category"] = "corrupt_file"
            result["retryable"] = False
            result["recovery_strategy"] = "repair_file"
            
        # Special handling for specific error types
        if error_type == "TimeoutError":
            result["category"] = "timeout"
            result["retryable"] = True
            result["recovery_strategy"] = "increase_timeout"
            
        elif error_type == "MemoryError":
            result["category"] = "memory"
            result["retryable"] = True
            result["recovery_strategy"] = "reduce_memory_usage"
            
        elif error_type == "FileNotFoundError":
            result["category"] = "not_found"
            result["retryable"] = False
            result["recovery_strategy"] = "check_path"
            
        elif error_type == "PermissionError":
            result["category"] = "permissions"
            result["retryable"] = False
            result["recovery_strategy"] = "check_permissions"
            
        return result
    
    @staticmethod
    def handle_pdf_error(pdf_file: str, error: Exception, output_folder: Optional[str] = None) -> Dict[str, Any]:
        """
        Handle PDF processing errors with appropriate recovery strategies.
        
        Args:
            pdf_file: Path to the problematic PDF
            error: The exception that occurred
            output_folder: Output folder for error reports
            
        Returns:
            Dictionary with error handling results
        """
        # Classify the error
        classification = ErrorHandler.classify_error(error)
        logger.error(f"PDF processing error ({classification['category']}): {error}")
        
        # Initialize result
        result = {
            "status": "error",
            "error_type": classification["error_type"],
            "error_message": classification["error_message"],
            "error_category": classification["category"],
            "recovery_attempted": False,
            "recovery_successful": False,
            "recovery_method": None
        }
        
        # Apply recovery strategy based on error category
        if classification["retryable"]:
            try:
                if classification["category"] == "memory":
                    # Try processing with reduced memory settings
                    logger.info(f"Attempting memory-optimized processing for {pdf_file}")
                    result["recovery_attempted"] = True
                    result["recovery_method"] = "reduced_memory_usage"
                    # Recovery logic would be implemented here
                    
                elif classification["category"] == "timeout":
                    # Try processing with extended timeout
                    logger.info(f"Attempting processing with extended timeout for {pdf_file}")
                    result["recovery_attempted"] = True
                    result["recovery_method"] = "increased_timeout"
                    # Recovery logic would be implemented here
                    
                elif classification["category"] == "network":
                    # Retry with backoff
                    logger.info(f"Retrying network operation with backoff for {pdf_file}")
                    result["recovery_attempted"] = True
                    result["recovery_method"] = "retry_with_backoff"
                    # Recovery logic would be implemented here
                    
            except Exception as recovery_error:
                logger.error(f"Recovery attempt failed: {recovery_error}")
                result["recovery_error"] = str(recovery_error)
        
        # Save error report if output folder provided
        if output_folder:
            try:
                import os
                import json
                
                os.makedirs(output_folder, exist_ok=True)
                report_path = os.path.join(
                    output_folder,
                    f"error_report_{os.path.basename(pdf_file)}.json"
                )
                
                with open(report_path, 'w', encoding='utf-8') as f:
                    json.dump(result, f, indent=2)
                    
                result["error_report"] = report_path
                logger.info(f"Error report saved to: {report_path}")
            except Exception as e:
                logger.warning(f"Failed to save error report: {e}")
        
        return result