import os
import sys
import logging
import pytesseract
from PIL import Image

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def verify_tesseract():
    """Verify Tesseract installation and fix paths."""
    # List of possible Tesseract executable locations
    possible_locations = [
        r'C:\Program Files\Tesseract-OCR\tesseract.exe',
        r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
        r'C:\Tesseract-OCR\tesseract.exe'
    ]
    
    # Find the Tesseract executable
    tesseract_path = None
    for path in possible_locations:
        if os.path.exists(path):
            tesseract_path = path
            logger.info(f"Found Tesseract executable at: {tesseract_path}")
            break
    
    if not tesseract_path:
        logger.error("Tesseract executable not found in common locations!")
        return False
    
    # Set the path in pytesseract
    pytesseract.pytesseract.tesseract_cmd = tesseract_path
    
    # Set up tessdata directory
    tessdata_dir = os.path.join(os.path.dirname(tesseract_path), "tessdata")
    if os.path.exists(tessdata_dir):
        logger.info(f"Found tessdata directory at: {tessdata_dir}")
        os.environ['TESSDATA_PREFIX'] = tessdata_dir
    else:
        logger.warning(f"tessdata directory not found at: {tessdata_dir}")
        # Try to create it
        try:
            os.makedirs(tessdata_dir, exist_ok=True)
            os.environ['TESSDATA_PREFIX'] = tessdata_dir
            logger.info(f"Created tessdata directory at: {tessdata_dir}")
        except Exception as e:
            logger.error(f"Failed to create tessdata directory: {e}")
            return False
    
    # Verify eng.traineddata exists
    eng_traineddata = os.path.join(tessdata_dir, "eng.traineddata")
    if not os.path.exists(eng_traineddata):
        logger.warning(f"eng.traineddata not found at: {eng_traineddata}")
        logger.info("Attempting to download eng.traineddata...")
        
        try:
            import requests
            url = "https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata"
            
            with requests.get(url, stream=True) as r:
                r.raise_for_status()
                with open(eng_traineddata, 'wb') as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        f.write(chunk)
            
            logger.info(f"Successfully downloaded eng.traineddata to {eng_traineddata}")
        except Exception as e:
            logger.error(f"Failed to download eng.traineddata: {e}")
            return False
    
    # Test OCR functionality
    try:
        logger.info("Testing OCR functionality...")
        test_image = Image.new('RGB', (60, 30), color='white')
        text = pytesseract.image_to_string(test_image)
        logger.info("OCR test successful!")
        return True
    except Exception as e:
        logger.error(f"OCR test failed: {e}")
        return False

if __name__ == "__main__":
    if verify_tesseract():
        logger.info("Tesseract verification and configuration successful!")
        print("TESSDATA_PREFIX=" + os.environ.get('TESSDATA_PREFIX', ''))
        print("TESSERACT_CMD=" + pytesseract.pytesseract.tesseract_cmd)
    else:
        logger.error("Tesseract verification and configuration failed!")
        sys.exit(1)