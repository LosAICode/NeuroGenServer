"""
Production-ready claude.py

This module processes files in a given directory, extracts text (including from PDFs),
chunks the text, generates smart tags, and aggregates metadata into a structured JSON.
It supports concurrent processing and optional caching.
"""

import os
import sys
import json
import logging
import re
import hashlib
import time
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor, as_completed
from typing import Optional, Tuple, Dict, List, Set, Any, Callable
from collections import Counter
from dataclasses import dataclass, field, asdict
from pathlib import Path
from functools import lru_cache

# -----------------------------------------------------------------------------
# Optional PDF Extraction Libraries
# -----------------------------------------------------------------------------
USE_FITZ = False
try:
    import fitz  # PyMuPDF
    USE_FITZ = True
except ImportError:
    try:
        import PyPDF2  # fallback to PyPDF2 if fitz not available
    except ImportError:
        PyPDF2 = None

# -----------------------------------------------------------------------------
# LOGGING SETUP
# -----------------------------------------------------------------------------
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)  # Production log level; override via config if needed
ch = logging.StreamHandler(sys.stdout)
ch.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))
logger.addHandler(ch)

# -----------------------------------------------------------------------------
# CONFIGURABLE CONSTANTS
# -----------------------------------------------------------------------------
DEFAULT_MAX_CHUNK_SIZE = 4096
DEFAULT_VALID_EXTENSIONS = [
    ".py", ".html", ".css", ".yaml", ".yml",
    ".txt", ".md", ".js", ".gitignore", ".ts",
    ".json", ".csv", ".rtf", ".pdf"
]
DEFAULT_STOP_WORDS: Set[str] = {
    "the", "and", "or", "for", "a", "an", "of", "in", "to", "from",
    "on", "at", "by", "this", "is", "are", "were", "was", "be", "as",
    "it", "that", "these", "those", "with", "can", "if", "not", "no",
    "your", "you", "i", "am", "our", "we", "they", "their", "me",
    "have", "has", "had", "also", "too", "very", "up", "out", "about",
    "so", "some", "any", "my", "his", "her", "he", "she"
}
BINARY_SIGNATURES = {
    b'\xff\xd8\xff': '.jpg',
    b'\x89PNG\r\n\x1a\n': '.png',
    b'GIF87a': '.gif',
    b'GIF89a': '.gif',
    b'PK\x03\x04': '.zip',
    b'%PDF': '.pdf',
}
CACHE_FILE = "processed_cache.json"

# -----------------------------------------------------------------------------
# CUSTOM EXCEPTIONS
# -----------------------------------------------------------------------------
class MetadataExtractionError(Exception):
    pass

class BinaryFileError(Exception):
    pass

# -----------------------------------------------------------------------------
# DATA STRUCTURES
# -----------------------------------------------------------------------------
@dataclass
class DocData:
    section_name: str
    content: str
    file_path: str
    file_size: int
    last_modified: str
    tags: List[str] = field(default_factory=list)
    is_chunked: bool = False
    content_hash: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

@dataclass
class FileStats:
    total_files: int = 0
    processed_files: int = 0
    skipped_files: int = 0
    error_files: int = 0
    total_bytes: int = 0
    total_chunks: int = 0
    start_time: float = field(default_factory=time.time)

    def calculate_duration(self) -> float:
        return time.time() - self.start_time

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d['duration_seconds'] = self.calculate_duration()
        d.pop('start_time', None)
        return d

