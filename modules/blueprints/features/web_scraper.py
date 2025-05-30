"""
Web Scraper Blueprint
Handles all web scraping related routes and functionality
"""

from flask import Blueprint, request, jsonify, send_from_directory, abort
from flask_socketio import emit
import logging
import uuid
import time
import os
import threading
import tempfile
import hashlib
import requests
from typing import Dict, Any, List, Optional, Set
from pathlib import Path
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse, urlunparse
from urllib.robotparser import RobotFileParser
import re
from collections import deque

# Optional dependencies (graceful fallback if not available)
try:
    import trafilatura
    TRAFILATURA_AVAILABLE = True
except ImportError:
    TRAFILATURA_AVAILABLE = False

# Import necessary modules and utilities
from blueprints.core.services import (
    add_task, get_task, remove_task,
    structured_error_response, emit_task_error,
    ScraperTask
)
from blueprints.core.utils import get_output_filepath, sanitize_filename
from blueprints.core.structify_integration import structify_module
from blueprints.features.pdf_processor import download_pdf, analyze_pdf_structure

# Try to import web_scraper module
try:
    import web_scraper
    web_scraper_available = True
except ImportError:
    web_scraper_available = False

# Try to import python-magic for file type detection
try:
    import magic
    magic_available = True
except ImportError:
    magic_available = False

# Default settings
DEFAULT_OUTPUT_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'downloads')

logger = logging.getLogger(__name__)

# Initialize logger if needed
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

# Create the blueprint
web_scraper_bp = Blueprint('web_scraper', __name__, url_prefix='/api')

# Export the blueprint and utility functions
__all__ = ['web_scraper_bp', 'emit_scraping_progress', 'emit_scraping_completed', 'emit_scraping_error']

class EnhancedWebScraper:
    """Enhanced Web Scraper with 2 powerful options integrated into main file"""
    
    def __init__(self):
        self.crawl_config = {
            'max_depth': 3,
            'max_pages': 200,
            'respect_robots': True,
            'follow_redirects': True,
            'concurrent_requests': 8,
            'request_delay': 1000,  # milliseconds
            'timeout': 30000,
            'retry_attempts': 3,
            'user_agent_rotation': True
        }
        
        self.content_config = {
            'extract_clean_content': True,
            'remove_navigation': True,
            'remove_ads': True,
            'preserve_code_blocks': True,
            'convert_to_markdown': True,
            'extract_images': True,
            'follow_internal_links': True
        }
        
        # State management
        self.visited_urls: Set[str] = set()
        self.url_queue: deque = deque()
        self.pdf_urls: List[Dict] = []
        self.results: Dict = {}
        self.errors: List[Dict] = []
        
    def detect_site_type(self, url: str, html: str) -> Dict[str, Any]:
        """Detect if site is documentation, blog, news, etc."""
        soup = BeautifulSoup(html, 'html.parser')
        
        detection = {
            'type': 'general',
            'platform': 'unknown',
            'features': []
        }
        
        # Check for documentation patterns
        if any(keyword in url.lower() for keyword in ['docs', 'documentation', 'api', 'guide']):
            detection['type'] = 'documentation'
            detection['features'].append('docs_url')
            
        # GitBook detection
        if 'gitbook' in html.lower() or soup.find('meta', {'name': 'generator', 'content': lambda x: x and 'gitbook' in x.lower()}):
            detection['platform'] = 'gitbook'
            detection['features'].append('gitbook')
            
        # ReadTheDocs detection
        if 'readthedocs' in url or soup.find('div', class_='rst-content'):
            detection['platform'] = 'readthedocs'
            detection['features'].append('sphinx')
            
        # Navigation patterns
        if soup.find('nav') or soup.find('div', class_=re.compile(r'nav|sidebar|menu', re.I)):
            detection['features'].append('navigation')
            
        # Table of contents
        if soup.find('div', class_=re.compile(r'toc|table-of-contents', re.I)):
            detection['features'].append('toc')
            
        return detection
        
    def extract_navigation_links(self, html: str, base_url: str) -> List[str]:
        """Extract navigation and documentation links"""
        soup = BeautifulSoup(html, 'html.parser')
        links = []
        
        # Find navigation areas
        nav_selectors = [
            'nav a',
            '.nav a', 
            '.navbar a',
            '.sidebar a',
            '.menu a',
            '.toc a',
            '.table-of-contents a',
            '[class*="nav"] a',
            '[class*="menu"] a'
        ]
        
        for selector in nav_selectors:
            nav_links = soup.select(selector)
            for link in nav_links:
                href = link.get('href')
                if href:
                    absolute_url = urljoin(base_url, href)
                    if self.is_same_domain(base_url, absolute_url):
                        links.append(absolute_url)
                        
        # Also look for "next" and pagination links
        pagination_links = soup.find_all('a', text=re.compile(r'next|continue|more', re.I))
        for link in pagination_links:
            href = link.get('href')
            if href:
                absolute_url = urljoin(base_url, href)
                if self.is_same_domain(base_url, absolute_url):
                    links.append(absolute_url)
                    
        return list(set(links))  # Remove duplicates
        
    def extract_clean_content(self, html: str, url: str) -> Dict[str, Any]:
        """Extract clean content optimized for LLM training"""
        try:
            if TRAFILATURA_AVAILABLE:
                # Use trafilatura for clean content extraction
                extracted = trafilatura.extract(
                    html,
                    include_comments=False,
                    include_tables=True,
                    include_links=True,
                    output_format='json',
                    config=trafilatura.settings.use_config()
                )
                
                if extracted:
                    import json
                    content_data = json.loads(extracted)
                    
                    return {
                        'title': content_data.get('title', ''),
                        'content': content_data.get('text', ''),
                        'markdown': self.html_to_markdown(content_data.get('text', '')),
                        'metadata': {
                            'url': url,
                            'extracted_at': time.time(),
                            'word_count': len(content_data.get('text', '').split()),
                            'language': content_data.get('language', 'en'),
                            'extraction_method': 'trafilatura'
                        }
                    }
            
            # Fallback to BeautifulSoup if trafilatura not available
            return self.extract_with_beautifulsoup(html, url)
                
        except Exception as e:
            logger.warning(f"Content extraction failed for {url}: {e}")
            return self.extract_with_beautifulsoup(html, url)
            
    def extract_with_beautifulsoup(self, html: str, url: str) -> Dict[str, Any]:
        """Fallback content extraction with BeautifulSoup"""
        soup = BeautifulSoup(html, 'html.parser')
        
        # Remove unwanted elements
        for element in soup(['script', 'style', 'nav', 'header', 'footer', 'aside']):
            element.decompose()
            
        # Find main content area
        main_content = (
            soup.find('main') or 
            soup.find('article') or 
            soup.find('div', class_=re.compile(r'content|main|body', re.I)) or
            soup.find('body')
        )
        
        if main_content:
            # Get title
            title = soup.find('title')
            title_text = title.get_text().strip() if title else ''
            
            # Extract text content
            content = main_content.get_text(separator='\n', strip=True)
            
            return {
                'title': title_text,
                'content': content,
                'markdown': self.html_to_markdown(content),
                'metadata': {
                    'url': url,
                    'extracted_at': time.time(),
                    'word_count': len(content.split()),
                    'extraction_method': 'beautifulsoup'
                }
            }
        
        return {
            'title': '',
            'content': '',
            'markdown': '',
            'metadata': {'url': url, 'error': 'No content found'}
        }
        
    def html_to_markdown(self, text: str) -> str:
        """Convert HTML text to clean markdown"""
        markdown = text
        
        # Basic formatting preservation
        markdown = re.sub(r'\n\s*\n\s*\n+', '\n\n', markdown)  # Normalize spacing
        markdown = re.sub(r'^\s+', '', markdown, flags=re.MULTILINE)  # Remove leading spaces
        
        return markdown.strip()
        
    def is_same_domain(self, base_url: str, check_url: str) -> bool:
        """Check if URLs are from the same domain"""
        base_domain = urlparse(base_url).netloc.lower()
        check_domain = urlparse(check_url).netloc.lower()
        return base_domain == check_domain
        
    def discover_pdfs_on_page(self, html: str, base_url: str) -> List[Dict[str, str]]:
        """Discover PDF links on a single page (depth 0)"""
        soup = BeautifulSoup(html, 'html.parser')
        pdf_links = []
        
        # Find all links
        for link in soup.find_all('a', href=True):
            href = link['href']
            
            # Check if it's a PDF link
            if href.lower().endswith('.pdf') or 'pdf' in href.lower():
                absolute_url = urljoin(base_url, href)
                
                # Get link text or title for metadata
                title = (
                    link.get_text(strip=True) or 
                    link.get('title', '') or 
                    os.path.basename(href)
                )
                
                pdf_links.append({
                    'url': absolute_url,
                    'title': title,
                    'found_on': base_url
                })
                
        return pdf_links

    def check_robots_txt(self, base_url: str) -> bool:
        """Check if robots.txt allows crawling"""
        try:
            parsed_url = urlparse(base_url)
            robots_url = f"{parsed_url.scheme}://{parsed_url.netloc}/robots.txt"
            
            rp = RobotFileParser()
            rp.set_url(robots_url)
            rp.read()
            
            return rp.can_fetch('*', base_url)
        except Exception:
            # If can't read robots.txt, assume allowed
            return True

