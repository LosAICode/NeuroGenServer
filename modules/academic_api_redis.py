"""
Redis extension for the Academic API.

This module provides Redis integration for improved caching and rate limiting
in the Academic API. It replaces the in-memory cache with Redis for better
scalability and persistence.
"""

import json
import time
import logging
import pickle
from functools import wraps
from typing import Dict, Any, Optional, Union, List, Callable, Tuple

import redis
from flask import Flask, current_app, g, request

logger = logging.getLogger(__name__)

class RedisCache:
    """Redis-based cache implementation for the Academic API."""
    
    def __init__(self, app: Optional[Flask] = None, redis_url: str = "redis://localhost:6379/0"):
        """
        Initialize the Redis cache.
        
        Args:
            app: Flask application (optional)
            redis_url: Redis connection URL
        """
        self.prefix = "academic_api:"
        self.redis = None
        self.fallback_cache = {}  # In-memory fallback cache
        
        if app is not None:
            self.init_app(app, redis_url)
    
    def init_app(self, app: Flask, redis_url: Optional[str] = None) -> None:
        """
        Initialize the cache with a Flask application.
        
        Args:
            app: Flask application
            redis_url: Redis connection URL (overrides app config)
        """
        if redis_url is None:
            redis_url = app.config.get("REDIS_URL", "redis://localhost:6379/0")
        
        try:
            self.redis = redis.Redis.from_url(
                redis_url,
                decode_responses=True,
                socket_timeout=5.0,
                socket_connect_timeout=3.0,
                health_check_interval=30
            )
            self.timeout = app.config.get("CACHE_TIMEOUT", 3600)  # Default: 1 hour
            
            # Add Redis cache instance to app for easy access
            app.extensions["redis_cache"] = self
            
            # Test Redis connection
            self.redis.ping()
            logger.info(f"Connected to Redis at {redis_url}")
            
            # Register teardown callback to close Redis connections
            app.teardown_appcontext(self.teardown)
        except redis.exceptions.ConnectionError as e:
            logger.warning(f"Redis connection failed: {e}")
            logger.warning("Falling back to local cache")
            self.redis = None
        except Exception as e:
            logger.error(f"Error initializing Redis: {e}")
            self.redis = None
    
    def teardown(self, exception):
        """Close Redis connection when app context ends."""
        if self.redis and hasattr(self.redis, 'close'):
            try:
                self.redis.close()
            except Exception as e:
                logger.debug(f"Error closing Redis connection: {e}")
    
    def _make_key(self, key: str) -> str:
        """
        Create a prefixed Redis key.
        
        Args:
            key: Cache key
            
        Returns:
            Prefixed key string
        """
        return f"{self.prefix}{key}"
    
    def get(self, key: str) -> Optional[Any]:
        """
        Get a value from the cache.
        
        Args:
            key: Cache key
            
        Returns:
            Cached value or None if not found or expired
        """
        if self.redis is None:
            # Use in-memory fallback cache
            if key in self.fallback_cache:
                entry = self.fallback_cache[key]
                if time.time() - entry["timestamp"] < self.timeout:
                    return entry["data"]
                else:
                    # Expired
                    del self.fallback_cache[key]
            return None
        
        try:
            redis_key = self._make_key(key)
            data_str = self.redis.get(redis_key)
            
            if data_str is None:
                return None
            
            # Deserialize JSON
            return json.loads(data_str)
        except json.JSONDecodeError as e:
            logger.error(f"Error decoding JSON from Redis cache: {e}")
            return None
        except redis.exceptions.RedisError as e:
            logger.error(f"Redis error retrieving key {key}: {e}")
            
            # Try fallback cache
            if key in self.fallback_cache:
                entry = self.fallback_cache[key]
                if time.time() - entry["timestamp"] < self.timeout:
                    return entry["data"]
            
            return None
        except Exception as e:
            logger.error(f"Error retrieving from Redis cache: {e}")
            return None
    
    def get_many(self, keys: List[str]) -> Dict[str, Any]:
        """
        Get multiple values from the cache at once.
        
        Args:
            keys: List of cache keys
            
        Returns:
            Dictionary mapping keys to values (missing keys omitted)
        """
        if not keys:
            return {}
            
        result = {}
        
        if self.redis is None:
            # Use in-memory fallback cache
            for key in keys:
                value = self.get(key)
                if value is not None:
                    result[key] = value
            return result
        
        try:
            # Convert keys to Redis format
            redis_keys = [self._make_key(key) for key in keys]
            
            # Use pipeline to get values in a single operation
            pipe = self.redis.pipeline()
            for rk in redis_keys:
                pipe.get(rk)
            values = pipe.execute()
            
            # Process results
            for i, (key, value) in enumerate(zip(keys, values)):
                if value is not None:
                    try:
                        result[key] = json.loads(value)
                    except json.JSONDecodeError:
                        logger.error(f"Error decoding JSON for key {key}")
            
            return result
        except redis.exceptions.RedisError as e:
            logger.error(f"Redis error retrieving multiple keys: {e}")
            
            # Fall back to individual gets
            for key in keys:
                value = self.get(key)
                if value is not None:
                    result[key] = value
            
            return result
    
    def set(self, key: str, value: Any, timeout: Optional[int] = None) -> bool:
        """
        Set a value in the cache.
        
        Args:
            key: Cache key
            value: Value to cache
            timeout: Cache timeout in seconds (None uses default)
            
        Returns:
            True if successful, False otherwise
        """
        if timeout is None:
            timeout = self.timeout
        
        # Always update in-memory fallback cache
        self.fallback_cache[key] = {
            "data": value,
            "timestamp": time.time()
        }
        
        if self.redis is None:
            return True
        
        try:
            redis_key = self._make_key(key)
            # Serialize to JSON
            data_str = json.dumps(value)
            
            self.redis.setex(redis_key, timeout, data_str)
            return True
        except (TypeError, OverflowError) as e:
            logger.error(f"Error serializing value for key {key}: {e}")
            return False
        except redis.exceptions.RedisError as e:
            logger.error(f"Redis error setting key {key}: {e}")
            return False
        except Exception as e:
            logger.error(f"Error setting Redis cache: {e}")
            return False
    
    def set_many(self, mapping: Dict[str, Any], timeout: Optional[int] = None) -> bool:
        """
        Set multiple key-value pairs in the cache.
        
        Args:
            mapping: Dictionary mapping keys to values
            timeout: Cache timeout in seconds (None uses default)
            
        Returns:
            True if all operations succeeded, False otherwise
        """
        if not mapping:
            return True
            
        if timeout is None:
            timeout = self.timeout
            
        # Always update in-memory fallback cache
        for key, value in mapping.items():
            self.fallback_cache[key] = {
                "data": value,
                "timestamp": time.time()
            }
            
        if self.redis is None:
            return True
            
        try:
            # Use pipeline for better performance
            pipe = self.redis.pipeline()
            
            for key, value in mapping.items():
                redis_key = self._make_key(key)
                try:
                    data_str = json.dumps(value)
                    pipe.setex(redis_key, timeout, data_str)
                except (TypeError, OverflowError) as e:
                    logger.error(f"Error serializing value for key {key}: {e}")
                    # Continue with other keys
            
            pipe.execute()
            return True
        except redis.exceptions.RedisError as e:
            logger.error(f"Redis error in set_many: {e}")
            return False
        except Exception as e:
            logger.error(f"Error in set_many: {e}")
            return False
    
    def delete(self, key: str) -> bool:
        """
        Delete a value from the cache.
        
        Args:
            key: Cache key
            
        Returns:
            True if successful, False otherwise
        """
        # Remove from in-memory fallback cache
        if key in self.fallback_cache:
            del self.fallback_cache[key]
        
        if self.redis is None:
            return True
        
        try:
            redis_key = self._make_key(key)
            self.redis.delete(redis_key)
            return True
        except redis.exceptions.RedisError as e:
            logger.error(f"Redis error deleting key {key}: {e}")
            return False
        except Exception as e:
            logger.error(f"Error deleting from Redis cache: {e}")
            return False
    
    def delete_many(self, keys: List[str]) -> bool:
        """
        Delete multiple keys from the cache.
        
        Args:
            keys: List of cache keys to delete
            
        Returns:
            True if successful, False otherwise
        """
        if not keys:
            return True
            
        # Remove from in-memory fallback cache
        for key in keys:
            if key in self.fallback_cache:
                del self.fallback_cache[key]
                
        if self.redis is None:
            return True
            
        try:
            # Convert keys to Redis format
            redis_keys = [self._make_key(key) for key in keys]
            
            if redis_keys:
                self.redis.delete(*redis_keys)
            return True
        except redis.exceptions.RedisError as e:
            logger.error(f"Redis error in delete_many: {e}")
            return False
        except Exception as e:
            logger.error(f"Error in delete_many: {e}")
            return False
    
    def clear(self) -> bool:
        """
        Clear all cached values with the academic_api prefix.
        
        Returns:
            True if successful, False otherwise
        """
        # Clear in-memory fallback cache
        self.fallback_cache.clear()
        
        if self.redis is None:
            return True
        
        try:
            # Find all keys with our prefix
            pattern = f"{self.prefix}*"
            keys = self.redis.keys(pattern)
            
            if keys:
                self.redis.delete(*keys)
            
            return True
        except redis.exceptions.RedisError as e:
            logger.error(f"Redis error clearing cache: {e}")
            return False
        except Exception as e:
            logger.error(f"Error clearing Redis cache: {e}")
            return False
    
    def exists(self, key: str) -> bool:
        """
        Check if a key exists in the cache.
        
        Args:
            key: Cache key
            
        Returns:
            True if the key exists, False otherwise
        """
        # Check in-memory fallback cache first
        if key in self.fallback_cache:
            entry = self.fallback_cache[key]
            if time.time() - entry["timestamp"] < self.timeout:
                return True
            else:
                # Expired
                del self.fallback_cache[key]
                return False
                
        if self.redis is None:
            return False
            
        try:
            redis_key = self._make_key(key)
            return bool(self.redis.exists(redis_key))
        except redis.exceptions.RedisError as e:
            logger.error(f"Redis error checking existence of key {key}: {e}")
            return False
        except Exception as e:
            logger.error(f"Error checking if key exists in Redis cache: {e}")
            return False
    
    def increment(self, key: str, amount: int = 1) -> Optional[int]:
        """
        Increment a value in the cache.
        
        Args:
            key: Cache key
            amount: Amount to increment by
            
        Returns:
            New value or None if operation failed
        """
        if self.redis is None:
            # Update in-memory fallback cache
            if key in self.fallback_cache:
                entry = self.fallback_cache[key]
                if time.time() - entry["timestamp"] < self.timeout:
                    try:
                        value = entry["data"] + amount
                        self.fallback_cache[key] = {
                            "data": value,
                            "timestamp": time.time()
                        }
                        return value
                    except (TypeError, ValueError):
                        return None
            return None
            
        try:
            redis_key = self._make_key(key)
            
            # Check if key exists and is a valid number
            current = self.redis.get(redis_key)
            if current is None:
                return None
                
            try:
                # Try to convert to number
                current_num = int(current)
                
                # Use incrby for atomic increment
                new_value = self.redis.incrby(redis_key, amount)
                
                # Update fallback cache
                self.fallback_cache[key] = {
                    "data": new_value,
                    "timestamp": time.time()
                }
                
                return new_value
            except (TypeError, ValueError):
                logger.error(f"Cannot increment non-numeric value for key {key}")
                return None
                
        except redis.exceptions.RedisError as e:
            logger.error(f"Redis error incrementing key {key}: {e}")
            return None
        except Exception as e:
            logger.error(f"Error incrementing value in Redis cache: {e}")
            return None
    
    def touch(self, key: str, timeout: Optional[int] = None) -> bool:
        """
        Refresh the expiry time of a key.
        
        Args:
            key: Cache key
            timeout: New timeout in seconds (None uses default)
            
        Returns:
            True if successful, False otherwise
        """
        if timeout is None:
            timeout = self.timeout
            
        # Update in-memory fallback cache
        if key in self.fallback_cache:
            entry = self.fallback_cache[key]
            self.fallback_cache[key] = {
                "data": entry["data"],
                "timestamp": time.time()
            }
            
        if self.redis is None:
            return True
            
        try:
            redis_key = self._make_key(key)
            
            # Check if key exists
            if not self.redis.exists(redis_key):
                return False
                
            # Update expiry
            return bool(self.redis.expire(redis_key, timeout))
        except redis.exceptions.RedisError as e:
            logger.error(f"Redis error touching key {key}: {e}")
            return False
        except Exception as e:
            logger.error(f"Error touching key in Redis cache: {e}")
            return False
            
    def get_ttl(self, key: str) -> Optional[int]:
        """
        Get the remaining time-to-live of a key in seconds.
        
        Args:
            key: Cache key
            
        Returns:
            TTL in seconds, or None if key doesn't exist or error occurs
        """
        # No TTL info for in-memory fallback cache
        if self.redis is None:
            if key in self.fallback_cache:
                entry = self.fallback_cache[key]
                remaining = self.timeout - (time.time() - entry["timestamp"])
                if remaining > 0:
                    return int(remaining)
            return None
            
        try:
            redis_key = self._make_key(key)
            ttl = self.redis.ttl(redis_key)
            
            # ttl = -2 means key doesn't exist, ttl = -1 means no expiry
            if ttl == -2:
                return None
            elif ttl == -1:
                return self.timeout  # Default to standard timeout for keys with no expiry
            else:
                return ttl
        except redis.exceptions.RedisError as e:
            logger.error(f"Redis error getting TTL for key {key}: {e}")
            return None
        except Exception as e:
            logger.error(f"Error getting TTL in Redis cache: {e}")
            return None
            
    def set_if_not_exists(self, key: str, value: Any, timeout: Optional[int] = None) -> bool:
        """
        Set a value in the cache only if the key does not already exist.
        
        Args:
            key: Cache key
            value: Value to cache
            timeout: Cache timeout in seconds (None uses default)
            
        Returns:
            True if the key was set, False if the key already exists or error
        """
        if timeout is None:
            timeout = self.timeout
            
        # Check in-memory fallback cache first
        if key in self.fallback_cache:
            entry = self.fallback_cache[key]
            if time.time() - entry["timestamp"] < self.timeout:
                return False
                
        if self.redis is None:
            # Set in fallback cache
            self.fallback_cache[key] = {
                "data": value,
                "timestamp": time.time()
            }
            return True
            
        try:
            redis_key = self._make_key(key)
            
            # Serialize to JSON
            data_str = json.dumps(value)
            
            # Use NX option to only set if not exists
            result = self.redis.set(redis_key, data_str, ex=timeout, nx=True)
            
            if result:
                # Also update fallback cache
                self.fallback_cache[key] = {
                    "data": value,
                    "timestamp": time.time()
                }
                
            return bool(result)
        except (TypeError, OverflowError) as e:
            logger.error(f"Error serializing value for key {key}: {e}")
            return False
        except redis.exceptions.RedisError as e:
            logger.error(f"Redis error in set_if_not_exists for key {key}: {e}")
            
            # Fallback to in-memory cache
            if key not in self.fallback_cache:
                self.fallback_cache[key] = {
                    "data": value,
                    "timestamp": time.time()
                }
                return True
            return False
        except Exception as e:
            logger.error(f"Error in set_if_not_exists: {e}")
            return False
            
    def get_or_set(self, key: str, callable_func: Callable[[], Any], timeout: Optional[int] = None) -> Any:
        """
        Get value from cache or set it by calling the function if not present.
        
        Args:
            key: Cache key
            callable_func: Function to call if key not in cache
            timeout: Cache timeout in seconds (None uses default)
            
        Returns:
            The cached or newly computed value
        """
        # Try to get from cache first
        cached_value = self.get(key)
        if cached_value is not None:
            return cached_value
            
        # Not in cache, compute value
        value = callable_func()
        
        # Cache the value
        self.set(key, value, timeout)
        
        return value