# -----------------------------------------------------------------------------
# PDF Extraction
# -----------------------------------------------------------------------------
def extract_text_from_pdf(file_path: str) -> str:
    """
    Extract text from a PDF file using PyMuPDF if available, else fallback to PyPDF2.
    """
    if USE_FITZ:
        try:
            text_parts = []
            with fitz.open(file_path) as doc:
                for page in doc:
                    text = page.get_text()
                    if text:
                        text_parts.append(text)
            return "\n".join(text_parts)
        except Exception as e:
            logger.error(f"PyMuPDF extraction failed for {file_path}: {e}")
            return ""
    elif PyPDF2 is not None:
        try:
            text_parts = []
            with open(file_path, 'rb') as f:
                reader = PyPDF2.PdfReader(f)
                for page in reader.pages:
                    content = page.extract_text() or ""
                    text_parts.append(content)
            return "\n".join(text_parts)
        except Exception as e:
            logger.error(f"PyPDF2 extraction failed for {file_path}: {e}")
            return ""
    else:
        logger.warning("No PDF extraction library available.")
        return ""

# -----------------------------------------------------------------------------
# UTILITY FUNCTIONS
# -----------------------------------------------------------------------------
def is_binary_file(file_path: str, check_bytes: int = 8192) -> bool:
    """
    Determine if a file is binary. PDFs are always treated as text since they are processed separately.
    """
    if file_path.lower().endswith(".pdf"):
        return False

    ext = Path(file_path).suffix.lower()
    known_bin = {".jpg", ".jpeg", ".png", ".gif", ".zip", ".exe", ".dll", ".so", ".pyc", ".bin", ".dat"}
    if ext in known_bin:
        return True

    size = os.path.getsize(file_path)
    if size < 10:
        return False

    try:
        with open(file_path, "rb") as f:
            chunk = f.read(min(check_bytes, size))
            for sig in BINARY_SIGNATURES:
                if chunk.startswith(sig):
                    return True
            if b"\x00" in chunk:
                return True
            printable = sum(1 for b in chunk if (32 <= b < 127) or b in b" \t\r\n")
            if printable / len(chunk) < 0.8:
                return True
        return False
    except Exception as e:
        logger.debug(f"Binary file check failed on {file_path}: {e}")
        return False

def extract_metadata(file_path: str, root_directory: str) -> Tuple[str, str, int, str]:
    """
    Extract metadata from file_path relative to root_directory.
    Returns a tuple: (primary_library, relative_path, size, last_modified).
    """
    try:
        p = Path(file_path)
        rel = str(p.relative_to(Path(root_directory)))
        parts = rel.split(os.sep)
        primary_lib = parts[0] if len(parts) > 1 else "root"
        size = p.stat().st_size
        mtime = datetime.fromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S")
        return primary_lib, rel, size, mtime
    except Exception as e:
        logger.error(f"Metadata extraction error for {file_path}: {e}")
        raise MetadataExtractionError(file_path)

def read_file_text(file_path: str) -> str:
    """
    Read text from a file. For PDFs, use the PDF extraction logic.
    For text files, try multiple encodings.
    """
    if file_path.lower().endswith(".pdf"):
        return extract_text_from_pdf(file_path)

    size = os.path.getsize(file_path)
    if size < 1024:
        try:
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                return unify_whitespace(f.read())
        except Exception as e:
            logger.error(f"Error reading small file {file_path}: {e}")
            return ""

    possible_encs = ["utf-8", "latin-1", "cp1252"]
    buffer_size = min(1024 * 1024, size)
    content_parts = []
    for enc in possible_encs:
        try:
            with open(file_path, "r", encoding=enc, errors="replace") as f:
                while True:
                    chunk = f.read(buffer_size)
                    if not chunk:
                        break
                    content_parts.append(chunk)
            break
        except Exception:
            content_parts.clear()
            continue

    if not content_parts:
        logger.error(f"Failed reading {file_path} with encodings {possible_encs}")
        return ""
    return unify_whitespace("".join(content_parts))

def unify_whitespace(txt: str) -> str:
    """Normalize whitespace in the given text."""
    return " ".join(txt.split())

PARA_SPLIT = re.compile(r"\n\s*\n")

