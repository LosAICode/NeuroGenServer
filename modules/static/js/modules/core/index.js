// Core modules index
export { default as app } from './app.js';
export { default as errorHandler } from './errorHandler.js';
export { default as eventManager } from './eventManager.js';
export { default as eventRegistry } from './eventRegistry.js';
export { default as moduleLoader } from './moduleLoader.js';
export { default as stateManager } from './stateManager.js';
export { default as themeManager } from './themeManager.js';
export { default as uiRegistry } from './uiRegistry.js';

// Named exports from core modules
export * from './uiRegistry.js';
export * from './eventRegistry.js';
export * from './stateManager.js';
export * from './errorHandler.js';
export * from './eventManager.js';
export * from './moduleLoader.js';
export * from './themeManager.js';

// Export default module
export default index;
