/**
 * NeuroGen Processor - Legacy Compatibility Layer
 *
 * This file provides backward compatibility with the original main.js
 * by exposing modular functions through the global namespace.
 */

// Import the modular system
import app from './index.js';

// --------------------------------------------------
// Restore global variables from the original main.js
// --------------------------------------------------

window.currentTaskId = null;
window.socket = app.socket.socket;
window.statusCheckInterval = null;
window.helpMode = false;

window.completionTriggered = false;
window.taskCompleted = false;
window.resultsDisplayed = false;
window.latestTaskData = null;
window.appInitialized = false;

// Create getters and setters to keep global variables in sync with state manager
Object.defineProperty(window, 'currentTaskId', {
  get: () => app.state.getCurrentTaskId(),
  set: (value) => app.state.setCurrentTaskId(value)
});

Object.defineProperty(window, 'helpMode', {
  get: () => app.state.isHelpMode(),
  set: (value) => app.state.setHelpMode(value)
});

Object.defineProperty(window, 'completionTriggered', {
  get: () => app.state.isCompletionTriggered(),
  set: (value) => app.state.setCompletionTriggered(value)
});

Object.defineProperty(window, 'taskCompleted', {
  get: () => app.state.isTaskCompleted(),
  set: (value) => app.state.setTaskCompleted(value)
});

Object.defineProperty(window, 'resultsDisplayed', {
  get: () => app.state.isResultsDisplayed(),
  set: (value) => app.state.setResultsDisplayed(value)
});

Object.defineProperty(window, 'latestTaskData', {
  get: () => app.state.getLatestTaskData(),
  set: (value) => app.state.setLatestTaskData(value)
});

Object.defineProperty(window, 'appInitialized', {
  get: () => app.state.isAppInitialized(),
  set: (value) => app.state.setAppInitialized(value)
});

// --------------------------------------------------
// Expose core functions to the global namespace
// --------------------------------------------------

// File Processing
window.handleFileSubmit = app.fileProcessor.handleFileSubmit;
window.validateInputDirectory = app.fileProcessor.validateInputDirectory;
window.startProcessing = app.fileProcessor.startProcessing;
window.showForm = app.fileProcessor.showForm;
window.handleCancelClick = app.fileProcessor.handleCancelClick;
window.handleNewTaskClick = app.fileProcessor.handleNewTaskClick;

// UI Functions
window.showToast = app.ui.showToast;
window.updateProgressBarElement = app.ui.updateProgressBarElement;
window.updateProgressStatus = app.ui.updateProgressStatus;
window.makeDraggable = app.ui.makeDraggable;
window.toggleDarkMode = app.theme.toggleTheme;
window.applyTheme = app.theme.applyTheme;

// File Handling
window.verifyPath = app.fileHandler.verifyPath;
window.createDirectory = app.fileHandler.createDirectory;
window.handleBrowseClick = app.fileHandler.handleBrowseClick;
window.openFileByPath = app.fileHandler.openFileByPath;
window.configureOutputPath = app.fileHandler.configureOutputPath;
window.getDefaultOutputFolder = app.fileHandler.getDefaultOutputFolder;
window.checkOutputFileExists = app.fileHandler.checkOutputFileExists;
window.standardizePath = app.fileHandler.standardizePath;

// Progress & Results
window.showProgress = app.progress.showProgress;
window.showResult = app.progress.showResult;
window.showError = app.progress.showError;
window.updateResultStats = app.progress.updateResultStats;
window.updateProgressStats = app.progress.updateProgressStats;
window.updateScraperProgressStats = app.progress.updateScraperProgressStats;
window.updateScraperStats = app.progress.updateScraperStats;

// Socket Handling
window.initializeSocket = app.socket.initializeSocket;
window.startStatusPolling = app.socket.startStatusPolling;
window.stopStatusPolling = app.socket.stopStatusPolling;
window.setupRobustSocketConnection = app.socket.setupRobustSocketConnection;
window.emitProgressWithRateLimiting = app.socket.emitProgressWithRateLimiting;

// Playlist Downloader
window.handlePlaylistSubmit = app.playlists.handlePlaylistSubmit;
window.addPlaylistField = app.playlists.addPlaylistField;
window.startPlaylistDownload = app.playlists.startPlaylistDownload;
window.handlePlaylistCancelClick = app.playlists.handlePlaylistCancelClick;

