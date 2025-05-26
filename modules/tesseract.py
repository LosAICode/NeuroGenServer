import os
import requests
import shutil

def install_tesseract_language_data():
    """Download and install Tesseract language data files if they don't exist."""
    # Define the destination directory (using the same TEMP_OCR_DIR from your code)
    tessdata_dir = os.path.join(TEMP_OCR_DIR, "tessdata")
    os.makedirs(tessdata_dir, exist_ok=True)
    
    # Language file URL - use the official GitHub repository
    eng_lang_url = "https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata"
    
    # Destination file path
    eng_file_path = os.path.join(tessdata_dir, "eng.traineddata")
    
    # Only download if the file doesn't exist
    if not os.path.exists(eng_file_path):
        try:
            logger.info(f"Downloading Tesseract English language data to {tessdata_dir}")
            response = requests.get(eng_lang_url, stream=True)
            response.raise_for_status()
            
            with open(eng_file_path, 'wb') as file:
                shutil.copyfileobj(response.raw, file)
                
            logger.info(f"Successfully downloaded Tesseract language data to {eng_file_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to download Tesseract language data: {e}")
            return False
    else:
        logger.info(f"Tesseract language data already exists at {eng_file_path}")
        return True