def chunk_text_by_words(text: str, max_size: int) -> List[str]:
    """
    Chunk text into segments not exceeding max_size characters.
    Splits on paragraph breaks and words.
    """
    if len(text) <= max_size:
        return [text]
    if len(text) > 1_000_000:
        return chunk_large_text(text, max_size)

    paragraphs = PARA_SPLIT.split(text)
    chunks = []
    current_chunk = []
    cur_len = 0

    for para in paragraphs:
        p_len = len(para) + 2
        if p_len > max_size:
            if current_chunk:
                chunks.append("\n\n".join(current_chunk))
                current_chunk.clear()
                cur_len = 0
            words = para.split()
            wbuf, wlen = [], 0
            for w in words:
                wl = len(w) + 1
                if wlen + wl > max_size:
                    chunks.append(" ".join(wbuf))
                    wbuf.clear()
                    wlen = 0
                wbuf.append(w)
                wlen += wl
            if wbuf:
                chunks.append(" ".join(wbuf))
        elif cur_len + p_len > max_size:
            chunks.append("\n\n".join(current_chunk))
            current_chunk = [para]
            cur_len = p_len
        else:
            current_chunk.append(para)
            cur_len += p_len
    if current_chunk:
        chunks.append("\n\n".join(current_chunk))
    return chunks

def chunk_large_text(text: str, max_size: int) -> List[str]:
    """
    Efficiently chunk very large texts (multi-MB) into segments of size max_size.
    """
    out = []
    start = 0
    while start < len(text):
        if start + max_size >= len(text):
            out.append(text[start:])
            break
        end = start + max_size
        par_break = text.rfind("\n\n", start, end)
        if par_break != -1 and par_break > start + max_size // 2:
            out.append(text[start:par_break])
            start = par_break + 2
        else:
            sent_breaks = [
                text.rfind(". ", start, end),
                text.rfind("? ", start, end),
                text.rfind("! ", start, end),
                text.rfind(".\n", start, end)
            ]
            sb = max(sent_breaks)
            if sb != -1 and sb > start + max_size // 3:
                end = sb + 1
                out.append(text[start:end])
                start = end
            else:
                while end > start and not text[end].isspace():
                    end -= 1
                if end == start:
                    out.append(text[start:start + max_size])
                    start += max_size
                else:
                    out.append(text[start:end])
                    start = end + 1
    return out

# -----------------------------------------------------------------------------
# SMART TAGS
# -----------------------------------------------------------------------------
CLASS_PATTERN = re.compile(r"class\s+(\w+)")
FUNCTION_PATTERN = re.compile(r"def\s+(\w+)")
section_name_cache: Dict[str, str] = {}

def extract_section_name(file_path: str) -> str:
    """
    Extract a section name from a file. For Python files, try to use the first class or function name.
    Otherwise, use the filename stem.
    """
    if file_path in section_name_cache:
        return section_name_cache[file_path]

    p = Path(file_path)
    ext = p.suffix.lower()
    name = p.stem
    if ext == ".py":
        try:
            chunk_size = min(os.path.getsize(file_path), 10_000)
            with open(file_path, "rb") as f:
                data = f.read(chunk_size).decode("utf-8", "replace")
            cm = CLASS_PATTERN.search(data)
            if cm:
                nm = f"{name}::{cm.group(1)}"
                section_name_cache[file_path] = nm
                return nm
            fm = FUNCTION_PATTERN.search(data)
            if fm:
                nm = f"{name}::{fm.group(1)}"
                section_name_cache[file_path] = nm
                return nm
        except Exception:
            pass
    section_name_cache[file_path] = name
    return name