class RedisCacheDecorator:
    """
    Decorator class for caching function results using Redis.
    """
    
    def __init__(self, redis_cache: RedisCache, key_prefix: str = "", timeout: Optional[int] = None):
        """
        Initialize the cache decorator.
        
        Args:
            redis_cache: RedisCache instance
            key_prefix: Prefix for cache keys
            timeout: Cache timeout in seconds (None uses default from RedisCache)
        """
        self.redis_cache = redis_cache
        self.key_prefix = key_prefix
        self.timeout = timeout
        
    def __call__(self, func):
        """
        Decorate a function to cache its results.
        
        Args:
            func: Function to decorate
            
        Returns:
            Decorated function
        """
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate cache key
            key_parts = [self.key_prefix, func.__name__]
            
            # Add args and kwargs to key
            if args:
                key_parts.append(str(args))
            if kwargs:
                key_parts.append(str(sorted(kwargs.items())))
                
            key = ":".join(key_parts)
            
            # Try to get from cache
            cached_result = self.redis_cache.get(key)
            if cached_result is not None:
                return cached_result
                
            # Not in cache, call the function
            result = func(*args, **kwargs)
            
            # Cache the result
            self.redis_cache.set(key, result, self.timeout)
            
            return result
            
        return wrapper


class RedisRateLimiter:
    """
    Rate limiter implementation using Redis.
    """
    
    def __init__(self, app: Optional[Flask] = None, redis_url: str = "redis://localhost:6379/0"):
        """
        Initialize the rate limiter.
        
        Args:
            app: Flask application (optional)
            redis_url: Redis connection URL
        """
        self.prefix = "academic_api:ratelimit:"
        self.redis = None
        
        if app is not None:
            self.init_app(app, redis_url)
    
    def init_app(self, app: Flask, redis_url: Optional[str] = None) -> None:
        """
        Initialize the rate limiter with a Flask application.
        
        Args:
            app: Flask application
            redis_url: Redis connection URL (overrides app config)
        """
        if redis_url is None:
            redis_url = app.config.get("REDIS_URL", "redis://localhost:6379/0")
        
        try:
            self.redis = redis.Redis.from_url(
                redis_url,
                decode_responses=True,
                socket_timeout=3.0,
                socket_connect_timeout=2.0
            )
            
            # Add rate limiter instance to app for easy access
            app.extensions["redis_rate_limiter"] = self
            
            # Test Redis connection
            self.redis.ping()
            logger.info(f"Rate limiter connected to Redis at {redis_url}")
            
            # Register teardown callback
            app.teardown_appcontext(self.teardown)
        except redis.exceptions.ConnectionError as e:
            logger.warning(f"Redis connection failed for rate limiter: {e}")
            self.redis = None
        except Exception as e:
            logger.error(f"Error initializing Redis rate limiter: {e}")
            self.redis = None
    
    def teardown(self, exception):
        """Close Redis connection when app context ends."""
        if self.redis and hasattr(self.redis, 'close'):
            try:
                self.redis.close()
            except Exception as e:
                logger.debug(f"Error closing Redis connection for rate limiter: {e}")
    
    def _make_key(self, identifier: str, endpoint: str, period: str) -> str:
        """
        Create a rate limit key.
        
        Args:
            identifier: User identifier (e.g., API key or IP)
            endpoint: API endpoint
            period: Rate limit period (e.g., 'minute', 'hour', 'day')
            
        Returns:
            Rate limit key string
        """
        return f"{self.prefix}{identifier}:{endpoint}:{period}"
    
    def is_rate_limited(self, identifier: str, endpoint: str, limit: int, period: int) -> Tuple[bool, int, int]:
        """
        Check if a request is rate limited.
        
        Args:
            identifier: User identifier (e.g., API key or IP)
            endpoint: API endpoint
            limit: Maximum number of requests allowed
            period: Time period in seconds
            
        Returns:
            Tuple of (is_limited, remaining, reset_time)
        """
        if not self.redis:
            # No rate limiting if Redis is not available
            return False, limit, 0
        
        try:
            # Create key with period suffix
            period_name = {
                60: "minute",
                3600: "hour",
                86400: "day"
            }.get(period, str(period))
            
            key = self._make_key(identifier, endpoint, period_name)
            
            # Get current count and TTL
            pipe = self.redis.pipeline()
            pipe.get(key)
            pipe.ttl(key)
            count_str, ttl = pipe.execute()
            
            # Parse count (or default to 0)
            count = int(count_str) if count_str else 0
            
            if ttl == -2:  # Key doesn't exist
                # First request, set key with expiry
                pipe = self.redis.pipeline()
                pipe.set(key, 1, ex=period)
                pipe.execute()
                return False, limit - 1, period
            
            # Check if over limit
            is_limited = count >= limit
            
            if not is_limited:
                # Increment count
                new_count = self.redis.incr(key)
                
                # Ensure TTL if the key didn't have one
                if ttl == -1:  # No expiry set
                    self.redis.expire(key, period)
                    ttl = period
                
                # Update count
                count = new_count
            
            # Calculate remaining
            remaining = max(0, limit - count)
            
            return is_limited, remaining, ttl
        
        except redis.exceptions.RedisError as e:
            logger.error(f"Redis error in rate limiting: {e}")
            # Don't rate limit on errors
            return False, limit, 0
        except Exception as e:
            logger.error(f"Error in rate limiting: {e}")
            # Don't rate limit on errors
            return False, limit, 0
    
    def reset_rate_limit(self, identifier: str, endpoint: str = None) -> bool:
        """
        Reset rate limit counters for an identifier.
        
        Args:
            identifier: User identifier to reset
            endpoint: Optional specific endpoint to reset (None for all)
            
        Returns:
            True if successful, False otherwise
        """
        if not self.redis:
            return False
            
        try:
            if endpoint:
                # Reset specific endpoint limits
                pattern = f"{self.prefix}{identifier}:{endpoint}:*"
            else:
                # Reset all limits for this identifier
                pattern = f"{self.prefix}{identifier}:*"
                
            # Find all keys matching the pattern
            keys = self.redis.keys(pattern)
            
            if keys:
                # Delete all matching keys
                self.redis.delete(*keys)
                
            return True
        except redis.exceptions.RedisError as e:
            logger.error(f"Redis error resetting rate limits: {e}")
            return False
        except Exception as e:
            logger.error(f"Error resetting rate limits: {e}")
            return False


