#!/usr/bin/env python3
"""
NeuroGen Server - New Startup Script
Uses the refactored Flask Blueprint architecture
"""

import os
import sys
import logging
from pathlib import Path

# Ensure we're in the right directory
current_dir = Path(__file__).parent.absolute()
os.chdir(current_dir)

# Add to Python path
if str(current_dir) not in sys.path:
    sys.path.insert(0, str(current_dir))

def main():
    """Main startup function"""
    import argparse
    
    # Create argument parser
    parser = argparse.ArgumentParser(
        description="NeuroGen Server - Document processing and web scraping platform"
    )
    
    # Server mode vs CLI processing mode
    parser.add_argument('--mode', choices=['server', 'cli'], default='server',
                        help='Run as web server or CLI processor')
    
    # CLI processing arguments
    parser.add_argument("-i", "--input", help="Root directory for input files (CLI mode)")
    parser.add_argument("-o", "--output", help="Output JSON file path (CLI mode)")
    parser.add_argument("--max-chunk-size", type=int, default=4096, 
                        help="Maximum chunk size in characters (CLI mode)")
    parser.add_argument("--threads", type=int, default=4, 
                        help="Number of threads for processing (CLI mode)")
    
    # Server arguments
    parser.add_argument("--host", default=os.environ.get('HOST', '127.0.0.1'),
                        help="Server host address")
    parser.add_argument("--port", type=int, default=int(os.environ.get('PORT', 5025)),
                        help="Server port")
    parser.add_argument("--debug", action="store_true", 
                        help="Enable debug mode")
    
    args = parser.parse_args()
    
    if args.mode == 'cli':
        # CLI processing mode
        run_cli_processor(args)
    else:
        # Server mode
        run_server_mode(args)


def run_server_mode(args):
    """Run in server mode"""
    try:
        print("🚀 Starting NeuroGen Server (Blueprint Architecture)")
        print("=" * 50)
        
        # Import and run the new app
        from app_new import run_server
        
        print(f"📍 Server URL: http://{args.host}:{args.port}")
        print(f"🔧 Debug mode: {args.debug}")
        print(f"📁 Working directory: {current_dir}")
        print("=" * 50)
        
        # Start the server
        run_server(host=args.host, port=args.port, debug=args.debug)
        
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
    except Exception as e:
        print(f"💥 Error starting server: {e}")
        sys.exit(1)


def run_cli_processor(args):
    """Run in CLI processing mode"""
    try:
        print("📄 Running NeuroGen CLI Processor")
        print("=" * 50)
        
        # Validate required arguments
        if not args.input:
            print("❌ Error: --input directory required in CLI mode")
            sys.exit(1)
        
        # Import necessary modules
        from blueprints.core.structify_integration import structify_module, structify_available
        from blueprints.core.utils import get_output_filepath
        from blueprints.core.config import DEFAULT_OUTPUT_FOLDER
        
        if not structify_available:
            print("❌ Error: Structify module not available. Cannot process files.")
            sys.exit(1)
        
        # Set up output path
        if args.output:
            output_filepath = get_output_filepath(args.output)
        else:
            output_filepath = os.path.join(DEFAULT_OUTPUT_FOLDER, "bulk_output.json")
        
        # Log settings
        print(f"📁 Processing files from: {args.input}")
        print(f"💾 Output will be saved to: {output_filepath}")
        print(f"🧵 Using {args.threads} threads")
        print(f"📏 Max chunk size: {args.max_chunk_size}")
        print("=" * 50)
        
        # Process files
        result = structify_module.process_all_files(
            root_directory=args.input,
            output_file=output_filepath,
            max_chunk_size=args.max_chunk_size,
            executor_type="thread",
            max_workers=args.threads,
            stop_words=structify_module.DEFAULT_STOP_WORDS if hasattr(structify_module, 'DEFAULT_STOP_WORDS') else set(),
            use_cache=False,
            valid_extensions=structify_module.DEFAULT_VALID_EXTENSIONS if hasattr(structify_module, 'DEFAULT_VALID_EXTENSIONS') else None,
            ignore_dirs="venv,node_modules,.git,__pycache__,dist,build",
            stats_only=False,
            include_binary_detection=True
        )
        
        print(f"\n✅ Processing completed. JSON output saved at: {output_filepath}")
        return result
        
    except Exception as e:
        print(f"❌ Error in CLI processing: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()