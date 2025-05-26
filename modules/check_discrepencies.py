"""
Dependency checker and fixer for NeuroGen Processor.
This script verifies all dependencies and tries to fix common issues.
"""
import os
import sys
import subprocess
import shutil
import platform
import pkg_resources
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# Required Python packages
REQUIRED_PACKAGES = {
    'Flask': 'flask',
    'Flask-SocketIO': 'flask-socketio',
    'PyMuPDF': 'pymupdf',
    'PyPDF2': 'pypdf2',
    'pdfplumber': 'pdfplumber',
    'Pillow': 'pillow',
    'pytesseract': 'pytesseract',
    'requests': 'requests',
    'Beautiful Soup': 'beautifulsoup4',
    'python-dotenv': 'python-dotenv',
    'tabula-py': 'tabula-py',
    'numpy': 'numpy',
    'pandas': 'pandas',
    'python-magic': 'python-magic; platform_system!="Windows"',
    'python-magic-bin': 'python-magic-bin; platform_system=="Windows"'
}

# Optional but recommended packages
OPTIONAL_PACKAGES = {
    'pikepdf': 'pikepdf',
    'JPype1': 'jpype1',
    'joblib': 'joblib',
    'lxml': 'lxml',
    'chardet': 'chardet'
}

def check_python_version():
    """Check if Python version is supported."""
    version = sys.version_info
    if version.major < 3 or (version.major == 3 and version.minor < 8):
        logger.error(f"Unsupported Python version: {sys.version}")
        logger.error("Python 3.8 or higher is required")
        return False
    
    logger.info(f"Python version: {sys.version} ✓")
    return True

def check_installed_packages():
    """Check if required packages are installed."""
    missing_packages = []
    installed_packages = {}
    
    # Check required packages
    logger.info("Checking required packages...")
    for name, pkg in REQUIRED_PACKAGES.items():
        try:
            pkg_name = pkg.split(';')[0].strip()
            version = pkg_resources.get_distribution(pkg_name).version
            installed_packages[name] = version
            logger.info(f"  {name}: {version} ✓")
        except pkg_resources.DistributionNotFound:
            logger.warning(f"  {name}: Not installed ✗")
            missing_packages.append(pkg)
    
    # Check optional packages
    logger.info("\nChecking optional packages...")
    for name, pkg in OPTIONAL_PACKAGES.items():
        try:
            version = pkg_resources.get_distribution(pkg).version
            installed_packages[name] = version
            logger.info(f"  {name}: {version} ✓")
        except pkg_resources.DistributionNotFound:
            logger.warning(f"  {name}: Not installed")
    
    return missing_packages, installed_packages

