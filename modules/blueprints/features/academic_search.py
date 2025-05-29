"""
Academic Search Blueprint
Handles academic paper search and analysis functionality
"""

from flask import Blueprint, request, jsonify, current_app
import logging
import uuid
import time
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from functools import wraps

logger = logging.getLogger(__name__)

# Import academic-specific modules with error handling
# These modules are in the parent directory (modules/)
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

try:
    import academic_api
    academic_api_available = True
except ImportError:
    logger.warning("academic_api module not available")
    academic_api_available = False

try:
    from academic_api_redis import RedisCache, RedisRateLimiter
    redis_available = True
except ImportError:
    logger.warning("academic_api_redis module not available")
    redis_available = False
    RedisCache = None
    RedisRateLimiter = None

try:
    from citation_network_visualizer import CitationNetworkVisualizer
    citation_visualizer_available = True
except ImportError:
    logger.warning("citation_network_visualizer module not available")
    citation_visualizer_available = False
    CitationNetworkVisualizer = None

try:
    from academic_research_assistant import AcademicResearchAssistant
    research_assistant_available = True
except ImportError:
    logger.warning("academic_research_assistant module not available")
    research_assistant_available = False
    AcademicResearchAssistant = None

def format_search_results(raw_results):
    """
    Format raw search results into a standardized Academic API response format.
    
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

def search_academic_source(query, source, limit):
    """
    Search for academic papers from a specific source.
    
    Args:
        query: Search query
        source: Source to search (arxiv, semantic, etc.)
        limit: Maximum number of results
        
    Returns:
        List of paper information dictionaries
    """
    if not web_scraper_available:
        logger.warning("Web scraper module not available for academic search")
        return []
    
    try:
        if source == "arxiv":
            # Construct the arXiv search URL
            search_url = f"https://arxiv.org/search/?query={query}&searchtype=all"
            
            # Use web_scraper to fetch PDF links
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
                    "authors": [],  # Would extract actual authors with proper parsing
                    "abstract": "",  # Would extract actual abstract with proper parsing
                    "pdf_url": pdf_url,
                    "source": "arxiv"
                })
            
            return results
        
        elif source == "semantic":
            # Implement Semantic Scholar search
            # This would be similar to arXiv but with Semantic Scholar URLs
            return []
            
        elif source == "openalex":
            # Implement OpenAlex search
            # This would use OpenAlex specific APIs or web scraping
            return []
            
        else:
            logger.warning(f"Unsupported academic source: {source}")
            return []
            
    except Exception as e:
        logger.error(f"Error searching academic source: {e}")
        return []

def get_paper_citations(paper_id, source, depth=1):
    """
    Get citation information for a specific paper.
    
    Args:
        paper_id: Unique identifier for the paper
        source: Source platform (arxiv, semantic, etc.)
        depth: Depth of citation analysis
        
    Returns:
        Dictionary with citation analysis
    """
    try:
        # Get paper details first
        paper_details = get_paper_details(paper_id, source)
        
        # Sample data structure for citation analysis
        analysis = {
            "paper_id": paper_id,
            "paper_title": paper_details.get("title", "Unknown Paper"),
            "total_citations": 0,  # Would be determined from actual data
            "citation_by_year": {},
            "top_citing_authors": [],
            "top_citing_venues": [],
            "citation_network": {
                "nodes": [],
                "links": []
            }
        }
        
        # In a real implementation, you would fetch actual citation data
        # Here we'll add the main paper as the central node for the network visualization
        if depth > 0:
            # Add the main paper as the central node
            analysis["citation_network"]["nodes"].append({
                "id": paper_id,
                "label": paper_details.get("title", "Unknown"),
                "type": "main",
                "year": paper_details.get("publication_date", "")[:4] if paper_details.get("publication_date") else ""
            })
        
        return analysis
        
    except Exception as e:
        logger.error(f"Error analyzing citations: {e}")
        return {"error": f"Failed to analyze citations: {str(e)}"}

def recommend_related_papers(paper_id, source="arxiv", limit=5):
    """
    Recommend papers related to the given paper.
    
    Args:
        paper_id: Unique identifier for the paper
        source: Source platform
        limit: Maximum number of recommendations
        
    Returns:
        List of related paper dictionaries
    """
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

def get_paper_details(paper_id, source):
    """Get detailed information about a paper"""
    # Placeholder implementation
    return {
        "id": paper_id,
        "title": f"Detailed Paper {paper_id}",
        "authors": ["Author A", "Author B"],
        "abstract": "Full abstract text...",
        "source": source,
        "publication_date": "2023-01-15",
        "metadata": {}
    }

# Get shared services from app context when blueprint is registered
def get_require_api_key():
    """Get require_api_key decorator from app context"""
    from flask import current_app
    if hasattr(current_app, 'api_key_manager'):
        return current_app.api_key_manager.require_api_key
    else:
        # Fallback decorator
        def require_api_key(f):
            @wraps(f)
            def decorated_function(*args, **kwargs):
                return f(*args, **kwargs)
            return decorated_function
        return require_api_key

def get_limiter():
    """Get limiter from app context"""
    from flask import current_app
    if hasattr(current_app, 'limiter'):
        return current_app.limiter
    else:
        # Fallback limiter
        class MockLimiter:
            def limit(self, rate_limit):
                def decorator(f):
                    return f
                return decorator
        return MockLimiter()

# These will be set when blueprint is registered
require_api_key = lambda f: f  # Placeholder
limiter = type('MockLimiter', (), {'limit': lambda self, x: lambda f: f})()  # Placeholder

# Cache dictionaries (would normally be Redis or similar)
search_cache = {}
details_cache = {}

# Default output folder
DEFAULT_OUTPUT_FOLDER = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'academic_downloads')

# Check if web scraper is available
try:
    from blueprints.features.web_scraper import web_scraper
    web_scraper_available = True
except ImportError:
    web_scraper_available = False
    web_scraper = None

# Create the blueprint
academic_search_bp = Blueprint('academic_search', __name__, url_prefix='/api/academic')

# Export the blueprint and utility functions
__all__ = [
    'academic_search_bp',
    'format_search_results',
    'search_academic_source', 
    'get_paper_citations',
    'recommend_related_papers',
    'get_paper_details'
]

# Initialize the blueprint when it's registered
def init_blueprint(app):
    """Initialize blueprint with app context services"""
    global require_api_key, limiter
    
    # Import require_api_key from services
    try:
        from blueprints.core.services import require_api_key as api_key_decorator
        require_api_key = api_key_decorator
    except ImportError:
        require_api_key = get_require_api_key()
    
    if hasattr(app, 'limiter'):
        limiter = app.limiter
    else:
        limiter = get_limiter()

# This function should be called after the blueprint is registered
academic_search_bp.record(lambda setup_state: init_blueprint(setup_state.app))

# Helper functions
def get_from_cache(cache_dict, key, max_age=3600):
    """Get item from cache if not expired"""
    if key in cache_dict:
        item = cache_dict[key]
        if time.time() - item.get('timestamp', 0) < max_age:
            return item.get('data')
    return None

def add_to_cache(cache_dict, key, data):
    """Add item to cache with timestamp"""
    cache_dict[key] = {
        'data': data,
        'timestamp': time.time()
    }


def bulk_download_papers(paper_ids, source):
    """Download multiple papers"""
    # Placeholder implementation
    results = {
        "requested": len(paper_ids),
        "successful": 0,
        "failed": 0,
        "downloads": []
    }
    
    for paper_id in paper_ids:
        try:
            # Simulate download
            results["downloads"].append({
                "paper_id": paper_id,
                "status": "success",
                "file_path": f"/downloads/{paper_id}.pdf"
            })
            results["successful"] += 1
        except Exception as e:
            results["downloads"].append({
                "paper_id": paper_id,
                "status": "failed",
                "error": str(e)
            })
            results["failed"] += 1
    
    return results

def download_pdf(url, save_path, emit_progress=False, task_id=None):
    """Download a PDF file"""
    # This would be imported from the actual implementation
    # For now, return a placeholder
    filename = os.path.basename(url).replace('.pdf', '') or 'download'
    filepath = os.path.join(save_path, f"{filename}.pdf")
    
    # In a real implementation, this would download the file
    # For now, just return the expected path
    return filepath

@academic_search_bp.route('/search', methods=['GET'])
@require_api_key
@limiter.limit("10 per minute")
def academic_search():
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
        
    # Search cache key
    cache_key = f"academic_search:{source}:{query}:{limit}"
    
    # Check cache if we have a search_cache dictionary
    cached_result = get_from_cache(search_cache, cache_key) if 'search_cache' in globals() else None
    if cached_result:
        return jsonify(cached_result)
    
    try:
        # Get results from academic source
        raw_results = search_academic_source(query, source, limit)
        
        # Format results
        formatted_results = format_search_results(raw_results)
        
        # Cache results if we have a search_cache dictionary
        if 'search_cache' in globals() and 'add_to_cache' in globals():
            add_to_cache(search_cache, cache_key, formatted_results)
        
        return jsonify(formatted_results)
        
    except Exception as e:
        logger.error(f"Error in academic search: {e}")
        
        return jsonify({
            "error": {
                "code": "SEARCH_ERROR",
                "message": str(e)
            }
        }), 500

@academic_search_bp.route("/health", methods=["GET"])
@require_api_key
@limiter.limit("10 per minute")
def academic_health_check():
    """Simple health check endpoint for Academic API."""
    return jsonify({
        "status": "ok",
        "timestamp": time.time(),
        "web_scraper_available": web_scraper_available
    })
@academic_search_bp.route('/details/<path:id>', methods=['GET'])
@require_api_key
@limiter.limit("10 per minute")
def academic_paper_details(id):
    """
    Get detailed information about a specific paper.
    
    Path Parameters:
        id (required): Unique identifier for the article
        
    Query Parameters:
        source (optional): Specify the source (default: arxiv)
    """
    source = request.args.get("source", "arxiv").lower()
    
    # Cache key
    cache_key = f"academic_details:{source}:{id}"
    
    # Check cache
    cached_result = get_from_cache(details_cache, cache_key) if 'details_cache' in globals() else None
    if cached_result:
        return jsonify(cached_result)
    
    try:
        # Get paper details
        if source == "arxiv":
            # Construct arXiv URL for the paper
            if not id.startswith("http"):
                paper_url = f"https://arxiv.org/abs/{id}"
            else:
                paper_url = id
            
            # Use web_scraper to get HTML content
            try:
                html_content = web_scraper.extract_html_text(paper_url)
                
                # For PDF URL
                pdf_url = web_scraper.convert_arxiv_url(paper_url)
                
                # In a real implementation, you would parse the HTML properly
                # Here we'll create a sample result with minimal info
                details = {
                    "id": id,
                    "title": f"Paper {id}",  # Would be extracted from HTML
                    "authors": ["Author A", "Author B", "Author C"],  # Would be extracted from HTML
                    "abstract": f"This is a detailed abstract for paper {id}...",  # Would be extracted from HTML
                    "publication_date": "2023-01-15",  # Would be extracted from HTML
                    "source": "arxiv",
                    "pdf_url": pdf_url,
                    "metadata": {
                        "categories": ["cs.AI", "cs.LG"],
                        "comments": "Published in Example Conference 2023",
                        "doi": f"10.1000/{id}"
                    }
                }
            except Exception as html_err:
                logger.error(f"Error extracting HTML for paper {id}: {html_err}")
                details = {
                    "id": id,
                    "title": f"Paper {id}",
                    "authors": [],
                    "abstract": "",
                    "publication_date": "",
                    "source": "arxiv",
                    "pdf_url": f"https://arxiv.org/pdf/{id}.pdf",
                    "metadata": {}
                }
        else:
            # Handle other sources
            details = {
                "id": id,
                "title": f"Paper from {source}",
                "authors": ["Unknown Author"],
                "abstract": "Abstract not available for this source yet.",
                "publication_date": "2023-01-01",
                "source": source,
                "pdf_url": "",
                "metadata": {}
            }
        
        # Add to cache
        if 'details_cache' in globals() and 'add_to_cache' in globals():
            add_to_cache(details_cache, cache_key, details)
        
        return jsonify(details)
        
    except Exception as e:
        logger.error(f"Error getting academic paper details: {e}")
        
        return jsonify({
            "error": {
                "code": "DETAILS_ERROR",
                "message": str(e)
            }
        }), 500

@academic_search_bp.route('/download/<path:id>', methods=['GET'])
@require_api_key
@limiter.limit("10 per minute")
def academic_download_paper(id):
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
        
        # Download the PDF using your existing function
        try:
            pdf_file = download_pdf(
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
        logger.error(f"Error in academic download endpoint: {e}")
        
        return jsonify({
            "error": {
                "code": "SERVER_ERROR",
                "message": str(e)
            }
        }), 500

@academic_search_bp.route('/citations/<path:id>', methods=['GET'])
@require_api_key
@limiter.limit("10 per minute")
def academic_paper_citations(id):
    """
    Get citation analysis for a specific paper.
    
    Path Parameters:
        id (required): Unique identifier for the article
        
    Query Parameters:
        source (optional): Specify the source (default: arxiv)
        depth (optional): Depth of citation analysis (default: 1)
    """
    source = request.args.get("source", "arxiv").lower()
    depth = int(request.args.get("depth", "1"))
    
    # Cache key
    cache_key = f"academic_citations:{source}:{id}:{depth}"
    
    # Check cache
    cached_result = get_from_cache(search_cache, cache_key) if 'search_cache' in globals() else None
    if cached_result:
        return jsonify(cached_result)
    
    try:
        # Get citation analysis
        analysis = get_paper_citations(id, source, depth)
        
        # Cache results
        if 'search_cache' in globals() and 'add_to_cache' in globals():
            add_to_cache(search_cache, cache_key, analysis)
        
        return jsonify(analysis)
        
    except Exception as e:
        logger.error(f"Error getting paper citations: {e}")
        
        return jsonify({
            "error": {
                "code": "CITATION_ERROR",
                "message": str(e)
            }
        }), 500

@academic_search_bp.route('/recommendations/<path:id>', methods=['GET'])
@require_api_key
@limiter.limit("10 per minute")
def academic_paper_recommendations(id):
    """
    Get recommended papers related to a specific paper.
    
    Path Parameters:
        id (required): Unique identifier for the article
        
    Query Parameters:
        source (optional): Specify the source (default: arxiv)
        limit (optional): Maximum number of recommendations (default: 5)
    """
    source = request.args.get("source", "arxiv").lower()
    limit = int(request.args.get("limit", "5"))
    
    # Cache key
    cache_key = f"academic_recommendations:{source}:{id}:{limit}"
    
    # Check cache
    cached_result = get_from_cache(search_cache, cache_key) if 'search_cache' in globals() else None
    if cached_result:
        return jsonify(cached_result)
    
    try:
        # Get recommendations
        recommendations = recommend_related_papers(id, source, limit)
        
        # Format response
        result = {
            "paper_id": id,
            "source": source,
            "recommendation_count": len(recommendations),
            "recommendations": recommendations
        }
        
        # Cache results
        if 'search_cache' in globals() and 'add_to_cache' in globals():
            add_to_cache(search_cache, cache_key, result)
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error getting paper recommendations: {e}")
        
        return jsonify({
            "error": {
                "code": "RECOMMENDATION_ERROR",
                "message": str(e)
            }
        }), 500

@academic_search_bp.route("/bulk/download", methods=["POST"])
@require_api_key
@limiter.limit("3 per minute")
def academic_bulk_download():
    """
    Download multiple papers in bulk.
    
    Expected JSON body:
    {
        "paper_ids": ["paper_id_1", "paper_id_2", ...],
        "source": "arxiv"
    }
    """
    if not request.is_json:
        return jsonify({"error": {"code": "INVALID_REQUEST", "message": "Request must be JSON"}}), 400
    
    data = request.get_json()
    paper_ids = data.get("paper_ids", [])
    source = data.get("source", "arxiv")
    
    if not paper_ids:
        return jsonify({"error": {"code": "NO_PAPERS", "message": "No paper IDs provided"}}), 400
    
    try:
        # Use our existing bulk download function
        result = bulk_download_papers(paper_ids, source)
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error in bulk download: {e}")
        
        return jsonify({
            "error": {
                "code": "BULK_DOWNLOAD_ERROR",
                "message": str(e)
            }
        }), 500

@academic_search_bp.route('/multi-source', methods=['GET'])
@require_api_key
@limiter.limit("5 per minute")
def academic_multi_source_search():
    """
    Search multiple academic sources simultaneously and combine results.
    
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
        
    # Parse sources
    sources = [s.strip().lower() for s in sources_param.split(",")]
    
    # Cache key
    cache_key = f"academic_multi:{sources_param}:{query}:{limit}"
    
    # Check cache
    cached_result = get_from_cache(search_cache, cache_key) if 'search_cache' in globals() else None
    if cached_result:
        return jsonify(cached_result)
    
    try:
        all_results = []
        
        # Process each source in parallel
        with ThreadPoolExecutor(max_workers=min(3, len(sources))) as executor:
            # Submit search tasks
            future_to_source = {
                executor.submit(search_academic_source, query, source, limit): source 
                for source in sources
            }
            
            # Process results as they complete
            for future in as_completed(future_to_source):
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
        
        # Cache results
        if 'search_cache' in globals() and 'add_to_cache' in globals():
            add_to_cache(search_cache, cache_key, formatted_results)
        
        return jsonify(formatted_results)
        
    except Exception as e:
        logger.error(f"Error in multi-source search: {e}")
        
        return jsonify({
            "error": {
                "code": "SEARCH_ERROR",
                "message": str(e)
            }
        }), 500

    
