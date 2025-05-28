"""
Task Analytics Blueprint
Handles task completion analytics, stats processing, and insights generation
"""

from flask import Blueprint, jsonify, request, Response
import logging
import time
import json
import threading
from datetime import datetime
from typing import Dict, Any, Optional, List

# Import shared services and utilities
from blueprints.core.services import (
    get_task, 
    structured_error_response,
    socketio,
    active_tasks,
    tasks_lock
)
from blueprints.core.utils import format_time_duration

logger = logging.getLogger(__name__)

# Create the blueprint
analytics_bp = Blueprint('analytics', __name__, url_prefix='/api')

# Global task history storage (in production, use a database)
task_history = []
task_history_lock = threading.Lock()

# =============================================================================
# ENHANCED TASK COMPLETION SYSTEM
# =============================================================================

def emit_enhanced_task_completion(task_id, task_type="generic", output_file=None, 
                                stats=None, details=None, performance_metrics=None):
    """
    Enhanced task completion emission with comprehensive stats showcase.
    Integrates with existing emit_task_completion while adding rich analytics.
    
    Args:
        task_id: Unique identifier for the task
        task_type: Type of task 
        output_file: Optional path to the output file
        stats: CustomFileStats object or dict with statistics
        details: Optional additional details
        performance_metrics: Optional performance analytics
    """
    try:
        # Start with existing payload structure
        payload = {
            'task_id': task_id,
            'task_type': task_type,
            'status': 'completed',
            'progress': 100,
            'message': f"{task_type.replace('_', ' ').title()} completed successfully",
            'timestamp': time.time()
        }
        
        # Include output file if provided
        if output_file:
            payload['output_file'] = output_file
            
        # Enhanced stats processing with CustomFileStats integration
        if stats:
            processed_stats = process_completion_stats(stats, task_type)
            payload['stats'] = processed_stats
            payload['summary'] = generate_stats_summary(processed_stats, task_type)
            
        # Include additional details
        if details:
            payload['details'] = details
            
        # Add performance metrics if available
        if performance_metrics:
            payload['performance'] = performance_metrics
            
        # Generate insights and recommendations
        payload['insights'] = generate_task_insights(payload)
        
        # Emit the enhanced completion event
        socketio.emit('task_completed', payload)
        
        # Also emit a specialized stats showcase event
        socketio.emit('task_stats_showcase', {
            'task_id': task_id,
            'task_type': task_type,
            'stats': payload.get('stats', {}),
            'summary': payload.get('summary', {}),
            'insights': payload.get('insights', {}),
            'timestamp': time.time()
        })
        
        logger.info(f"Emitted enhanced task completion for {task_id} with full stats")
        
    except Exception as e:
        logger.error(f"Error emitting enhanced task completion: {e}")
        # Fallback to standard completion
        emit_task_completion(task_id, task_type, output_file, stats, details)


def process_completion_stats(stats, task_type):
    """
    Process CustomFileStats or dict stats into a comprehensive format.
    
    Args:
        stats: CustomFileStats object or dictionary
        task_type: Type of task for context
        
    Returns:
        Comprehensive stats dictionary
    """
    try:
        # Handle CustomFileStats objects
        if hasattr(stats, 'to_dict') and callable(stats.to_dict):
            base_stats = stats.to_dict()
        elif isinstance(stats, dict):
            base_stats = stats
        else:
            # Try to convert object to dict
            try:
                base_stats = stats.__dict__ if hasattr(stats, '__dict__') else {'raw_stats': str(stats)}
            except (AttributeError, TypeError):
                base_stats = {'raw_stats': str(stats)}
        
        # Enhance stats with calculated metrics
        enhanced_stats = {
            **base_stats,
            'completion_metrics': calculate_completion_metrics(base_stats),
            'performance_analysis': analyze_performance(base_stats),
            'file_type_breakdown': analyze_file_types(base_stats),
            'efficiency_metrics': calculate_efficiency_metrics(base_stats),
            'quality_indicators': assess_quality_indicators(base_stats)
        }
        
        # Add task-specific enhancements
        if task_type == 'file_processing':
            enhanced_stats['processing_insights'] = analyze_file_processing(base_stats)
        elif task_type == 'pdf_processing':
            enhanced_stats['pdf_insights'] = analyze_pdf_processing(base_stats)
        elif task_type == 'scraping':
            enhanced_stats['scraping_insights'] = analyze_scraping_performance(base_stats)
            
        return enhanced_stats
        
    except Exception as e:
        logger.error(f"Error processing completion stats: {e}")
        return stats if isinstance(stats, dict) else {'error': str(e)}