WORD_PATTERN = re.compile(r"\b[A-Za-z0-9_]+\b")
FILE_TYPE_KEYWORDS: Dict[str, Set[str]] = {
    ".py": {"documentation", "guide", "tutorial", "example", "test", "setup", "config", "utils", "helpers", "model", "view", "controller", "api", "client", "server", "database", "class", "function", "method", "decorator", "async", "generator", "exception"},
    ".js": {"documentation", "guide", "tutorial", "example", "test", "setup", "config", "utils", "helpers", "model", "view", "controller", "api", "client", "server", "database", "component", "function", "module", "export", "import", "async", "promise"},
    ".ts": {"documentation", "guide", "tutorial", "example", "test", "setup", "config", "utils", "helpers", "model", "view", "controller", "api", "client", "server", "database", "component", "function", "module", "export", "import", "async", "promise"},
    ".html": {"documentation", "guide", "tutorial", "example", "test", "setup", "config", "utils", "helpers", "model", "view", "controller", "api", "client", "server", "database", "header", "section", "article", "list", "table", "form", "input"},
    ".md": {"documentation", "guide", "tutorial", "example", "test", "setup", "config", "utils", "helpers", "model", "view", "controller", "api", "client", "server", "database", "header", "section", "article", "list", "table", "form", "input"}
}
DEFAULT_KEYWORDS = {"documentation", "guide", "tutorial", "example", "test", "setup", "config", "utils", "helpers", "model", "view", "controller", "api", "client", "server", "database"}
PROGRAMMING_STOP_WORDS = {"def", "class", "function", "return", "import", "from", "var", "let", "const", "if", "else", "for", "while", "try", "except", "finally", "with", "as", "in", "true", "false", "none", "null", "undefined", "nan"}

