import os
import sys
import json
import time
import logging
import argparse
from typing import Dict, List, Any, Optional, Union, Tuple
from urllib.parse import urljoin
import concurrent.futures
from dataclasses import dataclass, field

try:
    import requests
    from requests.adapters import HTTPAdapter, Retry
except ImportError:
    raise ImportError(
        "Requests library not installed. Install with: pip install requests"
    )

__version__ = "1.0.0"

# Configure logging
logger = logging.getLogger("academic_api_client")
handler = logging.StreamHandler()
formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
handler.setFormatter(formatter)
logger.addHandler(handler)
logger.setLevel(logging.INFO)

@dataclass
class RequestConfig:
    """Configuration for API requests with retry settings."""
    timeout: int = 30
    max_retries: int = 3
    backoff_factor: float = 0.5
    retry_status_codes: List[int] = field(default_factory=lambda: [429, 500, 502, 503, 504])
    verify_ssl: bool = True

@dataclass
class PaperInfo:
    """Structured data class for paper information."""
    id: str
    title: str
    authors: List[str]
    abstract: str
    source: str
    pdf_url: str
    publication_date: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

class APIError(Exception):
    """Base exception for API errors."""
    
    def __init__(self, message: str, code: str = "API_ERROR", status_code: int = None, response=None):
        self.message = message
        self.code = code
        self.status_code = status_code
        self.response = response
        super().__init__(self.message)
    
    def __str__(self):
        msg = f"{self.code}: {self.message}"
        if self.status_code:
            msg = f"{msg} (HTTP {self.status_code})"
        return msg

class AuthenticationError(APIError):
    """Raised when authentication fails."""
    def __init__(self, message="API key is invalid or missing", code="AUTHENTICATION_ERROR", status_code=401, response=None):
        super().__init__(message, code, status_code, response)

class RateLimitError(APIError):
    """Raised when rate limit is exceeded."""
    def __init__(self, message="Rate limit exceeded", code="RATE_LIMIT_EXCEEDED", status_code=429, response=None):
        super().__init__(message, code, status_code, response)
        
        # Extract retry-after header if available
        self.retry_after = None
        if response and 'Retry-After' in response.headers:
            try:
                self.retry_after = int(response.headers['Retry-After'])
            except (ValueError, TypeError):
                pass

class ResourceNotFoundError(APIError):
    """Raised when a requested resource is not found."""
    def __init__(self, message="Resource not found", code="RESOURCE_NOT_FOUND", status_code=404, response=None):
        super().__init__(message, code, status_code, response)

class ValidationError(APIError):
    """Raised when input validation fails."""
    def __init__(self, message="Invalid request parameters", code="VALIDATION_ERROR", status_code=400, response=None):
        super().__init__(message, code, status_code, response)

class ServerError(APIError):
    """Raised when the server encounters an error."""
    def __init__(self, message="Server error occurred", code="SERVER_ERROR", status_code=500, response=None):
        super().__init__(message, code, status_code, response)

class NetworkError(APIError):
    """Raised when a network error occurs."""
    def __init__(self, message="Network error occurred", code="NETWORK_ERROR", response=None):
        super().__init__(message, code, None, response)

