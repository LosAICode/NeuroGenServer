#json_maker.py

import os
import json
import logging
from datetime import datetime
from tqdm import tqdm
from concurrent.futures import ThreadPoolExecutor
import re

# Logging configuration
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Constants
MAX_CHUNK_SIZE = 5000  # Customize based on AI token limit

def read_and_normalize_file(file_path):
    """Read and normalize the content of a file to ensure consistency for AI processing."""
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            content = file.read().strip()
        return ' '.join(content.split())  
    except Exception as e:
        logger.error(f"Error reading file {file_path}: {e}")
        return None

def chunk_text(text, max_size=MAX_CHUNK_SIZE):
    """Split long text content into smaller, coherent chunks."""
    return [text[i:i + max_size] for i in range(0, len(text), max_size)]

def extract_metadata(file_path, root_directory):
    """Extract metadata such as primary library, relative path, file size, last modified."""
    relative_path = os.path.relpath(file_path, root_directory)
    primary_library = relative_path.split(os.sep)[0]
    file_size = os.path.getsize(file_path)
    last_modified = datetime.fromtimestamp(os.path.getmtime(file_path)).strftime("%Y-%m-%d %H:%M:%S")
    return primary_library, relative_path, file_size, last_modified

def process_file(file_path, root_directory):
    """Process a single file and return structured data."""
    file_content = read_and_normalize_file(file_path)
    if not file_content:
        return None

    primary_library, relative_path, file_size, last_modified = extract_metadata(file_path, root_directory)
    section_name = os.path.splitext(os.path.basename(file_path))[0]

    # Extract YouTube video ID from filename
    video_id_match = re.search(r'_([a-zA-Z0-9_-]{11})', section_name)  # Matches YouTube video ID in the filename
    video_id = video_id_match.group(1) if video_id_match else None
    youtube_url = f"https://www.youtube.com/watch?v={video_id}" if video_id else "Unknown URL"

    # Chunk long content
    chunks = chunk_text(file_content)
    docs_data = []
    for idx, chunk in enumerate(chunks):
        entry = {
            "section_name": f"{section_name}_Part_{idx + 1}" if len(chunks) > 1 else section_name,
            "content": chunk,
            "file_path": relative_path,
            "file_size": file_size,
            "last_modified": last_modified,
            "tags": generate_tags(section_name, chunk),
            "source": youtube_url  
        }
        docs_data.append(entry)

    return primary_library, docs_data

def generate_tags(section_name, content):
    """Generate metadata tags based on content and section name."""
    keywords = ["documentation", "guide", "case study", "glossary", "examples", "best practices"]
    tags = [kw for kw in keywords if kw in content.lower()] + [section_name]
    return tags

def generate_json(root_directory, output_file):
    """
    Walk through the `root_directory`, normalize file content,
    build the nested JSON structure, and write to `output_file`.
    """
    all_data = {}
    valid_extensions = ['.py', '.html', '.css', '.yaml', '.yml', '.txt', '.md', '.js', '.gitignore', '.ts', '.json', '.csv', '.rtf']
    file_paths = []

    for subdir, _, files in os.walk(root_directory):
        for filename in files:
            if any(filename.endswith(ext) for ext in valid_extensions):
                file_paths.append(os.path.join(subdir, filename))

    with ThreadPoolExecutor(max_workers=8) as executor:
        with tqdm(total=len(file_paths), desc="Processing files", ncols=100) as pbar:
            futures = [executor.submit(process_file, fp, root_directory) for fp in file_paths]
            for future in futures:
                try:
                    result = future.result()
                    if result:
                        primary_library, docs_data = result
                        if primary_library not in all_data:
                            all_data[primary_library] = {
                                "docs_data": [],
                                "metadata": {
                                    "library_name": primary_library,
                                    "processed_date": datetime.now().strftime("%Y-%m-%d"),
                                    "source": "Derived from file structure"
                                }
                            }
                        all_data[primary_library]["docs_data"].extend(docs_data)
                except Exception as e:
                    logger.error(f"Error processing file: {e}")
                finally:
                    pbar.update(1)  
    # Write to JSON
    try:
        with open(output_file, 'w', encoding='utf-8') as outfile:
            json.dump(all_data, outfile, ensure_ascii=False, indent=4)
        logger.info(f"Structured JSON file created at {output_file}")
    except Exception as e:
        logger.error(f"Error writing to {output_file}: {e}")
