"""
HTTP Client Configuration Module
Provides configured HTTP session with retry strategies
"""

import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

# Global session instance
_session: Optional[Any] = None


def create_session(max_retries: int = 3, backoff_factor: float = 0.3,
                  status_forcelist: Optional[list] = None) -> Optional[Any]:
    """
    Create a requests session with retry strategy.
    
    Args:
        max_retries: Maximum number of retry attempts
        backoff_factor: Backoff factor for retries
        status_forcelist: List of HTTP status codes to retry on
        
    Returns:
        Configured requests.Session or None if requests not available
    """
    global _session
    
    # Use default status codes if not provided
    if status_forcelist is None:
        status_forcelist = [500, 502, 503, 504]
    
    try:
        import requests
        from requests.adapters import HTTPAdapter, Retry
        
        # Create session
        session = requests.Session()
        
        # Configure retry strategy
        retry_strategy = Retry(
            total=max_retries,
            backoff_factor=backoff_factor,
            status_forcelist=status_forcelist,
            allowed_methods=["HEAD", "GET", "OPTIONS", "POST"]
        )
        
        # Create and mount adapter
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        
        # Set default headers
        session.headers.update({
            "User-Agent": "Mozilla/5.0 (compatible; NeuroGen/1.0)"
        })
        
        logger.info("HTTP session created with retry strategy")
        _session = session
        return session
        
    except ImportError:
        logger.warning("Requests library not available. Install with: pip install requests")
        return None


def get_session() -> Optional[Any]:
    """
    Get the global HTTP session, creating it if necessary.
    
    Returns:
        Configured requests.Session or None if requests not available
    """
    global _session
    
    if _session is None:
        _session = create_session()
    
    return _session


def download_file(url: str, output_path: str, chunk_size: int = 8192,
                 timeout: int = 30, headers: Optional[Dict[str, str]] = None) -> bool:
    """
    Download a file using the configured session.
    
    Args:
        url: URL to download from
        output_path: Path to save the file
        chunk_size: Size of chunks to download
        timeout: Request timeout in seconds
        headers: Optional additional headers
        
    Returns:
        True if successful, False otherwise
    """
    session = get_session()
    if not session:
        logger.error("No HTTP session available")
        return False
    
    try:
        # Prepare headers
        req_headers = {
            "Accept": "*/*",
            "Connection": "keep-alive"
        }
        if headers:
            req_headers.update(headers)
        
        # Make request with streaming
        response = session.get(url, stream=True, timeout=timeout, headers=req_headers)
        response.raise_for_status()
        
        # Write to file
        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=chunk_size):
                if chunk:
                    f.write(chunk)
        
        logger.info(f"Successfully downloaded {url} to {output_path}")
        return True
        
    except Exception as e:
        logger.error(f"Error downloading {url}: {e}")
        return False


def make_request(method: str, url: str, **kwargs) -> Optional[Any]:
    """
    Make an HTTP request using the configured session.
    
    Args:
        method: HTTP method (GET, POST, etc.)
        url: URL to request
        **kwargs: Additional arguments to pass to requests
        
    Returns:
        Response object or None if failed
    """
    session = get_session()
    if not session:
        logger.error("No HTTP session available")
        return None
    
    try:
        response = session.request(method, url, **kwargs)
        response.raise_for_status()
        return response
    except Exception as e:
        logger.error(f"Error making {method} request to {url}: {e}")
        return None


def test_connection(test_url: str = "https://www.google.com") -> bool:
    """
    Test if HTTP connections are working.
    
    Args:
        test_url: URL to test connection with
        
    Returns:
        True if connection successful, False otherwise
    """
    session = get_session()
    if not session:
        return False
    
    try:
        response = session.head(test_url, timeout=5)
        return response.status_code < 400
    except Exception as e:
        logger.debug(f"Connection test failed: {e}")
        return False


# Initialize session on module import
get_session()


# Export public interface
__all__ = [
    'create_session',
    'get_session',
    'download_file',
    'make_request',
    'test_connection'
]