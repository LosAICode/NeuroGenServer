# playlists_downloader.py
import os
import re
import time
import json
import math
import logging
from concurrent.futures import ThreadPoolExecutor
from tqdm import tqdm
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from youtube_transcript_api import YouTubeTranscriptApi

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Constants
BATCH_SIZE = 50  # Max number of video IDs to request in one batch

def sanitize_filename(filename):
    """Sanitize file names to remove invalid characters."""
    sanitized = re.sub(r'[\\/*?:"<>|]', "", filename)
    return sanitized[:100] if len(sanitized) > 100 else sanitized  # Truncate if filename is too long

def validate_config(api_key, playlists):
    """Validate API key and playlist URLs."""
    if not api_key or len(api_key) != 39:
        raise ValueError("Invalid API key. Please provide a valid YouTube API key.")
    
    for playlist in playlists:
        if 'list=' not in playlist["url"]:
            raise ValueError(f"Invalid playlist URL: {playlist['url']}")

def extract_playlist_id(playlist_url):
    """Extract playlist ID from a YouTube URL."""
    try:
        if 'list=' in playlist_url:
            playlist_id = playlist_url.split('list=')[1]
            # Remove any additional parameters
            if '&' in playlist_id:
                playlist_id = playlist_id.split('&')[0]
            return playlist_id
        else:
            logger.error(f"Invalid playlist URL format: {playlist_url}")
            return None
    except Exception as e:
        logger.error(f"Error extracting playlist ID from {playlist_url}: {e}")
        return None

def get_video_titles(youtube, video_ids, progress_callback=None):
    """
    Retrieve video titles in batches to reduce API calls.
    
    Args:
        youtube: YouTube API client
        video_ids: List of video IDs
        progress_callback: Optional callback for progress reporting
    
    Returns:
        List of (video_id, title) tuples
    """
    video_details = []
    total_batches = math.ceil(len(video_ids) / BATCH_SIZE)

    for batch_idx, i in enumerate(range(0, len(video_ids), BATCH_SIZE)):
        batch = video_ids[i:i + BATCH_SIZE]
        
        # Report progress if callback is provided
        if progress_callback:
            progress_callback('titles', batch_idx + 1, total_batches, 
                            f"Getting titles for batch {batch_idx+1}/{total_batches}")
        
        try:
            request = youtube.videos().list(part="snippet", id=",".join(batch))
            response = request.execute()

            for item in response.get('items', []):
                video_id = item['id']
                title = item['snippet']['title']
                sanitized_title = sanitize_filename(title)
                video_details.append((video_id, sanitized_title))

        except HttpError as e:
            logger.error(f"HTTP Error while retrieving video batch: {e}")
            time.sleep(60)  # Wait 60 seconds before retrying in case of rate-limiting

    return video_details

def get_playlist_video_ids(youtube, playlist_url, progress_callback=None):
    """
    Retrieve video IDs from the given playlist URL with progress reporting.
    
    Args:
        youtube: YouTube API client
        playlist_url: URL of the playlist to process
        progress_callback: Optional callback for progress reporting
    
    Returns:
        List of video IDs
    """
    try:
        # Report initial progress
        if progress_callback:
            progress_callback('video_ids', 0, 1, f"Extracting playlist ID from URL")
            
        playlist_id = extract_playlist_id(playlist_url)
        if not playlist_id:
            logger.error(f"Could not extract playlist ID from {playlist_url}")
            return []
            
        # Report progress - playlist ID extracted
        if progress_callback:
            progress_callback('video_ids', 0.2, 1, f"Getting playlist items")
            
        request = youtube.playlistItems().list(
            playlistId=playlist_id,
            part='contentDetails',
            maxResults=50
        )
        video_ids = []
        page_count = 0
        total_pages_est = 1  # Initial estimate, will be updated

        while request:
            page_count += 1
            
            # Report progress on pagination
            if progress_callback:
                progress_callback('video_ids', page_count, max(page_count, total_pages_est), 
                                f"Retrieving playlist page {page_count}")
                
            response = request.execute()
            video_ids.extend(item['contentDetails']['videoId'] for item in response.get('items', []))
            request = youtube.playlistItems().list_next(request, response)
            
            # Update estimated total pages based on results
            if 'pageInfo' in response and 'totalResults' in response['pageInfo']:
                total_results = response['pageInfo']['totalResults']
                page_size = response['pageInfo']['resultsPerPage']
                total_pages_est = math.ceil(total_results / page_size)

        # Final progress update
        if progress_callback:
            progress_callback('video_ids', 1, 1, 
                            f"Retrieved {len(video_ids)} videos from playlist")
            
        return video_ids
    except HttpError as e:
        logger.error(f"HTTP Error while retrieving playlist videos: {e}")
        return []
    except Exception as e:
        logger.error(f"Error retrieving playlist videos: {e}")
        return []

