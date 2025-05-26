import hashlib
import json
import os
import re
import time
from datetime import datetime
from typing import Dict, Any, List, Optional, Set
import logging

# Configure logging
logger = logging.getLogger(__name__)

# -----------------------------------------------------------------------------
# DOCUMENT STRUCTURE ENHANCEMENT FUNCTIONS
# -----------------------------------------------------------------------------

def generate_document_id(file_path: str, content_hash: str = None) -> str:
    """
    Generate a unique document ID based on file path and optional content hash.
    
    Args:
        file_path: Path to the file
        content_hash: Optional hash of content
        
    Returns:
        String document ID in format "doc_XXXXXXXX"
    """
    if content_hash:
        # Use the first 8 characters of the content hash
        return f"doc_{content_hash[:8]}"
    else:
        # Create hash from file path
        path_hash = hashlib.md5(file_path.encode('utf-8')).hexdigest()
        return f"doc_{path_hash[:8]}"

def extract_authors_from_metadata(metadata: Dict[str, Any]) -> List[str]:
    """
    Extract author information from document metadata.
    
    Args:
        metadata: Document metadata dictionary
        
    Returns:
        List of author names
    """
    # Check for 'author' field in metadata
    if 'author' in metadata and metadata['author']:
        # Handle comma-separated or semicolon-separated author lists
        if isinstance(metadata['author'], str):
            if ',' in metadata['author'] or ';' in metadata['author']:
                # Split by comma or semicolon
                delimiter = ',' if ',' in metadata['author'] else ';'
                return [author.strip() for author in metadata['author'].split(delimiter)]
            else:
                # Single author
                return [metadata['author'].strip()]
    
    # In case no authors were found
    return []

def get_document_title(doc_data: Dict[str, Any], file_path: str) -> str:
    """
    Extract the document title from metadata or file path.
    
    Args:
        doc_data: Document data dictionary
        file_path: Path to the file
        
    Returns:
        Document title
    """
    # Check if title exists in metadata
    if 'metadata' in doc_data and doc_data['metadata'].get('title'):
        return doc_data['metadata']['title']
    
    # Check if structure has a title
    if 'structure' in doc_data and doc_data['structure'].get('title'):
        return doc_data['structure']['title']
        
    # Check if PDF metadata contains a title
    if 'metadata' in doc_data and doc_data['metadata'].get('pdf_metadata', {}).get('title'):
        return doc_data['metadata']['pdf_metadata']['title']
    
    # Use filename as fallback
    return os.path.basename(file_path).replace('.pdf', '').replace('_', ' ').title()