def calculate_completion_metrics(stats):
    """Calculate comprehensive completion metrics."""
    try:
        total_files = stats.get('total_files', 0)
        processed_files = stats.get('processed_files', 0)
        error_files = stats.get('error_files', 0)
        skipped_files = stats.get('skipped_files', 0)
        duration = stats.get('duration_seconds', stats.get('total_processing_time', 0))
        
        metrics = {
            'completion_rate': round((processed_files / total_files * 100) if total_files > 0 else 0, 2),
            'error_rate': round((error_files / total_files * 100) if total_files > 0 else 0, 2),
            'skip_rate': round((skipped_files / total_files * 100) if total_files > 0 else 0, 2),
            'processing_speed': round((processed_files / duration) if duration > 0 else 0, 2),
            'throughput_mb_per_sec': round((stats.get('total_bytes', 0) / (1024*1024) / duration) if duration > 0 else 0, 2),
            'average_file_size_mb': round((stats.get('total_bytes', 0) / processed_files / (1024*1024)) if processed_files > 0 else 0, 2)
        }
        
        # Performance rating
        if metrics['completion_rate'] >= 95 and metrics['error_rate'] <= 5:
            metrics['performance_rating'] = 'Excellent'
        elif metrics['completion_rate'] >= 85 and metrics['error_rate'] <= 15:
            metrics['performance_rating'] = 'Good'
        elif metrics['completion_rate'] >= 70:
            metrics['performance_rating'] = 'Fair'
        else:
            metrics['performance_rating'] = 'Needs Improvement'
            
        return metrics
        
    except Exception as e:
        logger.error(f"Error calculating completion metrics: {e}")
        return {'error': str(e)}


def analyze_performance(stats):
    """Analyze performance characteristics."""
    try:
        duration = stats.get('duration_seconds', stats.get('total_processing_time', 0))
        memory_peak = stats.get('peak_memory_usage_mb', 0)
        memory_avg = stats.get('avg_memory_usage_mb', 0)
        processing_rate = stats.get('current_processing_rate', 0)
        
        analysis = {
            'duration_formatted': format_duration(duration),
            'memory_efficiency': 'High' if memory_peak < 1000 else 'Medium' if memory_peak < 2000 else 'Low',
            'memory_stability': 'Stable' if abs(memory_peak - memory_avg) < memory_avg * 0.5 else 'Variable',
            'processing_consistency': analyze_processing_consistency(stats),
            'resource_utilization': {
                'peak_memory_mb': memory_peak,
                'avg_memory_mb': memory_avg,
                'memory_variance': round(abs(memory_peak - memory_avg), 2),
                'processing_rate_files_per_sec': round(processing_rate, 2)
            }
        }
        
        # Performance recommendations
        recommendations = []
        if memory_peak > 2000:
            recommendations.append("Consider processing smaller batches to reduce memory usage")
        if processing_rate < 1:
            recommendations.append("Processing speed could be improved with optimization")
        if stats.get('error_rate_percent', 0) > 10:
            recommendations.append("High error rate - check input data quality")
            
        analysis['recommendations'] = recommendations
        
        return analysis
        
    except Exception as e:
        logger.error(f"Error analyzing performance: {e}")
        return {'error': str(e)}


def analyze_file_types(stats):
    """Analyze file type distribution and processing success."""
    try:
        breakdown = {
            'total_file_types': 0,
            'most_common_type': 'N/A',
            'type_distribution': {},
            'success_by_type': {},
            'pdf_analysis': {}
        }
        
        # Extract file type information from speed profile if available
        speed_profile = stats.get('speed_profile', {})
        if 'extension_breakdown' in speed_profile:
            breakdown['type_distribution'] = speed_profile['extension_breakdown']
            breakdown['total_file_types'] = len(breakdown['type_distribution'])
            
            if breakdown['type_distribution']:
                breakdown['most_common_type'] = max(
                    breakdown['type_distribution'], 
                    key=breakdown['type_distribution'].get
                )
        
        # Error rates by extension
        if 'error_rates_by_extension' in speed_profile:
            breakdown['success_by_type'] = {
                ext: round(100 - rate, 2) 
                for ext, rate in speed_profile['error_rates_by_extension'].items()
            }
        
        # PDF-specific analysis
        pdf_files = stats.get('pdf_files', 0)
        if pdf_files > 0:
            breakdown['pdf_analysis'] = {
                'total_pdfs': pdf_files,
                'tables_extracted': stats.get('tables_extracted', 0),
                'references_extracted': stats.get('references_extracted', 0),
                'ocr_processed': stats.get('ocr_processed_files', 0),
                'scanned_pages': stats.get('scanned_pages_processed', 0),
                'avg_tables_per_pdf': round(stats.get('tables_extracted', 0) / pdf_files, 2),
                'ocr_usage_rate': round(stats.get('ocr_processed_files', 0) / pdf_files * 100, 2)
            }
        
        return breakdown
        
    except Exception as e:
        logger.error(f"Error analyzing file types: {e}")
        return {'error': str(e)}