def setup_java_path():
    """
    Set up Java path by checking multiple possible locations and properly updating
    both environment variables and global state.
    
    Returns:
        bool: True if Java was found and configured, False otherwise
    """
    java_found = False
    java_locations = [
        # Windows locations
        r"C:\Program Files\Java\jre1.8.0_441\bin",
        r"C:\Program Files\Java\latest\jre-1.8\bin",
        r"C:\Program Files (x86)\Java\jre1.8.0_441\bin",
        r"C:\Program Files (x86)\Java\latest\jre-1.8\bin",
        r"C:\Program Files\Java\jdk1.8.0_291\bin",
        r"C:\Program Files\Java\jdk-11\bin",
        r"C:\Program Files\Java\jdk-17\bin",
        # Unix-like locations
        "/usr/lib/jvm/java-8-openjdk/bin",
        "/usr/lib/jvm/java-11-openjdk/bin",
        "/usr/lib/jvm/java-17-openjdk/bin",
        "/usr/lib/jvm/default-java/bin",
        "/usr/bin",  # For system-wide Java
    ]
    
    # First check if JAVA_HOME is already set correctly
    if "JAVA_HOME" in os.environ and os.path.exists(os.environ["JAVA_HOME"]):
        # Check if java(.exe) exists in the bin directory
        java_exe = "java.exe" if os.name == 'nt' else "java"
        bin_dir = os.path.join(os.environ["JAVA_HOME"], "bin")
        if os.path.exists(os.path.join(bin_dir, java_exe)):
            # JAVA_HOME is valid, ensure bin is in PATH
            if bin_dir not in os.environ.get("PATH", ""):
                os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")
            logger.info(f"Using existing JAVA_HOME: {os.environ['JAVA_HOME']}")
            java_found = True
            return True
    
    # JAVA_HOME not set or invalid, check locations
    for location in java_locations:
        if os.path.exists(location):
            java_exe = os.path.join(location, "java.exe" if os.name == 'nt' else "java")
            if os.path.exists(java_exe):
                # Found Java, set environment variables
                parent_dir = os.path.dirname(location) if location.lower().endswith("bin") else location
                os.environ["JAVA_HOME"] = parent_dir
                
                # Add Java bin to PATH if not already there
                if location not in os.environ.get("PATH", ""):
                    os.environ["PATH"] = location + os.pathsep + os.environ.get("PATH", "")
                
                logger.info(f"Java found at: {location}")
                java_found = True
                return True
    
    # If all else fails, try to find java(.exe) in PATH
    if not java_found:
        try:
            if os.name == 'nt':  # Windows
                import subprocess
                result = subprocess.run(["where", "java"], capture_output=True, text=True)
                if result.returncode == 0 and result.stdout:
                    java_path = result.stdout.splitlines()[0]
                    if java_path.endswith("java.exe"):
                        bin_dir = os.path.dirname(java_path)
                        parent_dir = os.path.dirname(bin_dir)
                        os.environ["JAVA_HOME"] = parent_dir
                        logger.info(f"Java found in PATH: {bin_dir}")
                        java_found = True
                        return True
        except Exception as e:
            logger.warning(f"Failed to find Java in PATH: {e}")
    
    if not java_found:
        logger.warning("Java installation not found. Table extraction with Tabula will not be available.")
    
    return java_found

def install_missing_packages(packages, pip_command=None):
    """Install missing packages using pip."""
    if not packages:
        logger.info("No missing packages to install")
        return True
    
    if pip_command is None:
        pip_command = [sys.executable, "-m", "pip"]
    
    logger.info(f"Attempting to install {len(packages)} missing packages...")
    success = True
    
    for package in packages:
        try:
            logger.info(f"Installing {package}...")
            cmd = pip_command + ["install", package]
            result = subprocess.run(cmd, capture_output=True, text=True, check=False)
            
            if result.returncode == 0:
                logger.info(f"  Successfully installed {package}")
            else:
                logger.error(f"  Failed to install {package}: {result.stderr}")
                success = False
        except Exception as e:
            logger.error(f"  Error installing {package}: {e}")
            success = False
    
    return success

