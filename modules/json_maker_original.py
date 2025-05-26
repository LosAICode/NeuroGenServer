# json_maker.py

import os
import json
import logging
from datetime import datetime
from tqdm import tqdm

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def read_and_normalize_file(file_path):
    """Read and normalize the content of a file to ensure consistency for AI processing."""
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            content = file.read().strip()
        return ' '.join(content.split())  # Collapse extra whitespace
    except Exception as e:
        logger.error(f"Error reading file {file_path}: {e}")
        return None

def extract_metadata(file_path, root_directory):
    """Extract metadata such as primary library, relative path, file size, last modified."""
    relative_path = os.path.relpath(file_path, root_directory)
    primary_library = relative_path.split(os.sep)[0]
    file_size = os.path.getsize(file_path)
    last_modified = datetime.fromtimestamp(os.path.getmtime(file_path)).strftime("%Y-%m-%d %H:%M:%S")
    return primary_library, relative_path, file_size, last_modified

def generate_json(root_directory, output_file):
    """
    Public function to:
      1. Walk through the `root_directory`
      2. Normalize file content
      3. Build the nested JSON structure
      4. Write to `output_file`
    """
    all_data = {}
    valid_extensions = ['.py', '.html', '.css', '.yaml', '.yml', '.txt',
                        '.md', '.js', '.gitignore', '.ts', '.json',
                        '.csv', '.rtf']

    for subdir, _, files in os.walk(root_directory):
        for filename in tqdm(sorted(files), desc="Processing files"):
            if not any(filename.endswith(ext) for ext in valid_extensions):
                continue

            file_path = os.path.join(subdir, filename)
            logger.info(f"Processing file: {file_path}")

            file_content = read_and_normalize_file(file_path)
            if file_content:
                primary_library, relative_path, file_size, last_modified = extract_metadata(file_path, root_directory)
                if primary_library not in all_data:
                    all_data[primary_library] = {
                        "docs_data": [],
                        "metadata": {
                            "library_name": primary_library,
                            "processed_date": datetime.now().strftime("%Y-%m-%d"),
                            "source": "Derived from file structure"
                        }
                    }

                section_name = os.path.splitext(filename)[0]
                all_data[primary_library]["docs_data"].append({
                    "section_name": section_name,
                    "content": file_content,
                    "file_path": relative_path,
                    "file_size": file_size,
                    "last_modified": last_modified
                })

    try:
        with open(output_file, 'w', encoding='utf-8') as outfile:
            json.dump(all_data, outfile, ensure_ascii=False, indent=4)
        logger.info(f"Structured JSON file created at {output_file}")
    except Exception as e:
        logger.error(f"Error writing to {output_file}: {e}")