def download_transcript(video_id, title, download_path, progress_callback=None):
    """
    Download individual video transcript and save with YouTube URL as the source.
    
    Args:
        video_id: YouTube video ID
        title: Video title
        download_path: Path to save the transcript
        progress_callback: Optional callback for progress reporting
    """
    file_path = os.path.join(download_path, f'{title}_{video_id}.json')  # Save file as JSON

    if os.path.exists(file_path):
        logger.info(f"Transcript for video '{title}' already exists at {file_path}. Skipping download.")
        if progress_callback:
            progress_callback('download', 1, 1, f"Skipped existing transcript for '{title}'")
        return

    try:
        # Initial progress report
        if progress_callback:
            progress_callback('download', 0.1, 1, f"Fetching transcript for '{title}'")
            
        transcript = YouTubeTranscriptApi.get_transcript(video_id)
        transcript_text = '\n'.join([i['text'] for i in transcript])
        youtube_url = f"https://www.youtube.com/watch?v={video_id}"

        # Progress - transcript fetched, creating JSON
        if progress_callback:
            progress_callback('download', 0.5, 1, f"Processing transcript for '{title}'")

        # JSON structure
        structured_data = {
            "section_name": title,
            "content": transcript_text,
            "file_path": os.path.relpath(file_path),
            "tags": [title],
            "source": youtube_url  # Store full YouTube URL as source
        }

        # Progress - saving file
        if progress_callback:
            progress_callback('download', 0.8, 1, f"Saving transcript for '{title}'")

        with open(file_path, 'w', encoding='utf-8') as file:
            json.dump(structured_data, file, ensure_ascii=False, indent=4)
            
        # Final progress update
        if progress_callback:
            progress_callback('download', 1, 1, f"Completed transcript for '{title}'")
            
        logger.info(f"Transcript for video '{title}' saved in {file_path}.")

    except Exception as e:
        logger.error(f"Could not download transcript for video '{title}': {e}")
        if progress_callback:
            progress_callback('download', 1, 1, f"Error downloading transcript for '{title}': {str(e)}")
        # Re-raise the exception so the caller can handle it
        raise

def download_transcripts(video_details, download_path, progress_callback=None):
    """
    Download transcripts for each video in the playlist with progress tracking.
    
    Args:
        video_details: List of (video_id, title) tuples
        download_path: Path to save the transcripts
        progress_callback: Optional callback for progress reporting
    """
    os.makedirs(download_path, exist_ok=True)
    max_workers = min(10, os.cpu_count() or 1)  # Set dynamic thread pool size
    
    # If no progress callback, use tqdm for local progress tracking
    if not progress_callback:
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [executor.submit(download_transcript, video_id, title, download_path) 
                      for video_id, title in video_details]
            for future in tqdm(futures, desc="Downloading transcripts"):
                try:
                    future.result()  # Ensures exceptions within threads are caught
                except Exception as e:
                    logger.error(f"Error during transcript download: {e}")
    else:
        # Process videos sequentially with progress updates
        # We don't use ThreadPoolExecutor here to have more granular progress tracking
        for idx, (video_id, title) in enumerate(video_details):
            # Report overall progress
            overall_percent = (idx) / len(video_details)
            progress_callback('download', idx, len(video_details), 
                             f"Downloading transcript {idx+1}/{len(video_details)}: {title}")
            
            # Create a wrapper to track individual transcript download progress
            def video_progress_callback(stage, current, total, message):
                # Adjust overall progress based on individual transcript progress
                # Each video gets 1/len(video_details) of the total progress
                # We calculate progress within that allocation based on current/total
                video_progress = (idx + (current/total)) / len(video_details)
                progress_callback('download', video_progress * len(video_details), len(video_details), message)
            
            try:
                # Download transcript with progress tracking
                download_transcript(video_id, title, download_path, video_progress_callback)
            except Exception as e:
                logger.error(f"Error downloading transcript for {title}: {e}")
                # Continue with next video
    
    logger.info(f"Finished downloading {len(video_details)} transcripts to {download_path}")
    if progress_callback:
        progress_callback('download', len(video_details), len(video_details), 
                         f"Completed downloading {len(video_details)} transcripts")

