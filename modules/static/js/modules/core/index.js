// Core modules index
import app from './app.js';
import errorHandler from './errorHandler.js';
import eventManager from './eventManager.js';
import eventRegistry from './eventRegistry.js';
import moduleLoader from './moduleLoader.js';
import stateManager from './stateManager.js';
import themeManager from './themeManager.js';
import uiRegistry from './uiRegistry.js';

// Re-export as named exports
export { app, errorHandler, eventManager, eventRegistry, moduleLoader, stateManager, themeManager, uiRegistry };

// Named exports from core modules
export * from './uiRegistry.js';
export * from './eventRegistry.js';
export * from './stateManager.js';
export * from './errorHandler.js';
export * from './eventManager.js';
export * from './moduleLoader.js';
export * from './themeManager.js';

// Create index object with all exports
const index = {
  app,
  errorHandler,
  eventManager,
  eventRegistry,
  moduleLoader,
  stateManager,
  themeManager,
  uiRegistry
};

// Export default module
export default index;
