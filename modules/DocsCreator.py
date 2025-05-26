import os
import json
import logging
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, Tuple, Dict, List
import re
from collections import Counter

# Logging setup
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Constants
MAX_CHUNK_SIZE = 5000  # Target size for each chunk
VALID_EXTENSIONS = [
    '.py', '.html', '.css', '.yaml', '.yml',
    '.txt', '.md', '.js', '.gitignore', '.ts',
    '.json', '.csv', '.rtf'
]

# A minimal set of stop words to omit from "smart tags"
STOP_WORDS = {
    "the", "and", "or", "for", "a", "an", "of", "in", "to", "from",
    "on", "at", "by", "this", "is", "are", "were", "was", "be", "as",
    "it", "that", "these", "those", "with", "can", "if", "not", "no",
    "your", "you", "i", "am", "our", "we", "they", "their", "me",
    "have", "has", "had", "also", "too", "very", "up", "out", "about",
    "so", "some", "any", "my", "his", "her", "he", "she"
}

def read_file_in_chunks(file_path: str, chunk_size: int = 2048) -> str:

    content_parts = []
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            while True:
                chunk = file.read(chunk_size)
                if not chunk:
                    break
                content_parts.append(chunk)
    except (IOError, OSError) as e:
        logger.error(f"Error reading file {file_path}: {e}")
        return ""

    # Normalize whitespace into a single space
    return ' '.join(''.join(content_parts).split())

def chunk_text_by_words(text: str, max_size: int = MAX_CHUNK_SIZE) -> List[str]:

    words = text.split()
    chunks = []
    current_chunk_words = []
    current_length = 0

    for word in words:
        # +1 for a separating space
        word_length = len(word) + 1

        if current_length + word_length > max_size:
            # Finalize the current chunk
            chunks.append(" ".join(current_chunk_words))
            current_chunk_words = []
            current_length = 0

        current_chunk_words.append(word)
        current_length += word_length

    # Add any remaining words as the last chunk
    if current_chunk_words:
        chunks.append(" ".join(current_chunk_words))

    return chunks

def extract_metadata(file_path: str, root_directory: str) -> Tuple[str, str, int, str]:

    relative_path = os.path.relpath(file_path, root_directory)
    primary_library = relative_path.split(os.sep)[0]
    file_size = os.path.getsize(file_path)
    last_modified_dt = datetime.fromtimestamp(os.path.getmtime(file_path))
    last_modified = last_modified_dt.strftime("%Y-%m-%d %H:%M:%S")
    return primary_library, relative_path, file_size, last_modified

def basic_generate_tags(section_name: str, content: str) -> List[str]:

    keywords = ["documentation", "guide", "case study", "glossary", "examples", "best practices"]
    tags = [kw for kw in keywords if kw in content.lower()]
    tags.append(section_name)
    return tags

def extract_top_keywords(content: str, max_tags: int = 10) -> List[str]:

    tokens = re.findall(r'[a-zA-Z]+', content.lower())

    # Filter out stop words, short words, etc.
    filtered_tokens = [
        t for t in tokens
        if len(t) > 2 and t not in STOP_WORDS
    ]

    # Count frequencies and pick top items
    freq_counter = Counter(filtered_tokens)
    most_common_words = [word for word, _ in freq_counter.most_common(max_tags)]

    return most_common_words

def generate_smart_tags(section_name: str, content: str) -> List[str]:

    # Original approach
    base_tags = basic_generate_tags(section_name, content)

    # Frequency-based approach
    freq_tags = extract_top_keywords(content, max_tags=10)

    # Merge them into a set to avoid duplicates, then back to list
    combined_tags = list(set(base_tags + freq_tags))
    return combined_tags

def process_file(file_path: str, root_directory: str) -> Optional[Tuple[str, List[Dict]]]:
    """
    Process a single file by reading it, extracting metadata, and preparing
    structured data entries—one for each chunk (if the file is long).
    Returns a tuple of (primary_library, docs_data_list) or None if file is empty.
    """
    file_content = read_file_in_chunks(file_path)
    if not file_content:
        return None

    try:
        primary_library, relative_path, file_size, last_modified = extract_metadata(file_path, root_directory)
    except (IOError, OSError) as e:
        logger.error(f"Error extracting metadata from {file_path}: {e}")
        return None

    # Derive a base section_name (filename without extension)
    file_name = os.path.basename(file_path)        # e.g. "Advanced Prompt Engineering.txt"
    section_name = os.path.splitext(file_name)[0]  # e.g. "Advanced Prompt Engineering"

    # Word-aware chunking
    chunks = chunk_text_by_words(file_content, MAX_CHUNK_SIZE)

    # Create docs_data entries
    docs_data_list = []
    total_chunks = len(chunks)
    for idx, chunk_text in enumerate(chunks, start=1):
        chunk_section_name = (
            f"{section_name}_Part_{idx}" if total_chunks > 1 else section_name
        )

        entry = {
            "section_name": chunk_section_name,
            "content": chunk_text,
            "file_path": relative_path,
            "file_size": file_size,
            "last_modified": last_modified,
            # Generate the combined tags
            "tags": generate_smart_tags(section_name, chunk_text),
            "is_chunked": total_chunks > 1
        }
        docs_data_list.append(entry)

    return primary_library, docs_data_list

def process_all_files(root_directory: str, output_file: str) -> None:

    all_data = {}
    file_paths = []

    # Collect valid files
    for subdir, _, files in os.walk(root_directory):
        for filename in files:
            if any(filename.endswith(ext) for ext in VALID_EXTENSIONS):
                file_paths.append(os.path.join(subdir, filename))

    logger.info(f"Found {len(file_paths)} valid files in {root_directory}")

    # Process files: sequential if <10, else multithreaded
    if len(file_paths) < 10:
        results = [process_file(fp, root_directory) for fp in file_paths]
    else:
        max_workers = min(len(file_paths), os.cpu_count() or 1)
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            results = list(executor.map(lambda fp: process_file(fp, root_directory), file_paths))

    # Build the final JSON structure
    for result in results:
        if result:
            primary_library, docs_data_list = result
            if primary_library not in all_data:
                all_data[primary_library] = {
                    "docs_data": [],
                    "metadata": {
                        "library_name": primary_library,
                        "processed_date": datetime.now().strftime("%Y-%m-%d"),
                        "source": "Derived from file structure"
                    }
                }
            all_data[primary_library]["docs_data"].extend(docs_data_list)

    # Write structured data to JSON
    try:
        with open(output_file, 'w', encoding='utf-8') as outfile:
            json.dump(all_data, outfile, ensure_ascii=False, indent=4)
        logger.info(f"Structured JSON file created at {output_file}")
    except (IOError, OSError) as e:
        logger.error(f"Error writing to {output_file}: {e}")

def main() -> None:
    root_directory = r'C:\Users\Los\Documents\Transcripts db\AI\NeuroGen'
    output_file = r'C:\Users\Los\Documents\NeuroGen.json'
    process_all_files(root_directory, output_file)

if __name__ == "__main__":
    main()