class AcademicApiClient:
    """Production-ready client for the Academic API with advanced features."""
    
    DEFAULT_BASE_URL = "http://localhost:5000"
    
    def __init__(
        self, 
        base_url: str = None, 
        api_key: str = None,
        config: RequestConfig = None,
        debug: bool = False
    ):
        """
        Initialize the Academic API client.
        
        Args:
            base_url: The base URL of the Academic API server (default: http://localhost:5000)
            api_key: API key for authentication (can also be set via ACADEMIC_API_KEY env var)
            config: Request configuration settings
            debug: Enable debug logging
        """
        self.base_url = (base_url or os.environ.get("ACADEMIC_API_URL") or self.DEFAULT_BASE_URL).rstrip('/')
        self.api_key = api_key or os.environ.get("ACADEMIC_API_KEY")
        self.config = config or RequestConfig()
        self.session = self._create_session()
        
        # Configure logging based on debug parameter
        if debug:
            logger.setLevel(logging.DEBUG)
            logger.debug("Debug logging enabled for Academic API Client")
        
        if not self.api_key:
            logger.warning("No API key provided. Set via constructor or ACADEMIC_API_KEY env var.")
    
    def _create_session(self) -> requests.Session:
        """Create and configure a requests session with retries."""
        session = requests.Session()
        
        # Configure retries
        retry_strategy = Retry(
            total=self.config.max_retries,
            backoff_factor=self.config.backoff_factor,
            status_forcelist=self.config.retry_status_codes,
            allowed_methods=["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS"]
        )
        
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        
        # Set default headers
        session.headers.update({
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": f"AcademicApiClient/{__version__} (Python {sys.version.split()[0]})"
        })
        
        # Add API key if available
        if self.api_key:
            session.headers.update({"X-API-Key": self.api_key})
        
        return session
    
    def _handle_response(self, response: requests.Response) -> Dict:
        """
        Handle API response and convert errors to appropriate exceptions.
        
        Args:
            response: The HTTP response object
            
        Returns:
            Parsed JSON response
            
        Raises:
            AuthenticationError: When authentication fails
            RateLimitError: When rate limit is exceeded
            ResourceNotFoundError: When resource is not found
            ValidationError: When request parameters are invalid
            ServerError: When server encounters an error
            APIError: For other API errors
        """
        try:
            # Parse JSON response
            if not response.content:
                return {}
                
            data = response.json()
            
            # Handle error responses
            if response.status_code >= 400:
                error = data.get("error", {})
                code = error.get("code", "UNKNOWN_ERROR")
                message = error.get("message", "Unknown error occurred")
                
                if response.status_code == 401:
                    raise AuthenticationError(message, code, response.status_code, response)
                    
                elif response.status_code == 429:
                    raise RateLimitError(message, code, response.status_code, response)
                    
                elif response.status_code == 404:
                    raise ResourceNotFoundError(message, code, response.status_code, response)
                    
                elif response.status_code == 400:
                    raise ValidationError(message, code, response.status_code, response)
                    
                elif response.status_code >= 500:
                    raise ServerError(message, code, response.status_code, response)
                    
                else:
                    raise APIError(message, code, response.status_code, response)
            
            return data
            
        except json.JSONDecodeError:
            raise APIError(f"Invalid JSON response (HTTP {response.status_code})", "INVALID_RESPONSE", response.status_code, response)
    
    def _request(
        self, 
        method: str, 
        endpoint: str, 
        params: Dict = None, 
        json_data: Dict = None,
        timeout: int = None
    ) -> Dict:
        """
        Make an HTTP request to the API.
        
        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint path
            params: Query parameters
            json_data: JSON body data
            timeout: Request timeout in seconds
            
        Returns:
            Parsed JSON response
            
        Raises:
            NetworkError: When network error occurs
            APIError: When API returns an error
        """
        url = urljoin(self.base_url, endpoint)
        timeout = timeout or self.config.timeout
        
        logger.debug(f"Making {method} request to {url}")
        if params:
            logger.debug(f"Request params: {params}")
        if json_data:
            logger.debug(f"Request data: {json_data}")
        
        try:
            response = self.session.request(
                method=method,
                url=url,
                params=params,
                json=json_data,
                timeout=timeout,
                verify=self.config.verify_ssl
            )
            
            return self._handle_response(response)
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Network error: {e}")
            raise NetworkError(f"Network error: {str(e)}")
    
    def health_check(self) -> Dict:
        """
        Check if the Academic API is running.
        
        Returns:
            Health status information
            
        Raises:
            NetworkError: When network error occurs
        """
        return self._request("GET", "/api/academic/health")
    
    def search(
        self, 
        query: str, 
        source: str = "arxiv", 
        limit: int = 10
    ) -> Dict:
        """
        Search for academic papers matching a query.
        
        Args:
            query: The search term
            source: Source to search (arxiv, semantic, openalex)
            limit: Maximum number of results
            
        Returns:
            Search results dictionary
            
        Raises:
            ValidationError: When query is invalid
            APIError: When API returns an error
        """
        if not query or not query.strip():
            raise ValidationError("Search query cannot be empty")
            
        params = {
            "query": query,
            "source": source,
            "limit": limit
        }
        
        return self._request("GET", "/api/academic/search", params)
    
    def search_multi_source(
        self, 
        query: str, 
        sources: List[str] = None, 
        limit: int = 5
    ) -> Dict:
        """
        Search multiple sources simultaneously and combine results.
        
        Args:
            query: The search term
            sources: List of sources to search
            limit: Maximum results per source
            
        Returns:
            Combined search results dictionary
            
        Raises:
            ValidationError: When query is invalid
            APIError: When API returns an error
        """
        if not query or not query.strip():
            raise ValidationError("Search query cannot be empty")
            
        if sources is None:
            sources = ["arxiv", "semantic", "openalex"]
            
        params = {
            "query": query,
            "sources": ",".join(sources),
            "limit": limit
        }
        
        return self._request("GET", "/api/academic/multi-source", params)
    
    def get_paper_details(
        self, 
        paper_id: str, 
        source: str = "arxiv"
    ) -> Dict:
        """
        Get detailed information about a specific paper.
        
        Args:
            paper_id: Unique identifier for the paper
            source: Source platform (arxiv, semantic, openalex)
            
        Returns:
            Paper details dictionary
            
        Raises:
            ValidationError: When paper_id is invalid
            ResourceNotFoundError: When paper is not found
            APIError: When API returns an error
        """
        if not paper_id or not paper_id.strip():
            raise ValidationError("Paper ID cannot be empty")
            
        params = {"source": source}
        
        try:
            return self._request("GET", f"/api/academic/details/{paper_id}", params)
        except ResourceNotFoundError:
            logger.error(f"Paper not found: {paper_id} (source: {source})")
            raise
    
    def download_paper(
        self, 
        paper_id: str, 
        source: str = "arxiv", 
        filename: str = "",
        timeout: int = 60  # Longer timeout for downloads
    ) -> Dict:
        """
        Download the PDF for a specific paper.
        
        Args:
            paper_id: Unique identifier for the paper
            source: Source platform (currently only arxiv is supported)
            filename: Custom filename for the downloaded PDF
            timeout: Request timeout in seconds
            
        Returns:
            Download information dictionary
            
        Raises:
            ValidationError: When paper_id is invalid
            ResourceNotFoundError: When paper is not found
            APIError: When API returns an error
        """
        if not paper_id or not paper_id.strip():
            raise ValidationError("Paper ID cannot be empty")
            
        params = {"source": source}
        
        if filename:
            params["filename"] = filename
        
        return self._request("GET", f"/api/academic/download/{paper_id}", params, timeout=timeout)
    
    def get_paper_citations(
        self, 
        paper_id: str, 
        source: str = "arxiv", 
        depth: int = 1
    ) -> Dict:
        """
        Get citation analysis for a specific paper.
        
        Args:
            paper_id: Unique identifier for the paper
            source: Source platform (arxiv, semantic, openalex)
            depth: Depth of citation analysis (1 = direct citations only)
            
        Returns:
            Citation analysis dictionary
            
        Raises:
            ValidationError: When paper_id is invalid
            ResourceNotFoundError: When paper is not found
            APIError: When API returns an error
        """
        if not paper_id or not paper_id.strip():
            raise ValidationError("Paper ID cannot be empty")
            
        params = {
            "source": source,
            "depth": depth
        }
        
        return self._request("GET", f"/api/academic/citations/{paper_id}", params)
    
    def get_paper_recommendations(
        self, 
        paper_id: str, 
        source: str = "arxiv", 
        limit: int = 5
    ) -> Dict:
        """
        Get recommended papers related to a specific paper.
        
        Args:
            paper_id: Unique identifier for the paper
            source: Source platform (arxiv, semantic, openalex)
            limit: Maximum number of recommendations
            
        Returns:
            Recommendations dictionary
            
        Raises:
            ValidationError: When paper_id is invalid
            ResourceNotFoundError: When paper is not found
            APIError: When API returns an error
        """
        if not paper_id or not paper_id.strip():
            raise ValidationError("Paper ID cannot be empty")
            
        params = {
            "source": source,
            "limit": limit
        }
        
        return self._request("GET", f"/api/academic/recommendations/{paper_id}", params)
    
    def bulk_download_papers(
        self, 
        paper_ids: List[str], 
        source: str = "arxiv",
        timeout: int = 120  # Extended timeout for bulk operations
    ) -> Dict:
        """
        Download multiple papers in bulk.
        
        Args:
            paper_ids: List of paper IDs to download
            source: Source platform (currently only arxiv is supported)
            timeout: Request timeout in seconds
            
        Returns:
            Bulk download result dictionary
            
        Raises:
            ValidationError: When paper_ids is invalid
            APIError: When API returns an error
        """
        if not paper_ids:
            raise ValidationError("Paper IDs list cannot be empty")
            
        data = {
            "paper_ids": paper_ids,
            "source": source
        }
        
        return self._request("POST", "/api/academic/bulk/download", json_data=data, timeout=timeout)
    
    def search_and_download_all(
        self, 
        query: str, 
        source: str = "arxiv", 
        limit: int = 5,
        use_bulk: bool = True
    ) -> Union[List[Dict], Dict]:
        """
        Search for papers and download all results.
        
        Args:
            query: The search term
            source: Source to search
            limit: Maximum number of results
            use_bulk: Whether to use bulk download API (faster)
            
        Returns:
            If use_bulk=True: Bulk download result dictionary
            If use_bulk=False: List of download information dictionaries
            
        Raises:
            ValidationError: When query is invalid
            APIError: When API returns an error
        """
        # First search for papers
        search_results = self.search(query, source, limit)
        papers = search_results.get("results", [])
        
        if not papers:
            logger.info(f"No results found for query: {query}")
            return [] if not use_bulk else {"status": "completed", "successful": [], "failed": []}
        
        logger.info(f"Found {len(papers)} papers for query: {query}")
        
        # Extract paper IDs
        paper_ids = [paper.get("id") for paper in papers if paper.get("id")]
        
        # Use bulk download API if requested (more efficient)
        if use_bulk and paper_ids:
            logger.info(f"Downloading {len(paper_ids)} papers in bulk")
            try:
                return self.bulk_download_papers(paper_ids, source)
            except APIError as e:
                logger.error(f"Bulk download failed: {e}. Falling back to individual downloads.")
                # Fall back to individual downloads
        
        # Download each paper individually
        logger.info(f"Downloading {len(papers)} papers individually")
        download_results = []
        for paper in papers:
            paper_id = paper.get("id")
            if paper_id:
                try:
                    download_info = self.download_paper(paper_id, source)
                    download_info["title"] = paper.get("title")
                    download_results.append(download_info)
                    logger.info(f"Downloaded paper: {paper.get('title', paper_id)}")
                except Exception as e:
                    logger.error(f"Error downloading paper {paper_id}: {e}")
                    download_results.append({
                        "id": paper_id,
                        "title": paper.get("title"),
                        "error": str(e),
                        "status": "error"
                    })
        
        return download_results
    
    def analyze_and_visualize_paper(
        self, 
        paper_id: str, 
        source: str = "arxiv",
        include_citations: bool = True,
        include_recommendations: bool = True
    ) -> Dict:
        """
        Comprehensive analysis of a paper: details, citations, and recommendations.
        
        Args:
            paper_id: Unique identifier for the paper
            source: Source platform
            include_citations: Whether to include citation analysis
            include_recommendations: Whether to include recommendations
            
        Returns:
            Dictionary with comprehensive paper analysis
            
        Raises:
            ValidationError: When paper_id is invalid
            ResourceNotFoundError: When paper is not found
            APIError: When API returns an error
        """
        # Get paper details
        details = self.get_paper_details(paper_id, source)
        
        result = {
            "paper_id": paper_id,
            "source": source,
            "details": details
        }
        
        # Get citation analysis if requested
        if include_citations:
            try:
                citations = self.get_paper_citations(paper_id, source)
                result["citations"] = citations
            except Exception as e:
                logger.warning(f"Failed to get citation analysis: {e}")
                result["citations"] = {"error": str(e)}
        
        # Get recommendations if requested
        if include_recommendations:
            try:
                recommendations = self.get_paper_recommendations(paper_id, source)
                result["recommendations"] = recommendations
            except Exception as e:
                logger.warning(f"Failed to get recommendations: {e}")
                result["recommendations"] = {"error": str(e)}
        
        return result
    
    def get_papers_batch(
        self, 
        paper_ids: List[str], 
        source: str = "arxiv"
    ) -> List[Dict]:
        """
        Get details for multiple papers in parallel.
        
        Args:
            paper_ids: List of paper IDs
            source: Source platform
            
        Returns:
            List of paper detail dictionaries
            
        Raises:
            ValidationError: When paper_ids is invalid
            APIError: When API returns an error
        """
        if not paper_ids:
            raise ValidationError("Paper IDs list cannot be empty")
        
        results = []
        successful = 0
        failed = 0
        
        # Use concurrent.futures for parallel requests
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(10, len(paper_ids))) as executor:
            # Create a future for each paper ID
            future_to_id = {
                executor.submit(self.get_paper_details, paper_id, source): paper_id
                for paper_id in paper_ids
            }
            
            # Process as they complete
            for future in concurrent.futures.as_completed(future_to_id):
                paper_id = future_to_id[future]
                try:
                    paper_details = future.result()
                    results.append(paper_details)
                    successful += 1
                    logger.debug(f"Retrieved details for paper {paper_id}")
                except Exception as e:
                    logger.error(f"Error retrieving paper {paper_id}: {e}")
                    results.append({
                        "id": paper_id,
                        "error": str(e),
                        "status": "error"
                    })
                    failed += 1
        
        logger.info(f"Retrieved {successful} papers successfully, {failed} failed")
        return results
    
    def extract_papers_from_url(
        self, 
        url: str, 
        download: bool = False, 
        output_folder: str = None
    ) -> Dict:
        """
        Extract papers from a URL and optionally download them.
        
        Args:
            url: URL to extract papers from
            download: Whether to download extracted papers
            output_folder: Folder to save downloads (if None, server default is used)
            
        Returns:
            Dictionary with extraction results
            
        Raises:
            ValidationError: When URL is invalid
            APIError: When API returns an error
        """
        if not url or not url.strip():
            raise ValidationError("URL cannot be empty")
        
        params = {
            "url": url,
            "download": download
        }
        
        if output_folder:
            params["output_folder"] = output_folder
        
        return self._request("GET", "/api/academic/extract", params)