def generate_environment_report():
    """Generate a detailed environment report."""
    report = {
        "timestamp": datetime.now().isoformat(),
        "system": {
            "platform": platform.platform(),
            "python_version": sys.version,
            "python_path": sys.executable,
            "environment_variables": {
                "JAVA_HOME": os.environ.get("JAVA_HOME"),
                "PYTESSERACT_CMD": os.environ.get("PYTESSERACT_CMD")
            }
        },
        "dependencies": {
            "required_packages": {},
            "optional_packages": {},
            "java": {},
            "tesseract": {}
        },
        "conflicts": [],
        "import_tests": {},
        "fixes_applied": []
    }
    
    # Python version check
    python_ok = check_python_version()
    report["system"]["python_ok"] = python_ok
    
    # Package checks
    missing_packages, installed_packages = check_installed_packages()
    report["dependencies"]["required_packages"] = installed_packages
    report["dependencies"]["missing_packages"] = missing_packages
    
    # Java check
    java_found, java_version, java_home = check_java()
    report["dependencies"]["java"] = {
        "found": java_found,
        "version": java_version,
        "home": java_home
    }
    
    # Tesseract check
    tesseract_found, tesseract_version, tesseract_path = check_tesseract()
    report["dependencies"]["tesseract"] = {
        "found": tesseract_found,
        "version": tesseract_version,
        "path": tesseract_path
    }
    
    # PDF Module check
    pdf_module_ok = check_pdf_module_initialization()
    report["dependencies"]["pdf_module_initialization"] = pdf_module_ok
    
    # Conflict check
    conflicts = check_for_conflicting_packages()
    report["conflicts"] = conflicts
    
    # Import tests
    import_tests = test_imports_for_web_scraper()
    report["import_tests"] = import_tests
    
    # Save report
    report_path = os.path.join(os.getcwd(), "dependency_report.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    
    logger.info(f"Environment report saved to {report_path}")
    
    return report, report_path

def validate_content_extraction():
    """Test PDF content extraction with a sample PDF."""
    logger.info("Testing PDF content extraction...")
    
    # Create a simple test PDF
    pdf_content = """
%PDF-1.7
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 68 >>
stream
BT
/F1 24 Tf
100 700 Td
(Test PDF Content Extraction) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000233 00000 n
0000000300 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
417
%%EOF
"""
    # Create temp directory for test files
    test_dir = tempfile.mkdtemp()
    test_pdf_path = os.path.join(test_dir, "test_extraction.pdf")
    
    try:
        # Write test PDF
        with open(test_pdf_path, "wb") as f:
            f.write(pdf_content.encode("ascii"))
        
        logger.info(f"Created test PDF at {test_pdf_path}")
        
        # Test extraction using various methods
        extraction_results = {}
        
        # 1. PyMuPDF if available
        try:
            import fitz
            doc = fitz.open(test_pdf_path)
            text = ""
            for page in doc:
                text += page.get_text()
            doc.close()
            
            extraction_results["PyMuPDF"] = {
                "success": True,
                "text": text,
                "length": len(text)
            }
            logger.info(f"PyMuPDF extraction successful: {len(text)} characters")
        except ImportError:
            extraction_results["PyMuPDF"] = {"success": False, "error": "PyMuPDF not available"}
            logger.warning("PyMuPDF not available for testing")
        except Exception as e:
            extraction_results["PyMuPDF"] = {"success": False, "error": str(e)}
            logger.error(f"PyMuPDF extraction failed: {e}")
        
        # 2. PyPDF2 if available
        try:
            import PyPDF2
            with open(test_pdf_path, "rb") as f:
                reader = PyPDF2.PdfReader(f)
                text = ""
                for page in reader.pages:
                    text += page.extract_text() or ""
            
            extraction_results["PyPDF2"] = {
                "success": True,
                "text": text,
                "length": len(text)
            }
            logger.info(f"PyPDF2 extraction successful: {len(text)} characters")
        except ImportError:
            extraction_results["PyPDF2"] = {"success": False, "error": "PyPDF2 not available"}
            logger.warning("PyPDF2 not available for testing")
        except Exception as e:
            extraction_results["PyPDF2"] = {"success": False, "error": str(e)}
            logger.error(f"PyPDF2 extraction failed: {e}")
        
        # 3. Check if any extraction method was successful
        successes = [method for method, result in extraction_results.items() if result.get("success")]
        
        if successes:
            logger.info(f"PDF content extraction successful using: {', '.join(successes)}")
            return True, extraction_results
        else:
            logger.error("All PDF content extraction methods failed")
            return False, extraction_results
            
    except Exception as e:
        logger.error(f"Error during PDF content extraction test: {e}")
        return False, {"error": str(e)}
    finally:
        # Clean up
        try:
            import shutil
            shutil.rmtree(test_dir)
        except:
            pass
            
def print_summary(report):
    """Print a summary of the environment report."""
    print("\n" + "=" * 80)
    print("NEUROGENPROCESSOR DEPENDENCY CHECK SUMMARY")
    print("=" * 80)
    
    # Python version
    python_ok = report["system"]["python_ok"]
    print(f"Python: {'✓' if python_ok else '✗'} {sys.version}")
    
    # Required packages
    required_count = len(REQUIRED_PACKAGES)
    installed_count = len(report["dependencies"]["required_packages"])
    print(f"Required packages: {installed_count}/{required_count} installed")
    
    if "missing_packages" in report["dependencies"] and report["dependencies"]["missing_packages"]:
        print("  Missing:")
        for pkg in report["dependencies"]["missing_packages"]:
            print(f"  - {pkg}")
    
    # Java
    java = report["dependencies"]["java"]
    print(f"Java: {'✓' if java.get('found') else '✗'}{' ' + java.get('version', '') if java.get('version') else ''}")
    
    # Tesseract
    tesseract = report["dependencies"]["tesseract"]
    print(f"Tesseract: {'✓' if tesseract.get('found') else '✗'}{' ' + tesseract.get('version', '') if tesseract.get('version') else ''}")
    
    # PDF Module
    pdf_init = report["dependencies"].get("pdf_module_initialization", False)
    print(f"PDF Module Initialization: {'✓' if pdf_init else '✗'}")
    
    # Import tests
    imports = report["import_tests"]
    imports_ok = all(imports.values())
    print(f"Import Tests: {'✓' if imports_ok else '✗'}")
    
    # Conflicts
    conflicts = report["conflicts"]
    print(f"Conflicts: {len(conflicts)}")
    
    # Overall status
    all_ok = (python_ok and installed_count >= required_count and 
              java.get("found") and tesseract.get("found") and 
              pdf_init and imports_ok and not conflicts)
    
    print("\nOverall Status:", "✓ READY" if all_ok else "✗ ISSUES DETECTED")
    
    # Recommendations
    if not all_ok:
        print("\nRecommendations:")
        
        if not java.get("found"):
            print("- Install Java (JRE 1.8 or newer)")
            print("  Windows: https://www.java.com/download/")
            print("  Linux: sudo apt-get install openjdk-11-jre (Ubuntu/Debian)")
            print("  macOS: brew install --cask adoptopenjdk (Homebrew)")
        
        if not tesseract.get("found"):
            print("- Install Tesseract OCR")
            print("  Windows: https://github.com/UB-Mannheim/tesseract/wiki")
            print("  Linux: sudo apt-get install tesseract-ocr (Ubuntu/Debian)")
            print("  macOS: brew install tesseract (Homebrew)")
        
        if "missing_packages" in report["dependencies"] and report["dependencies"]["missing_packages"]:
            print(f"- Install missing Python packages:")
            print(f"  pip install {' '.join(report['dependencies']['missing_packages'])}")
        
        if conflicts:
            print("- Resolve package conflicts:")
            for conflict in conflicts:
                print(f"  * {conflict}")
    
    print("\nDetailed report saved to:", report[1])
    print("=" * 80)

def main():
    """Main function to run all checks."""
    parser = argparse.ArgumentParser(description="Check and fix dependencies for NeuroGen Processor")
    parser.add_argument("--install", action="store_true", help="Attempt to install missing packages")
    parser.add_argument("--fix", action="store_true", help="Attempt to fix configuration issues")
    parser.add_argument("--test-extraction", action="store_true", help="Test PDF content extraction")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose output")
    args = parser.parse_args()
    
    # Set logging level
    if args.verbose:
        logger.setLevel(logging.DEBUG)
    
    print("NeuroGen Processor Dependency Checker")
    print("Checking system configuration and dependencies...")
    
    # Generate report
    report, report_path = generate_environment_report()
    
    # Test extraction if requested
    if args.test_extraction:
        extraction_result, extraction_details = validate_content_extraction()
        report["extraction_test"] = {
            "success": extraction_result,
            "details": extraction_details
        }
        
        # Update report file
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
    
    # Fix issues if requested
    fixes_applied = []
    
    if args.fix:
        logger.info("Attempting to fix configuration issues...")
        
        # Fix Java configuration
        java_home = report["dependencies"]["java"].get("home")
        if not report["dependencies"]["java"].get("found") and java_home:
            fixes_applied.extend(fix_dependency_issues(java_home=java_home))
        
        # Fix Tesseract configuration
        tesseract_path = report["dependencies"]["tesseract"].get("path")
        if not report["dependencies"]["tesseract"].get("found") and tesseract_path:
            fixes_applied.extend(fix_dependency_issues(tesseract_path=tesseract_path))
        
        report["fixes_applied"] = fixes_applied
        
        # Update report file
        with open(report_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
    
    # Install missing packages if requested
    if args.install and "missing_packages" in report["dependencies"]:
        missing_packages = report["dependencies"]["missing_packages"]
        if missing_packages:
            logger.info(f"Installing {len(missing_packages)} missing packages...")
            install_success = install_missing_packages(missing_packages)
            report["installation_results"] = {
                "success": install_success,
                "packages": missing_packages
            }
            
            # Update report file
            with open(report_path, "w", encoding="utf-8") as f:
                json.dump(report, f, indent=2)
    
    # Print summary
    print_summary((report, report_path))
    
    return 0

if __name__ == "__main__":
    import argparse
    from datetime import datetime
    sys.exit(main())