@lru_cache(maxsize=128)
def generate_smart_tags(
    section_name: str,
    content: str,
    stop_words_hash: str,
    file_path: str
) -> Tuple[str, ...]:
    """
    Generate smart tags based on:
      - Section name and file extension,
      - Known keywords for the file type,
      - Frequency-based tokens from the content.
    """
    ext = Path(file_path).suffix.lower()
    base_tags = [section_name.lower()]
    if ext:
        base_tags.append(ext[1:])

    file_specific_kw = FILE_TYPE_KEYWORDS.get(ext, DEFAULT_KEYWORDS)

    # Sample the content if it is huge
    if len(content) > 50_000:
        chunk = content[:10_000] + content[len(content)//2 : len(content)//2 + 10_000] + content[-10_000:]
    else:
        chunk = content
    lowered = chunk.lower()

    found_kws = {kw for kw in file_specific_kw if f" {kw} " in f" {lowered} "}
    tokens = WORD_PATTERN.findall(lowered)
    freq = Counter(tokens)
    all_stop = PROGRAMMING_STOP_WORDS.copy()
    freq_tags = set()
    for w, c in freq.most_common(20):
        if w not in all_stop and len(w) > 2 and c > 1 and not w.isdigit() and w not in found_kws:
            freq_tags.add(w)
            if len(freq_tags) >= 10:
                break

    combined = set(base_tags) | found_kws | freq_tags
    return tuple(sorted(combined))

# -----------------------------------------------------------------------------
# PROCESS A SINGLE FILE
# -----------------------------------------------------------------------------
def process_file(
    file_path: str,
    root_directory: str,
    max_chunk_size: int,
    stop_words: Set[str],
    include_binary_detection: bool,
    stats: FileStats,
    progress_callback: Optional[Callable[[int, int, str], None]] = None
) -> Optional[Tuple[str, List[DocData]]]:
    """
    Process a single file:
      1) Update total files count.
      2) Skip if binary (if enabled).
      3) Extract metadata.
      4) Read file text.
      5) Chunk the text.
      6) Generate smart tags.
      7) Return a tuple of (primary_library, list_of_docdata).
    """
    stats.total_files += 1

    if include_binary_detection and is_binary_file(file_path):
        stats.skipped_files += 1
        raise BinaryFileError(f"Binary skip: {file_path}")

    try:
        primary_lib, rel_path, fsize, modtime = extract_metadata(file_path, root_directory)
    except MetadataExtractionError:
        stats.error_files += 1
        return None

    txt = read_file_text(file_path)
    if not txt:
        stats.error_files += 1
        return None

    stats.total_bytes += len(txt.encode("utf-8"))
    doc_hash = hashlib.md5(txt.encode("utf-8")).hexdigest()
    sec_name = extract_section_name(file_path)

    chunks = chunk_text_by_words(txt, max_chunk_size)
    stats.total_chunks += len(chunks)

    docdatas = []
    total_chunks = len(chunks)
    stop_hash = hashlib.md5(str(sorted(stop_words)).encode()).hexdigest()

    for i, chunk in enumerate(chunks, start=1):
        label = sec_name if total_chunks == 1 else f"{sec_name}_Part_{i}"
        tags = generate_smart_tags(sec_name, chunk, stop_hash, file_path)
        dd = DocData(
            section_name=label,
            content=chunk,
            file_path=rel_path,
            file_size=fsize,
            last_modified=modtime,
            tags=list(tags),
            is_chunked=(total_chunks > 1),
            content_hash=doc_hash
        )
        docdatas.append(dd)

    stats.processed_files += 1
    if progress_callback:
        progress_callback(stats.processed_files, stats.total_files, "processing")

    return (primary_lib, docdatas)

def safe_process(
    path: Path,
    root_directory: str,
    max_chunk_size: int,
    stop_words: Set[str],
    include_binary_detection: bool,
    stats: FileStats,
    progress_callback: Optional[Callable[[int, int, str], None]] = None
) -> Optional[Tuple[str, List[DocData]]]:
    """
    Wrapper for process_file to catch errors gracefully.
    """
    try:
        return process_file(
            str(path),
            root_directory,
            max_chunk_size,
            stop_words,
            include_binary_detection,
            stats,
            progress_callback
        )
    except BinaryFileError:
        logger.debug(f"Skipped binary file: {path}")
        return None
    except Exception as e:
        logger.error(f"Error processing {path}: {e}", exc_info=True)
        stats.error_files += 1
        return None

# -----------------------------------------------------------------------------
# MAIN DRIVER: PROCESS ALL FILES
# -----------------------------------------------------------------------------
def process_all_files(
    root_directory: str,
    output_file: str,
    max_chunk_size: int,
    executor_type: str,
    max_workers: Optional[int],
    stop_words: Set[str],
    use_cache: bool,
    valid_extensions: List[str],
    ignore_dirs: str,
    stats_only: bool,
    include_binary_detection: bool,
    progress_callback: Optional[Callable[[int, int, str], None]] = None,
    stats_obj: Optional[FileStats] = None
) -> Dict[str, Any]:
    """
    Process all files in the root_directory that match the valid_extensions,
    ignoring directories specified in ignore_dirs. Optionally uses caching.
    Writes the aggregated JSON to output_file unless stats_only is True.
    """
    stats = stats_obj if stats_obj else FileStats()
    ig_list = [d.strip() for d in ignore_dirs.split(",") if d.strip()]
    rroot = Path(root_directory)
    all_files = []
    for p in rroot.rglob("*"):
        if any(ig in p.parts for ig in ig_list):
            continue
        if p.is_file() and any(p.suffix.lower() == ext.lower() for ext in valid_extensions):
            all_files.append(p)

    logger.info(f"Found {len(all_files)} valid files in {root_directory}")
    if progress_callback:
        progress_callback(0, len(all_files), "discovery")

    processed_cache = {}
    if use_cache and os.path.isfile(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as c:
                processed_cache = json.load(c)
        except Exception as e:
            logger.warning(f"Cache load error: {e}")

    to_process = []
    for fpath in all_files:
        sp = str(fpath)
        mtime = fpath.stat().st_mtime
        if use_cache and sp in processed_cache:
            old = processed_cache[sp].get("mod_time", 0)
            if old >= mtime:
                stats.skipped_files += 1
                logger.debug(f"Skipping unchanged file: {sp}")
                continue
        to_process.append(fpath)

    if not to_process:
        logger.info("No new or modified files to process.")
        return {"stats": stats.to_dict(), "data": {}}

    if max_workers is None:
        import multiprocessing
        cpunum = multiprocessing.cpu_count()
        if executor_type == "process":
            max_workers = max(1, cpunum - 1)
        else:
            max_workers = min(32, cpunum * 2)

    logger.info(f"Using {executor_type} executor with max_workers={max_workers}")

    batch_size = 100 if len(to_process) <= 1000 else 200

    all_data = {}
    for i in range(0, len(to_process), batch_size):
        batch = to_process[i:i+batch_size]
        logger.info(f"Processing batch {i//batch_size+1} / {(len(to_process)+batch_size-1)//batch_size}")
        results = []
        if executor_type == "none":
            for p in batch:
                r = safe_process(p, root_directory, max_chunk_size, stop_words, include_binary_detection, stats, progress_callback)
                if r:
                    results.append((p, r))
        else:
            Exec = ThreadPoolExecutor if executor_type == "thread" else ProcessPoolExecutor
            with Exec(max_workers=max_workers) as ex:
                fut_map = {ex.submit(safe_process, p, root_directory, max_chunk_size, stop_words, include_binary_detection, stats, progress_callback): p for p in batch}
                for fut in as_completed(fut_map):
                    pth = fut_map[fut]
                    out = fut.result()
                    if out:
                        results.append((pth, out))

        for pth, (lib, docs) in results:
            if lib not in all_data:
                all_data[lib] = {
                    "docs_data": [],
                    "metadata": {
                        "library_name": lib,
                        "processed_date": datetime.now().strftime("%Y-%m-%d"),
                        "source": "Derived from file structure"
                    }
                }
            all_data[lib]["docs_data"].extend(d.to_dict() for d in docs)
            if use_cache:
                processed_cache[str(pth)] = {
                    "mod_time": pth.stat().st_mtime,
                    "size": pth.stat().st_size,
                    "chunks": len(docs)
                }

        if use_cache and (i + batch_size) % (batch_size * 5) == 0:
            try:
                with open(CACHE_FILE, "w", encoding="utf-8") as c:
                    json.dump(processed_cache, c, indent=2)
                logger.info(f"Saved cache after processing {i+batch_size} files.")
            except Exception as e:
                logger.warning(f"Cache save error: {e}")

    if not stats_only:
        try:
            outdir = os.path.dirname(output_file)
            if outdir and not os.path.exists(outdir):
                os.makedirs(outdir, exist_ok=True)
            with open(output_file, "w", encoding="utf-8") as of:
                json.dump(all_data, of, ensure_ascii=False, indent=4)
            logger.info(f"Created JSON output at {output_file}")
            if progress_callback:
                progress_callback(100, 100, "completed")
        except Exception as e:
            logger.error(f"Error writing final output: {e}")
            if progress_callback:
                progress_callback(0, 0, "error")

    if use_cache:
        try:
            with open(CACHE_FILE, "w", encoding="utf-8") as c:
                json.dump(processed_cache, c, indent=2)
        except Exception as e:
            logger.warning(f"Final cache save error: {e}")

    final_stats = stats.to_dict()
    logger.info(f"Processing complete. Stats: {final_stats}")
    return {"stats": final_stats, "data": all_data}

# -----------------------------------------------------------------------------
# MAIN CLI ENTRY POINT
# -----------------------------------------------------------------------------
def main():
    import argparse
    parser = argparse.ArgumentParser(
        description="Enhanced Claude file processor with parallel execution, PDF extraction, and custom tagging."
    )
    parser.add_argument("-i", "--input", default=r"C:\Users\Los\Documents\NeuroGen", help="Root directory for input files.")
    parser.add_argument("-o", "--output", default=r"C:\Users\Los\Documents\NeuroGenOutput.json", help="Path to output JSON file.")
    parser.add_argument("--max-chunk-size", type=int, default=DEFAULT_MAX_CHUNK_SIZE, help="Maximum chunk size in characters.")
    parser.add_argument("--log-level", default="INFO", help="Logging level (DEBUG, INFO, WARNING, ERROR).")
    parser.add_argument("--log-file", default=None, help="Optional log file path.")
    parser.add_argument("--executor-type", choices=["thread", "process", "none"], default="thread", help="Type of executor to use.")
    parser.add_argument("--max-workers", type=int, default=None, help="Maximum number of worker threads/processes.")
    parser.add_argument("--stop-words-file", default=None, help="Path to a file containing additional stop words.")
    parser.add_argument("--use-cache", action="store_true", help="Enable caching of processed files.")
    parser.add_argument("--extensions", default=None, help="Comma-separated list of valid file extensions.")
    parser.add_argument("--ignore-dirs", default="venv,node_modules,.git,__pycache__,dist,build", help="Comma-separated directories to ignore.")
    parser.add_argument("--stats-only", action="store_true", help="Only output processing statistics.")
    parser.add_argument("--include-binary-detection", action="store_true", help="Enable binary file detection.")
    args = parser.parse_args()

    lvl = getattr(logging, args.log_level.upper(), logging.INFO)
    logger.setLevel(lvl)
    if args.log_file:
        fh = logging.FileHandler(args.log_file, mode="a", encoding="utf-8")
        fh.setLevel(lvl)
        fh.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))
        logger.addHandler(fh)

    stop_words = DEFAULT_STOP_WORDS.copy()
    if args.stop_words_file and os.path.isfile(args.stop_words_file):
        try:
            with open(args.stop_words_file, "r", encoding="utf-8") as sf:
                for line in sf:
                    w = line.strip()
                    if w and not w.startswith("#"):
                        stop_words.add(w.lower())
        except Exception as e:
            logger.error(f"Error loading stop words from {args.stop_words_file}: {e}")
    elif args.stop_words_file:
        logger.error(f"Stop words file not found: {args.stop_words_file}")

    valid_exts = DEFAULT_VALID_EXTENSIONS
    if args.extensions:
        parsed_exts = [x.strip() for x in args.extensions.split(",") if x.strip()]
        if parsed_exts:
            valid_exts = parsed_exts

    if not os.path.isdir(args.input):
        logger.error(f"Input directory '{args.input}' not found or inaccessible.")
        sys.exit(1)

    logger.info(f"Starting processing on: {args.input}")
    logger.info(f"Output JSON will be saved to: {args.output}")
    logger.info(f"Max chunk size: {args.max_chunk_size}, Executor: {args.executor_type}, Cache: {args.use_cache}")
    logger.debug(f"Valid extensions: {valid_exts}, Ignoring dirs: {args.ignore_dirs}")

    start_time = time.time()
    result = process_all_files(
        root_directory=args.input,
        output_file=args.output,
        max_chunk_size=args.max_chunk_size,
        executor_type=args.executor_type,
        max_workers=args.max_workers,
        stop_words=stop_words,
        use_cache=args.use_cache,
        valid_extensions=valid_exts,
        ignore_dirs=args.ignore_dirs,
        stats_only=args.stats_only,
        include_binary_detection=args.include_binary_detection
    )
    duration = time.time() - start_time
    logger.info(f"Total processing time: {duration:.2f} seconds")

    if args.stats_only:
        print(json.dumps(result["stats"], indent=4))
    else:
        if "stats" in result:
            st = result["stats"]
            if st.get("processed_files", 0) > 0:
                logger.info("Files per second: %.2f" % (st["processed_files"] / duration))
            if st.get("total_chunks", 0) > 0:
                logger.info("Chunks per second: %.2f" % (st["total_chunks"] / duration))

if __name__ == "__main__":
    main()