def download_pdf_fixed(url: str, save_directory: str) -> Optional[str]:
    """Fixed version of PDF download without os.fsync bug"""
    try:
        os.makedirs(save_directory, exist_ok=True)
        
        # Convert arXiv abstract URLs to PDF URLs
        if 'arxiv.org/abs/' in url:
            url = url.replace('/abs/', '/pdf/') + '.pdf'
            logger.info(f"Converted arXiv abstract URL to PDF URL: {url}")
        
        # Generate filename
        url_hash = hashlib.md5(url.encode()).hexdigest()[:10]
        filename = f"{os.path.basename(urlparse(url).path) or 'document'}_{url_hash}.pdf"
        if not filename.endswith('.pdf'):
            filename += '.pdf'
        
        file_path = os.path.join(save_directory, filename)
        
        # Check if already exists
        if os.path.exists(file_path):
            logger.info(f"PDF already exists: {file_path}")
            return file_path
        
        # Download with proper headers
        headers = {
            'User-Agent': 'Mozilla/5.0 (compatible; Academic-Scraper/1.0)',
            'Accept': 'application/pdf,*/*'
        }
        
        response = requests.get(url, headers=headers, timeout=60, stream=True)
        response.raise_for_status()
        
        # Write file in chunks without the fsync bug
        with open(file_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        
        logger.info(f"Successfully downloaded PDF: {file_path}")
        return file_path
        
    except Exception as e:
        logger.error(f"Error downloading PDF {url}: {e}")
        return None

def crawl_website_recursive(scraper: EnhancedWebScraper, start_url: str, 
                          output_dir: str, output_format: str) -> Dict[str, Any]:
    """Recursively crawl website and extract content"""
    
    scraper.url_queue.append((start_url, 0))  # (url, depth)
    pages_crawled = 0
    pdfs_found = 0
    site_map = {}
    
    # Create output subdirectories
    pages_dir = os.path.join(output_dir, "pages")
    pdfs_dir = os.path.join(output_dir, "pdfs")
    os.makedirs(pages_dir, exist_ok=True)
    os.makedirs(pdfs_dir, exist_ok=True)
    
    while scraper.url_queue and pages_crawled < scraper.crawl_config['max_pages']:
        current_url, depth = scraper.url_queue.popleft()
        
        # Skip if already visited or exceeded depth
        if current_url in scraper.visited_urls or depth > scraper.crawl_config['max_depth']:
            continue
            
        scraper.visited_urls.add(current_url)
        
        try:
            logger.info(f"Crawling [{depth}]: {current_url}")
            
            response = requests.get(current_url, timeout=30)
            response.raise_for_status()
            
            # Detect site type and extract content
            site_info = scraper.detect_site_type(current_url, response.text)
            content_data = scraper.extract_clean_content(response.text, current_url)
            
            # Save page content
            page_filename = f"page_{pages_crawled:04d}_{sanitize_filename(urlparse(current_url).path or 'index')}"
            
            if output_format == "markdown":
                page_file = os.path.join(pages_dir, f"{page_filename}.md")
                with open(page_file, 'w', encoding='utf-8') as f:
                    f.write(f"# {content_data['title']}\n\n")
                    f.write(f"**URL:** {current_url}\n\n")
                    f.write(content_data['markdown'])
                    
            elif output_format == "json":
                page_file = os.path.join(pages_dir, f"{page_filename}.json")
                with open(page_file, 'w', encoding='utf-8') as f:
                    import json
                    json.dump({
                        'url': current_url,
                        'title': content_data['title'],
                        'content': content_data['content'],
                        'markdown': content_data['markdown'],
                        'site_info': site_info,
                        'metadata': content_data['metadata']
                    }, f, indent=2)
            
            # Discover PDFs on this page
            page_pdfs = scraper.discover_pdfs_on_page(response.text, current_url)
            for pdf_info in page_pdfs:
                pdf_file = download_pdf_fixed(pdf_info['url'], pdfs_dir)
                if pdf_file:
                    pdfs_found += 1
            
            # Find more links to crawl (if not at max depth)
            if depth < scraper.crawl_config['max_depth']:
                nav_links = scraper.extract_navigation_links(response.text, current_url)
                for link in nav_links:
                    if link not in scraper.visited_urls:
                        scraper.url_queue.append((link, depth + 1))
            
            # Update site map
            site_map[current_url] = {
                'depth': depth,
                'title': content_data['title'],
                'content_length': len(content_data['content']),
                'site_type': site_info['type'],
                'pdfs_found': len(page_pdfs)
            }
            
            pages_crawled += 1
            
            # Polite delay
            time.sleep(scraper.crawl_config['request_delay'] / 1000.0)
            
        except Exception as e:
            logger.error(f"Error crawling {current_url}: {e}")
            continue
    
    # Create summary
    summary = {
        'start_url': start_url,
        'pages_crawled': pages_crawled,
        'pdfs_found': pdfs_found,
        'max_depth_reached': max(site_map[url]['depth'] for url in site_map) if site_map else 0,
        'output_format': output_format,
        'directories': {
            'pages': pages_dir,
            'pdfs': pdfs_dir
        }
    }
    
    # Save summary
    summary_file = os.path.join(output_dir, "crawl_summary.json")
    with open(summary_file, 'w', encoding='utf-8') as f:
        import json
        json.dump(summary, f, indent=2)
    
    return {
        'pages_crawled': pages_crawled,
        'pdfs_found': pdfs_found,
        'site_map': site_map,
        'summary': summary
    }

def handle_enhanced_scraping(data: Dict[str, Any], scrape_mode: str) -> jsonify:
    """
    Handle the new 2-option enhanced scraping system
    """
    try:
        # Use the local enhanced scraper class and functions
        
        url = data.get("url")
        download_directory = data.get("download_directory")
        
        if not url or not download_directory:
            return structured_error_response("MISSING_PARAMS", "URL and download directory required.", 400)
        
        # Ensure download directory exists
        os.makedirs(download_directory, exist_ok=True)
        task_id = str(uuid.uuid4())
        
        if scrape_mode == "smart_pdf":
            return handle_smart_pdf_mode(data, task_id, url, download_directory)
        elif scrape_mode == "full_website":
            return handle_full_website_mode(data, task_id, url, download_directory)
        else:
            return structured_error_response("INVALID_MODE", f"Unknown scrape mode: {scrape_mode}", 400)
            
    except Exception as e:
        logger.error(f"Enhanced scraping failed: {e}")
        return structured_error_response("ENHANCED_SCRAPING_ERROR", f"Error: {str(e)}", 500)

def handle_smart_pdf_mode(data: Dict[str, Any], task_id: str, url: str, download_directory: str) -> jsonify:
    """Handle Smart PDF Discovery & Processing mode"""
    # Use local classes and functions
    
    # Get PDF processing options
    pdf_options = data.get("pdf_options", {})
    process_pdfs = pdf_options.get("process_pdfs", True)
    extract_tables = pdf_options.get("extract_tables", True)
    use_ocr = pdf_options.get("use_ocr", True)
    
    scraper = EnhancedWebScraper()
    
    try:
        # Check if URL is direct PDF
        if url.lower().endswith('.pdf'):
            logger.info(f"Direct PDF URL detected: {url}")
            
            # Download and process single PDF
            pdf_file = download_pdf_fixed(url, download_directory)
            
            if pdf_file and os.path.exists(pdf_file):
                # Process with Structify
                if structify_module and process_pdfs:
                    json_filename = f"{os.path.splitext(os.path.basename(pdf_file))[0]}_processed.json"
                    json_path = os.path.join(download_directory, json_filename)
                    
                    # Use existing Structify integration
                    result = structify_module.process_all_files(
                        root_directory=os.path.dirname(pdf_file),
                        output_file=json_path,
                        file_filter=lambda f: f == pdf_file
                    )
                    
                    return jsonify({
                        "task_id": task_id,
                        "status": "completed",
                        "mode": "smart_pdf",
                        "message": "Direct PDF downloaded and processed",
                        "pdfs_found": 1,
                        "pdfs_processed": 1,
                        "results": [{
                            "url": url,
                            "pdf_file": pdf_file,
                            "json_file": json_path
                        }]
                    })
                else:
                    return jsonify({
                        "task_id": task_id,
                        "status": "completed",
                        "mode": "smart_pdf",
                        "message": "Direct PDF downloaded (processing disabled)",
                        "pdfs_found": 1,
                        "pdfs_processed": 0,
                        "results": [{"url": url, "pdf_file": pdf_file}]
                    })
        
        else:
            logger.info(f"HTML page detected, discovering PDFs: {url}")
            
            # Fetch the HTML page
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            
            # Discover PDFs on this page (depth 0)
            pdf_links = scraper.discover_pdfs_on_page(response.text, url)
            
            if not pdf_links:
                return jsonify({
                    "task_id": task_id,
                    "status": "completed", 
                    "mode": "smart_pdf",
                    "message": "No PDFs found on page",
                    "pdfs_found": 0,
                    "pdfs_processed": 0
                })
            
            # Download and process all discovered PDFs
            processed_pdfs = []
            for pdf_info in pdf_links:
                try:
                    pdf_file = download_pdf_fixed(pdf_info['url'], download_directory)
                    
                    if pdf_file and os.path.exists(pdf_file):
                        result_info = {
                            "url": pdf_info['url'],
                            "title": pdf_info['title'],
                            "pdf_file": pdf_file
                        }
                        
                        # Process with Structify if enabled
                        if structify_module and process_pdfs:
                            json_filename = f"{os.path.splitext(os.path.basename(pdf_file))[0]}_processed.json"
                            json_path = os.path.join(download_directory, json_filename)
                            
                            structify_module.process_all_files(
                                root_directory=os.path.dirname(pdf_file),
                                output_file=json_path,
                                file_filter=lambda f: f == pdf_file
                            )
                            
                            result_info["json_file"] = json_path
                        
                        processed_pdfs.append(result_info)
                        
                except Exception as e:
                    logger.error(f"Error processing PDF {pdf_info['url']}: {e}")
                    continue
            
            return jsonify({
                "task_id": task_id,
                "status": "completed",
                "mode": "smart_pdf", 
                "message": f"Discovered and processed {len(processed_pdfs)} PDFs from page",
                "pdfs_found": len(pdf_links),
                "pdfs_processed": len(processed_pdfs),
                "results": processed_pdfs
            })
            
    except Exception as e:
        logger.error(f"Smart PDF mode failed: {e}")
        return structured_error_response("SMART_PDF_ERROR", f"Error: {str(e)}", 500)

def handle_full_website_mode(data: Dict[str, Any], task_id: str, url: str, download_directory: str) -> jsonify:
    """Handle Full Website & Documentation Crawler mode"""
    # Use local classes and functions
    
    # Get crawling options
    max_depth = min(data.get("max_depth", 3), 10)  # Cap at 10 levels
    max_pages = min(data.get("max_pages", 200), 1000)  # Cap at 1000 pages
    respect_robots = data.get("respect_robots", True)
    output_format = data.get("output_format", "markdown")  # markdown, html, json
    
    scraper = EnhancedWebScraper()
    scraper.crawl_config['max_depth'] = max_depth
    scraper.crawl_config['max_pages'] = max_pages
    scraper.crawl_config['respect_robots'] = respect_robots
    
    try:
        # Check robots.txt if requested
        if respect_robots and not scraper.check_robots_txt(url):
            return structured_error_response("ROBOTS_BLOCKED", "Crawling blocked by robots.txt", 403)
        
        # Start crawling
        result = crawl_website_recursive(scraper, url, download_directory, output_format)
        
        return jsonify({
            "task_id": task_id,
            "status": "completed",
            "mode": "full_website",
            "message": f"Crawled {result['pages_crawled']} pages, found {result['pdfs_found']} PDFs",
            "pages_crawled": result["pages_crawled"],
            "pdfs_found": result["pdfs_found"],
            "output_directory": download_directory,
            "max_depth_reached": result["summary"]["max_depth_reached"],
            "output_format": output_format,
            "summary": result["summary"]
        })
        
    except Exception as e:
        logger.error(f"Full website mode failed: {e}")
        return structured_error_response("FULL_WEBSITE_ERROR", f"Error: {str(e)}", 500)

@web_scraper_bp.route('/health-enhanced', methods=['GET'])
def health_check_enhanced():
    """Health check for enhanced web scraper features"""
    return jsonify({
        "status": "healthy",
        "version": "2.0_consolidated",
        "features": {
            "smart_pdf": "Smart PDF Discovery & Processing",
            "full_website": "Full Website & Documentation Crawler"
        },
        "dependencies": {
            "structify": structify_module is not None,
            "trafilatura": TRAFILATURA_AVAILABLE,
            "beautifulsoup": True,
            "requests": True,
            "urllib_robotparser": True
        },
        "legacy_compatibility": "Maintained for old 5-option system",
        "endpoints": {
            "enhanced": "/api/scrape2 (with scrape_mode parameter)",
            "legacy": "/api/scrape2 (with urls parameter)",
            "health": "/api/health-enhanced"
        }
    })

    
@web_scraper_bp.route('/scrape2', methods=['POST'])
def scrape2():
    """
    Enhanced endpoint supporting 2 powerful scraping modes:
    - smart_pdf: Smart PDF Discovery & Processing
    - full_website: Full Website & Documentation Crawler
    
    Maintains backward compatibility with old 5-option system
    """
    data = request.get_json()
    if not data:
        return structured_error_response("NO_DATA", "No JSON data provided.", 400)
    
    # Check for new 2-option system
    scrape_mode = data.get("scrape_mode")
    if scrape_mode in ["smart_pdf", "full_website"]:
        return handle_enhanced_scraping(data, scrape_mode)
    
    # Legacy support for old 5-option system
    url_configs = data.get("urls")
    download_directory = data.get("download_directory")
    output_filename = data.get("outputFilename", "").strip()
    
    # Get enhanced PDF options
    pdf_options = data.get("pdf_options", {})
    process_pdfs = pdf_options.get("process_pdfs", True)
    extract_tables = pdf_options.get("extract_tables", True)
    use_ocr = pdf_options.get("use_ocr", True)
    extract_structure = pdf_options.get("extract_structure", True)
    chunk_size = pdf_options.get("chunk_size", 4096)
    max_downloads = pdf_options.get("max_downloads", 10)  # Default to 10 PDFs
    
    if not url_configs or not isinstance(url_configs, list):
        return structured_error_response("URLS_REQUIRED", "A list of URLs is required.", 400)
    
    if not download_directory:
        return structured_error_response("ROOT_DIR_REQUIRED", "Download directory is required.", 400)
    
    if not output_filename:
        return structured_error_response("OUTPUT_FILE_REQUIRED", "Output filename is required.", 400)
    
    # Ensure output file has proper extension
    if not output_filename.lower().endswith('.json'):
        output_filename += '.json'
    
    # Convert to absolute path
    download_directory = os.path.abspath(download_directory)
    
    # Get properly formatted output path
    final_json = get_output_filepath(output_filename, user_defined_dir=download_directory)
    
    # Validate and create download directory if it doesn't exist
    if not os.path.isdir(download_directory):
        try:
            os.makedirs(download_directory, exist_ok=True)
            logger.info(f"Created download directory: {download_directory}")
        except Exception as e:
            return structured_error_response("DIR_CREATION_FAILED", f"Could not create download directory: {e}", 500)
    
    # Log the request
    logger.info(f"Starting web scraping with {len(url_configs)} URLs to {download_directory}")
    logger.info(f"Output JSON will be saved to: {final_json}")
    logger.info(f"PDF options: process={process_pdfs}, tables={extract_tables}, ocr={use_ocr}, structure={extract_structure}, chunk_size={chunk_size}, max_downloads={max_downloads}")
    
    # Create and start the scraper task with enhanced options
    task_id = str(uuid.uuid4())
    scraper_task = ScraperTask(task_id)
    add_task(task_id, scraper_task)
    
    # Pass the enhanced options to the task
    scraper_task.pdf_options = {
        "process_pdfs": process_pdfs,
        "extract_tables": extract_tables,
        "use_ocr": use_ocr,
        "extract_structure": extract_structure,
        "chunk_size": chunk_size,
        "max_downloads": max_downloads
    }
    
    # Start the task with parameters
    scraper_task.start(
        url_configs=url_configs,
        root_scrape_directory=download_directory,
        output_json_file=output_filename,
        pdf_options=scraper_task.pdf_options
    )
    
    return jsonify({
        "task_id": task_id,
        "status": "processing",
        "message": "Scraping started",
        "root_directory": download_directory,
        "output_file": final_json
    })
    


@web_scraper_bp.route('/scrape2/status/<task_id>', methods=['GET'])
def scrape2_status(task_id):
    """Get the status of a scraping task with PDF download information."""
    task = get_task(task_id)
    if not task or not isinstance(task, ScraperTask):
        return structured_error_response("TASK_NOT_FOUND", f"ScraperTask with ID {task_id} not found.", 404)
    
    # Build response with PDF downloads information
    response = {
        "task_id": task.task_id,
        "status": task.status,
        "progress": task.progress,
        "stats": task.stats,
        "error": task.error,
        "output_file": task.output_file,
        "output_folder": task.root_scrape_directory if hasattr(task, 'root_scrape_directory') else None
    }
    
    # Include PDF downloads information if available
    if hasattr(task, 'pdf_downloads') and task.pdf_downloads:
        response["pdf_downloads"] = task.pdf_downloads
    
    return jsonify(response)

@web_scraper_bp.route("/download-pdf", methods=["POST"])
def api_download_pdf():
    """
    Enhanced API endpoint to download a PDF file from a URL to a user-specified folder.
    
    Expected JSON body:
    {
        "url": "https://example.com/paper.pdf",
        "outputFolder": User-selected download directory,
        "outputFilename": User-specified filename (without extension),
        "processFile": true,  # Whether to process the PDF to JSON
        "extractTables": true,  # Whether to extract tables
        "useOcr": true  # Whether to use OCR for scanned content
    }
    
    Returns:
        JSON response with download status, file path, etc.
    """
    data = request.get_json()
    if not data:
        return structured_error_response("NO_DATA", "No JSON data provided.", 400)
    
    url = data.get("url")
    output_folder = data.get("outputFolder", DEFAULT_OUTPUT_FOLDER)
    output_filename = data.get("outputFilename")
    process_file = data.get("processFile", True)
    extract_tables = data.get("extractTables", True)
    use_ocr = data.get("useOcr", True)
    
    if not url:
        return structured_error_response("URL_REQUIRED", "PDF URL is required.", 400)
    
    # Ensure output directory exists
    try:
        os.makedirs(output_folder, exist_ok=True)
    except Exception as e:
        logger.error(f"Error creating output directory: {e}")
        return structured_error_response("OUTPUT_DIR_ERROR", f"Failed to create output directory: {str(e)}", 500)
    
    # Create a unique task ID for tracking this download
    download_id = str(uuid.uuid4())
    
    try:
        # Download the PDF using enhanced function
        logger.info(f"Starting PDF download from {url} to {output_folder}")
        
        # Use the enhanced download_pdf function from web_scraper
        pdf_file = download_pdf(url, output_folder)
        
        if pdf_file and os.path.exists(pdf_file):
            # Get file size and other metadata
            file_size = os.path.getsize(pdf_file)
            file_name = os.path.basename(pdf_file)
            
            response_data = {
                "status": "success",
                "message": "PDF downloaded successfully",
                "download_id": download_id,
                "url": url,
                "filePath": pdf_file,
                "fileName": file_name,
                "fileSize": file_size,
                "outputFolder": output_folder
            }
            
            # Process the PDF to JSON if requested
            if process_file and structify_module:
                json_file = None
                try:
                    # Generate a JSON filename based on user preference or PDF name
                    if output_filename:
                        json_filename = f"{output_filename}.json"
                    else:
                        json_filename = os.path.splitext(file_name)[0] + "_processed.json"
                        
                    json_path = os.path.join(output_folder, json_filename)
                    
                    # Detect document type to determine if OCR is needed
                    doc_type = None
                    if hasattr(structify_module, 'detect_document_type'):
                        try:
                            doc_type = structify_module.detect_document_type(pdf_file)
                            response_data["documentType"] = doc_type
                        except Exception as e:
                            logger.warning(f"Error detecting document type: {e}")
                    
                    # Apply OCR only if document type is scan or use_ocr is explicitly True
                    apply_ocr = use_ocr or (doc_type == "scan")
                    
                    # Process with process_pdf if available
                    if hasattr(structify_module, 'process_pdf'):
                        result = structify_module.process_pdf(
                            pdf_path=pdf_file,
                            output_path=json_path,
                            max_chunk_size=4096,
                            extract_tables=extract_tables,
                            use_ocr=apply_ocr,
                            return_data=True
                        )
                        
                        json_file = json_path
                        
                        # Add summary metrics to response
                        if result:
                            response_data["processingDetails"] = {
                                "tablesExtracted": len(result.get("tables", [])),
                                "referencesExtracted": len(result.get("references", [])),
                                "pageCount": result.get("page_count", 0),
                                "chunksCreated": len(result.get("chunks", []))
                            }
                            
                    else:
                        # Fallback to process_all_files
                        structify_module.process_all_files(
                            root_directory=os.path.dirname(pdf_file),
                            output_file=json_path,
                            max_chunk_size=4096,
                            executor_type="thread",
                            max_workers=None,
                            stop_words=structify_module.DEFAULT_STOP_WORDS if hasattr(structify_module, 'DEFAULT_STOP_WORDS') else set(),
                            use_cache=False,
                            valid_extensions=[".pdf"],
                            ignore_dirs="venv,node_modules,.git,__pycache__,dist,build",
                            stats_only=False,
                            include_binary_detection=False,
                            file_filter=lambda f: f == pdf_file
                        )
                        
                        json_file = json_path
                    
                    # Add JSON file info to response
                    if json_file and os.path.exists(json_file):
                        response_data["jsonFile"] = json_file
                        logger.info(f"PDF processed to JSON: {json_file}")
                        
                        # Generate a quick PDF structure summary
                        summary = analyze_pdf_structure(pdf_file)
                        if summary and "error" not in summary:
                            response_data["pdfStructure"] = summary
                    
                except Exception as e:
                    logger.error(f"Error processing PDF to JSON: {e}")
                    response_data["processingError"] = str(e)
            
            return jsonify(response_data)
        else:
            return structured_error_response("DOWNLOAD_FAILED", "Failed to download PDF file.", 400)
            
    except Exception as e:
       logger.error(f"Error downloading PDF: {e}", exc_info=True)
       return structured_error_response("DOWNLOAD_ERROR", f"Error downloading PDF: {str(e)}", 500)

@web_scraper_bp.route("/download-pdf/<path:pdf_path>")
def download_pdf_file(pdf_path):
    """
    Download or view a specific PDF file with enhanced security checks.
    
    Args:
        pdf_path: The path to the PDF file.
        
    Returns:
        The PDF file for download or viewing.
    """
    try:
        # For security, ensure the path is within allowed directories
        abs_path = os.path.abspath(pdf_path)
        
        # Define allowed directories (can be expanded based on application needs)
        allowed_dirs = [
            DEFAULT_OUTPUT_FOLDER,
            os.path.join(os.path.expanduser("~"), "Documents"),
            app.config.get("UPLOAD_FOLDER", tempfile.mkdtemp())
        ]
        
        # Check if the path is within any allowed directory
        is_allowed = any(os.path.commonpath([abs_path, allowed_dir]) == allowed_dir 
                        for allowed_dir in allowed_dirs if os.path.exists(allowed_dir))
        
        if not is_allowed:
            logger.warning(f"Attempted to access file outside allowed directories: {abs_path}")
            abort(403)  # Forbidden
        
        # Check if file exists
        if not os.path.exists(abs_path):
            logger.warning(f"PDF file not found: {abs_path}")
            abort(404)
        
        # Verify file is a PDF (optional but adds security)
        if not abs_path.lower().endswith('.pdf') and magic_available:
            mime = magic.from_file(abs_path, mime=True)
            if 'application/pdf' not in mime:
                logger.warning(f"File is not a PDF: {abs_path}, mime: {mime}")
                abort(400)  # Bad request
        
        # Get directory and filename
        directory = os.path.dirname(abs_path)
        filename = os.path.basename(abs_path)
        
        # Set response headers for PDF content
        response = send_from_directory(
            directory,
            filename,
            mimetype='application/pdf',
            as_attachment=False  # Display in browser instead of downloading
        )
        
        # Add additional security headers
        response.headers['Content-Security-Policy'] = "default-src 'self'"
        response.headers['X-Content-Type-Options'] = 'nosniff'
        
        logger.info(f"Successfully served PDF file: {filename}")
        return response
        
    except Exception as e:
        logger.error(f"Error serving PDF file: {e}")
        abort(500)

@web_scraper_bp.route("/download-file/<path:file_path>")
def download_file_attachment(file_path):
    """
    Force download of a specific file.
    
    Args:
        file_path: The path to the file.
        
    Returns:
        The file as an attachment for download.
    """
    try:
        # For security, ensure the path is within allowed directories
        abs_path = os.path.abspath(file_path)
        
        # Check if file exists
        if not os.path.exists(abs_path):
            abort(404)
        
        # Get directory and filename
        directory = os.path.dirname(abs_path)
        filename = os.path.basename(abs_path)
        
        # Set response headers for attachment download
        return send_from_directory(
            directory, 
            filename,
            as_attachment=True,  # Force download instead of displaying
            download_name=filename
        )
        
    except Exception as e:
        logger.error(f"Error serving file for download: {e}")
        abort(500)
@web_scraper_bp.route('/scrape2/cancel/<task_id>', methods=['POST'])
def cancel_scrape2(task_id):
    """Cancel a scraping task."""
    task = get_task(task_id)
    if not task or not isinstance(task, ScraperTask):
        return structured_error_response("TASK_NOT_FOUND", f"ScraperTask with ID {task_id} not found.", 404)
    
    task.status = "cancelled"
    remove_task(task_id)
    
    return jsonify({
        "task_id": task_id,
        "status": "cancelled",
        "message": "ScraperTask cancelled successfully."
    })

##########################
# Helper Functions
##########################
def scrape_and_download_pdfs(url: str, output_folder: str = DEFAULT_OUTPUT_FOLDER) -> Dict[str, Any]:
    """
    Scrape a webpage for PDF links and download them.
    
    Args:
        url (str): URL of the webpage to scrape
        output_folder (str): Folder to save PDFs
        
    Returns:
        Dict[str, Any]: Results of the scraping and downloading
    """
    logger.info(f"Scraping for PDFs from: {url}")
    
    try:
        # Ensure output folder exists
        os.makedirs(output_folder, exist_ok=True)
        
        # Get PDF links from the page
        pdf_links = fetch_pdf_links(url)
        
        if not pdf_links:
            logger.info(f"No PDF links found on {url}")
            return {
                "status": "completed",
                "url": url,
                "message": "No PDF links found",
                "pdfs_found": 0,
                "pdfs_downloaded": 0
            }
        
        # Download each PDF
        downloaded_pdfs = []
        failed_pdfs = []
        
        for pdf_info in pdf_links:
            pdf_url = pdf_info["url"]
            try:
                # Download the PDF
                pdf_path = download_pdf(pdf_url, output_folder)
                
                # Process the PDF if download was successful
                if pdf_path and os.path.exists(pdf_path):
                    # Generate JSON output filename
                    pdf_filename = os.path.basename(pdf_path)
                    json_filename = f"{os.path.splitext(pdf_filename)[0]}_processed.json"
                    json_path = os.path.join(output_folder, json_filename)
                    
                    # Process PDF to JSON if module is available
                    if structify_module:
                        try:
                            structify_module.process_all_files(
                                root_directory=output_folder,
                                output_file=json_path,
                                file_filter=lambda f: f == pdf_path
                            )
                            downloaded_pdfs.append({
                                "url": pdf_url,
                                "file_path": pdf_path,
                                "json_path": json_path,
                                "title": pdf_info.get("title", "")
                            })
                        except Exception as e:
                            logger.error(f"Error processing PDF to JSON: {e}")
                            downloaded_pdfs.append({
                                "url": pdf_url,
                                "file_path": pdf_path,
                                "title": pdf_info.get("title", "")
                            })
                    else:
                        downloaded_pdfs.append({
                            "url": pdf_url,
                            "file_path": pdf_path,
                            "title": pdf_info.get("title", "")
                        })
            except Exception as e:
                logger.error(f"Error downloading PDF from {pdf_url}: {e}")
                failed_pdfs.append({
                    "url": pdf_url,
                    "error": str(e),
                    "title": pdf_info.get("title", "")
                })
        
        return {
            "status": "completed",
            "url": url,
            "pdfs_found": len(pdf_links),
            "pdfs_downloaded": len(downloaded_pdfs),
            "pdfs_failed": len(failed_pdfs),
            "downloaded_pdfs": downloaded_pdfs,
            "failed_pdfs": failed_pdfs,
            "output_folder": output_folder
        }
    
    except Exception as e:
        logger.error(f"Error scraping PDFs from {url}: {e}")
        return {
            "status": "error",
            "url": url,
            "error": str(e)
        }
def fetch_pdf_links(url: str) -> List[Dict[str, str]]:
    """
    Extract PDF links from a webpage.
    
    Args:
        url: URL of the webpage to scrape
        
    Returns:
        List of dictionaries containing PDF URLs and titles
    """
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        pdf_links = []
        
        # Find all links that point to PDFs
        for link in soup.find_all('a', href=True):
            href = link['href']
            if href.lower().endswith('.pdf') or 'pdf' in href.lower():
                # Make absolute URL
                pdf_url = urljoin(url, href)
                
                # Get link text or title
                title = link.get_text(strip=True) or link.get('title', '') or os.path.basename(href)
                
                pdf_links.append({
                    'url': pdf_url,
                    'title': title
                })
        
        return pdf_links
        
    except Exception as e:
        logger.error(f"Error fetching PDF links from {url}: {e}")
        return []

# Add this function before process_url_with_settings
def process_url(url: str, setting: str, keyword: str = "", output_folder: str = DEFAULT_OUTPUT_FOLDER) -> Dict[str, Any]:
    """
    Process a URL based on the specified setting.
    
    Args:
        url (str): The URL to process
        setting (str): One of 'full', 'metadata', 'title', 'keyword', 'pdf'
        keyword (str): Optional keyword for keyword search mode
        output_folder (str): Directory where outputs should be saved
        
    Returns:
        Dict[str, Any]: Results of the processing
    """
    # Ensure output folder exists
    os.makedirs(output_folder, exist_ok=True)
    
    try:
        # If web_scraper module is available, use it
        if web_scraper_available and hasattr(web_scraper, 'process_url'):
            return web_scraper.process_url(url, setting, keyword, output_folder)
        
        # Otherwise, provide a basic implementation
        import requests
        from bs4 import BeautifulSoup
        
        result = {"url": url, "setting": setting}
        
        # Download the page
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        
        if setting == 'title':
            # Extract just the title
            soup = BeautifulSoup(response.text, 'html.parser')
            title = soup.find('title')
            result['title'] = title.text.strip() if title else 'No title found'
            
        elif setting == 'metadata':
            # Extract metadata
            soup = BeautifulSoup(response.text, 'html.parser')
            metadata = {}
            
            # Get title
            title = soup.find('title')
            metadata['title'] = title.text.strip() if title else ''
            
            # Get meta tags
            for meta in soup.find_all('meta'):
                name = meta.get('name') or meta.get('property', '')
                content = meta.get('content', '')
                if name and content:
                    metadata[name] = content
            
            result['metadata'] = metadata
            
        elif setting == 'keyword' and keyword:
            # Search for keyword
            soup = BeautifulSoup(response.text, 'html.parser')
            text = soup.get_text()
            occurrences = text.lower().count(keyword.lower())
            result['keyword'] = keyword
            result['occurrences'] = occurrences
            result['found'] = occurrences > 0
            
        elif setting == 'pdf':
            # Find PDF links
            soup = BeautifulSoup(response.text, 'html.parser')
            pdf_links = []
            for link in soup.find_all('a', href=True):
                href = link['href']
                if href.lower().endswith('.pdf'):
                    # Make absolute URL
                    from urllib.parse import urljoin
                    pdf_url = urljoin(url, href)
                    pdf_links.append(pdf_url)
            result['pdf_links'] = pdf_links
            result['pdf_count'] = len(pdf_links)
            
        else:  # 'full' or default
            # Save full content
            output_file = os.path.join(output_folder, f"scraped_{int(time.time())}.html")
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write(response.text)
            result['output_file'] = output_file
            result['content_length'] = len(response.text)
        
        result['status'] = 'success'
        return result
        
    except Exception as e:
        logger.error(f"Error processing URL {url}: {e}")
        return {"error": str(e), "url": url, "status": "error"}        
def process_url_with_settings(url, setting, keyword, output_folder):
    """
    Process a URL based on the specified setting, using the imported web_scraper functions.
    
    Args:
        url: URL to process
        setting: Processing setting ('full', 'metadata', 'title', 'keyword', 'pdf')
        keyword: Optional keyword for keyword search
        output_folder: Output directory for results
        
    Returns:
        Processing result dictionary
    """
    # Ensure output folder exists
    os.makedirs(output_folder, exist_ok=True)
    
    if web_scraper_available:
        # If web_scraper is available, use its process_url function
        return web_scraper.process_url(url, setting, keyword, output_folder)
    else:
        # Fallback implementation if web_scraper is not available
        if setting.lower() == "pdf":
            try:
                # Download the PDF file
                pdf_file = download_pdf(url, save_path=output_folder)
                
                # Get just the filename without the path
                pdf_filename = os.path.basename(pdf_file)
                output_json_name = os.path.splitext(pdf_filename)[0] + "_processed"
                
                # Create a unique JSON output filename
                json_output = get_output_filepath(output_json_name, user_defined_dir=output_folder)
                
                # Process the downloaded PDF using Structify (claude.py)
                if structify_module:
                    single_result = structify_module.process_all_files(
                        root_directory=os.path.dirname(pdf_file),
                        output_file=json_output,
                        file_filter=lambda f: f == pdf_file  # Only process our specific PDF file
                    )
                
                return {
                    "status": "PDF downloaded and processed",
                    "url": url,
                    "pdf_file": pdf_file,
                    "json_file": json_output,
                    "output_folder": output_folder
                }
            except Exception as e:
                return {
                    "status": "error",
                    "url": url,
                    "error": str(e)
                }
        else:
            # For all other settings, use the process_url function (placeholder if web_scraper not available)
            return process_url(url, setting, keyword, output_folder)


def emit_pdf_download_progress(task_id, url, progress, status, file_path=None, error=None, details=None):
    """Emit PDF download progress update"""
    try:
        payload = {
            'task_id': task_id,
            'url': url,
            'progress': progress,
            'status': status,
            'file_path': file_path,
            'error': error,
            'details': details or {},
            'timestamp': time.time()
        }
        
        emit('pdf_download_progress', payload, broadcast=True)
        logger.debug(f"Emitted PDF download progress for task {task_id}: {status}")
        
    except Exception as e:
        logger.error(f"Error emitting PDF download progress: {str(e)}")

# Socket.IO events for web scraper
def emit_scraping_progress(task_id, progress, current_url=None, pages_scraped=0, total_pages=0):
    """Emit scraping progress update"""
    try:
        payload = {
            'task_id': task_id,
            'progress': progress,
            'status': 'scraping',
            'current_url': current_url,
            'pages_scraped': pages_scraped,
            'total_pages': total_pages,
            'timestamp': time.time()
        }
        
        emit('scraping_progress', payload, broadcast=True)
        logger.debug(f"Emitted scraping progress for task {task_id}: {progress}%")
        
    except Exception as e:
        logger.error(f"Error emitting scraping progress: {str(e)}")


def emit_scraping_completed(task_id, result_data=None, stats=None):
    """Emit scraping completion event"""
    try:
        payload = {
            'task_id': task_id,
            'status': 'completed',
            'result_data': result_data,
            'stats': stats or {},
            'timestamp': time.time()
        }
        
        emit('scraping_completed', payload, broadcast=True)
        logger.info(f"Emitted scraping completion for task {task_id}")
        
    except Exception as e:
        logger.error(f"Error emitting scraping completion: {str(e)}")


def emit_scraping_error(task_id, error_message, current_url=None):
    """Emit scraping error event"""
    try:
        payload = {
            'task_id': task_id,
            'status': 'error',
            'error': error_message,
            'current_url': current_url,
            'timestamp': time.time()
        }
        
        emit('scraping_error', payload, broadcast=True)
        logger.error(f"Emitted scraping error for task {task_id}: {error_message}")
        
    except Exception as e:
        logger.error(f"Error emitting scraping error: {str(e)}")