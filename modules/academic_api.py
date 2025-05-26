"""
Academic API Module for NeuroGenServer

This module provides a RESTful API for searching, downloading, and analyzing 
academic papers from various sources such as arXiv, Semantic Scholar, and OpenAlex.
It integrates with the Flask application from the main module and provides 
authentication, caching, and advanced citation analysis features.
"""

import os
import re
import sys
import json
import time
import uuid
import logging
import traceback
from typing import Dict, List, Any, Optional, Union
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime  # Added missing import for datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('academic_api.log')
    ]
)
logger = logging.getLogger(__name__)

# Initialize global variables
app = None
limiter = None
search_cache = {}
details_cache = {}
history_log = []
web_scraper_available = False
socketio = None
API_KEYS = []
DEFAULT_OUTPUT_FOLDER = "downloads"
CACHE_TIMEOUT = 3600  # 1 hour default

def initialize(app_instance):
    """
    Initialize the Academic API with a Flask application instance.
    
    Args:
        app_instance: Flask application instance
        
    Returns:
        bool: True if initialization succeeded, False otherwise
    """
    global app, limiter, search_cache, details_cache, history_log
    global web_scraper_available, socketio, API_KEYS, DEFAULT_OUTPUT_FOLDER, CACHE_TIMEOUT
    
    try:
        # Store the Flask app
        app = app_instance
        
        # Initialize the rate limiter
        from flask_limiter import Limiter
        from flask_limiter.util import get_remote_address
        
        limiter = Limiter(
            get_remote_address,
            app=app,
            default_limits=["100 per day", "10 per minute"],
            storage_uri="memory://"
        )
        
        # Initialize caches and history log
        search_cache = {}
        details_cache = {}
        history_log = []
        
        # Try to access SocketIO from app
        if hasattr(app, 'socketio'):
            socketio = app.socketio
        elif 'socketio' in globals():
            # The socketio variable might be defined elsewhere
            pass
        
        # Try to import web_scraper
        try:
            import web_scraper
            web_scraper_available = True
            logger.info("Web scraper module loaded successfully")
        except ImportError:
            web_scraper_available = False
            logger.warning("web_scraper module not available, running in limited mode")

        # Load configuration
        API_KEYS = os.environ.get("API_KEYS", "test_key,dev_key").split(",")
        DEFAULT_OUTPUT_FOLDER = os.environ.get("DEFAULT_OUTPUT_FOLDER", "downloads")
        CACHE_TIMEOUT = int(os.environ.get("CACHE_TIMEOUT", "3600"))  # 1 hour

        # Create output folder if it doesn't exist
        os.makedirs(DEFAULT_OUTPUT_FOLDER, exist_ok=True)
        
        # Register routes
        _register_routes()
        
        logger.info("Academic API initialized successfully")
        return True
        
    except Exception as e:
        logger.error(f"Failed to initialize Academic API: {e}")
        logger.debug(traceback.format_exc())
        return False

def _register_routes():
    """Register all API routes with the Flask application."""
    if not app:
        logger.error("Cannot register routes - Flask app not initialized")
        return
    
    # Register health check route
    app.add_url_rule(
        "/api/health", 
        "health_check", 
        health_check, 
        methods=["GET"]
    )
    
    # Register search routes
    app.add_url_rule(
        "/api/search", 
        "search_papers", 
        search_papers, 
        methods=["GET"]
    )
    
    app.add_url_rule(
        "/api/multi-source", 
        "multi_source_search", 
        multi_source_search, 
        methods=["GET"]
    )
    
    # Register detail routes
    app.add_url_rule(
        "/api/details/<path:id>", 
        "paper_details", 
        paper_details, 
        methods=["GET"]
    )
    
    # Register download routes
    app.add_url_rule(
        "/api/download/<path:id>", 
        "download_paper", 
        download_paper, 
        methods=["GET"]
    )
    
    app.add_url_rule(
        "/api/download_paper", 
        "download_academic_paper", 
        download_academic_paper, 
        methods=["GET"]
    )
    
    # Register error handlers
    app.errorhandler(404)(not_found)
    app.errorhandler(429)(ratelimit_handler)
    app.errorhandler(500)(server_error)
    
    logger.info("Academic API routes registered successfully")