def calculate_efficiency_metrics(stats):
    """Calculate efficiency and optimization metrics."""
    try:
        total_files = stats.get('total_files', 0)
        processed_files = stats.get('processed_files', 0)
        total_bytes = stats.get('total_bytes', 0)
        duration = stats.get('duration_seconds', stats.get('total_processing_time', 0))
        chunks = stats.get('total_chunks', 0)
        
        metrics = {
            'files_per_minute': round((processed_files / duration * 60) if duration > 0 else 0, 2),
            'mb_per_minute': round((total_bytes / (1024*1024) / duration * 60) if duration > 0 else 0, 2),
            'chunks_per_file': round((chunks / processed_files) if processed_files > 0 else 0, 2),
            'bytes_per_second': round((total_bytes / duration) if duration > 0 else 0, 2),
            'efficiency_score': 0
        }
        
        # Calculate efficiency score (0-100)
        completion_rate = (processed_files / total_files * 100) if total_files > 0 else 0
        error_rate = stats.get('error_rate_percent', 0)
        speed_factor = min(metrics['files_per_minute'] / 10, 10) * 10  # Normalize speed component
        
        metrics['efficiency_score'] = round(
            (completion_rate * 0.4) + 
            ((100 - error_rate) * 0.3) + 
            (speed_factor * 0.3), 2
        )
        
        # Efficiency grade
        if metrics['efficiency_score'] >= 90:
            metrics['efficiency_grade'] = 'A+'
        elif metrics['efficiency_score'] >= 80:
            metrics['efficiency_grade'] = 'A'
        elif metrics['efficiency_score'] >= 70:
            metrics['efficiency_grade'] = 'B'
        elif metrics['efficiency_score'] >= 60:
            metrics['efficiency_grade'] = 'C'
        else:
            metrics['efficiency_grade'] = 'D'
        
        return metrics
        
    except Exception as e:
        logger.error(f"Error calculating efficiency metrics: {e}")
        return {'error': str(e)}


def assess_quality_indicators(stats):
    """Assess quality indicators for the processing task."""
    try:
        indicators = {
            'data_integrity': 'Good',  # Default assumption
            'processing_reliability': 'High',
            'output_quality': 'Standard',
            'quality_score': 0,
            'quality_flags': []
        }
        
        error_rate = stats.get('error_rate_percent', 0)
        success_rate = stats.get('success_rate_percent', 0)
        
        # Assess data integrity
        if error_rate < 5:
            indicators['data_integrity'] = 'Excellent'
        elif error_rate < 15:
            indicators['data_integrity'] = 'Good'
        elif error_rate < 30:
            indicators['data_integrity'] = 'Fair'
        else:
            indicators['data_integrity'] = 'Poor'
            indicators['quality_flags'].append('High error rate detected')
        
        # Assess processing reliability
        if success_rate > 95:
            indicators['processing_reliability'] = 'Very High'
        elif success_rate > 85:
            indicators['processing_reliability'] = 'High'
        elif success_rate > 70:
            indicators['processing_reliability'] = 'Medium'
        else:
            indicators['processing_reliability'] = 'Low'
            indicators['quality_flags'].append('Low success rate')
        
        # Check for quality flags
        if stats.get('skipped_files', 0) > stats.get('total_files', 0) * 0.2:
            indicators['quality_flags'].append('High skip rate - check file compatibility')
            
        largest_file_mb = stats.get('largest_file_bytes', 0) / (1024*1024)
        if largest_file_mb > 100:
            indicators['quality_flags'].append(f'Large file processed: {largest_file_mb:.1f}MB')
        
        # Calculate overall quality score
        base_score = success_rate
        penalty = len(indicators['quality_flags']) * 5
        indicators['quality_score'] = max(0, round(base_score - penalty, 2))
        
        return indicators
        
    except Exception as e:
        logger.error(f"Error assessing quality indicators: {e}")
        return {'error': str(e)}


