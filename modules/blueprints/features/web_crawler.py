"""
Web Crawler Module
Implements recursive web crawling functionality for the Web Scraper blueprint
"""

import logging
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse, urlunparse
from urllib.robotparser import RobotFileParser
import time
from typing import Set, List, Dict, Optional, Callable
from collections import deque
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib

logger = logging.getLogger(__name__)


class WebCrawler:
    """
    Advanced web crawler with recursive crawling capabilities.
    
    Features:
    - Depth-first and breadth-first crawling
    - Robots.txt compliance
    - Domain restriction options
    - Rate limiting and throttling
    - Duplicate URL detection
    - PDF link extraction
    - Progress tracking
    """
    
    def __init__(self, 
                 max_depth: int = 3,
                 max_pages: int = 100,
                 respect_robots: bool = True,
                 follow_redirects: bool = True,
                 request_delay: float = 0.5,
                 timeout: int = 30,
                 max_workers: int = 5):
        """
        Initialize the web crawler.
        
        Args:
            max_depth: Maximum crawling depth
            max_pages: Maximum pages to crawl per domain
            respect_robots: Whether to respect robots.txt
            follow_redirects: Whether to follow HTTP redirects
            request_delay: Delay between requests to same domain (seconds)
            timeout: Request timeout in seconds
            max_workers: Maximum concurrent workers
        """
        self.max_depth = max_depth
        self.max_pages = max_pages
        self.respect_robots = respect_robots
        self.follow_redirects = follow_redirects
        self.request_delay = request_delay
        self.timeout = timeout
        self.max_workers = max_workers
        
        # Crawling state
        self.visited_urls: Set[str] = set()
        self.url_queue: deque = deque()
        self.pdf_links: List[Dict[str, str]] = []
        self.scraped_data: Dict[str, Dict] = {}
        self.domain_last_access: Dict[str, float] = {}
        self.robots_cache: Dict[str, RobotFileParser] = {}
        
        # Statistics
        self.stats = {
            'pages_crawled': 0,
            'pdfs_found': 0,
            'errors': 0,
            'total_bytes': 0,
            'start_time': None,
            'end_time': None
        }
        
        # Control flags
        self.is_cancelled = False
        self.lock = threading.RLock()
        
        # Session for connection pooling
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'NeuroGenBot/1.0 (+https://neurogen.ai/bot)'
        })
    
    def crawl(self, 
              start_url: str,
              progress_callback: Optional[Callable] = None,
              pdf_callback: Optional[Callable] = None,
              stay_in_domain: bool = True) -> Dict[str, any]:
        """
        Start crawling from the given URL.
        
        Args:
            start_url: URL to start crawling from
            progress_callback: Function to call with progress updates
            pdf_callback: Function to call when PDF is found
            stay_in_domain: Whether to restrict crawling to start domain
            
        Returns:
            Dictionary with crawling results
        """
        self.stats['start_time'] = time.time()
        start_domain = urlparse(start_url).netloc
        
        # Initialize queue with start URL
        self.url_queue.append((start_url, 0))  # (url, depth)
        
        try:
            with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
                futures = []
                
                while self.url_queue and not self.is_cancelled:
                    if self.stats['pages_crawled'] >= self.max_pages:
                        logger.info(f"Reached maximum pages limit: {self.max_pages}")
                        break
                    
                    # Get next URL to crawl
                    url, depth = self._get_next_url()
                    if not url:
                        continue
                    
                    # Check domain restriction
                    if stay_in_domain and urlparse(url).netloc != start_domain:
                        continue
                    
                    # Submit crawling task
                    future = executor.submit(
                        self._crawl_page, 
                        url, 
                        depth, 
                        stay_in_domain, 
                        start_domain,
                        progress_callback,
                        pdf_callback
                    )
                    futures.append(future)
                    
                    # Process completed futures
                    for completed in list(futures):
                        if completed.done():
                            try:
                                completed.result()
                            except Exception as e:
                                logger.error(f"Crawling error: {e}")
                                self.stats['errors'] += 1
                            futures.remove(completed)
                
                # Wait for remaining futures
                for future in as_completed(futures):
                    try:
                        future.result()
                    except Exception as e:
                        logger.error(f"Crawling error: {e}")
                        self.stats['errors'] += 1
                        
        except Exception as e:
            logger.error(f"Critical crawling error: {e}")
            
        finally:
            self.stats['end_time'] = time.time()
            self.session.close()
        
        return self._get_results()
    
    def _get_next_url(self) -> Optional[tuple]:
        """Get next URL from queue with thread safety."""
        with self.lock:
            if self.url_queue:
                return self.url_queue.popleft()
            return None, None
    
    def _crawl_page(self, 
                    url: str, 
                    depth: int,
                    stay_in_domain: bool,
                    start_domain: str,
                    progress_callback: Optional[Callable],
                    pdf_callback: Optional[Callable]) -> None:
        """
        Crawl a single page.
        
        Args:
            url: URL to crawl
            depth: Current crawling depth
            stay_in_domain: Whether to stay in start domain
            start_domain: Original domain
            progress_callback: Progress callback function
            pdf_callback: PDF discovery callback function
        """
        # Check if already visited
        with self.lock:
            if url in self.visited_urls:
                return
            self.visited_urls.add(url)
        
        # Check robots.txt
        if self.respect_robots and not self._can_fetch(url):
            logger.info(f"Robots.txt disallows: {url}")
            return
        
        # Rate limiting
        self._apply_rate_limit(url)
        
        try:
            # Fetch the page
            response = self.session.get(
                url, 
                timeout=self.timeout,
                allow_redirects=self.follow_redirects
            )
            response.raise_for_status()
            
            # Update statistics
            with self.lock:
                self.stats['pages_crawled'] += 1
                self.stats['total_bytes'] += len(response.content)
            
            # Parse the page
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Extract page data
            page_data = self._extract_page_data(url, soup, response)
            with self.lock:
                self.scraped_data[url] = page_data
            
            # Find and process links
            if depth < self.max_depth:
                links = self._extract_links(soup, url)
                
                for link in links:
                    # Check if it's a PDF
                    if self._is_pdf_link(link):
                        pdf_info = {
                            'url': link,
                            'source_page': url,
                            'title': self._extract_link_title(soup, link),
                            'depth': depth
                        }
                        
                        with self.lock:
                            self.pdf_links.append(pdf_info)
                            self.stats['pdfs_found'] += 1
                        
                        if pdf_callback:
                            pdf_callback(pdf_info)
                    else:
                        # Add to crawl queue if not visited
                        with self.lock:
                            if link not in self.visited_urls:
                                # Check domain restriction
                                if not stay_in_domain or urlparse(link).netloc == start_domain:
                                    self.url_queue.append((link, depth + 1))
            
            # Progress callback
            if progress_callback:
                progress_callback({
                    'url': url,
                    'depth': depth,
                    'pages_crawled': self.stats['pages_crawled'],
                    'pdfs_found': self.stats['pdfs_found'],
                    'queue_size': len(self.url_queue)
                })
                
        except requests.exceptions.RequestException as e:
            logger.error(f"Error crawling {url}: {e}")
            with self.lock:
                self.stats['errors'] += 1
    
    def _can_fetch(self, url: str) -> bool:
        """Check if URL can be fetched according to robots.txt."""
        try:
            parsed = urlparse(url)
            robot_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
            
            # Check cache
            if robot_url in self.robots_cache:
                rp = self.robots_cache[robot_url]
            else:
                # Fetch and parse robots.txt
                rp = RobotFileParser()
                rp.set_url(robot_url)
                rp.read()
                self.robots_cache[robot_url] = rp
            
            return rp.can_fetch(self.session.headers['User-Agent'], url)
            
        except Exception as e:
            logger.warning(f"Error checking robots.txt for {url}: {e}")
            return True  # Allow if can't check
    
    def _apply_rate_limit(self, url: str) -> None:
        """Apply rate limiting for the domain."""
        domain = urlparse(url).netloc
        
        with self.lock:
            if domain in self.domain_last_access:
                elapsed = time.time() - self.domain_last_access[domain]
                if elapsed < self.request_delay:
                    time.sleep(self.request_delay - elapsed)
            
            self.domain_last_access[domain] = time.time()
    
    def _extract_page_data(self, url: str, soup: BeautifulSoup, response: requests.Response) -> Dict:
        """Extract relevant data from the page."""
        # Extract title
        title = ""
        if soup.title:
            title = soup.title.string.strip() if soup.title.string else ""
        
        # Extract meta description
        description = ""
        meta_desc = soup.find('meta', attrs={'name': 'description'})
        if meta_desc:
            description = meta_desc.get('content', '')
        
        # Extract text content (limited)
        text_content = soup.get_text(separator=' ', strip=True)[:5000]
        
        return {
            'url': url,
            'title': title,
            'description': description,
            'content_preview': text_content,
            'content_type': response.headers.get('Content-Type', ''),
            'status_code': response.status_code,
            'size': len(response.content),
            'timestamp': time.time()
        }
    
    def _extract_links(self, soup: BeautifulSoup, base_url: str) -> List[str]:
        """Extract all links from the page."""
        links = []
        
        for tag in soup.find_all(['a', 'link']):
            href = tag.get('href')
            if href:
                # Make absolute URL
                absolute_url = urljoin(base_url, href)
                
                # Clean URL (remove fragments)
                parsed = urlparse(absolute_url)
                clean_url = urlunparse(parsed._replace(fragment=''))
                
                # Filter out non-HTTP(S) URLs
                if parsed.scheme in ['http', 'https']:
                    links.append(clean_url)
        
        return list(set(links))  # Remove duplicates
    
    def _is_pdf_link(self, url: str) -> bool:
        """Check if URL points to a PDF file."""
        # Check file extension
        if url.lower().endswith('.pdf'):
            return True
        
        # Check for PDF in path
        if '/pdf/' in url.lower() or 'pdf' in urlparse(url).path.lower():
            return True
        
        # Check for common academic PDF patterns
        patterns = [
            'arxiv.org/pdf/',
            'doi.org/',
            '/fulltext.pdf',
            '/download/pdf',
            'type=pdf'
        ]
        
        return any(pattern in url.lower() for pattern in patterns)
    
    def _extract_link_title(self, soup: BeautifulSoup, link_url: str) -> str:
        """Extract title for a link."""
        # Find the anchor tag with this href
        for a in soup.find_all('a', href=True):
            if urljoin(soup.get('url', ''), a['href']) == link_url:
                # Get link text
                text = a.get_text(strip=True)
                if text:
                    return text
                
                # Check title attribute
                if a.get('title'):
                    return a['title']
        
        # Default to filename
        return urlparse(link_url).path.split('/')[-1] or 'Untitled'
    
    def _get_results(self) -> Dict[str, any]:
        """Get crawling results."""
        duration = self.stats['end_time'] - self.stats['start_time'] if self.stats['end_time'] else 0
        
        return {
            'stats': {
                **self.stats,
                'duration': duration,
                'pages_per_second': self.stats['pages_crawled'] / max(duration, 1)
            },
            'pdf_links': self.pdf_links,
            'scraped_pages': len(self.scraped_data),
            'total_links_found': len(self.visited_urls)
        }
    
    def cancel(self) -> None:
        """Cancel the crawling operation."""
        self.is_cancelled = True
        logger.info("Crawling cancelled by user")


def crawl_website(url: str, 
                  max_depth: int = 3,
                  max_pages: int = 100,
                  progress_callback: Optional[Callable] = None,
                  pdf_callback: Optional[Callable] = None,
                  **kwargs) -> Dict[str, any]:
    """
    Convenience function to crawl a website.
    
    Args:
        url: Starting URL
        max_depth: Maximum crawling depth
        max_pages: Maximum pages to crawl
        progress_callback: Progress callback function
        pdf_callback: PDF discovery callback function
        **kwargs: Additional crawler parameters
        
    Returns:
        Crawling results dictionary
    """
    crawler = WebCrawler(
        max_depth=max_depth,
        max_pages=max_pages,
        **kwargs
    )
    
    return crawler.crawl(
        url,
        progress_callback=progress_callback,
        pdf_callback=pdf_callback
    )