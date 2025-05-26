# optimized_pdf_processor.py

import os
import tempfile
import shutil
import logging
from pathlib import Path
import time

logger = logging.getLogger(__name__)

class MemoryEfficientPDFProcessor:
    """
    A memory-efficient PDF processor that uses temp files and streaming
    to minimize RAM usage when processing large PDF files.
    """
    
    def __init__(self):
        self.temp_dir = tempfile.mkdtemp(prefix="neurogentemp_")
        logger.info(f"Created temporary directory: {self.temp_dir}")
        self.temp_files = []
    
    def process_pdf(self, pdf_path, output_path=None, extract_tables=True, use_ocr=True, chunk_size=4096):
        """
        Process a PDF file with optimized memory usage by using temp files.
        
        Args:
            pdf_path: Path to the PDF file
            output_path: Path for the output JSON (if None, derives from PDF filename)
            extract_tables: Whether to extract tables from the PDF
            use_ocr: Whether to use OCR for scanned content
            chunk_size: Maximum chunk size for text processing
            
        Returns:
            Dictionary with processing results and statistics
        """
        start_time = time.time()
        logger.info(f"Processing PDF: {pdf_path} with memory optimization")
        
        if output_path is None:
            # Generate output path if none provided
            base_name = os.path.splitext(os.path.basename(pdf_path))[0]
            output_path = os.path.join(os.path.dirname(pdf_path), f"{base_name}_processed.json")
        
        # Ensure output directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        try:
            # Detect document type to determine processing approach
            doc_type = self._detect_document_type(pdf_path)
            logger.info(f"Detected document type: {doc_type}")
            
            # Create temporary files for intermediate results
            text_temp = self._create_temp_file("text_")
            metadata_temp = self._create_temp_file("metadata_")
            
            # Extract text content to temp file
            page_count = self._extract_text_to_file(pdf_path, text_temp, use_ocr and doc_type == "scan")
            
            # Extract metadata to temp file
            self._extract_metadata_to_file(pdf_path, metadata_temp)
            
            # Process tables if requested
            tables = []
            if extract_tables and doc_type in ["academic_paper", "report", "book"]:
                tables_temp = self._create_temp_file("tables_")
                tables = self._extract_tables(pdf_path, tables_temp)
                
            # Generate chunks from temp files
            chunks_temp = self._create_temp_file("chunks_")
            chunks = self._generate_chunks(text_temp, chunks_temp, chunk_size)
            
            # Combine all processed data into the final output JSON
            success = self._generate_final_output(
                output_path=output_path,
                metadata_file=metadata_temp,
                text_file=text_temp,
                chunks_file=chunks_temp,
                tables=tables,
                doc_type=doc_type,
                page_count=page_count
            )
            
            processing_time = time.time() - start_time
            
            # Create and return the result dictionary
            result = {
                "status": "success" if success else "error",
                "file_path": pdf_path,
                "output_file": output_path,
                "document_type": doc_type,
                "page_count": page_count,
                "tables_count": len(tables),
                "chunks_count": len(chunks),
                "processing_time": processing_time,
                "processing_info": {
                    "memory_optimized": True,
                    "elapsed_seconds": processing_time
                }
            }
            
            return result
            
        except Exception as e:
            logger.error(f"Error processing PDF {pdf_path}: {e}", exc_info=True)
            return {
                "status": "error",
                "error": str(e),
                "file_path": pdf_path
            }
        finally:
            # Clean up all temporary files
            self.cleanup()
    
    def _create_temp_file(self, prefix):
        """Create a temporary file and track it for later cleanup"""
        fd, temp_path = tempfile.mkstemp(prefix=prefix, suffix=".tmp", dir=self.temp_dir)
        os.close(fd)  # Close the file descriptor
        self.temp_files.append(temp_path)
        return temp_path
    
    def _detect_document_type(self, pdf_path):
        """
        Detect the type of PDF document.
        This is a placeholder - in a real implementation, this would use
        more sophisticated detection.
        """
        try:
            # Placeholder for actual document type detection
            # In production, this would be implemented with proper PDF analysis
            import fitz  # PyMuPDF
            
            # This is a simplified detection example
            doc = fitz.open(pdf_path)
            
            # Check for scanned content
            has_text = False
            for page in doc:
                if page.get_text().strip():
                    has_text = True
                    break
            
            if not has_text:
                return "scan"
                
            # Simple heuristics for document types
            text = ""
            # Only check first few pages for efficiency
            for i in range(min(5, doc.page_count)):
                text += doc[i].get_text()
            
            # Look for academic paper indicators
            if "abstract" in text.lower() and "references" in text.lower():
                return "academic_paper"
            
            # Look for report indicators
            if "executive summary" in text.lower() or "findings" in text.lower():
                return "report"
            
            # Look for book indicators
            if "chapter" in text.lower() and doc.page_count > 50:
                return "book"
                
            # Default type
            return "general"
            
        except Exception as e:
            logger.warning(f"Error detecting document type: {e}")
            return "unknown"
    
    def _extract_text_to_file(self, pdf_path, output_file, use_ocr=False):
        """
        Extract text from a PDF to a file with minimal memory usage.
        Returns the page count.
        """
        try:
            import fitz  # PyMuPDF
            
            with open(output_file, 'w', encoding='utf-8') as out_file:
                doc = fitz.open(pdf_path)
                page_count = doc.page_count
                
                # Process each page individually to reduce memory usage
                for page_num in range(page_count):
                    page = doc[page_num]
                    
                    if use_ocr:
                        # For OCR, we'd extract the page as an image and process it
                        # This is a placeholder for actual OCR implementation
                        text = self._ocr_page(page)
                    else:
                        text = page.get_text()
                    
                    # Write page text to file with page marker
                    out_file.write(f"--- PAGE {page_num + 1} ---\n")
                    out_file.write(text)
                    out_file.write("\n\n")
                    
                    # Force page out of memory
                    page = None
                
                # Close the document to free memory
                doc.close()
                
            return page_count
            
        except Exception as e:
            logger.error(f"Error extracting text: {e}")
            raise
    
    def _ocr_page(self, page):
        """
        OCR a page using PyTesseract (placeholder implementation).
        In production, this would use a proper OCR implementation.
        """
        try:
            # Convert page to image
            pix = page.get_pixmap()
            
            # Save to temporary file
            img_temp = self._create_temp_file("ocr_img_")
            pix.save(img_temp)
            
            # Use OCR to extract text (simplified example)
            try:
                import pytesseract
                from PIL import Image
                
                with Image.open(img_temp) as img:
                    text = pytesseract.image_to_string(img)
                    return text
            except ImportError:
                logger.warning("pytesseract not available, returning empty text")
                return ""
                
        except Exception as e:
            logger.warning(f"OCR processing error: {e}")
            return ""
    
    def _extract_metadata_to_file(self, pdf_path, output_file):
        """Extract PDF metadata to a file"""
        try:
            import fitz  # PyMuPDF
            import json
            
            with fitz.open(pdf_path) as doc:
                metadata = doc.metadata
                
                # Add any additional metadata
                metadata["page_count"] = doc.page_count
                metadata["form_fields"] = bool(doc.form_fields)
                metadata["is_encrypted"] = doc.is_encrypted
                metadata["has_layers"] = bool(doc.layers)
                
            # Write metadata to temp file
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, indent=2)
                
        except Exception as e:
            logger.error(f"Error extracting metadata: {e}")
            raise
    
    def _extract_tables(self, pdf_path, output_file):
        """
        Extract tables from PDF (placeholder implementation).
        In production, this would use a proper table extraction library.
        """
        tables = []
        try:
            # This is a placeholder for actual table extraction
            # In production, you would use a library like tabula-py, camelot, etc.
            
            # Just a mock implementation for demonstration purposes
            import fitz
            import json
            import re
            
            with fitz.open(pdf_path) as doc:
                for page_num, page in enumerate(doc):
                    text = page.get_text()
                    
                    # Very simple table detection (not for production use)
                    # Look for patterns that might indicate tables
                    lines = text.split('\n')
                    
                    current_table = None
                    for i, line in enumerate(lines):
                        # Look for lines with multiple column-like separations
                        if re.search(r'\s{2,}', line) and len(line.split()) > 3:
                            if current_table is None:
                                current_table = {
                                    "table_id": f"table_{page_num}_{len(tables)}",
                                    "page": page_num + 1,
                                    "rows": [],
                                    "columns": []
                                }
                            
                            # Split by whitespace to get potential columns
                            columns = [col for col in re.split(r'\s{2,}', line) if col.strip()]
                            if columns:
                                current_table["rows"].append(columns)
                                
                                # Update columns count if this row has more columns
                                if len(columns) > len(current_table.get("columns", [])):
                                    current_table["columns"] = ["col_" + str(i) for i in range(len(columns))]
                        else:
                            # End of table
                            if current_table and len(current_table["rows"]) > 2:
                                tables.append(current_table)
                                current_table = None
            
            # Write tables to temp file
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(tables, f, indent=2)
                
            return tables
                
        except Exception as e:
            logger.error(f"Error extracting tables: {e}")
            # Return empty list rather than failing the entire process
            return []
    
    def _generate_chunks(self, text_file, output_file, chunk_size):
        """
        Generate text chunks from the extracted text file.
        Uses streaming to minimize memory usage.
        """
        chunks = []
        try:
            import json
            
            current_chunk = ""
            current_page = 1
            chunk_index = 0
            
            with open(text_file, 'r', encoding='utf-8') as f:
                for line in f:
                    # Check for page marker
                    page_match = re.match(r'--- PAGE (\d+) ---', line)
                    if page_match:
                        current_page = int(page_match.group(1))
                        continue
                    
                    # Add line to current chunk
                    current_chunk += line
                    
                    # If chunk size exceeded, save it and start a new one
                    if len(current_chunk) >= chunk_size:
                        chunk = {
                            "chunk_id": f"chunk_{chunk_index}",
                            "text": current_chunk.strip(),
                            "page": current_page
                        }
                        chunks.append(chunk)
                        chunk_index += 1
                        current_chunk = ""
            
            # Add the last chunk if it's not empty
            if current_chunk.strip():
                chunk = {
                    "chunk_id": f"chunk_{chunk_index}",
                    "text": current_chunk.strip(),
                    "page": current_page
                }
                chunks.append(chunk)
            
            # Write chunks to temp file
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(chunks, f, indent=2)
                
            return chunks
                
        except Exception as e:
            logger.error(f"Error generating chunks: {e}")
            raise
    
    def _generate_final_output(self, output_path, metadata_file, text_file, chunks_file, tables, doc_type, page_count):
        """
        Combine all processed components into the final output JSON file.
        Uses file streaming to minimize memory usage.
        """
        try:
            import json
            
            # Load metadata
            with open(metadata_file, 'r', encoding='utf-8') as f:
                metadata = json.load(f)
            
            # Load chunks
            with open(chunks_file, 'r', encoding='utf-8') as f:
                chunks = json.load(f)
            
            # Create the final structure
            result = {
                "metadata": metadata,
                "document_type": doc_type,
                "page_count": page_count,
                "chunks": chunks,
                "tables": tables,
                "processing_info": {
                    "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "memory_optimized": True
                }
            }
            
            # Write to the output file
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(result, f, indent=2)
                
            return True
                
        except Exception as e:
            logger.error(f"Error generating final output: {e}")
            return False
    
    def cleanup(self):
        """Clean up all temporary files and directories"""
        for temp_file in self.temp_files:
            if os.path.exists(temp_file):
                try:
                    os.remove(temp_file)
                    logger.debug(f"Removed temp file: {temp_file}")
                except Exception as e:
                    logger.warning(f"Failed to remove temp file {temp_file}: {e}")
        
        # Empty the list
        self.temp_files = []
        
        # Remove temp directory
        if os.path.exists(self.temp_dir):
            try:
                shutil.rmtree(self.temp_dir)
                logger.debug(f"Removed temp directory: {self.temp_dir}")
            except Exception as e:
                logger.warning(f"Failed to remove temp directory {self.temp_dir}: {e}")

# Example usage
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    processor = MemoryEfficientPDFProcessor()
    result = processor.process_pdf("sample.pdf", "output/result.json")
    print("Processing result:", result)