def main():
    """Command-line interface for the Academic API client."""
    parser = argparse.ArgumentParser(description="Academic API Client")
    
    # Subparsers for different commands
    subparsers = parser.add_subparsers(dest="command", help="Command")
    
    # Common arguments for all commands
    common_parser = argparse.ArgumentParser(add_help=False)
    common_parser.add_argument("--api-url", help="Academic API URL (default: ACADEMIC_API_URL env var or http://localhost:5000)")
    common_parser.add_argument("--api-key", help="API key (default: ACADEMIC_API_KEY env var)")
    common_parser.add_argument("--source", default="arxiv", help="Source platform (default: arxiv)")
    common_parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    
    # Search command
    search_parser = subparsers.add_parser("search", parents=[common_parser], help="Search for papers")
    search_parser.add_argument("--query", required=True, help="Search query")
    search_parser.add_argument("--limit", type=int, default=5, help="Maximum results (default: 5)")
    search_parser.add_argument("--download", action="store_true", help="Also download PDFs")
    search_parser.add_argument("--bulk", action="store_true", help="Use bulk download API")
    search_parser.add_argument("--output", help="Output JSON file")
    
    # Multi-source search command
    multi_parser = subparsers.add_parser("multi-search", parents=[common_parser], help="Search multiple sources")
    multi_parser.add_argument("--query", required=True, help="Search query")
    multi_parser.add_argument("--sources", default="arxiv,semantic,openalex", help="Comma-separated list of sources (default: arxiv,semantic,openalex)")
    multi_parser.add_argument("--limit", type=int, default=3, help="Maximum results per source (default: 3)")
    multi_parser.add_argument("--output", help="Output JSON file")
    
    # Get paper details command
    details_parser = subparsers.add_parser("details", parents=[common_parser], help="Get paper details")
    details_parser.add_argument("--id", required=True, help="Paper ID")
    details_parser.add_argument("--output", help="Output JSON file")
    
    # Download paper command
    download_parser = subparsers.add_parser("download", parents=[common_parser], help="Download paper PDF")
    download_parser.add_argument("--id", required=True, help="Paper ID")
    download_parser.add_argument("--filename", help="Custom filename")
    
    # Citations command
    citations_parser = subparsers.add_parser("citations", parents=[common_parser], help="Get paper citations")
    citations_parser.add_argument("--id", required=True, help="Paper ID")
    citations_parser.add_argument("--depth", type=int, default=1, help="Citation depth (default: 1)")
    citations_parser.add_argument("--output", help="Output JSON file")
    
    # Recommendations command
    recommendations_parser = subparsers.add_parser("recommendations", parents=[common_parser], help="Get paper recommendations")
    recommendations_parser.add_argument("--id", required=True, help="Paper ID")
    recommendations_parser.add_argument("--limit", type=int, default=5, help="Maximum recommendations (default: 5)")
    recommendations_parser.add_argument("--output", help="Output JSON file")
    
    # Analyze command
    analyze_parser = subparsers.add_parser("analyze", parents=[common_parser], help="Comprehensive paper analysis")
    analyze_parser.add_argument("--id", required=True, help="Paper ID")
    analyze_parser.add_argument("--output", help="Output JSON file")
    
    # Bulk download command
    bulk_parser = subparsers.add_parser("bulk-download", parents=[common_parser], help="Bulk download papers")
    bulk_parser.add_argument("--ids", required=True, help="Comma-separated list of paper IDs")
    
    # Extract papers from URL
    extract_parser = subparsers.add_parser("extract", parents=[common_parser], help="Extract papers from URL")
    extract_parser.add_argument("--url", required=True, help="URL to extract papers from")
    extract_parser.add_argument("--download", action="store_true", help="Download extracted papers")
    extract_parser.add_argument("--output-folder", help="Custom output folder for downloads")
    
    # Health check command
    health_parser = subparsers.add_parser("health", parents=[common_parser], help="Check API health")
    
    # Parse arguments
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return 0
    
    # Create client
    try:
        client = AcademicApiClient(
            base_url=args.api_url,
            api_key=args.api_key,
            debug=args.debug
        )
        
        # Execute command
        if args.command == "search":
            results = client.search(args.query, args.source, args.limit)
            if args.download:
                logger.info(f"Downloading {min(args.limit, len(results.get('results', [])))} papers...")
                download_results = client.search_and_download_all(
                    args.query, args.source, args.limit, use_bulk=args.bulk
                )
                print_results(download_results, "downloads")
            else:
                print_results(results)
            
            if args.output:
                save_json(results, args.output)
        
        elif args.command == "multi-search":
            sources = [s.strip() for s in args.sources.split(",")]
            results = client.search_multi_source(args.query, sources, args.limit)
            print_results(results)
            
            if args.output:
                save_json(results, args.output)
        
        elif args.command == "details":
            details = client.get_paper_details(args.id, args.source)
            print_paper_details(details)
            
            if args.output:
                save_json(details, args.output)
        
        elif args.command == "download":
            download_info = client.download_paper(args.id, args.source, args.filename)
            print(f"Downloaded PDF to: {download_info.get('file_path')}")
        
        elif args.command == "citations":
            citations = client.get_paper_citations(args.id, args.source, args.depth)
            print_citation_analysis(citations)
            
            if args.output:
                save_json(citations, args.output)
        
        elif args.command == "recommendations":
            recommendations = client.get_paper_recommendations(args.id, args.source, args.limit)
            print_recommendations(recommendations)
            
            if args.output:
                save_json(recommendations, args.output)
        
        elif args.command == "analyze":
            analysis = client.analyze_and_visualize_paper(args.id, args.source)
            print_paper_analysis(analysis)
            
            if args.output:
                save_json(analysis, args.output)
        
        elif args.command == "bulk-download":
            paper_ids = [id.strip() for id in args.ids.split(",")]
            result = client.bulk_download_papers(paper_ids, args.source)
            print_bulk_download_results(result)
            
        elif args.command == "extract":
            result = client.extract_papers_from_url(
                args.url, 
                download=args.download,
                output_folder=args.output_folder
            )
            
            if "pdfs" in result:
                print(f"Found {len(result['pdfs'])} papers in {args.url}")
                for i, pdf in enumerate(result["pdfs"], 1):
                    print(f"[{i}] {pdf.get('title', 'Unknown')}")
                    if args.download and "file_path" in pdf:
                        print(f"    Downloaded to: {pdf['file_path']}")
            else:
                print(f"Extraction result: {result.get('status', 'unknown')}")
                if "error" in result:
                    print(f"Error: {result['error']}")
        
        elif args.command == "health":
            health = client.health_check()
            print(f"API Status: {health.get('status', 'unknown')}")
            print(f"Web Scraper Available: {health.get('web_scraper_available', False)}")
            print(f"Timestamp: {health.get('timestamp')}")
        
        return 0
        
    except ValidationError as e:
        logger.error(f"Validation error: {e}")
        return 1
    
    except AuthenticationError as e:
        logger.error(f"Authentication error: {e}")
        logger.error("Please provide a valid API key via --api-key or ACADEMIC_API_KEY environment variable")
        return 1
    
    except ResourceNotFoundError as e:
        logger.error(f"Resource not found: {e}")
        return 1
    
    except RateLimitError as e:
        logger.error(f"Rate limit exceeded: {e}")
        if e.retry_after:
            logger.error(f"Please try again after {e.retry_after} seconds")
        return 1
    
    except ServerError as e:
        logger.error(f"Server error: {e}")
        return 1
    
    except NetworkError as e:
        logger.error(f"Network error: {e}")
        logger.error("Please check your connection and the API server status")
        return 1
    
    except APIError as e:
        logger.error(f"API error: {e}")
        return 1
    
    except KeyboardInterrupt:
        logger.info("Operation cancelled by user")
        return 130
    
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        if args.debug:
            import traceback
            traceback.print_exc()
        return 1