// Web Scraper
window.handleScraperSubmit = app.scraper.handleScraperSubmit;
window.addScraperUrlField = app.scraper.addScraperUrlField;
window.handleScraperSettingsChange = app.scraper.handleScraperSettingsChange;
window.handleScraperCancelClick = app.scraper.handleScraperCancelClick;
window.getScraperConfigs = app.scraper.getScraperConfigs;
window.startScraperTask = app.scraper.startScraperTask;
window.formatAndDisplayScraperResults = app.scraper.formatAndDisplayScraperResults;
window.handleScraperNewTask = app.scraper.handleScraperNewTask;
window.handleOpenOutputFolder = app.scraper.handleOpenOutputFolder;
window.updatePdfInfoSection = app.scraper.updatePdfInfoSection;

// History Management
window.addTaskToHistory = app.history.addTaskToHistory;
window.loadTaskHistoryFromStorage = app.history.loadTaskHistoryFromStorage;
window.refreshHistoryTable = app.history.refreshHistoryTable;
window.clearTaskHistory = app.history.clearTaskHistory;
window.initializeHistoryTab = app.history.initializeHistoryTab;
window.updatePdfSummaries = app.history.updatePdfSummaries;
window.showTaskDetails = app.history.showTaskDetails;
window.showPdfStructure = app.history.showPdfStructure;

// Help Mode
window.toggleHelpMode = app.help.toggleHelpMode;
window.handleKeyboardShortcuts = app.help.handleKeyboardShortcuts;
window.showHelpTooltips = app.help.showHelpTooltips;
window.removeHelpTooltips = app.help.removeHelpTooltips;
window.setupKeyboardShortcuts = app.help.setupKeyboardShortcuts;

// Academic Search
window.initializeAcademicSearch = app.academic.initializeAcademicSearch;
window.performAcademicSearch = app.academic.performAcademicSearch;
window.displayAcademicResults = app.academic.displayAcademicResults;
window.addSelectedPapers = app.academic.addSelectedPapers;

// Debug Tools
window.initializeDebugMode = app.debug.initializeDebugMode;
window.updateDebugPanel = app.debug.updateDebugPanel;
window.trackErrorInDebugPanel = app.debug.trackErrorInDebugPanel;
window.verifyEventListeners = app.debug.verifyEventListeners;
window.validateUIElements = app.debug.validateUIElements;
window.enhanceDebugPanel = app.debug.enhanceDebugPanel;

// PDF Processing
window.addPdfDownloadItem = app.pdf.addPdfDownloadItem;
window.updatePdfDownloadStatus = app.pdf.updatePdfDownloadStatus;
window.findPdfDownloadItem = app.pdf.findPdfDownloadItem;
window.retryPdfDownload = app.pdf.retryPdfDownload;
window.openPdfViewer = app.pdf.openPdfViewer;
window.handlePdfDownloadsUpdate = app.pdf.handlePdfDownloadsUpdate;
window.processPDF = app.pdf.processPDF;
window.initializePdfProcessing = app.pdf.initializePdfProcessing;

// Utility Functions
window.formatBytes = app.utils.formatBytes;
window.formatDuration = app.utils.formatDuration;
window.escapeHtml = app.utils.escapeHtml;
window.sanitizeFilename = app.utils.sanitizeFilename;

// Performance Optimizations
window.debounce = app.performance.debounce;
window.throttle = app.performance.throttle;
window.optimizeUI = app.performance.optimizeUI;

// Application Functions
window.getCurrentTaskType = app.app.getCurrentTaskType;
window.startTask = app.app.startTask;
window.checkCriticalElements = app.app.checkCriticalElements;
window.ensureCriticalElements = app.app.ensureCriticalElements;
window.initializeInputOutputRelationship = app.app.initializeInputOutputRelationship;
window.initializeThemes = app.app.initializeThemes;
window.checkOngoingTask = app.app.checkOngoingTask;
window.displayEnhancedErrorMessage = app.errors.displayEnhancedErrorMessage;
window.resetLoadingState = app.app.resetLoadingState;

console.log('NeuroGen legacy compatibility layer initialized');

// Export legacy interface for testing
export default {
  initialize: app.app.initializeApp
};