def analyze_file_processing(stats):
    """Analyze file processing specific insights."""
    try:
        insights = {
            'processing_pattern': 'Standard',
            'optimization_opportunities': [],
            'file_handling_efficiency': 'Good'
        }
        
        # Analyze processing patterns
        avg_file_size = stats.get('average_file_size', 0)
        if avg_file_size > 10 * 1024 * 1024:  # > 10MB
            insights['processing_pattern'] = 'Large File Processing'
            insights['optimization_opportunities'].append('Consider streaming for large files')
        elif avg_file_size < 1024:  # < 1KB
            insights['processing_pattern'] = 'Small File Processing'
            insights['optimization_opportunities'].append('Batch processing could improve efficiency')
        
        # Check chunk efficiency
        chunks_per_file = stats.get('total_chunks', 0) / max(stats.get('processed_files', 1), 1)
        if chunks_per_file > 20:
            insights['optimization_opportunities'].append('Many chunks per file - consider larger chunk sizes')
        elif chunks_per_file < 2:
            insights['optimization_opportunities'].append('Few chunks per file - files might be very small')
        
        return insights
        
    except Exception as e:
        logger.error(f"Error analyzing file processing: {e}")
        return {'error': str(e)}


def analyze_pdf_processing(stats):
    """Analyze PDF processing specific insights."""
    try:
        insights = {
            'pdf_complexity': 'Standard',
            'extraction_success': 'Good',
            'ocr_efficiency': 'N/A'
        }
        
        pdf_files = stats.get('pdf_files', 0)
        if pdf_files > 0:
            tables_per_pdf = stats.get('tables_extracted', 0) / pdf_files
            refs_per_pdf = stats.get('references_extracted', 0) / pdf_files
            ocr_rate = stats.get('ocr_processed_files', 0) / pdf_files * 100
            
            # Assess PDF complexity
            if tables_per_pdf > 5 or refs_per_pdf > 50:
                insights['pdf_complexity'] = 'High - Rich content documents'
            elif tables_per_pdf > 2 or refs_per_pdf > 20:
                insights['pdf_complexity'] = 'Medium - Standard academic/business documents'
            else:
                insights['pdf_complexity'] = 'Low - Simple text documents'
            
            # Assess extraction success
            if tables_per_pdf > 3 and refs_per_pdf > 30:
                insights['extraction_success'] = 'Excellent - Rich data extracted'
            elif tables_per_pdf > 1 or refs_per_pdf > 10:
                insights['extraction_success'] = 'Good - Moderate extraction'
            else:
                insights['extraction_success'] = 'Basic - Limited structured content'
            
            # OCR efficiency
            if ocr_rate > 50:
                insights['ocr_efficiency'] = 'High OCR usage - Many scanned documents'
            elif ocr_rate > 20:
                insights['ocr_efficiency'] = 'Moderate OCR usage'
            elif ocr_rate > 0:
                insights['ocr_efficiency'] = 'Low OCR usage - Mostly digital PDFs'
            else:
                insights['ocr_efficiency'] = 'No OCR needed - All digital content'
        
        return insights
        
    except Exception as e:
        logger.error(f"Error analyzing PDF processing: {e}")
        return {'error': str(e)}


def analyze_scraping_performance(stats):
    """Analyze web scraping specific insights."""
    try:
        insights = {
            'scraping_efficiency': 'Standard',
            'download_performance': 'Good',
            'content_extraction': 'Standard'
        }
        
        # Add scraping-specific analysis based on available stats
        # This would be expanded based on scraping-specific metrics
        
        return insights
        
    except Exception as e:
        logger.error(f"Error analyzing scraping performance: {e}")
        return {'error': str(e)}


def analyze_processing_consistency(stats):
    """Analyze consistency of processing performance."""
    try:
        current_rate = stats.get('current_processing_rate', 0)
        avg_rate = stats.get('files_per_second', 0)
        
        if abs(current_rate - avg_rate) < avg_rate * 0.2:
            return 'Very Consistent'
        elif abs(current_rate - avg_rate) < avg_rate * 0.5:
            return 'Consistent'
        else:
            return 'Variable'
            
    except Exception:
        return 'Unknown'