@academic_search_bp.route("/analyze/<path:id>", methods=["GET"])
@require_api_key
@limiter.limit("5 per minute")
def academic_analyze_paper(id):
    """
    Comprehensive analysis of a paper: details, citations, and recommendations.
    
    Path Parameters:
        id (required): Unique identifier for the article
        
    Query Parameters:
        source (optional): Specify the source (default: arxiv)
        include_citations (optional): Whether to include citation analysis (default: true)
        include_recommendations (optional): Whether to include recommendations (default: true)
    """
    source = request.args.get("source", "arxiv").lower()
    include_citations = request.args.get("include_citations", "true").lower() == "true"
    include_recommendations = request.args.get("include_recommendations", "true").lower() == "true"
    
    # Cache key
    cache_key = f"academic_analyze:{source}:{id}:{include_citations}:{include_recommendations}"
    
    # Check cache
    cached_result = get_from_cache(search_cache, cache_key) if 'search_cache' in globals() else None
    if cached_result:
        return jsonify(cached_result)
    
    try:
        # Get paper details
        details = None
        try:
            response = academic_paper_details(id)
            if response.status_code == 200:
                details = response.get_json()
        except Exception:
            # Try direct call if jsonify response doesn't work
            details = get_paper_details(id, source)
        
        if not details or "error" in details:
            return jsonify({
                "error": {
                    "code": "DETAILS_ERROR",
                    "message": "Failed to retrieve paper details"
                }
            }), 404
        
        result = {
            "paper_id": id,
            "source": source,
            "details": details
        }
        
        # Get citation analysis if requested
        if include_citations:
            try:
                citations = get_paper_citations(id, source)
                result["citations"] = citations
            except Exception as e:
                logger.warning(f"Failed to get citation analysis: {e}")
                result["citations"] = {"error": str(e)}
        
        # Get recommendations if requested
        if include_recommendations:
            try:
                recommendations = recommend_related_papers(id, source)
                result["recommendations"] = {
                    "recommendation_count": len(recommendations),
                    "recommendations": recommendations
                }
            except Exception as e:
                logger.warning(f"Failed to get recommendations: {e}")
                result["recommendations"] = {"error": str(e)}
        
        # Cache results
        if 'search_cache' in globals() and 'add_to_cache' in globals():
            add_to_cache(search_cache, cache_key, result)
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Error analyzing paper: {e}")
        
        return jsonify({
            "error": {
                "code": "ANALYSIS_ERROR",
                "message": str(e)
            }
        }), 500

