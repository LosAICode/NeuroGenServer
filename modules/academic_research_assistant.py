"""
Academic Research Assistant - Example integration of the Academic API client

This script demonstrates how to use the Academic API client in a practical
research workflow, including searching for papers, analyzing citations,
generating recommendations, and creating a research summary.

Usage:
    python academic_research_assistant.py --topic "machine learning" --papers 10 --output-dir "./research"
"""

import os
import sys
import time
import json
import logging
import argparse
from typing import Dict, List, Any, Optional
from pathlib import Path
from datetime import datetime

# Import the Academic API client
from academic_api_client import (
    AcademicApiClient, 
    APIError,
    ValidationError, 
    AuthenticationError, 
    RateLimitError, 
    ResourceNotFoundError
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('research_assistant.log')
    ]
)
logger = logging.getLogger("research_assistant")

class AcademicResearchAssistant:
    """
    Assistant for academic research that leverages the Academic API
    to find, analyze, and organize research papers.
    """
    
    def __init__(
        self, 
        api_key: Optional[str] = None,
        api_url: Optional[str] = None,
        output_dir: str = "./research",
        sources: List[str] = None,
        citation_depth: int = 1,
        max_recommendations: int = 5,
        include_pdfs: bool = True,
        debug: bool = False
    ):
        """
        Initialize the research assistant.
        
        Args:
            api_key: API key for the Academic API
            api_url: URL of the Academic API server
            output_dir: Directory to save research outputs
            sources: Academic sources to search
            citation_depth: Depth for citation analysis
            max_recommendations: Maximum paper recommendations
            include_pdfs: Whether to download PDF files
            debug: Enable debug logging
        """
        self.output_dir = os.path.abspath(output_dir)
        self.sources = sources or ["arxiv", "semantic", "openalex"]
        self.citation_depth = citation_depth
        self.max_recommendations = max_recommendations
        self.include_pdfs = include_pdfs
        
        # Initialize the API client
        self.client = AcademicApiClient(
            api_key=api_key,
            base_url=api_url,
            debug=debug
        )
        
        # Create output directories
        self._setup_directories()
        
        # Track papers and citations
        self.papers = {}
        self.citations = {}
        self.recommendations = {}
        self.downloads = {}
        
        logger.info(f"Research Assistant initialized with output to: {self.output_dir}")
    
    def _setup_directories(self):
        """Create the necessary output directories."""
        # Main output directory
        os.makedirs(self.output_dir, exist_ok=True)
        
        # Directories for different outputs
        self.pdf_dir = os.path.join(self.output_dir, "pdfs")
        self.data_dir = os.path.join(self.output_dir, "data")
        self.report_dir = os.path.join(self.output_dir, "reports")
        
        os.makedirs(self.pdf_dir, exist_ok=True)
        os.makedirs(self.data_dir, exist_ok=True)
        os.makedirs(self.report_dir, exist_ok=True)
        
        logger.debug(f"Created output directories in {self.output_dir}")
    
    def research_topic(
        self, 
        topic: str, 
        max_papers: int = 10,
        min_year: Optional[int] = None,
        save_results: bool = True
    ) -> Dict[str, Any]:
        """
        Conduct comprehensive research on a topic.
        
        Args:
            topic: Research topic to investigate
            max_papers: Maximum number of papers to analyze
            min_year: Minimum publication year to include
            save_results: Whether to save results to disk
            
        Returns:
            Dictionary with research results
        """
        start_time = time.time()
        research_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        logger.info(f"Starting research on topic: {topic}")
        logger.info(f"Research ID: {research_id}")
        
        # Track research progress
        research_data = {
            "id": research_id,
            "topic": topic,
            "timestamp": datetime.now().isoformat(),
            "sources": self.sources,
            "max_papers": max_papers,
            "min_year": min_year,
            "papers": [],
            "metrics": {
                "total_papers": 0,
                "total_citations": 0,
                "downloaded_pdfs": 0,
                "key_authors": [],
                "key_venues": []
            }
        }
        
        try:
            # Step 1: Search for papers on the topic
            search_results = self._search_papers(topic, max_papers)
            papers = search_results.get("results", [])
            research_data["metrics"]["total_papers"] = len(papers)
            
            # Step 2: Filter papers if min_year is specified
            if min_year:
                papers = self._filter_by_year(papers, min_year)
                logger.info(f"Filtered to {len(papers)} papers from {min_year} onwards")
            
            # Step 3: Get detailed information for each paper
            total_citations = 0
            authors_count = {}
            venues_count = {}
            
            for i, paper in enumerate(papers, 1):
                paper_id = paper.get("id")
                if not paper_id:
                    continue
                
                logger.info(f"Processing paper {i}/{len(papers)}: {paper.get('title', paper_id)}")
                
                # Get paper details
                try:
                    paper_details = self._get_paper_with_analysis(
                        paper_id, 
                        paper.get("source", "arxiv")
                    )
                    
                    # Update citation count
                    citations = paper_details.get("citations", {})
                    citation_count = citations.get("total_citations", 0)
                    total_citations += citation_count
                    
                    # Track authors
                    for author in paper_details.get("details", {}).get("authors", []):
                        authors_count[author] = authors_count.get(author, 0) + 1
                    
                    # Track venues (journals/conferences)
                    venue = paper_details.get("details", {}).get("metadata", {}).get("venue")
                    if venue:
                        venues_count[venue] = venues_count.get(venue, 0) + 1
                    
                    # Save paper data
                    research_data["papers"].append({
                        "id": paper_id,
                        "title": paper_details.get("details", {}).get("title", "Unknown"),
                        "authors": paper_details.get("details", {}).get("authors", []),
                        "publication_date": paper_details.get("details", {}).get("publication_date"),
                        "citation_count": citation_count,
                        "pdf_downloaded": paper_id in self.downloads,
                        "pdf_path": self.downloads.get(paper_id, {}).get("file_path"),
                        "source": paper_details.get("source")
                    })
                    
                except Exception as e:
                    logger.error(f"Error processing paper {paper_id}: {e}")
                    continue
            
            # Step 4: Download PDFs if requested
            if self.include_pdfs:
                downloaded = self._download_papers([p.get("id") for p in papers if p.get("id")])
                research_data["metrics"]["downloaded_pdfs"] = len(downloaded)
            
            # Step 5: Update research metrics
            research_data["metrics"]["total_citations"] = total_citations
            
            # Get top authors
            top_authors = sorted(authors_count.items(), key=lambda x: x[1], reverse=True)[:10]
            research_data["metrics"]["key_authors"] = [
                {"name": author, "paper_count": count} for author, count in top_authors
            ]
            
            # Get top venues
            top_venues = sorted(venues_count.items(), key=lambda x: x[1], reverse=True)[:5]
            research_data["metrics"]["key_venues"] = [
                {"name": venue, "paper_count": count} for venue, count in top_venues
            ]
            
            # Step 6: Generate research report
            if save_results:
                self._save_research_results(research_data, research_id)
            
            # Record execution time
            end_time = time.time()
            research_data["metrics"]["execution_time"] = end_time - start_time
            
            logger.info(f"Research completed in {end_time - start_time:.2f} seconds")
            logger.info(f"Found {len(papers)} papers with {total_citations} total citations")
            
            return research_data
            
        except Exception as e:
            logger.error(f"Error during research: {e}")
            if isinstance(e, APIError):
                logger.error(f"API Error Code: {e.code}, Status: {e.status_code}")
            
            # Record what we have so far
            if save_results:
                self._save_research_results(research_data, research_id + "_incomplete")
            
            raise
    
    def _search_papers(self, topic: str, max_papers: int) -> Dict[str, Any]:
        """
        Search for papers on a topic across multiple sources.
        
        Args:
            topic: Search topic
            max_papers: Maximum number of papers
            
        Returns:
            Search results dictionary
        """
        logger.info(f"Searching for papers on: {topic}")
        
        # Implement rate limit handling with retry
        max_retries = 3
        for attempt in range(max_retries):
            try:
                return self.client.search_multi_source(
                    query=topic,
                    sources=self.sources,
                    limit=max(5, max_papers // len(self.sources))
                )
            except RateLimitError as e:
                if attempt < max_retries - 1:
                    retry_after = e.retry_after or (2 ** attempt)
                    logger.warning(f"Rate limit reached. Retrying in {retry_after}s (attempt {attempt+1}/{max_retries})")
                    time.sleep(retry_after)
                else:
                    logger.error("Max retries reached for search")
                    raise
    
    def _filter_by_year(self, papers: List[Dict], min_year: int) -> List[Dict]:
        """
        Filter papers by publication year.
        
        Args:
            papers: List of papers
            min_year: Minimum publication year
            
        Returns:
            Filtered list of papers
        """
        filtered_papers = []
        for paper in papers:
            paper_id = paper.get("id")
            if not paper_id:
                continue
            
            # Need to get details to check publication date
            try:
                details = self.client.get_paper_details(
                    paper_id=paper_id,
                    source=paper.get("source", "arxiv")
                )
                
                # Extract year from publication_date
                pub_date = details.get("publication_date", "")
                if pub_date:
                    year = int(pub_date.split("-")[0])
                    if year >= min_year:
                        filtered_papers.append(paper)
                        
            except Exception as e:
                logger.warning(f"Error checking year for paper {paper_id}: {e}")
        
        return filtered_papers
    
    def _get_paper_with_analysis(self, paper_id: str, source: str) -> Dict[str, Any]:
        """
        Get comprehensive paper analysis.
        
        Args:
            paper_id: Paper identifier
            source: Source platform
            
        Returns:
            Paper analysis dictionary
        """
        # Check if we already analyzed this paper
        cache_key = f"{paper_id}_{source}"
        if cache_key in self.papers:
            return self.papers[cache_key]
        
        # Get comprehensive analysis
        try:
            analysis = self.client.analyze_and_visualize_paper(
                paper_id=paper_id,
                source=source,
                include_citations=(self.citation_depth > 0),
                include_recommendations=(self.max_recommendations > 0)
            )
            
            # Cache the results
            self.papers[cache_key] = analysis
            
            # Also cache citations and recommendations separately
            if "citations" in analysis and "error" not in analysis["citations"]:
                self.citations[cache_key] = analysis["citations"]
                
            if "recommendations" in analysis and "error" not in analysis["recommendations"]:
                self.recommendations[cache_key] = analysis["recommendations"]
            
            return analysis
            
        except ResourceNotFoundError:
            logger.warning(f"Paper {paper_id} not found")
            return {"error": "Paper not found"}
        except APIError as e:
            logger.warning(f"API error for paper {paper_id}: {e}")
            return {"error": str(e)}
    
    def _download_papers(self, paper_ids: List[str]) -> List[Dict]:
        """
        Download PDFs for multiple papers.
        
        Args:
            paper_ids: List of paper IDs
            
        Returns:
            List of download information dictionaries
        """
        if not paper_ids:
            return []
            
        logger.info(f"Downloading {len(paper_ids)} PDFs")
        
        try:
            # Use bulk download API
            result = self.client.bulk_download_papers(
                paper_ids=paper_ids,
                source="arxiv"  # Currently only arXiv is supported for bulk
            )
            
            # Track successful downloads
            successful = result.get("successful", [])
            for paper in successful:
                paper_id = paper.get("paper_id")
                if paper_id:
                    self.downloads[paper_id] = paper
            
            logger.info(f"Successfully downloaded {len(successful)} PDFs")
            return successful
            
        except Exception as e:
            logger.error(f"Bulk download failed: {e}")
            logger.info("Falling back to individual downloads")
            
            # Fall back to individual downloads
            successful = []
            for paper_id in paper_ids:
                try:
                    download_info = self.client.download_paper(
                        paper_id=paper_id,
                        source="arxiv"
                    )
                    self.downloads[paper_id] = download_info
                    successful.append(download_info)
                    
                except Exception as download_err:
                    logger.warning(f"Error downloading paper {paper_id}: {download_err}")
            
            logger.info(f"Successfully downloaded {len(successful)} PDFs through individual downloads")
            return successful
    
    def _save_research_results(self, research_data: Dict, research_id: str):
        """
        Save research results to disk.
        
        Args:
            research_data: Research data dictionary
            research_id: Unique research identifier
        """
        # Save the main research data
        data_file = os.path.join(self.data_dir, f"research_{research_id}.json")
        with open(data_file, 'w', encoding='utf-8') as f:
            json.dump(research_data, f, indent=2)
            
        logger.info(f"Saved research data to {data_file}")
        
        # Save paper details
        papers_dir = os.path.join(self.data_dir, f"research_{research_id}_papers")
        os.makedirs(papers_dir, exist_ok=True)
        
        for paper in research_data["papers"]:
            paper_id = paper.get("id")
            if not paper_id:
                continue
                
            cache_key = f"{paper_id}_{paper.get('source', 'arxiv')}"
            
            # Save paper details
            if cache_key in self.papers:
                paper_file = os.path.join(papers_dir, f"{paper_id.replace('/', '_')}.json")
                with open(paper_file, 'w', encoding='utf-8') as f:
                    json.dump(self.papers[cache_key], f, indent=2)
        
        # Generate a summary report in markdown
        self._generate_research_report(research_data, research_id)
    
    def _generate_research_report(self, research_data: Dict, research_id: str):
        """
        Generate a markdown research report.
        
        Args:
            research_data: Research data dictionary
            research_id: Unique research identifier
        """
        report_file = os.path.join(self.report_dir, f"research_{research_id}_report.md")
        
        with open(report_file, 'w', encoding='utf-8') as f:
            # Report header
            f.write(f"# Research Report: {research_data['topic']}\n\n")
            f.write(f"*Generated on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*\n\n")
            
            # Summary metrics
            f.write("## Research Summary\n\n")
            f.write(f"- **Topic:** {research_data['topic']}\n")
            f.write(f"- **Papers Found:** {research_data['metrics']['total_papers']}\n")
            f.write(f"- **Total Citations:** {research_data['metrics']['total_citations']}\n")
            f.write(f"- **PDFs Downloaded:** {research_data['metrics']['downloaded_pdfs']}\n")
            f.write(f"- **Sources:** {', '.join(research_data['sources'])}\n\n")
            
            # Key authors
            f.write("## Key Authors\n\n")
            for author in research_data["metrics"]["key_authors"]:
                f.write(f"- {author['name']} ({author['paper_count']} papers)\n")
            f.write("\n")
            
            # Key venues
            if research_data["metrics"]["key_venues"]:
                f.write("## Key Venues\n\n")
                for venue in research_data["metrics"]["key_venues"]:
                    f.write(f"- {venue['name']} ({venue['paper_count']} papers)\n")
                f.write("\n")
            
            # Papers
            f.write("## Papers\n\n")
            for i, paper in enumerate(research_data["papers"], 1):
                f.write(f"### {i}. {paper['title']}\n\n")
                f.write(f"- **Authors:** {', '.join(paper['authors'])}\n")
                f.write(f"- **Publication Date:** {paper.get('publication_date', 'Unknown')}\n")
                f.write(f"- **Citations:** {paper.get('citation_count', 0)}\n")
                f.write(f"- **ID:** {paper['id']}\n")
                f.write(f"- **Source:** {paper.get('source', 'Unknown')}\n")
                
                if paper.get('pdf_downloaded'):
                    pdf_path = paper.get('pdf_path', '')
                    if pdf_path:
                        rel_path = os.path.relpath(pdf_path, self.report_dir)
                        f.write(f"- **PDF:** [{os.path.basename(pdf_path)}]({rel_path})\n")
                    else:
                        f.write(f"- **PDF:** Downloaded\n")
                
                f.write("\n")
                
                # Get recommendations for this paper
                cache_key = f"{paper['id']}_{paper.get('source', 'arxiv')}"
                if cache_key in self.recommendations:
                    recs = self.recommendations[cache_key].get("recommendations", [])
                    if recs:
                        f.write("**Related Papers:**\n\n")
                        for rec in recs[:3]:  # Top 3 recommendations
                            f.write(f"- {rec.get('title', 'Unknown')} (Similarity: {rec.get('similarity_score', 'Unknown')})\n")
                        f.write("\n")
            
            # Footer
            f.write("\n---\n")
            f.write(f"*Research ID: {research_id}*\n")
        
        logger.info(f"Generated research report at {report_file}")

def main():
    """Command-line interface for the Academic Research Assistant."""
    parser = argparse.ArgumentParser(description="Academic Research Assistant")
    
    parser.add_argument("--topic", required=True, help="Research topic to investigate")
    parser.add_argument("--papers", type=int, default=10, help="Maximum number of papers to analyze")
    parser.add_argument("--output-dir", default="./research", help="Directory to save research outputs")
    parser.add_argument("--min-year", type=int, help="Minimum publication year to include")
    parser.add_argument("--sources", default="arxiv,semantic,openalex", help="Comma-separated list of sources")
    parser.add_argument("--citation-depth", type=int, default=1, help="Depth for citation analysis")
    parser.add_argument("--max-recommendations", type=int, default=5, help="Maximum paper recommendations")
    parser.add_argument("--no-pdfs", action="store_true", help="Skip downloading PDFs")
    parser.add_argument("--api-key", help="API key for the Academic API")
    parser.add_argument("--api-url", help="URL of the Academic API server")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging")
    
    args = parser.parse_args()
    
    # Configure logging level
    if args.debug:
        logger.setLevel(logging.DEBUG)
    
    try:
        # Initialize research assistant
        assistant = AcademicResearchAssistant(
            api_key=args.api_key,
            api_url=args.api_url,
            output_dir=args.output_dir,
            sources=args.sources.split(','),
            citation_depth=args.citation_depth,
            max_recommendations=args.max_recommendations,
            include_pdfs=not args.no_pdfs,
            debug=args.debug
        )
        
        # Conduct research
        results = assistant.research_topic(
            topic=args.topic,
            max_papers=args.papers,
            min_year=args.min_year
        )
        
        # Print summary
        print("\nResearch Complete!")
        print(f"Topic: {args.topic}")
        print(f"Papers analyzed: {results['metrics']['total_papers']}")
        print(f"Total citations: {results['metrics']['total_citations']}")
        print(f"PDFs downloaded: {results['metrics']['downloaded_pdfs']}")
        print(f"Results saved to: {os.path.abspath(args.output_dir)}")
        
        # Show report location
        report_files = [f for f in os.listdir(assistant.report_dir) if f.endswith('_report.md')]
        if report_files:
            print(f"Report: {os.path.join(assistant.report_dir, report_files[-1])}")
        
        return 0
        
    except Exception as e:
        logger.error(f"Research assistant error: {e}")
        if args.debug:
            import traceback
            traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())
