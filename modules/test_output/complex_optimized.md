# Training Corpus

**Document Count:** 2
**Generated:** 2025-06-02

---

## documentation.md

**Source:** `/workspace/modules/test_input_complex/documentation.md`

# Project Documentation

## Overview
This project demonstrates the optimized file processing system that eliminates metadata bloat and focuses on training content.

## Features
- Clean JSON output with minimal metadata
- Optimized Markdown format for LLM training
- Efficient content extraction
- No unnecessary processing statistics

## Usage
Simply run the file processor with your input directory and desired output format.

### Example
```python
process_all_files(
    input_dir="/path/to/files",
    output_file="output.json"  # or output.md
)
```

## Benefits
- 60-90% file size reduction
- Training-focused content structure
- Clean, readable output
- No metadata bloat

---

## python_code.py

**Source:** `/workspace/modules/test_input_complex/python_code.py`

def hello_world():
    """A simple function that prints hello world."""
    print("Hello, World!")
    return "success"

class DataProcessor:
    """A class for processing data efficiently."""
    
    def __init__(self, data):
        self.data = data
        self.processed = False
    
    def process(self):
        """Process the data and mark as processed."""
        # Simulate some processing
        self.data = [item.upper() for item in self.data]
        self.processed = True
        return self.data

if __name__ == "__main__":
    processor = DataProcessor(["hello", "world", "from", "python"])
    result = processor.process()
    print(f"Processed data: {result}")

---