# Flask extension for rate limiting
def rate_limit(
    limit_per_minute: int = 0,
    limit_per_hour: int = 0, 
    limit_per_day: int = 0,
    key_func: Callable = None
):
    """
    Decorator for rate limiting API endpoints.
    
    Args:
        limit_per_minute: Requests allowed per minute (0 to disable)
        limit_per_hour: Requests allowed per hour (0 to disable)
        limit_per_day: Requests allowed per day (0 to disable)
        key_func: Function to get the rate limit key (defaults to using API key or IP)
        
    Returns:
        Decorator function
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Skip rate limiting if Redis is not configured
            if not hasattr(current_app, 'extensions') or 'redis_rate_limiter' not in current_app.extensions:
                return f(*args, **kwargs)
                
            rate_limiter = current_app.extensions['redis_rate_limiter']
            
            # Get identifier (API key or IP)
            if key_func:
                identifier = key_func()
            else:
                # Default to API key or IP
                identifier = request.headers.get('X-API-Key')
                if not identifier:
                    identifier = request.remote_addr
            
            endpoint = request.endpoint or f.__name__
            
            # Check each rate limit
            rate_limits = [
                (limit_per_minute, 60),
                (limit_per_hour, 3600),
                (limit_per_day, 86400)
            ]
            
            for limit, period in rate_limits:
                if limit > 0:
                    is_limited, remaining, reset = rate_limiter.is_rate_limited(
                        identifier, endpoint, limit, period
                    )
                    
                    if is_limited:
                        # Save rate limit info in response headers
                        response = current_app.make_response(json.dumps({
                            "error": {
                                "code": "RATE_LIMIT_EXCEEDED",
                                "message": f"Rate limit exceeded. Try again in {reset} seconds."
                            }
                        }))
                        response.status_code = 429
                        response.headers['Content-Type'] = 'application/json'
                        response.headers['X-RateLimit-Limit'] = str(limit)
                        response.headers['X-RateLimit-Remaining'] = "0"
                        response.headers['X-RateLimit-Reset'] = str(reset)
                        response.headers['Retry-After'] = str(reset)
                        return response
                    
                    # Store rate limit info for after_request handler
                    if not hasattr(g, 'rate_limit_info'):
                        g.rate_limit_info = {}
                    
                    # Store the most restrictive remaining value
                    if 'remaining' not in g.rate_limit_info or remaining < g.rate_limit_info['remaining']:
                        g.rate_limit_info = {
                            'limit': limit,
                            'remaining': remaining,
                            'reset': reset
                        }
            
            return f(*args, **kwargs)
        
        return decorated_function
    
    return decorator