def generate_stats_summary(stats, task_type):
    """Generate a human-readable summary of the stats."""
    try:
        completion_metrics = stats.get('completion_metrics', {})
        performance_analysis = stats.get('performance_analysis', {})
        efficiency_metrics = stats.get('efficiency_metrics', {})
        
        summary = {
            'headline': generate_headline_summary(stats, task_type),
            'key_metrics': {
                'files_processed': stats.get('processed_files', 0),
                'success_rate': f"{completion_metrics.get('completion_rate', 0)}%",
                'duration': performance_analysis.get('duration_formatted', 'Unknown'),
                'efficiency_grade': efficiency_metrics.get('efficiency_grade', 'N/A')
            },
            'highlights': generate_highlights(stats),
            'areas_for_improvement': generate_improvement_areas(stats)
        }
        
        return summary
        
    except Exception as e:
        logger.error(f"Error generating stats summary: {e}")
        return {'error': str(e)}


def generate_headline_summary(stats, task_type):
    """Generate a compelling headline summary."""
    try:
        processed = stats.get('processed_files', 0)
        total = stats.get('total_files', 0)
        duration = stats.get('duration_seconds', 0)
        
        if total > 0:
            success_rate = round((processed / total) * 100, 1)
            if success_rate >= 95:
                performance_word = "successfully"
            elif success_rate >= 80:
                performance_word = "efficiently"
            else:
                performance_word = "partially"
        else:
            performance_word = "completed"
            
        return f"{task_type.replace('_', ' ').title()} {performance_word} processed {processed} files in {format_duration(duration)}"
        
    except Exception:
        return f"{task_type.replace('_', ' ').title()} completed"


def generate_highlights(stats):
    """Generate key highlights from the processing."""
    highlights = []
    
    try:
        # Performance highlights
        efficiency_grade = stats.get('efficiency_metrics', {}).get('efficiency_grade', '')
        if efficiency_grade in ['A+', 'A']:
            highlights.append(f"Excellent efficiency rating: {efficiency_grade}")
        
        # Processing speed highlights
        speed = stats.get('efficiency_metrics', {}).get('files_per_minute', 0)
        if speed > 60:
            highlights.append(f"High processing speed: {speed} files/minute")
        
        # PDF processing highlights
        pdf_files = stats.get('pdf_files', 0)
        tables = stats.get('tables_extracted', 0)
        if pdf_files > 0 and tables > 0:
            highlights.append(f"Extracted {tables} tables from {pdf_files} PDF files")
        
        # Memory efficiency highlights
        memory_efficiency = stats.get('performance_analysis', {}).get('memory_efficiency', '')
        if memory_efficiency == 'High':
            highlights.append("Efficient memory usage maintained")
        
        # Large file handling
        largest_file_mb = stats.get('largest_file_bytes', 0) / (1024*1024)
        if largest_file_mb > 50:
            highlights.append(f"Successfully processed large file: {largest_file_mb:.1f}MB")
            
    except Exception as e:
        logger.debug(f"Error generating highlights: {e}")
    
    return highlights[:5]  # Limit to top 5 highlights


def generate_improvement_areas(stats):
    """Generate areas for improvement based on stats."""
    improvements = []
    
    try:
        # Error rate improvements
        error_rate = stats.get('completion_metrics', {}).get('error_rate', 0)
        if error_rate > 10:
            improvements.append(f"Reduce error rate from {error_rate}%")
        
        # Speed improvements
        efficiency_grade = stats.get('efficiency_metrics', {}).get('efficiency_grade', '')
        if efficiency_grade in ['C', 'D']:
            improvements.append("Optimize processing speed")
        
        # Memory improvements
        memory_efficiency = stats.get('performance_analysis', {}).get('memory_efficiency', '')
        if memory_efficiency == 'Low':
            improvements.append("Optimize memory usage")
        
        # Quality improvements
        quality_flags = stats.get('quality_indicators', {}).get('quality_flags', [])
        if quality_flags:
            improvements.extend(quality_flags[:2])  # Add top 2 quality issues
            
    except Exception as e:
        logger.debug(f"Error generating improvement areas: {e}")
    
    return improvements[:3]  # Limit to top 3 improvements