def print_results(results: Dict, result_type: str = "search"):
    """
    Print search results in a formatted way.
    
    Args:
        results: Search results dictionary
        result_type: Type of results ('search' or 'downloads')
    """
    if "error" in results:
        print(f"Error: {results['error']}")
        return
    
    if result_type == "search":
        total = results.get("total_results", 0)
        items = results.get("results", [])
        
        print(f"\nFound {total} results:")
        
        # Print source distribution if available
        source_dist = results.get("source_distribution")
        if source_dist:
            print("\nSource Distribution:")
            for source, count in source_dist.items():
                print(f"  {source}: {count}")
        
        print("\nResults:")
        for i, paper in enumerate(items, 1):
            print(f"\n[{i}] {paper.get('title', 'Unknown Title')}")
            print(f"  Authors: {', '.join(paper.get('authors', ['Unknown']))}")
            print(f"  Source: {paper.get('source', 'Unknown')}")
            print(f"  ID: {paper.get('id', 'Unknown')}")
            
            abstract = paper.get('abstract', '')
            if abstract:
                # Truncate and format abstract
                if len(abstract) > 200:
                    abstract = abstract[:197] + "..."
                print(f"  Abstract: {abstract}")
    
    elif result_type == "downloads":
        if isinstance(results, list):
            # Individual downloads
            print(f"\nDownload Results ({len(results)} papers):")
            for i, download in enumerate(results, 1):
                status = download.get("status", "unknown")
                title = download.get("title", "Unknown")
                
                if status == "success" or "file_path" in download:
                    print(f"[{i}] {title}")
                    print(f"  Status: Success")
                    print(f"  File: {download.get('file_path', 'Unknown')}")
                else:
                    print(f"[{i}] {title}")
                    print(f"  Status: Failed")
                    print(f"  Error: {download.get('error', 'Unknown error')}")
        else:
            # Bulk download
            successful = results.get("successful_downloads", 0)
            failed = results.get("failed_downloads", 0)
            total = results.get("total_papers", 0)
            
            print(f"\nBulk Download Results:")
            print(f"  Total Papers: {total}")
            print(f"  Successfully Downloaded: {successful}")
            print(f"  Failed: {failed}")
            print(f"  Download Directory: {results.get('batch_directory', 'Unknown')}")
            
            if "successful" in results and results["successful"]:
                print("\nSuccessful Downloads:")
                for i, paper in enumerate(results["successful"], 1):
                    print(f"  [{i}] {paper.get('title', paper.get('paper_id', 'Unknown'))}")
                    print(f"      File: {paper.get('file_path', 'Unknown')}")
            
            if "failed" in results and results["failed"]:
                print("\nFailed Downloads:")
                for i, paper in enumerate(results["failed"], 1):
                    print(f"  [{i}] {paper.get('paper_id', 'Unknown')}")
                    print(f"      Error: {paper.get('error', 'Unknown error')}")