def process_playlist(youtube, playlist_config, progress_callback=None):
    """
    Process a single playlist with progress reporting: get video IDs, titles, and download transcripts.
    
    Args:
        youtube: YouTube API client
        playlist_config: Dictionary with playlist URL and folder
        progress_callback: Optional callback for progress reporting
        
    Returns:
        Dictionary with playlist results
    """
    playlist_url = playlist_config["url"]
    download_path = playlist_config["folder"]

    if not playlist_url:
        logger.warning(f"Skipping playlist without URL: {download_path}")
        if progress_callback:
            progress_callback('init', 1, 1, "Skipping playlist with no URL")
        return {"url": playlist_url, "folder": download_path, "status": "skipped", "videos": []}

    # Init stage
    if progress_callback:
        progress_callback('init', 0, 1, f"Initializing playlist: {playlist_url}")
    
    logger.info(f"Processing playlist: {playlist_url}")
    logger.info(f"Saving transcripts to: {download_path}")

    # Get video IDs with progress tracking
    if progress_callback:
        progress_callback('video_ids', 0, 1, f"Getting videos from playlist")
        
    video_ids = get_playlist_video_ids(youtube, playlist_url, progress_callback)
    
    if not video_ids:
        logger.warning(f"No video IDs found for playlist: {playlist_url}")
        if progress_callback:
            progress_callback('video_ids', 1, 1, f"No videos found in playlist")
        return {"url": playlist_url, "folder": download_path, "status": "empty", "videos": []}

    # Get video titles with progress tracking
    if progress_callback:
        progress_callback('titles', 0, 1, f"Getting details for {len(video_ids)} videos")
        
    logger.info(f"Found {len(video_ids)} videos. Fetching titles...")
    video_details = get_video_titles(youtube, video_ids, progress_callback)
    
    if not video_details:
        logger.warning("No video details found. Skipping this playlist.")
        if progress_callback:
            progress_callback('titles', 1, 1, f"No video details found")
        return {"url": playlist_url, "folder": download_path, "status": "no_details", "videos": []}

    # Download transcripts with progress tracking
    if progress_callback:
        progress_callback('download', 0, len(video_details), 
                         f"Starting download of {len(video_details)} transcripts")
        
    logger.info(f"Downloading transcripts for {len(video_details)} videos...")
    download_transcripts(video_details, download_path, progress_callback)
    
    # Final completion
    if progress_callback:
        progress_callback('complete', 1, 1, f"Playlist processing completed")
        
    logger.info("Playlist processing complete.")
    
    # Return a result object with video details
    return {
        "url": playlist_url, 
        "folder": download_path, 
        "status": "completed", 
        "videos": [{"id": vid, "title": title} for vid, title in video_details]
    }

def download_all_playlists(api_key, playlists, progress_callback=None, progress_bar=None):
    """
    Public function to:
      1. Validate configuration
      2. Initialize the YouTube client
      3. Loop through each playlist configuration and download transcripts
      
    Args:
        api_key: YouTube API key
        playlists: List of playlist configurations with URL and folder
        progress_callback: Optional callback function for progress updates
        progress_bar: Optional progress bar (for backward compatibility)
        
    Returns:
        List of playlist results
    """
    try:
        # Initialize progress if callback provided
        if progress_callback:
            progress_callback('init', 0, 1, "Validating configuration...")
        
        validate_config(api_key, playlists)
        
        if progress_callback:
            progress_callback('init', 0.5, 1, "Initializing YouTube client...")
            
        youtube = build('youtube', 'v3', developerKey=api_key)
        
        if progress_callback:
            progress_callback('init', 1, 1, "Configuration validated successfully")

        results = []
        for idx, playlist in enumerate(playlists):
            try:
                # Process a single playlist with progress tracking
                if progress_callback:
                    # Create a wrapper callback for this playlist
                    def playlist_callback(stage, current, total, message):
                        progress_callback(
                            stage, 
                            (idx + current/total) / len(playlists), 
                            1,
                            f"Playlist {idx+1}/{len(playlists)}: {message}"
                        )
                        
                    # Call with progress tracking
                    result = process_playlist(youtube, playlist, playlist_callback)
                else:
                    # Use the original implementation without progress updates
                    result = process_playlist(youtube, playlist)
                    
                if result is not None:  # Check if result is not None before appending
                    results.append(result)
                else:
                    logger.warning(f"Skipping None result for playlist: {playlist.get('url', 'unknown')}")
                    
                # Always update progress even if a playlist failed
                if progress_bar:
                    progress_bar.update(1)
                    
            except Exception as e:
                logger.error(f"Error processing playlist {playlist.get('url', 'unknown')}: {e}")
                # Continue with other playlists
                continue

        # Final completion callback
        if progress_callback:
            progress_callback('complete', 1, 1, "All playlists processed successfully")
            
        logger.info("All playlists processed successfully.")
        return results
    except Exception as e:
        logger.error(f"Error in download_all_playlists: {e}")
        raise []