def generate_task_insights(payload):
    """Generate actionable insights from task completion data."""
    try:
        stats = payload.get('stats', {})
        task_type = payload.get('task_type', 'unknown')
        
        insights = {
            'performance_insights': [],
            'optimization_recommendations': [],
            'next_steps': [],
            'comparative_analysis': {}
        }
        
        # Performance insights
        completion_rate = stats.get('completion_metrics', {}).get('completion_rate', 0)
        if completion_rate == 100:
            insights['performance_insights'].append("Perfect completion rate achieved")
        elif completion_rate >= 95:
            insights['performance_insights'].append("Excellent completion rate with minimal failures")
        elif completion_rate >= 80:
            insights['performance_insights'].append("Good completion rate with room for improvement")
        else:
            insights['performance_insights'].append("Completion rate needs attention")
        
        # Processing efficiency insights
        efficiency_score = stats.get('efficiency_metrics', {}).get('efficiency_score', 0)
        if efficiency_score >= 90:
            insights['performance_insights'].append("Outstanding processing efficiency")
        elif efficiency_score >= 70:
            insights['performance_insights'].append("Good processing efficiency")
        else:
            insights['performance_insights'].append("Processing efficiency could be improved")
        
        # Optimization recommendations
        recommendations = stats.get('performance_analysis', {}).get('recommendations', [])
        insights['optimization_recommendations'].extend(recommendations)
        
        # Task-specific recommendations
        if task_type == 'file_processing':
            file_insights = stats.get('processing_insights', {})
            insights['optimization_recommendations'].extend(
                file_insights.get('optimization_opportunities', [])
            )
        
        # Next steps based on results
        error_files = stats.get('error_files', 0)
        if error_files > 0:
            insights['next_steps'].append(f"Review {error_files} failed files for common issues")
        
        output_file = payload.get('output_file')
        if output_file:
            insights['next_steps'].append(f"Review results in {os.path.basename(output_file)}")
        
        # Comparative analysis (placeholder for future enhancement)
        insights['comparative_analysis'] = {
            'vs_previous_runs': 'No comparison data available',
            'vs_benchmarks': 'Establishing baseline performance'
        }
        
        return insights
        
    except Exception as e:
        logger.error(f"Error generating task insights: {e}")
        return {'error': str(e)}