def extract_keywords_from_content(content: str, max_keywords: int = 15) -> List[str]:
    """
    Extract keywords from document content using frequency analysis.
    Optimized for scientific papers.
    
    Args:
        content: Document content
        max_keywords: Maximum number of keywords to extract
        
    Returns:
        List of keywords
    """
    # Common stop words to exclude
    stop_words = {
        'the', 'and', 'is', 'of', 'to', 'in', 'that', 'for', 'this', 'with', 'as', 'are', 'on',
        'be', 'by', 'an', 'we', 'our', 'from', 'at', 'or', 'not', 'has', 'have', 'had', 'was',
        'were', 'they', 'their', 'it', 'been', 'will', 'would', 'could', 'should', 'can', 'may',
        'these', 'those', 'such', 'then', 'than', 'when', 'who', 'whom', 'whose', 'which', 'what',
        'how', 'why', 'where', 'there', 'here', 'some', 'any', 'all', 'one', 'two', 'three',
        'four', 'five', 'first', 'second', 'third', 'also', 'however', 'thus', 'therefore',
        'although', 'though', 'since', 'because', 'while', 'if', 'unless', 'until', 'whether'
    }
    
    # Science-specific stop words
    science_stop_words = {
        'figure', 'table', 'section', 'appendix', 'equation', 'chapter', 'page', 'vol', 'volume',
        'journal', 'conference', 'proceedings', 'paper', 'article', 'publication', 'published',
        'author', 'authors', 'et', 'al', 'doi', 'copyright', 'isbn', 'issn', 'url', 'http', 'www'
    }
    
    # Combined stop words
    combined_stop_words = stop_words.union(science_stop_words)
    
    # Find all words (excluding numbers)
    words = re.findall(r'\b[a-zA-Z][a-zA-Z-]{2,}\b', content.lower())
    
    # Count word frequencies excluding stop words
    word_freq = {}
    for word in words:
        if word not in combined_stop_words and len(word) > 3:  # Only consider words longer than 3 characters
            word_freq[word] = word_freq.get(word, 0) + 1
    
    # Get top keywords
    keywords = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)
    
    # Extract multi-word phrases that are likely to be technical terms
    # This is especially useful for scientific papers
    phrases = extract_technical_phrases(content, combined_stop_words)
    
    # Combine single keywords and phrases
    combined_keywords = [word for word, _ in keywords[:max_keywords-len(phrases)]]
    combined_keywords.extend(phrases[:min(len(phrases), max_keywords//3)])  # Allocate 1/3 of slots for phrases
    
    # Remove duplicates while preserving order
    seen = set()
    unique_keywords = []
    for kw in combined_keywords:
        if kw not in seen:
            seen.add(kw)
            unique_keywords.append(kw)
    
    return unique_keywords[:max_keywords]

def extract_technical_phrases(content: str, stop_words: Set[str], max_phrases: int = 5) -> List[str]:
    """
    Extract technical phrases (multi-word terms) from content.
    
    Args:
        content: Document content
        stop_words: Set of stop words to exclude
        max_phrases: Maximum number of phrases to extract
        
    Returns:
        List of technical phrases
    """
    # Look for capitalized multi-word phrases, common in scientific papers
    cap_phrases = re.findall(r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b', content)
    
    # Also look for phrases with hyphens and specific patterns common in scientific terminology
    tech_patterns = [
        r'\b([a-z]+-[a-z]+(?:-[a-z]+)?)\b',  # Hyphenated terms
        r'\b([a-z]+\s+[a-z]+(?:ing|ed|ion|ity|ics))\b',  # Terms ending with specific suffixes
    ]
    
    tech_matches = []
    for pattern in tech_patterns:
        tech_matches.extend(re.findall(pattern, content.lower()))
    
    # Combine and filter phrases
    all_phrases = cap_phrases + tech_matches
    
    # Count frequency
    phrase_freq = {}
    for phrase in all_phrases:
        # Skip phrases that start with a stop word
        first_word = phrase.split()[0].lower()
        if first_word in stop_words:
            continue
        phrase_freq[phrase] = phrase_freq.get(phrase, 0) + 1
    
    # Get top phrases
    sorted_phrases = sorted(phrase_freq.items(), key=lambda x: x[1], reverse=True)
    return [phrase for phrase, _ in sorted_phrases[:max_phrases]]

def organize_sections_from_structure(structure: Dict[str, Any], full_text: str, max_section_length: int = 5000) -> List[Dict[str, Any]]:
    """
    Organize document sections from structure information.
    
    Args:
        structure: Document structure dictionary
        full_text: Full document text
        max_section_length: Maximum section content length
        
    Returns:
        List of section dictionaries
    """
    sections = []
    
    # First check if we have predefined sections
    if structure and 'sections' in structure and structure['sections']:
        for section in structure['sections']:
            # Get section content
            content = ""
            if 'content' in section:
                if isinstance(section['content'], list):
                    content = "\n".join(section['content'])
                else:
                    content = section['content']
            
            # Truncate content if too long
            if len(content) > max_section_length:
                content = content[:max_section_length] + "..."
            
            # Create section entry
            sections.append({
                "section_name": section.get('clean_title', section.get('title', 'Unnamed Section')),
                "content": content,
                "level": section.get('level', 1)
            })
    
    # If we have potential lists in the structure, convert them to sections
    if structure and 'potential_lists' in structure and structure['potential_lists']:
        list_sections = []
        for i, list_items in enumerate(structure['potential_lists']):
            if isinstance(list_items, list) and list_items:
                list_sections.append({
                    "section_name": f"List {i+1}",
                    "content": "\n".join(f"• {item}" for item in list_items),
                    "level": 2,
                    "is_list": True
                })
        
        # Add list sections if we found any
        if list_sections:
            sections.extend(list_sections)
    
    # If no sections were found, create artificial sections from full text
    if not sections and full_text:
        # First try to find standard sections in scientific papers
        sci_sections = extract_scientific_paper_sections(full_text)
        
        if sci_sections:
            sections.extend(sci_sections)
        else:
            # If no standard sections found, split by potential section markers
            potential_sections = re.split(r'\n\s*\n\s*(?=[A-Z][a-z]+(?:[\s\-]|$))', full_text)
            
            for i, section_text in enumerate(potential_sections):
                # Skip very short sections
                if len(section_text.strip()) < 100:
                    continue
                    
                # Extract first line as potential title
                lines = section_text.strip().split('\n')
                title = lines[0] if lines else f"Section {i+1}"
                
                # Content is everything after the first line
                content = "\n".join(lines[1:]) if len(lines) > 1 else section_text
                
                # Truncate content if too long
                if len(content) > max_section_length:
                    content = content[:max_section_length] + "..."
                
                sections.append({
                    "section_name": title,
                    "content": content,
                    "level": 1
                })
    
    return sections

def extract_scientific_paper_sections(text: str) -> List[Dict[str, Any]]:
    """
    Extract standard sections from scientific papers.
    
    Args:
        text: Full document text
        
    Returns:
        List of section dictionaries
    """
    # Common section names in scientific papers
    section_patterns = [
        (r'(?:abstract|summary)\s*', "Abstract", 1),
        (r'(?:introduction|background)\s*', "Introduction", 1),
        (r'(?:methodology|methods|materials(?:\s+and\s+methods)?|experimental(?:\s+setup)?)\s*', "Methodology", 1),
        (r'(?:results(?:\s+and\s+discussion)?)\s*', "Results", 1),
        (r'(?:discussion|analysis)\s*', "Discussion", 1),
        (r'(?:conclusion(?:s)?|summary)\s*', "Conclusion", 1),
        (r'(?:acknowledgements|acknowledgments)\s*', "Acknowledgements", 2),
        (r'(?:references|bibliography|works\s+cited|literature\s+cited)\s*', "References", 2),
        (r'(?:appendix|appendices|supplementary\s+material)\s*', "Appendix", 2)
    ]
    
    sections = []
    section_markers = []
    
    # Find potential section boundaries
    for pattern, name, level in section_patterns:
        # Look for section headers with flexible matching
        for match in re.finditer(r'\n\s*(' + pattern + r')\s*(?:\n|\:)', text, re.IGNORECASE):
            section_markers.append((match.start(), match.group(1), name, level))
    
    # Sort by position in text
    section_markers.sort(key=lambda x: x[0])
    
    # Extract section content
    for i, (start_pos, _, name, level) in enumerate(section_markers):
        # Determine section end
        if i < len(section_markers) - 1:
            end_pos = section_markers[i+1][0]
        else:
            end_pos = len(text)
        
        # Extract section content
        content = text[start_pos:end_pos].strip()
        
        # Skip empty sections
        if not content:
            continue
        
        # Remove the section header from content
        content_lines = content.split('\n')
        if content_lines and re.match(r'\s*' + section_patterns[i][0], content_lines[0], re.IGNORECASE):
            content = '\n'.join(content_lines[1:])
        
        sections.append({
            "section_name": name,
            "content": content.strip(),
            "level": level
        })
    
    # If no sections were found but the abstract pattern is detectable
    if not sections and re.search(r'\babstract\b', text[:1000], re.IGNORECASE):
        # Try to split by common headings
        text_lower = text.lower()
        for i, (pattern, name, level) in enumerate(section_patterns):
            pos = re.search(r'\b' + pattern.replace(r'\s*', r'\s+') + r'\b', text_lower)
            if pos:
                sections.append({
                    "section_name": name,
                    "content": "Content extraction failed - please check the original document",
                    "level": level
                })
    
    return sections

def convert_tables_to_standard_format(tables: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Convert tables to a standardized format optimized for scientific papers.
    
    Args:
        tables: List of table dictionaries
        
    Returns:
        List of standardized table dictionaries
    """
    standardized_tables = []
    
    for idx, table in enumerate(tables):
        # Create standardized table structure
        std_table = {
            "table_id": f"table_{idx+1}",
            "caption": extract_table_caption(table) or f"Table {idx+1}" + (f" (Page {table.get('page', '?')})" if 'page' in table else ""),
            "page": table.get('page', None),
            "rows": table.get('rows', 0),
            "columns": table.get('columns', []),
            "data": []
        }
        
        # Convert data to standard format
        if 'data' in table:
            if isinstance(table['data'], list):
                # Handle different data formats
                if table['data'] and isinstance(table['data'][0], dict):
                    # Already in column:value format
                    std_table['data'] = table['data']
                else:
                    # Convert row-based format to dict-based format
                    converted_data = []
                    for row_idx, row in enumerate(table['data']):
                        if row_idx == 0 and not std_table['columns'] and isinstance(row, list):
                            # Use first row as column headers if not explicitly defined
                            std_table['columns'] = [str(cell) for cell in row]
                        else:
                            # Convert to dictionary using column names or default column names
                            row_dict = {}
                            for col_idx, cell in enumerate(row if isinstance(row, list) else [row]):
                                col_name = std_table['columns'][col_idx] if col_idx < len(std_table['columns']) else f"col_{col_idx+1}"
                                row_dict[col_name] = cell
                            converted_data.append(row_dict)
                    
                    std_table['data'] = converted_data
        
        standardized_tables.append(std_table)
    
    return standardized_tables

def extract_table_caption(table: Dict[str, Any]) -> Optional[str]:
    """
    Extract a meaningful caption from a table object.
    
    Args:
        table: Table dictionary
        
    Returns:
        Table caption or None if not found
    """
    # Check common caption fields
    if 'caption' in table:
        return table['caption']
    
    # Check for a title field
    if 'title' in table:
        return table['title']
    
    # Try to infer caption from data or description
    if 'description' in table:
        return table['description']
    
    # Try to extract from table_id if it's descriptive
    if 'table_id' in table and isinstance(table['table_id'], str) and len(table['table_id']) > 10:
        # Convert CamelCase or snake_case to spaces
        caption = re.sub(r'([a-z])([A-Z])', r'\1 \2', table['table_id'])
        caption = caption.replace('_', ' ').capitalize()
        return caption
    
    # No caption found
    return None

def process_references_to_standard_format(references: List[str]) -> List[Dict[str, Any]]:
    """
    Process references to a standardized format with additional metadata.
    Optimized for scientific paper citations.
    
    Args:
        references: List of reference strings
        
    Returns:
        List of standardized reference dictionaries
    """
    std_references = []
    
    for idx, ref in enumerate(references):
        # Try to extract year
        year_match = re.search(r'(?:19|20)\d{2}', ref)
        year = year_match.group(0) if year_match else None
        
        # Try to extract DOI
        doi_match = re.search(r'doi:([^\s,]+)|https?://doi\.org/([^\s,]+)', ref, re.IGNORECASE)
        doi = (doi_match.group(1) or doi_match.group(2)) if doi_match else None
        
        # Try to extract URL
        url_match = re.search(r'https?://(?!doi\.org)[^\s,]+', ref)
        url = url_match.group(0) if url_match else None
        
        # Try to extract author (improved approach)
        authors = extract_reference_authors(ref)
        first_author = authors[0] if authors else None
        
        # Try to extract title
        title = extract_reference_title(ref)
        
        # First 100 characters as preview
        preview = ref[:100] + "..." if len(ref) > 100 else ref
        
        std_references.append({
            "ref_id": f"ref_{idx+1}",
            "text": ref,
            "title": title,
            "authors": authors, 
            "first_author": first_author,
            "year": year,
            "doi": doi,
            "url": url,
            "preview": preview
        })
    
    return std_references

def extract_reference_authors(ref: str) -> List[str]:
    """
    Extract authors from a reference string.
    
    Args:
        ref: Reference string
        
    Returns:
        List of author names
    """
    # Pattern for author lists at beginning of reference (various formats)
    author_patterns = [
        # Last, F. M. pattern
        r'^([A-Z][a-z]+,\s+[A-Z]\.(?:\s*[A-Z]\.)?)(?:,\s+([A-Z][a-z]+,\s+[A-Z]\.(?:\s*[A-Z]\.)?)){0,10}',
        # Last, First pattern
        r'^([A-Z][a-z]+,\s+[A-Z][a-z]+)(?:,\s+([A-Z][a-z]+,\s+[A-Z][a-z]+)){0,10}',
        # F. Last pattern
        r'^([A-Z]\.\s*[A-Z][a-z]+)(?:,\s+([A-Z]\.\s*[A-Z][a-z]+)){0,10}',
        # First Last pattern
        r'^([A-Z][a-z]+\s+[A-Z][a-z]+)(?:,\s+([A-Z][a-z]+\s+[A-Z][a-z]+)){0,10}'
    ]
    
    for pattern in author_patterns:
        match = re.search(pattern, ref)
        if match:
            # Extract full match and try to split by commas and 'and'
            author_text = match.group(0)
            
            # Replace "and" with comma for uniform splitting
            author_text = re.sub(r'\s+and\s+', ', ', author_text)
            
            # Split by comma
            return [author.strip() for author in author_text.split(',') if author.strip()]
    
    # Check for "et al." pattern
    et_al_match = re.search(r'^([A-Z][a-z]+(?:,\s+[A-Z]\.|\s+[A-Z]\.)?)\s+et\s+al\.', ref)
    if et_al_match:
        return [et_al_match.group(1)]
    
    # No authors found
    return []

def extract_reference_title(ref: str) -> Optional[str]:
    """
    Extract the title from a reference string.
    
    Args:
        ref: Reference string
        
    Returns:
        Title string or None if not found
    """
    # Remove author section if present (assuming it's at the beginning)
    cleaned_ref = ref
    author_match = re.search(r'^.*?(?=\.\s+[A-Z]|\(\d{4}\))', ref)
    if author_match:
        cleaned_ref = ref[author_match.end():].strip()
        if cleaned_ref.startswith('.'):
            cleaned_ref = cleaned_ref[1:].strip()
    
    # Look for quotes which often contain titles
    quote_match = re.search(r'"([^"]+)"', cleaned_ref)
    if quote_match:
        return quote_match.group(1)
    
    # Look for title ending with a period followed by journal/conference info
    title_match = re.search(r'^([^\.]+)\.\s+(?:In|Journal|Proceedings|IEEE|ACM)', cleaned_ref)
    if title_match:
        return title_match.group(1)
    
    # If there's a year, try to get text after year and before next punctuation
    year_match = re.search(r'\((?:19|20)\d{2}\)\s*(.+?)[\.\,]', cleaned_ref)
    if year_match:
        return year_match.group(1)
    
    # Fall back to first sentence if nothing else works
    sentence_match = re.search(r'^([^\.]+)\.', cleaned_ref)
    if sentence_match:
        return sentence_match.group(1)
    
    # No title found
    return None

def build_keyword_index(documents: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    """
    Build a keyword index across all documents for faster retrieval.
    
    Args:
        documents: List of document dictionaries
        
    Returns:
        Dictionary mapping keywords to document IDs
    """
    index = {}
    
    for doc in documents:
        doc_id = doc.get('document_id', '')
        
        # Skip documents without ID
        if not doc_id:
            continue
        
        # Extract keywords from various sources
        keywords = set()
        
        # From explicit keywords list
        if 'keywords' in doc:
            keywords.update(doc.get('keywords', []))
        
        # From title words (excluding stop words)
        if 'title' in doc and doc['title']:
            title_words = re.findall(r'\b[A-Za-z][A-Za-z-]{3,}\b', doc['title'])
            keywords.update([word.lower() for word in title_words if len(word) > 3])
        
        # From document type
        if 'metadata' in doc and doc['metadata'].get('document_type'):
            keywords.add(doc['metadata']['document_type'])
            
        # From section names
        if 'sections' in doc:
            for section in doc['sections']:
                if 'section_name' in section:
                    section_words = re.findall(r'\b[A-Za-z][A-Za-z-]{3,}\b', section['section_name'])
                    keywords.update([word.lower() for word in section_words if len(word) > 3])
        
        # Add document ID to each keyword's document list
        for keyword in keywords:
            if keyword in index:
                if doc_id not in index[keyword]:
                    index[keyword].append(doc_id)
            else:
                index[keyword] = [doc_id]
    
    return index

def prepare_improved_output(
    all_data: Dict[str, Any], 
    create_index: bool = True,
    max_section_length: int = 5000
) -> Dict[str, Any]:
    """
    Prepare improved output format from processed data.
    
    Args:
        all_data: Dictionary of processed data
        create_index: Whether to create a keyword index
        max_section_length: Maximum section content length
        
    Returns:
        Dictionary in improved format ready for JSON output
    """
    # Initialize the improved output structure
    improved_output = {
        "root": {
            "documents": [],
            "metadata": {
                "document_count": 0,
                "processing_timestamp": datetime.now().isoformat(),
                "libraries_processed": list(all_data.keys())
            }
        }
    }
    
    # Process each library
    all_documents = []
    
    for lib_name, lib_data in all_data.items():
        # Group docs_data by file_path to form complete documents
        docs_by_file = {}
        
        for doc in lib_data.get("docs_data", []):
            file_path = doc.get("file_path", "")
            
            if not file_path:
                continue
                
            # Initialize document if not already present
            if file_path not in docs_by_file:
                docs_by_file[file_path] = {
                    "docs_data": [],
                    "file_path": file_path,
                    "content_hash": doc.get("content_hash", ""),
                    "metadata": doc.get("metadata", {}),
                    "full_text": "",
                    "tables": [],
                    "references": [],
                    "structure": {}
                }
            
            # Collect all chunks for this document
            docs_by_file[file_path]["docs_data"].append(doc)
            
            # Look for full_content chunk to use as main document content
            if doc.get("metadata", {}).get("chunk_type") == "full_content":
                docs_by_file[file_path]["full_text"] = doc.get("content", "")
            
            # Collect tables, references and structure data from all chunks
            for key in ["tables", "references", "structure"]:
                if key in doc:
                    if isinstance(doc[key], list):
                        docs_by_file[file_path][key].extend(doc[key])
                    else:
                        # For dictionaries like structure, use the most detailed one
                        current = docs_by_file[file_path][key]
                        new = doc[key]
                        
                        # Use the one with more keys, or the new one if same number of keys
                        if not current or (isinstance(new, dict) and len(new) >= len(current)):
                            docs_by_file[file_path][key] = new
                            
                # Also check metadata for these fields
                elif key in doc.get("metadata", {}):
                    if isinstance(doc["metadata"][key], list):
                        docs_by_file[file_path][key].extend(doc["metadata"][key])
                    else:
                        current = docs_by_file[file_path][key]
                        new = doc["metadata"][key]
                        
                        if not current or (isinstance(new, dict) and len(new) >= len(current)):
                            docs_by_file[file_path][key] = new
        
        # Convert each file's data to the improved document format
        for file_path, doc_data in docs_by_file.items():
            # Generate document ID
            doc_id = generate_document_id(file_path, doc_data["content_hash"])
            
            # Get the document's full text - either from full_content chunk or by joining all chunks
            full_text = doc_data.get("full_text", "")
            if not full_text:
                # Join all chunks' content as fallback
                all_content = [d.get("content", "") for d in doc_data["docs_data"]]
                full_text = "\n\n".join(filter(None, all_content))
            
            # Extract metadata
            metadata = doc_data.get("metadata", {})
            
            # Get document title
            title = get_document_title(doc_data, file_path)
            
            # Extract authors
            authors = extract_authors_from_metadata(metadata)
            
            # Extract keywords
            keywords = extract_keywords_from_content(full_text)
            
            # Organize sections
            structure = doc_data.get("structure", {})
            sections = organize_sections_from_structure(structure, full_text, max_section_length)
            
            # Process tables
            tables = convert_tables_to_standard_format(doc_data.get("tables", []))
            
            # Process references
            references = process_references_to_standard_format(doc_data.get("references", []))
            
            # Create document in improved format
            document = {
                "document_id": doc_id,
                "title": title,
                "file_path": file_path,
                "authors": authors,
                "keywords": keywords,
                "sections": sections,
                "tables": tables,
                "references": references,
                "metadata": {
                    "library": lib_name,
                    "document_type": metadata.get("document_type", "general"),
                    "language": metadata.get("language", "en"),
                    "page_count": metadata.get("page_count", 0),
                    "creation_date": metadata.get("creation_date", ""),
                    "last_modified": metadata.get("last_modified", ""),
                    "content_hash": doc_data.get("content_hash", ""),
                    "original_metadata": metadata  # Keep original metadata for reference
                }
            }
            
            # Add document to list
            all_documents.append(document)
    
    # Add documents to output
    improved_output["root"]["documents"] = all_documents
    improved_output["root"]["metadata"]["document_count"] = len(all_documents)
    
    # Build index if requested
    if create_index:
        improved_output["root"]["index"] = build_keyword_index(all_documents)
    
    return improved_output

def write_improved_output(
    data: Dict[str, Any], 
    output_file: str, 
    indent: int = 2
) -> bool:
    """
    Write improved output to JSON file with error handling.
    
    Args:
        data: Data in improved format
        output_file: Path to output file
        indent: JSON indentation level
        
    Returns:
        True if successful, False otherwise
    """
    # Create output directory if needed
    output_dir = os.path.dirname(output_file)
    if output_dir and not os.path.exists(output_dir):
        try:
            os.makedirs(output_dir, exist_ok=True)
        except Exception as e:
            logger.error(f"Error creating output directory: {e}")
            return False
    
    # Create a temporary file
    temp_file = f"{output_file}.tmp"
    
    try:
        # Write to temporary file first
        with open(temp_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=indent)
        
        # Verify the file exists and has content
        if not os.path.exists(temp_file) or os.path.getsize(temp_file) < 10:
            logger.error(f"Error: Temporary file {temp_file} not created or empty")
            return False
        
        # Replace the target file with the temporary file
        if os.path.exists(output_file):
            os.replace(temp_file, output_file)
        else:
            os.rename(temp_file, output_file)
            
        logger.info(f"Successfully wrote enhanced output to {output_file}")
        return True
    except Exception as e:
        logger.error(f"Error writing output: {e}")
        if os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except:
                pass
        return False

# -----------------------------------------------------------------------------
# INTEGRATION WITH EXISTING CODE
# -----------------------------------------------------------------------------

def write_final_output_improved(all_data, output_file, stats_only=False):
    """
    Write the final JSON output using the improved format.
    This function replaces the original write_final_output.
    
    Args:
        all_data: The data to write as JSON
        output_file: Path to the output JSON file
        stats_only: Whether to only include statistics
        
    Returns:
        bool: True if successful, False otherwise
    """
    if stats_only:
        return True
        
    try:
        # Convert to improved format
        improved_data = prepare_improved_output(all_data)
        
        # Write to file
        success = write_improved_output(improved_data, output_file)
        
        if success:
            logger.info(f"Created improved JSON output at {output_file}")
            return True
        else:
            logger.error(f"Failed to create improved JSON output at {output_file}")
            return False
            
    except Exception as e:
        logger.error(f"Error writing improved final output: {e}")
        return False

def enhance_existing_output(input_file, output_file=None):
    """
    Enhance an existing PDF processing output file to the improved format.
    
    Args:
        input_file: Path to the input JSON file
        output_file: Path to save the enhanced JSON output (default: input_file with _enhanced suffix)
        
    Returns:
        bool: Success status
    """
    if not output_file:
        base, ext = os.path.splitext(input_file)
        output_file = f"{base}_enhanced{ext}"
    
    try:
        # Read input JSON
        with open(input_file, 'r', encoding='utf-8') as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError as e:
                logger.error(f"Error parsing JSON from {input_file}: {e}")
                return False
        
        # Transform to improved format
        improved_data = prepare_improved_output(data)
        
        # Write enhanced output
        return write_improved_output(improved_data, output_file)
    except Exception as e:
        logger.error(f"Error enhancing output: {e}")
        return False

def modify_process_all_files(module_globals):
    """
    Patches process_all_files to use the improved output format.
    Should be called to apply the patch globally.
    
    Args:
        module_globals: The globals() dictionary from the calling module
    
    Returns:
        bool: Success status
    """
    try:
        # Check if write_final_output exists in globals
        if 'write_final_output' in module_globals:
            # Store the original function
            original_write_final_output = module_globals['write_final_output']
            
            # Replace with our improved version
            module_globals['write_final_output'] = write_final_output_improved
            
            logger.info("Successfully patched process_all_files to use improved output format")
            return True
        else:
            logger.warning("write_final_output not found in globals, patch not applied")
            return False
    except Exception as e:
        logger.error(f"Error modifying process_all_files: {e}")
        return False

def process_pdf_wrapper(original_process_pdf):
    """
    Create a wrapper for process_pdf that adds improved output format.
    
    Args:
        original_process_pdf: The original process_pdf function
        
    Returns:
        function: The wrapped function
    """
    def wrapper(*args, **kwargs):
        # Call the original function
        result = original_process_pdf(*args, **kwargs)
        
        # Check if we need to convert the result
        if result and kwargs.get("return_data", False) and "docs_data" in result:
            # Create a simple structure for the converter
            all_data = {"pdf": {"docs_data": result["docs_data"]}}
            
            # Convert to improved format
            try:
                improved = prepare_improved_output(all_data)
                
                # Add the improved format to the result
                result["improved_format"] = improved
                logger.info("Added improved format to process_pdf result")
            except Exception as e:
                logger.error(f"Error adding improved format to process_pdf result: {e}")
        
        return result
    
    return wrapper

def modify_process_pdf(module_globals):
    """
    Patches process_pdf to use the improved output format for direct PDF processing.
    
    Args:
        module_globals: The globals() dictionary from the calling module
        
    Returns:
        bool: Success status
    """
    try:
        # Check if process_pdf exists in globals
        if 'process_pdf' in module_globals:
            # Get the original function
            original_process_pdf = module_globals['process_pdf']
            
            # Create wrapper function that adds improved output
            wrapped_process_pdf = process_pdf_wrapper(original_process_pdf)
            
            # Replace the original function
            module_globals['process_pdf'] = wrapped_process_pdf
            
            # Store original function for reference
            module_globals['process_pdf_original'] = original_process_pdf
            
            logger.info("Successfully patched process_pdf to use improved output format")
            return True
        else:
            logger.warning("process_pdf not found in globals, patch not applied")
            return False
    except Exception as e:
        logger.error(f"Error modifying process_pdf: {e}")
        return False

# -----------------------------------------------------------------------------
# INITIALIZATION AND USAGE FUNCTIONS
# -----------------------------------------------------------------------------
# Add this validation function to prevent errors when splitting undefined values
# This should be added to pdf_output_enhancer.py

def safe_split(text_value, delimiter=',', default=None):
    """Safely split text with proper validation."""
    if default is None:
        default = []
        
    if text_value is None:
        return default
    
    if not isinstance(text_value, str):
        try:
            text_value = str(text_value)
        except:
            return default
    
    return text_value.split(delimiter)

def safe_get(obj, key, default=None):
    """Safely get a value from dict without KeyError."""
    if obj is None or not isinstance(obj, dict):
        return default
    return obj.get(key, default)

def safely_write_json(data, output_path, indent=2):
    """Write JSON data with proper error handling."""
    try:
        # Create output directory if needed
        output_dir = os.path.dirname(output_path)
        if output_dir and not os.path.exists(output_dir):
            os.makedirs(output_dir, exist_ok=True)
            
        # Create a temporary file
        temp_file = f"{output_path}.tmp"
        
        # Write to temporary file first
        with open(temp_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=indent)
        
        # Verify the file exists and has content
        if not os.path.exists(temp_file) or os.path.getsize(temp_file) < 10:
            logger.error(f"Error: Temporary file {temp_file} not created or empty")
            return False
        
        # Replace the target file with the temporary file
        if os.path.exists(output_path):
            os.replace(temp_file, output_path)
        else:
            os.rename(temp_file, output_path)
            
        return True
    except Exception as e:
        logger.error(f"Error writing JSON: {e}")
        
        # Clean up temp file if it exists
        if 'temp_file' in locals() and os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except:
                pass
                
        return False

def cleanup_temp_files():
    """Clean up any remaining temporary files in the OCR temp directory."""
    import glob
    import time
    
    # Define temp directory - use the same location as in the module
    temp_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'modules', 'temp')
    
    if not os.path.exists(temp_dir):
        return
        
    # Get all temp files older than 30 minutes
    current_time = time.time()
    for file_path in glob.glob(os.path.join(temp_dir, "ocr_temp_*")):
        try:
            file_age = current_time - os.path.getmtime(file_path)
            if file_age > 1800:  # 30 minutes
                try:
                    os.remove(file_path)
                    logger.debug(f"Removed temp file {file_path}")
                except PermissionError:
                    # On Windows, files may be locked temporarily
                    logger.debug(f"Could not remove temp file {file_path} - may be in use")
        except Exception as e:
            logger.debug(f"Error cleaning up temp file {file_path}: {e}")

# Fix for the extract_authors_from_metadata function
def extract_authors_from_metadata(metadata: Dict[str, Any]) -> List[str]:
    """
    Extract author information from document metadata with improved safety.
    
    Args:
        metadata: Document metadata dictionary
        
    Returns:
        List of author names
    """
    if metadata is None:
        return []
        
    # Check for 'author' field in metadata
    if 'author' in metadata and metadata['author']:
        # Handle comma-separated or semicolon-separated author lists
        if isinstance(metadata['author'], str):
            author_str = metadata['author']
            if ',' in author_str:
                return [author.strip() for author in author_str.split(',') if author.strip()]
            elif ';' in author_str:
                return [author.strip() for author in author_str.split(';') if author.strip()]
            else:
                # Single author
                return [metadata['author'].strip()]
        elif isinstance(metadata['author'], list):
            # Already a list
            return [str(author).strip() for author in metadata['author'] if author]
    
    # In case no authors were found
    return []

# Fix for the extract_reference_authors function
def extract_reference_authors(ref: str) -> List[str]:
    """
    Extract authors from a reference string with improved safety.
    
    Args:
        ref: Reference string
        
    Returns:
        List of author names
    """
    if not ref or not isinstance(ref, str):
        return []
        
    # Pattern for author lists at beginning of reference (various formats)
    author_patterns = [
        # Last, F. M. pattern
        r'^([A-Z][a-z]+,\s+[A-Z]\.(?:\s*[A-Z]\.)?)(?:,\s+([A-Z][a-z]+,\s+[A-Z]\.(?:\s*[A-Z]\.)?)){0,10}',
        # Last, First pattern
        r'^([A-Z][a-z]+,\s+[A-Z][a-z]+)(?:,\s+([A-Z][a-z]+,\s+[A-Z][a-z]+)){0,10}',
        # F. Last pattern
        r'^([A-Z]\.\s*[A-Z][a-z]+)(?:,\s+([A-Z]\.\s*[A-Z][a-z]+)){0,10}',
        # First Last pattern
        r'^([A-Z][a-z]+\s+[A-Z][a-z]+)(?:,\s+([A-Z][a-z]+\s+[A-Z][a-z]+)){0,10}'
    ]
    
    for pattern in author_patterns:
        match = re.search(pattern, ref)
        if match:
            # Extract full match and try to split by commas and 'and'
            author_text = match.group(0)
            
            # Replace "and" with comma for uniform splitting
            author_text = re.sub(r'\s+and\s+', ', ', author_text)
            
            # Split by comma
            return [author.strip() for author in author_text.split(',') if author.strip()]
    
    # Check for "et al." pattern
    et_al_match = re.search(r'^([A-Z][a-z]+(?:,\s+[A-Z]\.|\s+[A-Z]\.)?)\s+et\s+al\.', ref)
    if et_al_match:
        return [et_al_match.group(1)]
    
    # No authors found
    return []

# Fix for the build_keyword_index function
def build_keyword_index(documents: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    """
    Build a keyword index across all documents for faster retrieval.
    
    Args:
        documents: List of document dictionaries
        
    Returns:
        Dictionary mapping keywords to document IDs
    """
    index = {}
    
    if not documents:
        return index
        
    for doc in documents:
        if doc is None:
            continue
            
        doc_id = safe_get(doc, 'document_id', '')
        
        # Skip documents without ID
        if not doc_id:
            continue
        
        # Extract keywords from various sources
        keywords = set()
        
        # From explicit keywords list
        if 'keywords' in doc and isinstance(doc['keywords'], list):
            keywords.update(doc.get('keywords', []))
        
        # From title words (excluding stop words)
        title = safe_get(doc, 'title', '')
        if title:
            title_words = re.findall(r'\b[A-Za-z][A-Za-z-]{3,}\b', title)
            keywords.update([word.lower() for word in title_words if len(word) > 3])
        
        # From document type
        doc_type = safe_get(safe_get(doc, 'metadata', {}), 'document_type', '')
        if doc_type:
            keywords.add(doc_type)
            
        # From section names
        if 'sections' in doc and isinstance(doc['sections'], list):
            for section in doc['sections']:
                if section and isinstance(section, dict):
                    section_name = safe_get(section, 'section_name', '')
                    if section_name:
                        section_words = re.findall(r'\b[A-Za-z][A-Za-z-]{3,}\b', section_name)
                        keywords.update([word.lower() for word in section_words if len(word) > 3])
        
        # Add document ID to each keyword's document list
        for keyword in keywords:
            if not keyword or not isinstance(keyword, str):
                continue
                
            if keyword in index:
                if doc_id not in index[keyword]:
                    index[keyword].append(doc_id)
            else:
                index[keyword] = [doc_id]
    
    return index

# Fix for the write_improved_output function
def write_improved_output(
    data: Dict[str, Any], 
    output_file: str, 
    indent: int = 2
) -> bool:
    """
    Write improved output to JSON file with error handling.
    
    Args:
        data: Data in improved format
        output_file: Path to output file
        indent: JSON indentation level
        
    Returns:
        True if successful, False otherwise
    """
    # Create output directory if needed
    output_dir = os.path.dirname(output_file)
    if output_dir and not os.path.exists(output_dir):
        try:
            os.makedirs(output_dir, exist_ok=True)
        except Exception as e:
            logger.error(f"Error creating output directory: {e}")
            return False
    
    return safely_write_json(data, output_file, indent)

# Improved patch for the init_improved_output_format function
def init_improved_output_format(module_globals=None):
    """
    Initialize the improved output format by patching necessary functions.
    
    Args:
        module_globals: Optional globals dictionary (defaults to the caller's globals)
        
    Returns:
        bool: Success status
    """
    try:
        # Get caller's globals if not provided
        if module_globals is None:
            # Try to get caller's globals - this is somewhat hacky but works in most cases
            import inspect
            frame = inspect.currentframe().f_back
            module_globals = frame.f_globals
        
        # Add all our patch functions to the module globals
        module_globals['safe_split'] = safe_split
        module_globals['safe_get'] = safe_get
        module_globals['safely_write_json'] = safely_write_json
        module_globals['cleanup_temp_files'] = cleanup_temp_files
        module_globals['extract_authors_from_metadata'] = extract_authors_from_metadata
        module_globals['extract_reference_authors'] = extract_reference_authors
        module_globals['build_keyword_index'] = build_keyword_index
        module_globals['write_improved_output'] = write_improved_output
        
        logger.info("Successfully initialized improved output format with patches")
        return True
    except Exception as e:
        logger.error(f"Error initializing improved output format: {e}")
        return False
def process_references_to_standard_format(references):
    """
    Process references to a standardized format with additional metadata.
    Optimized for scientific paper citations.
    
    Args:
        references: List of reference strings
        
    Returns:
        List of standardized reference dictionaries
    """
    # Ensure references is a list
    if references is None:
        references = []
    elif isinstance(references, str):
        references = [references]
        
    std_references = []
    
    for idx, ref in enumerate(references):
        if ref is None:
            continue
            
        # Convert non-string references to string
        if not isinstance(ref, str):
            try:
                ref = str(ref)
            except:
                continue
                
        # Try to extract year
        year_match = re.search(r'(?:19|20)\d{2}', ref)
        year = year_match.group(0) if year_match else None
        
        # Try to extract DOI
        doi_match = re.search(r'doi:([^\s,]+)|https?://doi\.org/([^\s,]+)', ref, re.IGNORECASE)
        doi = (doi_match.group(1) or doi_match.group(2)) if doi_match else None
        
        # Try to extract URL
        url_match = re.search(r'https?://(?!doi\.org)[^\s,]+', ref)
        url = url_match.group(0) if url_match else None
        
        # Try to extract author (improved approach)
        authors = extract_reference_authors(ref)
        first_author = authors[0] if authors else None
        
        # Try to extract title
        title = extract_reference_title(ref)
        
        # First 100 characters as preview
        preview = ref[:100] + "..." if len(ref) > 100 else ref
        
        std_references.append({
            "ref_id": f"ref_{idx+1}",
            "text": ref,
            "title": title,
            "authors": authors, 
            "first_author": first_author,
            "year": year,
            "doi": doi,
            "url": url,
            "preview": preview
        })
    
    return std_references

def init_improved_output_format(module_globals=None):
    """
    Initialize the improved output format by patching necessary functions.
    
    Args:
        module_globals: Optional globals dictionary (defaults to the caller's globals)
        
    Returns:
        bool: Success status
    """
    try:
        # Get caller's globals if not provided
        if module_globals is None:
            # Try to get caller's globals - this is somewhat hacky but works in most cases
            import inspect
            frame = inspect.currentframe().f_back
            module_globals = frame.f_globals
        
        # Patch process_all_files
        all_files_patched = modify_process_all_files(module_globals)
        
        # Patch process_pdf
        pdf_patched = modify_process_pdf(module_globals)
        
        success = all_files_patched or pdf_patched
        
        if success:
            logger.info("Successfully initialized improved output format")
        else:
            logger.warning("Failed to initialize improved output format")
        
        return success
    except Exception as e:
        logger.error(f"Error initializing improved output format: {e}")
        return False

def enhance_pdf_output(file_path, output_path=None):
    """
    Convenience function to enhance PDF output from a file.
    
    Args:
        file_path: Path to the input JSON file
        output_path: Path to save the enhanced output (default: auto-generated)
        
    Returns:
        bool: Success status
    """
    return enhance_existing_output(file_path, output_path)

# Example usage in a script
def example_usage():
    """
    Example of how to use this module.
    """
    # 1. Direct initialization (modifies global functions)
    init_improved_output_format()
    
    # 2. Process a PDF file - will automatically use enhanced output
    # from pdf_extractor import process_pdf
    # result = process_pdf("example.pdf", return_data=True)
    # enhanced_data = result["improved_format"]
    
    # 3. Enhance an existing output file
    # enhance_pdf_output("existing_output.json", "enhanced_output.json")
    
    # 4. Process a directory of files - will automatically use enhanced output
    # from pdf_extractor import process_all_files
    # process_all_files("input_dir", "output.json")
    
    pass

# Automatically initialize when this module is imported
if __name__ != "__main__":
    # Don't auto-initialize on import to avoid unexpected behavior
    logger.info("PDF Output Enhancer module imported. Call init_improved_output_format() to initialize.")
else:
    # If run as a script, provide example usage
    logger.info("Running PDF Output Enhancer as script")
    example_usage()