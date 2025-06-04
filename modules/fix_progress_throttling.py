#!/usr/bin/env python3
"""
Fix for excessive progress callback emissions causing performance degradation.
Adds throttling to prevent emitting progress updates too frequently.
"""

import os
import sys

def apply_throttling_fix():
    """Apply throttling fix to ProcessingTask progress callback"""
    
    services_file = "/workspace/modules/blueprints/core/services.py"
    
    # Read the current file
    with open(services_file, 'r') as f:
        content = f.read()
    
    # Find the _structify_progress_callback method and add throttling
    fix_code = '''    def _structify_progress_callback(self, processed_count: int, total_count: int, 
                                   stage_message: str, current_file: Optional[str] = None):
        """
        Enhanced callback function with corrected cancellation checking.
        Uses internal cancellation check to avoid AttributeError.
        
        Args:
            processed_count: Number of items processed
            total_count: Total number of items to process
            stage_message: Current processing stage
            current_file: Optional current file being processed
        
        Raises:
            InterruptedError: If task was cancelled during processing
        """
        # Use internal cancellation check to avoid the 'get' attribute error
        if processed_count % self.cancellation_check_interval == 0:
            if self._check_internal_cancellation():
                logger.info(f"Task {self.task_id} cancelled during processing")
                raise InterruptedError("Task cancelled by user")
        
        # Calculate progress with better precision - allow reaching 100%
        if total_count > 0:
            # Calculate actual progress percentage, allowing 100% when complete
            actual_progress = (processed_count / total_count) * 100
            self.progress = min(int(actual_progress), 100)
        else:
            self.progress = 0
        
        # PERFORMANCE FIX: Throttle progress emissions to prevent overhead
        # Initialize last emit time if not exists
        if not hasattr(self, '_last_progress_emit_time'):
            self._last_progress_emit_time = 0
            self._last_progress_percent = -1
        
        current_time = time.time()
        time_since_last_emit = current_time - self._last_progress_emit_time
        progress_change = abs(self.progress - self._last_progress_percent)
        
        # Only emit if:
        # 1. It's been at least 0.5 seconds since last emit, OR
        # 2. Progress changed by at least 5%, OR  
        # 3. We're at 0%, 100%, or this is the first file
        should_emit = (
            time_since_last_emit >= 0.5 or
            progress_change >= 5 or
            self.progress in [0, 100] or
            processed_count == 1 or
            processed_count == total_count
        )
        
        # Update CustomFileStats with comprehensive information
        if isinstance(self.stats, CustomFileStats):
            self.stats.total_files = total_count
            
            # Track processing milestones
            if processed_count == 1 and not hasattr(self, '_first_file_processed'):
                self._first_file_processed = time.time()
                self.performance_metrics['time_to_first_file'] = self._first_file_processed - self.start_time
            
            if processed_count == total_count // 2 and not hasattr(self, '_halfway_processed'):
                self._halfway_processed = time.time()
                self.performance_metrics['time_to_halfway'] = self._halfway_processed - self.start_time
        
        # Enhanced performance tracking
        elapsed_time = current_time - self.start_time
        
        # Enhanced detailed progress tracking
        self.detailed_progress = {
            "processed_count": processed_count,
            "total_count": total_count,
            "stage": stage_message,
            "current_file": current_file,
            "progress_percent": self.progress,
            "timestamp": current_time,
            "elapsed_time": elapsed_time,
            "processing_rate": processed_count / elapsed_time if elapsed_time > 0 else 0,
            "memory_usage_mb": self._get_current_memory_usage()
        }
        
        # Only emit if we should based on throttling rules
        if should_emit:
            # Prepare enhanced message
            msg = f"Stage: {stage_message} ({processed_count}/{total_count})"
            if current_file:
                msg += f" - Current: {os.path.basename(current_file)}"
            
            # Add performance indicators to message
            if elapsed_time > 30:  # After 30 seconds, include rate information
                rate = processed_count / elapsed_time
                msg += f" - Rate: {rate:.1f} files/sec"
            
            # Enhanced details for emission
            details = {
                "current_stage_message": stage_message,
                "processed_count": processed_count,
                "total_count": total_count,
                "elapsed_time": elapsed_time,
                "processing_rate_files_per_sec": processed_count / elapsed_time if elapsed_time > 0 else 0,
                "memory_usage_mb": self.detailed_progress.get("memory_usage_mb", 0)
            }
            
            if current_file:
                details["current_file_processing"] = os.path.basename(current_file)
            
            # Periodic memory and performance tracking
            if processed_count % 25 == 0:
                if hasattr(self.stats, 'track_memory_usage'):
                    self.stats.track_memory_usage()
                
                # Record performance checkpoint
                checkpoint = {
                    'processed_count': processed_count,
                    'timestamp': current_time,
                    'memory_mb': self._get_current_memory_usage(),
                    'rate': processed_count / elapsed_time if elapsed_time > 0 else 0
                }
                self.performance_metrics['processing_checkpoints'].append(checkpoint)
            
            # Emit progress update with enhanced information
            self.emit_progress_update(progress=self.progress, message=msg, details=details)
            
            # Update last emit tracking
            self._last_progress_emit_time = current_time
            self._last_progress_percent = self.progress'''
    
    # Find the start of the method
    start_marker = "    def _structify_progress_callback(self, processed_count: int, total_count: int,"
    if start_marker not in content:
        print("ERROR: Could not find _structify_progress_callback method")
        return False
    
    # Find the end of the method (next def at same indentation)
    start_idx = content.find(start_marker)
    next_def_idx = content.find("\n    def ", start_idx + 100)
    
    if next_def_idx == -1:
        print("ERROR: Could not find end of method")
        return False
    
    # Replace the method
    new_content = content[:start_idx] + fix_code + content[next_def_idx:]
    
    # Write the fixed content
    with open(services_file, 'w') as f:
        f.write(new_content)
    
    print("✅ Applied throttling fix to _structify_progress_callback")
    print("   - Progress updates now throttled to max 2 per second")
    print("   - Or when progress changes by 5% or more")
    print("   - Always emits at 0%, 100%, first and last file")
    
    return True

if __name__ == "__main__":
    apply_throttling_fix()