@academic_search_bp.route("/extract", methods=["GET"])
@require_api_key
@limiter.limit("10 per minute")
def academic_extract_from_url():
    """
    Extract papers from a URL and optionally download them.
    
    Query Parameters:
        url (required): URL to extract papers from
        download (optional): Whether to download extracted papers (default: false)
        output_folder (optional): Folder to save downloads (server default if not specified)
    """
    url = request.args.get("url")
    download = request.args.get("download", "false").lower() == "true"
    output_folder = request.args.get("output_folder", DEFAULT_OUTPUT_FOLDER)
    
    if not url:
        return jsonify({"error": {"code": "URL_REQUIRED", "message": "URL parameter is required"}}), 400
    
    try:
        # Ensure output folder exists
        os.makedirs(output_folder, exist_ok=True)
        
        # Use web_scraper to extract PDF links
        pdf_links = web_scraper.fetch_pdf_links(url)
        
        if not pdf_links:
            return jsonify({
                "status": "completed",
                "url": url,
                "message": "No PDF links found",
                "pdfs_found": 0
            })
        
        response = {
            "status": "completed",
            "url": url,
            "pdfs_found": len(pdf_links),
            "pdfs": []
        }
        
        # Process each PDF link
        for link in pdf_links:
            pdf_info = {
                "url": link.get("url"),
                "title": link.get("title", "Unknown")
            }
            
            # Download if requested
            if download:
                try:
                    pdf_file = web_scraper.download_pdf(
                        link.get("url"),
                        save_path=output_folder
                    )
                    
                    if pdf_file and os.path.exists(pdf_file):
                        pdf_info["file_path"] = pdf_file
                        pdf_info["file_size"] = os.path.getsize(pdf_file)
                        pdf_info["downloaded"] = True
                    else:
                        pdf_info["downloaded"] = False
                except Exception as e:
                    pdf_info["downloaded"] = False
                    pdf_info["error"] = str(e)
            
            response["pdfs"].append(pdf_info)
        
        # Update counts
        if download:
            response["pdfs_downloaded"] = sum(1 for pdf in response["pdfs"] if pdf.get("downloaded", False))
            response["output_folder"] = output_folder
        
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Error extracting from URL: {e}")
        
        return jsonify({
            "error": {
                "code": "EXTRACTION_ERROR",
                "message": str(e)
            }
        }), 500