def print_paper_details(paper: Dict):
    """
    Print paper details in a formatted way.
    
    Args:
        paper: Paper details dictionary
    """
    if "error" in paper:
        print(f"Error: {paper['error']}")
        return
    
    print(f"\nPaper Details:")
    print(f"  Title: {paper.get('title', 'Unknown')}")
    print(f"  Authors: {', '.join(paper.get('authors', ['Unknown']))}")
    print(f"  Publication Date: {paper.get('publication_date', 'Unknown')}")
    print(f"  Source: {paper.get('source', 'Unknown')}")
    print(f"  ID: {paper.get('id', 'Unknown')}")
    print(f"  PDF URL: {paper.get('pdf_url', 'Unknown')}")
    
    abstract = paper.get('abstract', '')
    if abstract:
        print("\nAbstract:")
        # Format abstract with word wrapping at 80 chars
        import textwrap
        print(textwrap.fill(abstract, width=80))
    
    metadata = paper.get('metadata', {})
    if metadata:
        print("\nMetadata:")
        for key, value in metadata.items():
            if isinstance(value, list):
                print(f"  {key}: {', '.join(value)}")
            else:
                print(f"  {key}: {value}")

def print_citation_analysis(citations: Dict):
    """
    Print citation analysis in a formatted way.
    
    Args:
        citations: Citation analysis dictionary
    """
    if "error" in citations:
        print(f"Error: {citations['error']}")
        return
    
    print(f"\nCitation Analysis:")
    print(f"  Paper: {citations.get('paper_title', 'Unknown')}")
    print(f"  ID: {citations.get('paper_id', 'Unknown')}")
    print(f"  Total Citations: {citations.get('total_citations', 'Unknown')}")
    
    # Print citations by year
    by_year = citations.get('citation_by_year', {})
    if by_year:
        print("\nCitations by Year:")
        for year, count in sorted(by_year.items()):
            print(f"  {year}: {count}")
    
    # Print top citing authors
    top_authors = citations.get('top_citing_authors', [])
    if top_authors:
        print("\nTop Citing Authors:")
        for author in top_authors:
            print(f"  {author.get('name', 'Unknown')}: {author.get('count', 0)} citations (h-index: {author.get('h_index', 'Unknown')})")
    
    # Print top citing venues
    top_venues = citations.get('top_citing_venues', [])
    if top_venues:
        print("\nTop Citing Venues:")
        for venue in top_venues:
            print(f"  {venue.get('name', 'Unknown')}: {venue.get('count', 0)} citations (impact factor: {venue.get('impact_factor', 'Unknown')})")
    
    # Print citation network info
    network = citations.get('citation_network', {})
    if network:
        nodes = network.get('nodes', [])
        links = network.get('links', [])
        print(f"\nCitation Network: {len(nodes)} nodes, {len(links)} links")
        
        # Print a summary of node types
        node_types = {}
        for node in nodes:
            node_type = node.get('type', 'unknown')
            node_types[node_type] = node_types.get(node_type, 0) + 1
        
        for node_type, count in node_types.items():
            print(f"  {node_type} papers: {count}")

