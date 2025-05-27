/**
 * Minimal Service Worker for NeuroGen Server
 * Prevents 404 errors during development
 */

// Simple service worker that doesn't break anything
self.addEventListener('install', function(event) {
  console.log('NeuroGen Service Worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  console.log('NeuroGen Service Worker activated');
  event.waitUntil(self.clients.claim());
});

// Don't intercept any requests during development
self.addEventListener('fetch', function(event) {
  // Just pass through all requests
  return;
});