# -----------------------------------------------------------------------------
# Authentication Decorator
# -----------------------------------------------------------------------------
def require_api_key(f):
    """Decorator to require API key for a route."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        api_key = request.headers.get('X-API-Key')
        
        # Check if API key is provided and valid
        if not api_key:
            return jsonify({"error": {"code": "MISSING_API_KEY", "message": "API key is required"}}), 401
        
        if api_key not in API_KEYS:
            return jsonify({"error": {"code": "INVALID_API_KEY", "message": "Invalid API key"}}), 401
        
        return f(*args, **kwargs)
    
    # Ensure wraps is available
    try:
        from functools import wraps
    except ImportError:
        logger.error("functools.wraps not available - authentication will not work")
        return f
    
    return decorated_function

# -----------------------------------------------------------------------------
# Utility Functions
# -----------------------------------------------------------------------------
def sanitize_query(query: str) -> str:
    """Sanitize a search query by removing special characters."""
    return re.sub(r'[^\w\s.-]', '', query).strip()

def generate_cache_key(endpoint: str, **params) -> str:
    """Generate a unique cache key based on endpoint and parameters."""
    params_str = "-".join(f"{k}={v}" for k, v in sorted(params.items()))
    return f"{endpoint}_{params_str}"

def get_from_cache(cache: Dict, key: str) -> Optional[Any]:
    """Get a value from cache if it exists and is not expired."""
    if key in cache:
        entry = cache[key]
        if time.time() - entry["timestamp"] < CACHE_TIMEOUT:
            logger.info(f"Cache hit for key: {key}")
            return entry["data"]
        else:
            # Cache expired
            del cache[key]
    return None

def add_to_cache(cache: Dict, key: str, data: Any) -> None:
    """Add a value to the cache with current timestamp."""
    cache[key] = {
        "data": data,
        "timestamp": time.time()
    }
    logger.info(f"Added to cache: {key}")

def format_search_results(raw_results: List[Dict]) -> Dict:
    """
    Format raw search results into a standardized response format.
    
    Args:
        raw_results: List of raw search results
        
    Returns:
        Formatted search results dict
    """
    formatted_results = []
    
    for result in raw_results:
        # Extract the required fields for each result
        formatted_result = {
            "id": result.get("identifier", result.get("id", str(uuid.uuid4()))),
            "title": result.get("title", "Unknown Title"),
            "authors": result.get("authors", []),
            "abstract": result.get("abstract", result.get("description", "")),
            "source": result.get("source", "unknown"),
            "pdf_url": result.get("pdf_url", "")
        }
        
        # Clean up fields
        if isinstance(formatted_result["abstract"], str) and len(formatted_result["abstract"]) > 500:
            formatted_result["abstract"] = formatted_result["abstract"][:497] + "..."
        
        formatted_results.append(formatted_result)
    
    return {
        "results": formatted_results,
        "total_results": len(formatted_results)
    }

def get_source_handler(source: str):
    """
    Get the appropriate handler function for a given source.
    
    Args:
        source: The source identifier (e.g., 'arxiv', 'semantic')
        
    Returns:
        Handler function or None if not supported
    """
    source = source.lower()
    
    if source == "arxiv":
        return search_arxiv
    elif source == "semantic":
        return search_semantic_scholar
    elif source == "openalex":
        return search_openalex
    else:
        return None

def add_to_history(task_id, task_type, filename, metadata=None):
    """
    Add a task to the history record
    
    Args:
        task_id: Unique ID for the task
        task_type: Type of task (e.g., "file_scraper")
        filename: Name of the file
        metadata: Additional metadata for the task
        
    Returns:
        Dictionary with the added history entry
    """
    try:
        # Create history entry
        entry = {
            "task_id": task_id,
            "type": task_type,
            "filename": filename,
            "timestamp": datetime.now().isoformat(),
            "unix_time": time.time()
        }
        
        # Add metadata if provided
        if metadata:
            entry.update(metadata)
        
        # Add to history log
        global history_log
        history_log.append(entry)
        
        # Persist to disk (optional)
        try:
            history_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'history.json')
            
            # Load existing history if file exists
            if os.path.exists(history_file):
                with open(history_file, 'r') as f:
                    try:
                        disk_history = json.load(f)
                        if isinstance(disk_history, list):
                            disk_history.append(entry)
                        else:
                            disk_history = [entry]
                    except json.JSONDecodeError:
                        disk_history = [entry]
            else:
                disk_history = [entry]
            
            # Write updated history to disk
            with open(history_file, 'w') as f:
                json.dump(disk_history, f, indent=2)
                
        except Exception as disk_error:
            logger.warning(f"Could not persist history to disk: {str(disk_error)}")
        
        # Emit event for real-time updates if Socket.IO is available
        if socketio:
            try:
                socketio.emit('history_updated', {
                    'new_entry': entry
                })
            except Exception as e:
                logger.error(f"Socket.IO emission failed: {e}")
        
        return entry
        
    except Exception as e:
        logger.error(f"Error adding to history: {str(e)}")
        return None

# -----------------------------------------------------------------------------
# API Source Handlers
# -----------------------------------------------------------------------------
def search_arxiv(query: str, limit: int = 10) -> List[Dict]:
    """
    Search arXiv for papers matching the query.
    
    Args:
        query: Search query
        limit: Maximum number of results to return
        
    Returns:
        List of paper information dictionaries
    """
    if not web_scraper_available:
        logger.error("Web scraper module not available for arXiv search")
        return []
    
    try:
        # Construct the arXiv search URL
        search_url = f"https://arxiv.org/search/?query={query}&searchtype=all"
        
        # Use web_scraper to get HTML content
        html_content = web_scraper.extract_html_text(search_url)
        
        # Parse the HTML to extract paper information
        # In a real implementation, you would parse the HTML properly
        # Here we'll create some sample results based on the query
        
        # Use web_scraper's fetch_pdf_links to get PDF links
        pdf_links = web_scraper.fetch_pdf_links(search_url)
        
        results = []
        for i, link in enumerate(pdf_links[:limit]):
            # Convert abstract URLs to proper format
            url = link.get("url", "")
            if "arxiv.org/abs/" in url:
                pdf_url = web_scraper.convert_arxiv_url(url)
                paper_id = url.split("/")[-1]
            else:
                pdf_url = url
                paper_id = f"arxiv:{str(uuid.uuid4())[:8]}"
            
            results.append({
                "id": paper_id,
                "identifier": paper_id,
                "title": link.get("title", f"Paper related to {query}"),
                "authors": ["Author A", "Author B"],  # Would parse from actual results
                "abstract": f"This is a sample abstract for a paper about {query}...",
                "pdf_url": pdf_url,
                "source": "arxiv"
            })
        
        return results
        
    except Exception as e:
        logger.error(f"Error searching arXiv: {e}")
        return []

def search_semantic_scholar(query: str, limit: int = 10) -> List[Dict]:
    """
    Search Semantic Scholar for papers matching the query.
    
    Args:
        query: Search query
        limit: Maximum number of results to return
        
    Returns:
        List of paper information dictionaries
    """
    if not web_scraper_available:
        logger.error("Web scraper module not available for Semantic Scholar search")
        return []
    
    try:
        # Construct the Semantic Scholar search URL
        search_url = f"https://www.semanticscholar.org/search?q={query}"
        
        # Use web_scraper to get HTML content and links
        results = []
        
        # This is a simplified placeholder implementation
        # In a real-world scenario, you would properly parse the HTML
        for i in range(min(5, limit)):
            results.append({
                "id": f"semantic:{str(uuid.uuid4())[:8]}",
                "title": f"Semantic Scholar result for {query} #{i+1}",
                "authors": ["Researcher C", "Researcher D"],
                "abstract": f"Abstract for a Semantic Scholar paper about {query}...",
                "pdf_url": f"https://example.com/semantic/{i}.pdf",
                "source": "semantic"
            })
        
        return results
        
    except Exception as e:
        logger.error(f"Error searching Semantic Scholar: {e}")
        return []

def search_openalex(query: str, limit: int = 10) -> List[Dict]:
    """
    Search OpenAlex for papers matching the query.
    
    Args:
        query: Search query
        limit: Maximum number of results to return
        
    Returns:
        List of paper information dictionaries
    """
    try:
        # Placeholder implementation
        results = []
        
        for i in range(min(3, limit)):
            results.append({
                "id": f"openalex:{str(uuid.uuid4())[:8]}",
                "title": f"OpenAlex result for {query} #{i+1}",
                "authors": ["Researcher E", "Researcher F"],
                "abstract": f"Abstract for an OpenAlex paper about {query}...",
                "pdf_url": f"https://example.com/openalex/{i}.pdf",
                "source": "openalex"
            })
        
        return results
        
    except Exception as e:
        logger.error(f"Error searching OpenAlex: {e}")
        return []

def get_paper_details(paper_id: str, source: str = "arxiv") -> Dict:
    """
    Get detailed information about a specific paper.
    
    Args:
        paper_id: Unique identifier for the paper
        source: Source platform (e.g., 'arxiv', 'semantic')
        
    Returns:
        Dictionary with paper details or None if not found
    """
    if not web_scraper_available:
        logger.error("Web scraper module not available for paper details")
        return {"error": "Web scraper module not available"}
    
    try:
        if source.lower() == "arxiv":
            # Construct arXiv URL for the paper
            if not paper_id.startswith("http"):
                paper_url = f"https://arxiv.org/abs/{paper_id}"
            else:
                paper_url = paper_id
            
            # Use web_scraper to get HTML content
            html_content = web_scraper.extract_html_text(paper_url)
            
            # In a real implementation, parse the HTML properly
            # Here we create a sample result
            
            # Check if a PDF URL can be generated
            pdf_url = web_scraper.convert_arxiv_url(paper_url)
            
            return {
                "id": paper_id,
                "title": f"Detailed paper about {paper_id}",
                "authors": ["Author A", "Author B", "Author C"],
                "abstract": f"This is a detailed abstract for paper {paper_id}. It contains more comprehensive information about the research, methodology, and findings. The abstract would typically be several sentences long and provide a good overview of the paper's content.",
                "publication_date": "2023-01-15",
                "source": "arxiv",
                "pdf_url": pdf_url,
                "metadata": {
                    "categories": ["cs.AI", "cs.LG"],
                    "comments": "Published in Example Conference 2023",
                    "doi": f"10.1000/{paper_id}"
                }
            }
        else:
            # Handle other sources similarly
            return {
                "id": paper_id,
                "title": f"Paper from {source}",
                "authors": ["Unknown Author"],
                "abstract": "Abstract not available for this source yet.",
                "publication_date": "2023-01-01",
                "source": source,
                "pdf_url": "",
                "metadata": {}
            }
            
    except Exception as e:
        logger.error(f"Error getting paper details: {e}")
        return {"error": f"Failed to retrieve paper details: {str(e)}"}

# -----------------------------------------------------------------------------
# Citation Analysis Functions
# -----------------------------------------------------------------------------
def analyze_citations(paper_id: str, source: str = "arxiv", depth: int = 1) -> Dict:
    """
    Analyze citations for a specific paper.
    
    Args:
        paper_id: Unique identifier for the paper
        source: Source platform (e.g., 'arxiv', 'semantic')
        depth: Depth of citation analysis (1 = direct citations only)
        
    Returns:
        Dictionary with citation analysis
    """
    if not web_scraper_available:
        logger.error("Web scraper module not available for citation analysis")
        return {"error": "Web scraper module not available"}
    
    try:
        # Get paper details first
        paper_details = get_paper_details(paper_id, source)
        
        # In a real implementation, we would fetch actual citation data
        # Here we'll create sample citation data for demonstration
        
        # Sample data structure for citation analysis
        analysis = {
            "paper_id": paper_id,
            "paper_title": paper_details.get("title", "Unknown Paper"),
            "total_citations": 42,  # would be determined from actual data
            "citation_by_year": {
                "2020": 5,
                "2021": 12,
                "2022": 15,
                "2023": 10
            },
            "top_citing_authors": [
                {"name": "Author X", "count": 4, "h_index": 25},
                {"name": "Author Y", "count": 3, "h_index": 18},
                {"name": "Author Z", "count": 2, "h_index": 31}
            ],
            "top_citing_venues": [
                {"name": "Journal A", "count": 8, "impact_factor": 4.2},
                {"name": "Conference B", "count": 6, "impact_factor": 3.8},
                {"name": "Journal C", "count": 5, "impact_factor": 5.1}
            ],
            "citation_network": {
                "nodes": [],
                "links": []
            }
        }
        
        # Generate a simple citation network
        # In a real implementation, we would fetch the actual network
        if depth > 0:
            # Add the main paper as the central node
            analysis["citation_network"]["nodes"].append({
                "id": paper_id,
                "label": paper_details.get("title", "Unknown"),
                "type": "main",
                "year": paper_details.get("publication_date", "")[:4]  # Extract year
            })
            
            # Add some citing papers
            for i in range(1, 6):
                citing_id = f"citing_{i}_{paper_id}"
                analysis["citation_network"]["nodes"].append({
                    "id": citing_id,
                    "label": f"Citing Paper {i}",
                    "type": "citing",
                    "year": str(2020 + i % 4)
                })
                
                # Add link from citing paper to main paper
                analysis["citation_network"]["links"].append({
                    "source": citing_id,
                    "target": paper_id,
                    "type": "cites"
                })
            
            # Add some cited papers
            for i in range(1, 4):
                cited_id = f"cited_{i}_{paper_id}"
                analysis["citation_network"]["nodes"].append({
                    "id": cited_id,
                    "label": f"Cited Paper {i}",
                    "type": "cited",
                    "year": str(2018 + i)
                })
                
                # Add link from main paper to cited paper
                analysis["citation_network"]["links"].append({
                    "source": paper_id,
                    "target": cited_id,
                    "type": "cites"
                })
        
        return analysis
        
    except Exception as e:
        logger.error(f"Error analyzing citations: {e}")
        return {"error": f"Failed to analyze citations: {str(e)}"}

def recommend_related_papers(paper_id: str, source: str = "arxiv", limit: int = 5) -> List[Dict]:
    """
    Recommend papers related to the given paper.
    
    Args:
        paper_id: Unique identifier for the paper
        source: Source platform (e.g., 'arxiv', 'semantic')
        limit: Maximum number of recommendations
        
    Returns:
        List of related paper dictionaries
    """
    if not web_scraper_available:
        logger.error("Web scraper module not available for recommendations")
        return []
    
    try:
        # Get paper details first
        paper_details = get_paper_details(paper_id, source)
        
        # Extract keywords from the paper's title and abstract
        title = paper_details.get("title", "")
        abstract = paper_details.get("abstract", "")
        
        # In a real implementation, we would use NLP to extract keywords
        # and find related papers based on semantic similarity
        # Here we'll create sample recommendations
        
        recommendations = []
        for i in range(1, limit + 1):
            recommendations.append({
                "id": f"related_{i}_{paper_id}",
                "title": f"Related Paper {i} to {title[:30]}...",
                "authors": ["Researcher A", "Researcher B"],
                "abstract": f"This paper relates to the concepts in {title[:50]}...",
                "similarity_score": round(0.9 - (i * 0.1), 2),  # Decreasing similarity
                "shared_keywords": ["machine learning", "neural networks"],
                "publication_date": f"202{i}-01-01",
                "source": source,
                "pdf_url": f"https://example.com/related_{i}.pdf"
            })
        
        return recommendations
        
    except Exception as e:
        logger.error(f"Error generating recommendations: {e}")
        return []

# -----------------------------------------------------------------------------
# Bulk Processing Functions
# -----------------------------------------------------------------------------
def bulk_download_papers(paper_ids: List[str], source: str = "arxiv") -> Dict:
    """
    Download multiple papers in bulk.
    
    Args:
        paper_ids: List of paper IDs to download
        source: Source platform (e.g., 'arxiv', 'semantic')
        
    Returns:
        Dictionary with download results
    """
    if not web_scraper_available:
        logger.error("Web scraper module not available for bulk downloads")
        return {"error": "Web scraper module not available"}
    
    try:
        # Create a unique batch ID
        batch_id = str(uuid.uuid4())
        batch_dir = os.path.join(DEFAULT_OUTPUT_FOLDER, f"batch_{batch_id}")
        os.makedirs(batch_dir, exist_ok=True)
        
        # Track downloads
        successful = []
        failed = []
        
        # Process each paper ID
        for paper_id in paper_ids:
            try:
                # Get paper details
                paper_details = get_paper_details(paper_id, source)
                
                # Download the PDF
                if source.lower() == "arxiv":
                    if not paper_id.startswith("http"):
                        pdf_url = f"https://arxiv.org/pdf/{paper_id}.pdf"
                    else:
                        pdf_url = paper_id
                else:
                    # For other sources, get PDF URL from details
                    pdf_url = paper_details.get("pdf_url")
                    
                if not pdf_url:
                    raise ValueError(f"No PDF URL available for paper {paper_id}")
                
                # Download the PDF using web_scraper
                pdf_file = web_scraper.download_pdf(
                    url=pdf_url,
                    save_path=batch_dir,
                    emit_progress=False
                )
                
                # Add to successful downloads
                successful.append({
                    "paper_id": paper_id,
                    "title": paper_details.get("title", "Unknown"),
                    "file_path": pdf_file,
                    "file_name": os.path.basename(pdf_file),
                    "file_size": os.path.getsize(pdf_file) if os.path.exists(pdf_file) else 0
                })
                
            except Exception as e:
                logger.error(f"Error downloading paper {paper_id}: {e}")
                failed.append({
                    "paper_id": paper_id,
                    "error": str(e)
                })
        
        # Return download summary
        return {
            "status": "completed",
            "batch_id": batch_id,
            "batch_directory": batch_dir,
            "total_papers": len(paper_ids),
            "successful_downloads": len(successful),
            "failed_downloads": len(failed),
            "successful": successful,
            "failed": failed
        }
        
    except Exception as e:
        logger.error(f"Error in bulk download: {e}")
        return {"error": f"Bulk download failed: {str(e)}"}

# -----------------------------------------------------------------------------
# API Endpoints
# -----------------------------------------------------------------------------
def health_check():
    """Simple health check endpoint."""
    return jsonify({
        "status": "ok",
        "timestamp": time.time(),
        "web_scraper_available": web_scraper_available
    })

def search_papers():
    """
    Search for academic papers matching a query.
    
    Query Parameters:
        query (required): The search term
        source (optional): Specify a source (arxiv, semantic, openalex)
        limit (optional): Maximum number of results (default: 10)
    """
    query = request.args.get("query", "")
    source = request.args.get("source", "arxiv").lower()
    limit = int(request.args.get("limit", "10"))
    
    # Validate query
    if not query:
        return jsonify({"error": {"code": "INVALID_QUERY", "message": "The query parameter is missing."}}), 400
        
    # Sanitize query
    query = sanitize_query(query)
    
    # Check cache first
    cache_key = generate_cache_key("search", query=query, source=source, limit=limit)
    cached_result = get_from_cache(search_cache, cache_key)
    if cached_result:
        return jsonify(cached_result)
    
    try:
        # Get the appropriate handler for the source
        source_handler = get_source_handler(source)
        
        if not source_handler:
            return jsonify({
                "error": {
                    "code": "INVALID_SOURCE",
                    "message": f"Source '{source}' is not supported. Use 'arxiv', 'semantic', or 'openalex'."
                }
            }), 400
        
        # Execute the search
        raw_results = source_handler(query, limit)
        
        # Format results
        formatted_results = format_search_results(raw_results)
        
        # Add to cache
        add_to_cache(search_cache, cache_key, formatted_results)
        
        return jsonify(formatted_results)
        
    except Exception as e:
        logger.error(f"Error in search: {e}")
        tb = traceback.format_exc()
        logger.debug(tb)
        
        return jsonify({
            "error": {
                "code": "SEARCH_ERROR",
                "message": str(e)
            }
        }), 500

def paper_details(id):
    """
    Get detailed information about a specific paper.
    
    Path Parameters:
        id (required): Unique identifier for the article
        
    Query Parameters:
        source (optional): Specify the source (default: arxiv)
    """
    source = request.args.get("source", "arxiv").lower()
    
    # Check cache first
    cache_key = generate_cache_key("details", id=id, source=source)
    cached_result = get_from_cache(details_cache, cache_key)
    if cached_result:
        return jsonify(cached_result)
    
    try:
        # Get paper details
        details = get_paper_details(id, source)
        
        if "error" in details:
            return jsonify({"error": {"code": "DETAILS_ERROR", "message": details["error"]}}), 404
        
        # Add to cache
        add_to_cache(details_cache, cache_key, details)
        
        return jsonify(details)
        
    except Exception as e:
        logger.error(f"Error getting paper details: {e}")
        tb = traceback.format_exc()
        logger.debug(tb)
        
        return jsonify({
            "error": {
                "code": "DETAILS_ERROR",
                "message": str(e)
            }
        }), 500

def download_paper(id):
    """
    Download the PDF for a specific paper.
    
    Path Parameters:
        id (required): Unique identifier for the article
        
    Query Parameters:
        source (optional): Specify the source (default: arxiv)
        filename (optional): Custom filename for the downloaded PDF
    """
    source = request.args.get("source", "arxiv").lower()
    filename = request.args.get("filename", "")
    
    try:
        # Handle arxiv IDs
        if source == "arxiv":
            # Convert ID to URL if needed
            if not id.startswith("http"):
                pdf_url = f"https://arxiv.org/pdf/{id}.pdf"
            else:
                pdf_url = id
        else:
            # For other sources, we would need proper URL handling
            return jsonify({
                "error": {
                    "code": "UNSUPPORTED_SOURCE",
                    "message": f"PDF download for source '{source}' is not supported yet."
                }
            }), 400
        
        if not web_scraper_available:
            return jsonify({
                "error": {
                    "code": "MODULE_ERROR",
                    "message": "Web scraper module not available for PDF download."
                }
            }), 500
        
        # Generate a task ID for tracking download progress
        task_id = str(uuid.uuid4())
        
        # Download the PDF (run in a separate thread to avoid blocking)
        try:
            pdf_file = web_scraper.download_pdf(
                url=pdf_url,
                save_path=DEFAULT_OUTPUT_FOLDER,
                emit_progress=True,
                task_id=task_id
            )
            
            if pdf_file and os.path.exists(pdf_file):
                # Return download information
                return jsonify({
                    "status": "success",
                    "message": "PDF downloaded successfully",
                    "file_path": pdf_file,
                    "file_name": os.path.basename(pdf_file),
                    "file_size": os.path.getsize(pdf_file),
                    "task_id": task_id
                })
            else:
                return jsonify({
                    "error": {
                        "code": "DOWNLOAD_FAILED",
                        "message": "Failed to download PDF."
                    }
                }), 404
                
        except Exception as download_error:
            logger.error(f"Download error: {download_error}")
            return jsonify({
                "error": {
                    "code": "DOWNLOAD_ERROR",
                    "message": str(download_error)
                }
            }), 500
            
    except Exception as e:
        logger.error(f"Error in download endpoint: {e}")
        tb = traceback.format_exc()
        logger.debug(tb)
        
        return jsonify({
            "error": {
                "code": "SERVER_ERROR",
                "message": str(e)
            }
        }), 500

def download_academic_paper():
    """
    Download an academic paper from a URL.
    
    Query Parameters:
        url (required): URL of the paper to download
        filename (optional): Filename to save the downloaded paper
        output_folder (optional): Folder to save the downloaded paper
    """
    url = request.args.get("url", "")
    filename = request.args.get("filename", "")
    output_folder = request.args.get("output_folder", DEFAULT_OUTPUT_FOLDER)
    
    if not url:
        return jsonify({"error": "URL is required"}), 400
    
    # Generate a task ID for tracking
    task_id = str(uuid.uuid4())
    
    # Sanitize filename or use a default based on task_id
    sanitized_filename = ""
    if filename:
        # Remove invalid characters and ensure it's safe
        sanitized_filename = re.sub(r'[^\w\-_.]', '_', filename)
    else:
        sanitized_filename = f"paper_{task_id[:8]}"
    
    # Ensure file has proper extension
    if not sanitized_filename.endswith('.pdf') and not sanitized_filename.endswith('.json'):
        sanitized_filename = f"{sanitized_filename}.pdf"  # Default to PDF extension
    
    # Ensure output directory exists and create full path
    os.makedirs(output_folder, exist_ok=True)
    full_path = os.path.join(output_folder, sanitized_filename)
    
    # Start download task with proper tracking
    try:
        # Pass task_id for progress tracking and filename for saving
        success = web_scraper.download_pdf(
            url=url, 
            save_path=full_path,
            emit_progress=True, 
            task_id=task_id
        )
        
        if success:
            # Verify file was created
            if os.path.exists(full_path):
                # Log the successful download to history
                add_to_history(task_id, "file_scraper", sanitized_filename, {
                    "url": url,
                    "output_path": full_path,
                    "timestamp": datetime.now().isoformat()
                })
                
                return jsonify({
                    "status": "success",
                    "task_id": task_id,
                    "file_path": full_path,
                    "filename": sanitized_filename,
                    "message": f"Successfully downloaded to {full_path}"
                })
            else:
                return jsonify({
                    "status": "error", 
                    "error": "File download failed - file not created"
                }), 500
        else:
            return jsonify({
                "status": "error", 
                "error": "File download failed"
            }), 500
    except Exception as e:
        logger.error(f"Error downloading file: {str(e)}", exc_info=True)
        return jsonify({
            "status": "error", 
            "error": f"Error downloading file: {str(e)}"
        }), 500

def multi_source_search():
    """
    Search multiple sources simultaneously and combine results.
    
    Query Parameters:
        query (required): The search term
        sources (optional): Comma-separated list of sources (default: all)
        limit (optional): Maximum results per source (default: 5)
    """
    query = request.args.get("query", "")
    sources_param = request.args.get("sources", "arxiv,semantic,openalex")
    limit = int(request.args.get("limit", "5"))
    
    # Validate query
    if not query:
        return jsonify({"error": {"code": "INVALID_QUERY", "message": "The query parameter is missing."}}), 400
        
    # Sanitize query
    query = sanitize_query(query)
    
    # Parse sources
    sources = [s.strip().lower() for s in sources_param.split(",")]
    
    # Check cache first
    cache_key = generate_cache_key("multi", query=query, sources=sources_param, limit=limit)
    cached_result = get_from_cache(search_cache, cache_key)
    if cached_result:
        return jsonify(cached_result)
    
    try:
        all_results = []
        
        # Get handler functions for each source
        handlers = []
        for source in sources:
            handler = get_source_handler(source)
            if handler:
                handlers.append((source, handler))
        
        # Create thread pool for parallel searches
        with ThreadPoolExecutor(max_workers=len(handlers)) as executor:
            # Submit search tasks
            future_to_source = {
                executor.submit(handler, query, limit): source 
                for source, handler in handlers
            }
            
            # Process results as they complete
            for future in future_to_source:
                source = future_to_source[future]
                try:
                    source_results = future.result()
                    all_results.extend(source_results)
                except Exception as e:
                    logger.error(f"Error in {source} search: {e}")
        
        # Format combined results
        formatted_results = format_search_results(all_results)
        
        # Add source distribution information
        source_counts = {}
        for result in all_results:
            source = result.get("source", "unknown")
            source_counts[source] = source_counts.get(source, 0) + 1
        
        formatted_results["source_distribution"] = source_counts
        
        # Add to cache
        add_to_cache(search_cache, cache_key, formatted_results)
        
        return jsonify(formatted_results)
        
    except Exception as e:
        logger.error(f"Error in multi-source search: {e}")
        tb = traceback.format_exc()
        logger.debug(tb)
        
        return jsonify({
            "error": {
                "code": "SEARCH_ERROR",
                "message": str(e)
            }
        }), 500

# -----------------------------------------------------------------------------
# Error Handlers
# -----------------------------------------------------------------------------
def not_found(error):
    """Handle 404 errors."""
    return jsonify({"error": {"code": "NOT_FOUND", "message": "The requested resource was not found."}}), 404

def ratelimit_handler(error):
    """Handle rate limit exceeded errors."""
    return jsonify({"error": {"code": "RATE_LIMIT_EXCEEDED", "message": "Rate limit exceeded. Please try again later."}}), 429

def server_error(error):
    """Handle internal server errors."""
    return jsonify({"error": {"code": "SERVER_ERROR", "message": "An internal server error occurred."}}), 500

# -----------------------------------------------------------------------------
# Advanced API Routes (Citation Analysis, Recommendations, Bulk Operations)
# -----------------------------------------------------------------------------

# Register additional routes if available
def register_advanced_routes():
    """Register advanced API routes for citation analysis and bulk operations."""
    if not app:
        return
    
    @app.route("/api/analyze/citations/<path:id>", methods=["GET"])
    def analyze_paper_citations(id):
        """
        Analyze citations for a specific paper.
        
        Path Parameters:
            id (required): Unique identifier for the article
            
        Query Parameters:
            source (optional): Specify the source (default: arxiv)
            depth (optional): Depth of citation analysis (default: 1)
            format (optional): Output format (json, html, etc.)
        """
        source = request.args.get("source", "arxiv").lower()
        depth = int(request.args.get("depth", "1"))
        output_format = request.args.get("format", "json").lower()
        
        try:
            # Get citation analysis
            analysis = analyze_citations(id, source, depth)
            
            if "error" in analysis:
                return jsonify({"error": {"code": "ANALYSIS_ERROR", "message": analysis["error"]}}), 500
            
            # Handle different output formats
            if output_format == "json":
                return jsonify(analysis)
            elif output_format == "html":
                # In a real implementation, we would generate a visualization
                return jsonify({"error": {"code": "UNSUPPORTED_FORMAT", "message": "HTML output not implemented yet."}}), 501
            else:
                return jsonify({"error": {"code": "INVALID_FORMAT", "message": f"Format '{output_format}' is not supported."}}), 400
                
        except Exception as e:
            logger.error(f"Error analyzing citations: {e}")
            tb = traceback.format_exc()
            logger.debug(tb)
            
            return jsonify({
                "error": {
                    "code": "ANALYSIS_ERROR",
                    "message": str(e)
                }
            }), 500
    
    @app.route("/api/recommend/<path:id>", methods=["GET"])
    def recommend_papers(id):
        """
        Recommend papers related to the given paper.
        
        Path Parameters:
            id (required): Unique identifier for the article
            
        Query Parameters:
            source (optional): Specify the source (default: arxiv)
            limit (optional): Maximum number of recommendations (default: 5)
        """
        source = request.args.get("source", "arxiv").lower()
        limit = int(request.args.get("limit", "5"))
        
        try:
            # Get recommendations
            recommendations = recommend_related_papers(id, source, limit)
            
            return jsonify({
                "recommendations": recommendations,
                "total": len(recommendations),
                "paper_id": id,
                "source": source
            })
                
        except Exception as e:
            logger.error(f"Error getting recommendations: {e}")
            tb = traceback.format_exc()
            logger.debug(tb)
            
            return jsonify({
                "error": {
                    "code": "RECOMMENDATION_ERROR",
                    "message": str(e)
                }
            }), 500
    
    @app.route("/api/bulk/download", methods=["POST"])
    def bulk_download():
        """
        Download multiple papers in bulk.
        
        Request Body:
            paper_ids (required): List of paper IDs to download
            source (optional): Source platform (default: arxiv)
        """
        try:
            data = request.get_json()
            
            if not data or not isinstance(data, dict):
                return jsonify({
                    "error": {
                        "code": "INVALID_REQUEST",
                        "message": "Invalid request body. Expected JSON object."
                    }
                }), 400
            
            paper_ids = data.get("paper_ids", [])
            source = data.get("source", "arxiv").lower()
            
            if not paper_ids or not isinstance(paper_ids, list):
                return jsonify({
                    "error": {
                        "code": "INVALID_PAPER_IDS",
                        "message": "The paper_ids field is required and must be a list."
                    }
                }), 400
            
            # Execute bulk download
            result = bulk_download_papers(paper_ids, source)
            
            if "error" in result:
                return jsonify({"error": {"code": "DOWNLOAD_ERROR", "message": result["error"]}}), 500
            
            return jsonify(result)
                
        except Exception as e:
            logger.error(f"Error in bulk download: {e}")
            tb = traceback.format_exc()
            logger.debug(tb)
            
            return jsonify({
                "error": {
                    "code": "SERVER_ERROR",
                    "message": str(e)
                }
            }), 500

# Ensure proper imports are available
def ensure_imports():
    """Ensure all required Flask imports are available."""
    global request, jsonify
    try:
        from flask import request, jsonify
    except ImportError:
        logger.error("Cannot import Flask request and jsonify")
        return False
    return True

# Export useful standalone functions for external use
__all__ = [
    'initialize',
    'get_paper_details',
    'analyze_citations',
    'recommend_related_papers',
    'bulk_download_papers',
    'search_arxiv',
    'search_semantic_scholar',
    'search_openalex'
]

# For direct testing when this module is run standalone
if __name__ == "__main__":
    # Create a simple Flask app for testing if Flask is available
    try:
        from flask import Flask
        
        test_app = Flask(__name__)
        
        # Add CORS support
        try:
            from flask_cors import CORS
            CORS(test_app)
        except ImportError:
            logger.warning("CORS not available for test app")
        
        # Initialize the academic API
        if initialize(test_app):
            # Register advanced routes
            register_advanced_routes()
            
            # Run the test app
            logger.info("Running Academic API in standalone mode")
            test_app.run(host="0.0.0.0", port=5001, debug=True)
        else:
            logger.error("Failed to initialize Academic API")
            
    except ImportError:
        logger.error("Cannot run as standalone - Flask is not available")
        print("Academic API module loaded successfully but Flask not available for testing")