def print_recommendations(recommendations: Dict):
    """
    Print paper recommendations in a formatted way.
    
    Args:
        recommendations: Recommendations dictionary
    """
    if "error" in recommendations:
        print(f"Error: {recommendations['error']}")
        return
    
    print(f"\nRecommendations for Paper: {recommendations.get('paper_id', 'Unknown')}")
    print(f"  Source: {recommendations.get('source', 'Unknown')}")
    print(f"  Recommendation Count: {recommendations.get('recommendation_count', 0)}")
    
    items = recommendations.get('recommendations', [])
    if not items:
        print("\nNo recommendations found.")
        return
    
    print("\nRecommended Papers:")
    for i, paper in enumerate(items, 1):
        print(f"\n[{i}] {paper.get('title', 'Unknown')}")
        print(f"  Authors: {', '.join(paper.get('authors', ['Unknown']))}")
        print(f"  Publication Date: {paper.get('publication_date', 'Unknown')}")
        print(f"  Similarity Score: {paper.get('similarity_score', 'Unknown')}")
        
        shared_keywords = paper.get('shared_keywords', [])
        if shared_keywords:
            print(f"  Shared Keywords: {', '.join(shared_keywords)}")
        
        abstract = paper.get('abstract', '')
        if abstract:
            # Truncate and format abstract
            if len(abstract) > 200:
                abstract = abstract[:197] + "..."
            print(f"  Abstract: {abstract}")