def format_duration(seconds):
    """Format duration in a human-readable way."""
    try:
        if seconds < 60:
            return f"{seconds:.1f} seconds"
        elif seconds < 3600:
            minutes = int(seconds // 60)
            secs = int(seconds % 60)
            return f"{minutes}m {secs}s"
        else:
            hours = int(seconds // 3600)
            minutes = int((seconds % 3600) // 60)
            return f"{hours}h {minutes}m"
    except Exception:
        return "Unknown duration"


# ----------------------------------------------------------------------------
# Integration with Existing Task Classes
# ----------------------------------------------------------------------------

def enhance_processing_task_completion(task):
    """
    Enhance ProcessingTask completion with rich stats.
    Call this in ProcessingTask completion logic.
    
    Args:
        task: ProcessingTask instance with stats
    """
    try:
        # Finalize stats
        if hasattr(task, 'stats') and hasattr(task.stats, 'finish_processing'):
            task.stats.finish_processing()
        
        # Generate performance metrics
        performance_metrics = {
            'memory_profile': getattr(task.stats, 'get_memory_profile', lambda: {})(),
            'speed_profile': getattr(task.stats, 'get_processing_speed_profile', lambda: {})(),
            'task_duration': time.time() - getattr(task, 'start_time', time.time()),
            'peak_memory_usage': getattr(task.stats, 'peak_memory_usage', 0)
        }
        
        # Emit enhanced completion
        emit_enhanced_task_completion(
            task_id=task.task_id,
            task_type=getattr(task, 'task_type', 'file_processing'),
            output_file=getattr(task, 'output_file', None),
            stats=task.stats,
            performance_metrics=performance_metrics
        )
        
    except Exception as e:
        logger.error(f"Error enhancing task completion: {e}")
        # Fallback to standard completion
        emit_task_completion(
            task.task_id, 
            getattr(task, 'task_type', 'file_processing'),
            getattr(task, 'output_file', None),
            getattr(task, 'stats', None)
        )


# =============================================================================
# TASK HISTORY MANAGEMENT
# =============================================================================

# Global task history storage (in production, use a database)
task_history = []
task_history_lock = threading.Lock()

def add_task_to_history(task_id, task_type, stats, output_file=None):
    """
    Add completed task to history for analytics.
    
    Args:
        task_id: Task identifier
        task_type: Type of task
        stats: Task statistics
        output_file: Output file path if applicable
    """
    try:
        with task_history_lock:
            # Process stats for storage
            processed_stats = process_completion_stats(stats, task_type) if stats else {}
            
            history_entry = {
                'task_id': task_id,
                'task_type': task_type,
                'completed_at': datetime.now().isoformat(),
                'output_file': output_file,
                'stats': processed_stats,
                'summary': generate_stats_summary(processed_stats, task_type)
            }
            
            task_history.append(history_entry)
            
            # Keep only last 100 entries (in memory)
            if len(task_history) > 100:
                task_history.pop(0)
                
            logger.info(f"Added task {task_id} to history")
            
    except Exception as e:
        logger.error(f"Error adding task to history: {e}")



# =============================================================================
# API ENDPOINTS
# =============================================================================

@analytics_bp.route("/task/<task_id>/stats", methods=["GET"])
def get_task_stats(task_id):
    """
    API endpoint to retrieve detailed task statistics.
    
    Args:
        task_id: The task identifier
        
    Returns:
        JSON response with detailed task statistics
    """
    try:
        task = get_task(task_id)
        if not task:
            return structured_error_response(
                "TASK_NOT_FOUND", 
                f"Task {task_id} not found", 
                404
            )
        
        # Get basic task info
        task_info = {
            'task_id': task_id,
            'task_type': task.get('type', 'unknown'),
            'status': task.get('status', 'unknown'),
            'start_time': task.get('start_time'),
            'end_time': task.get('end_time')
        }
        
        # Get enhanced stats if available
        stats = None
        if hasattr(task, 'stats'):
            stats = process_completion_stats(task.stats, task_info['task_type'])
        elif 'stats' in task:
            stats = process_completion_stats(task['stats'], task_info['task_type'])
        
        response = {
            'task_info': task_info,
            'stats': stats,
            'summary': generate_stats_summary(stats, task_info['task_type']) if stats else None,
            'insights': generate_task_insights({'stats': stats, 'task_type': task_info['task_type']}) if stats else None
        }
        
        return jsonify(response)
        
    except Exception as e:
        logger.error(f"Error retrieving task stats for {task_id}: {e}")
        return structured_error_response(
            "STATS_RETRIEVAL_ERROR",
            f"Error retrieving stats: {str(e)}",
            500
        )


@analytics_bp.route("/task/<task_id>/stats/export", methods=["GET"])
def export_task_stats(task_id):
    """
    Export detailed task statistics as downloadable JSON.
    
    Args:
        task_id: The task identifier
        
    Returns:
        JSON file download with comprehensive stats
    """
    try:
        # Get comprehensive stats
        response = get_task_stats(task_id)
        if response.status_code != 200:
            return response
        
        stats_data = response.get_json()
        
        # Add export metadata
        export_data = {
            'export_info': {
                'exported_at': datetime.now().isoformat(),
                'export_version': '1.0',
                'task_id': task_id
            },
            **stats_data
        }
        
        # Create response with download headers
        json_output = json.dumps(export_data, indent=2, ensure_ascii=False)
        
        response = Response(
            json_output,
            mimetype='application/json',
            headers={
                'Content-Disposition': f'attachment; filename=task_{task_id}_stats.json',
                'Content-Type': 'application/json; charset=utf-8'
            }
        )
        
        return response
        
    except Exception as e:
        logger.error(f"Error exporting task stats for {task_id}: {e}")
        return structured_error_response(
            "EXPORT_ERROR",
            f"Error exporting stats: {str(e)}",
            500
        )


@analytics_bp.route("/tasks/history", methods=["GET"])
def get_task_history():
    """
    Get task processing history with analytics.
    
    Returns:
        JSON response with task history and analytics
    """
    # Implementation will be moved here
    pass


@analytics_bp.route("/tasks/analytics", methods=["GET"])
def get_task_analytics():
    """
    Get aggregated analytics across all tasks.
    
    Returns:
        JSON response with aggregated analytics
    """
    # Implementation will be moved here
    pass


# Export the blueprint
__all__ = ['analytics_bp']