"""
Test Configuration
Centralized configuration for all test scripts
"""

import os

# Base URL Configuration
BASE_URL = os.environ.get('NEUROGEN_BASE_URL', 'http://localhost:5025')

# Test Configuration
TEST_TIMEOUT = int(os.environ.get('TEST_TIMEOUT', '30'))
TEST_RETRY_COUNT = int(os.environ.get('TEST_RETRY_COUNT', '3'))

# Download Directories
DOWNLOAD_BASE_DIR = os.environ.get('NEUROGEN_DOWNLOAD_DIR', '/workspace/modules/downloads')

def get_test_headers():
    """Get standard headers for test requests"""
    return {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'NeuroGenServer-Test/1.0'
    }

def print_config():
    """Print current configuration"""
    print(f"Test Configuration:")
    print(f"  BASE_URL: {BASE_URL}")
    print(f"  TIMEOUT: {TEST_TIMEOUT}s")
    print(f"  DOWNLOAD_DIR: {DOWNLOAD_BASE_DIR}")

# Export configuration
config = {
    'BASE_URL': BASE_URL,
    'TIMEOUT': TEST_TIMEOUT,
    'RETRY_COUNT': TEST_RETRY_COUNT,
    'DOWNLOAD_DIR': DOWNLOAD_BASE_DIR,
    'HEADERS': get_test_headers()
}