def print_paper_analysis(analysis: Dict):
    """
    Print comprehensive paper analysis in a formatted way.
    
    Args:
        analysis: Paper analysis dictionary
    """
    print(f"\nComprehensive Analysis for Paper: {analysis.get('paper_id', 'Unknown')}")
    print(f"  Source: {analysis.get('source', 'Unknown')}")
    
    # Print paper details
    details = analysis.get('details', {})
    if details and "error" not in details:
        print_paper_details(details)
    elif "error" in details:
        print(f"\nDetails Error: {details['error']}")
    
    # Print citation analysis
    citations = analysis.get('citations', {})
    if citations and "error" not in citations:
        print_citation_analysis(citations)
    elif "error" in citations:
        print(f"\nCitation Analysis Error: {citations['error']}")
    
    # Print recommendations
    recommendations = analysis.get('recommendations', {})
    if recommendations and "error" not in recommendations:
        print_recommendations(recommendations)
    elif "error" in recommendations:
        print(f"\nRecommendations Error: {recommendations['error']}")

def print_bulk_download_results(result: Dict):
    """
    Print bulk download results in a formatted way.
    
    Args:
        result: Bulk download result dictionary
    """
    if "error" in result:
        print(f"Error: {result['error']}")
        return
    
    successful = result.get("successful_downloads", 0)
    failed = result.get("failed_downloads", 0)
    total = result.get("total_papers", 0)
    
    print(f"\nBulk Download Results:")
    print(f"  Batch ID: {result.get('batch_id', 'Unknown')}")
    print(f"  Total Papers: {total}")
    print(f"  Successfully Downloaded: {successful}")
    print(f"  Failed: {failed}")
    print(f"  Download Directory: {result.get('batch_directory', 'Unknown')}")
    
    # Print successful downloads
    successful_items = result.get("successful", [])
    if successful_items:
        print("\nSuccessful Downloads:")
        for i, item in enumerate(successful_items, 1):
            print(f"  [{i}] {item.get('title', item.get('paper_id', 'Unknown'))}")
            print(f"      File: {item.get('file_path', 'Unknown')}")
            print(f"      Size: {item.get('file_size', 0)} bytes")
    
    # Print failed downloads
    failed_items = result.get("failed", [])
    if failed_items:
        print("\nFailed Downloads:")
        for i, item in enumerate(failed_items, 1):
            print(f"  [{i}] {item.get('paper_id', 'Unknown')}")
            print(f"      Error: {item.get('error', 'Unknown error')}")

def save_json(data: Dict, filepath: str):
    """
    Save data to a JSON file.
    
    Args:
        data: Data to save
        filepath: Output file path
    """
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"Results saved to {filepath}")
    except Exception as e:
        logger.error(f"Error saving to {filepath}: {e}")
        print(f"Error saving results: {e}")

if __name__ == "__main__":
    sys.exit(main())