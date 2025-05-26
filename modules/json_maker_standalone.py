import os
import json
import logging
from datetime import datetime
from tqdm import tqdm
from concurrent.futures import ThreadPoolExecutor
import re

# Logging setup
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Constants
MAX_CHUNK_SIZE = 5000  # AI-friendly text chunk size
VALID_EXTENSIONS = ['.py', '.html', '.css', '.yaml', '.yml', '.txt', '.md', '.js', '.gitignore', '.ts', '.json', '.csv', '.rtf']

def read_and_normalize_file(file_path):
    """Read and normalize the content of a file for consistent processing."""
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            content = file.read().strip()
        return ' '.join(content.split())  # Normalize whitespace
    except Exception as e:
        logger.error(f"Error reading file {file_path}: {e}")
        return None

def chunk_text(text, max_size=MAX_CHUNK_SIZE):
    """Split text into smaller, coherent chunks for processing."""
    return [text[i:i + max_size] for i in range(0, len(text), max_size)]

def extract_metadata(file_path, root_directory):
    """Extract metadata for a file."""
    relative_path = os.path.relpath(file_path, root_directory)
    primary_library = relative_path.split(os.sep)[0]
    file_size = os.path.getsize(file_path)
    last_modified = datetime.fromtimestamp(os.path.getmtime(file_path)).strftime("%Y-%m-%d %H:%M:%S")
    return primary_library, relative_path, file_size, last_modified

def generate_tags(section_name, content):
    """Generate metadata tags based on content and section name."""
    keywords = ["documentation", "guide", "case study", "glossary", "examples", "best practices"]
    tags = [kw for kw in keywords if kw in content.lower()] + [section_name]
    return tags

def process_file(file_path, root_directory):
    """Process a single file and return structured data."""
    file_content = read_and_normalize_file(file_path)
    if not file_content:
        return None

    primary_library, relative_path, file_size, last_modified = extract_metadata(file_path, root_directory)
    section_name = os.path.splitext(os.path.basename(file_path))[0]

    # Extract video ID (optional) and chunk content
    video_id_match = re.search(r'_([a-zA-Z0-9_-]{11})', section_name)
    video_id = video_id_match.group(1) if video_id_match else None
    youtube_url = f"https://www.youtube.com/watch?v={video_id}" if video_id else "Unknown URL"

    chunks = chunk_text(file_content)
    full_content = "\n".join(chunks) if len(chunks) > 1 else file_content  # Merge for single entry
    docs_data = {
        "section_name": section_name,
        "content": full_content,
        "file_path": relative_path,
        "file_size": file_size,
        "last_modified": last_modified,
        "tags": generate_tags(section_name, full_content),
        "source": youtube_url,
        "is_chunked": len(chunks) > 1
    }

    return primary_library, docs_data

def process_all_files(root_directory, output_file):
    """Process all valid files, normalize their content, and save structured data."""
    all_data = {}

    file_paths = []
    for subdir, _, files in os.walk(root_directory):
        for filename in files:
            if any(filename.endswith(ext) for ext in VALID_EXTENSIONS):
                file_paths.append(os.path.join(subdir, filename))

    # Use sequential processing for fewer than 10 files
    if len(file_paths) < 10:
        results = [process_file(fp, root_directory) for fp in file_paths]
    else:
        with ThreadPoolExecutor(max_workers=8) as executor:
            results = list(tqdm(executor.map(lambda fp: process_file(fp, root_directory), file_paths), total=len(file_paths), desc="Processing files"))

    # Structure the data
    for result in results:
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
            all_data[primary_library]["docs_data"].append(docs_data)

    # Save to JSON
    try:
        with open(output_file, 'w', encoding='utf-8') as outfile:
            json.dump(all_data, outfile, ensure_ascii=False, indent=4)
        logger.info(f"Structured JSON file created at {output_file}")
    except Exception as e:
        logger.error(f"Error writing to {output_file}: {e}")

def main():
    """Main function to initiate processing."""
    root_directory = r'C:\Users\Los\Downloads\autogen-main (9)'
    output_file = r'C:\Users\Los\Documents\Autogen_Newest.json'
    process_all_files(root_directory, output_file)

if __name__ == "__main__":
    main()
