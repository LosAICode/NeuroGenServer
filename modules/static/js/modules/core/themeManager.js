/**
 * NeuroGen Server - Theme Manager Module
 * 
 * Provides theming capabilities for the NeuroGen Server frontend.
 * Manages theme changes, persistence, and system preference tracking.
 * 
 * Features:
 * - Multiple theme support (light, dark, system)
 * - System preference detection
 * - CSS variable-based theming
 * - Theme persistence
 * - Bootstrap integration
 * - Support for custom themes
 * - Event emission on theme changes
 */

/**
 * Theme Manager for application appearance
 */
const themeManager = {
  // Available themes
  _themes: ['light', 'dark', 'system'],
  
  // Current active theme - default to dark for consistency
  _currentTheme: 'dark',
  
  // Theme variables
  _themeVariables: {
    light: {
      // Base colors
      '--bg-color': '#ffffff',
      '--text-color': '#333333',
      '--primary-color': '#3498db',
      '--secondary-color': '#2ecc71',
      '--accent-color': '#e74c3c',
      '--border-color': '#dddddd',
      
      // Component backgrounds
      '--card-bg': '#f8f9fa',
      '--header-bg': '#f0f0f0',
      '--footer-bg': '#f0f0f0',
      '--form-control-bg': '#ffffff',
      '--dropdown-bg': '#ffffff',
      '--modal-bg': '#ffffff',
      '--toast-bg': '#ffffff',
      
      // Status colors
      '--success-color': '#28a745',
      '--warning-color': '#ffc107',
      '--error-color': '#dc3545',
      '--info-color': '#17a2b8',
      
      // Interactive elements
      '--link-color': '#0066cc',
      '--link-hover-color': '#005299',
      '--btn-text-color': '#ffffff',
      '--btn-primary-bg': '#3498db',
      '--btn-secondary-bg': '#6c757d',
      '--btn-success-bg': '#28a745',
      '--btn-warning-bg': '#ffc107',
      '--btn-danger-bg': '#dc3545',
      '--btn-info-bg': '#17a2b8',
      
      // Input and form elements
      '--input-border-color': '#ced4da',
      '--input-focus-border-color': '#86b7fe',
      '--input-focus-shadow': 'rgba(13, 110, 253, 0.25)',
      '--input-disabled-bg': '#e9ecef',
      
      // Tables
      '--table-border-color': '#dee2e6',
      '--table-header-bg': '#e9ecef',
      '--table-row-hover-bg': '#f5f5f5',
      
      // Shadows
      '--shadow-sm': '0 .125rem .25rem rgba(0, 0, 0, .075)',
      '--shadow-md': '0 .5rem 1rem rgba(0, 0, 0, .15)',
      '--shadow-lg': '0 1rem 3rem rgba(0, 0, 0, .175)'
    },
    dark: {
      // Base colors
      '--bg-color': '#222222',
      '--text-color': '#f0f0f0',
      '--primary-color': '#3498db',
      '--secondary-color': '#2ecc71',
      '--accent-color': '#e74c3c',
      '--border-color': '#444444',
      
      // Component backgrounds
      '--card-bg': '#333333',
      '--header-bg': '#1a1a1a',
      '--footer-bg': '#1a1a1a',
      '--form-control-bg': '#333333',
      '--dropdown-bg': '#333333',
      '--modal-bg': '#333333',
      '--toast-bg': '#333333',
      
      // Status colors
      '--success-color': '#28a745',
      '--warning-color': '#ffc107',
      '--error-color': '#dc3545',
      '--info-color': '#17a2b8',
      
      // Interactive elements
      '--link-color': '#4dadff',
      '--link-hover-color': '#69b9ff',
      '--btn-text-color': '#ffffff',
      '--btn-primary-bg': '#3498db',
      '--btn-secondary-bg': '#6c757d',
      '--btn-success-bg': '#28a745',
      '--btn-warning-bg': '#ffc107',
      '--btn-danger-bg': '#dc3545',
      '--btn-info-bg': '#17a2b8',
      
      // Input and form elements
      '--input-border-color': '#495057',
      '--input-focus-border-color': '#86b7fe',
      '--input-focus-shadow': 'rgba(13, 110, 253, 0.25)',
      '--input-disabled-bg': '#343a40',
      
      // Tables
      '--table-border-color': '#495057',
      '--table-header-bg': '#343a40',
      '--table-row-hover-bg': '#2d3339',
      
      // Shadows
      '--shadow-sm': '0 .125rem .25rem rgba(0, 0, 0, .2)',
      '--shadow-md': '0 .5rem 1rem rgba(0, 0, 0, .4)',
      '--shadow-lg': '0 1rem 3rem rgba(0, 0, 0, .5)'
    }
  },
  
  // Track initialization
  initialized: false,
  
  // System preference media query
  _systemPreference: null,
  
  // Storage key for theme preference - ALWAYS use 'theme' for consistency
  _storageKey: 'theme',
  
  // Bootstrap data-bs-theme integration
  _bootstrapIntegration: true,
  
  // Local event handlers
  _eventHandlers: {},
  
  /**
   * Initialize the theme manager
   * @param {Object} options - Initialization options
   * @returns {boolean} - Whether initialization was successful
   */
  initialize(options = {}) {
    if (this.initialized) {
      console.warn('Theme manager already initialized');
      return false;
    }
    
    try {
      console.log("Initializing theme manager...");
      
      // For theme persistence, we ALWAYS use 'theme' as the storage key
      // to avoid conflicts with other components
      this._storageKey = 'theme';
      
      // Set up bootstrap integration option
      if (options.bootstrapIntegration !== undefined) {
        this._bootstrapIntegration = options.bootstrapIntegration;
      }
      
      // Set up system preference tracking
      this._setupSystemPreference();
      
      // Load saved theme preference
      this._loadThemePreference();
      
      // Set initial theme - prioritize options.theme if provided
      if (options.theme && this._themes.includes(options.theme)) {
        this.setTheme(options.theme);
      } else {
        this.applyCurrentTheme();
      }
      
      // Add theme toggle button event listener if it exists
      this._setupThemeToggleButton();
      
      // Register keyboard shortcut for theme toggle (Shift+Alt+T)
      this._setupKeyboardShortcut();
      
      // Make available globally for debugging and access
      window.themeManager = this;
      
      // Indicate initialized state
      this.initialized = true;
      console.log(`Theme manager initialized with theme: ${this._currentTheme} (effective: ${this.getEffectiveTheme()})`);
      
      return true;
    } catch (error) {
      console.error('Error initializing theme manager:', error);
      return false;
    }
  },
  
  /**
   * Set up system preference tracking
   * @private
   */
  _setupSystemPreference() {
    try {
      this._systemPreference = window.matchMedia('(prefers-color-scheme: dark)');
      
      // Listen for system preference changes
      if (this._systemPreference.addEventListener) {
        this._systemPreference.addEventListener('change', this._handleSystemPreferenceChange.bind(this));
      } else if (this._systemPreference.addListener) {
        // Older browsers
        this._systemPreference.addListener(this._handleSystemPreferenceChange.bind(this));
      }
    } catch (error) {
      console.warn('Error setting up system preference tracking:', error);
    }
  },
  
  /**
   * Handle system preference changes
   * @private
   * @param {MediaQueryListEvent} event - Media query change event
   */
  _handleSystemPreferenceChange(event) {
    // Only update if current theme is 'system'
    if (this._currentTheme === 'system') {
      this.applyCurrentTheme();
    }
    
    // Emit event if eventRegistry is available
    try {
      if (window.eventRegistry && typeof window.eventRegistry.emit === 'function') {
        window.eventRegistry.emit('theme:system-preference-change', {
          prefersDarkMode: event.matches,
          effectiveTheme: this.getEffectiveTheme()
        });
      }
    } catch (e) {
      // Ignore errors with event registry
      console.debug('Error emitting theme:system-preference-change event:', e);
    }
    
    // Trigger local event handlers
    this._triggerEvent('system-preference-change', {
      prefersDarkMode: event.matches,
      effectiveTheme: this.getEffectiveTheme()
    });
  },
  
  /**
   * Load saved theme preference with improved reliability
   * @private
   */
  _loadThemePreference() {
    try {
      console.log("Loading theme preference from storage...");
      
      // Always use 'theme' as the storage key for consistency
      this._storageKey = 'theme';
      
      // Try localStorage with our storage key
      const savedTheme = localStorage.getItem(this._storageKey);
      
      if (savedTheme && this._themes.includes(savedTheme)) {
        this._currentTheme = savedTheme;
        console.log(`Loaded saved theme preference: ${savedTheme}`);
        
        // Apply immediately for better UI consistency
        const effectiveTheme = this.getEffectiveTheme();
        document.documentElement.setAttribute('data-theme', effectiveTheme);
        document.documentElement.setAttribute('data-bs-theme', effectiveTheme);
        document.body.setAttribute('data-theme', effectiveTheme);
        
        return;
      }
      
      // No saved preference found, default to 'dark' for consistency
      // This is a change from the original behavior that defaulted to 'system'
      console.log("No saved theme preference found, defaulting to dark mode");
      this._currentTheme = 'dark';
      
      // Save this preference for future visits
      this._saveThemePreference('dark');
    } catch (e) {
      console.warn('Error loading theme preference from localStorage:', e);
      
      // Default to dark theme if there's an error
      this._currentTheme = 'dark';
      
      // Try to save the default
      try {
        localStorage.setItem(this._storageKey, this._currentTheme);
      } catch (error) {
        console.error('Error saving default theme preference:', error);
      }
    }
  },
  
  /**
   * Save theme preference with improved reliability
   * @private
   * @param {string} theme - Theme to save
   */
  _saveThemePreference(theme) {
    try {
      // Save to standard 'theme' key
      localStorage.setItem('theme', theme);
      console.log(`Saved theme preference: ${theme}`);
    } catch (e) {
      console.warn('Error saving theme preference to localStorage:', e);
    }
  },
  
  /**
   * Set up theme toggle button if it exists in the DOM
   * @private
   */
  _setupThemeToggleButton() {
    try {
      const darkModeToggle = document.getElementById('darkModeToggle');
      if (darkModeToggle) {
        // First update the button to match the current theme
        this._updateThemeToggleButton();
        
        // Add click event listener
        darkModeToggle.addEventListener('click', () => {
          this.toggleTheme();
        });
        
        console.log('Theme toggle button initialized');
      }
    } catch (error) {
      console.warn('Error setting up theme toggle button:', error);
    }
  },
  
  /**
   * Update theme toggle button to reflect current theme
   * @private
   */
  _updateThemeToggleButton() {
    try {
      const darkModeToggle = document.getElementById('darkModeToggle');
      if (!darkModeToggle) return;
      
      const isDark = this.getEffectiveTheme() === 'dark';
      const iconElement = darkModeToggle.querySelector('i');
      
      if (iconElement) {
        // Update icon class
        iconElement.className = isDark ? 'fas fa-sun fa-lg' : 'fas fa-moon fa-lg';
      } else {
        // If no icon element, recreate button content
        darkModeToggle.innerHTML = isDark ? 
          '<i class="fas fa-sun fa-lg"></i>' : 
          '<i class="fas fa-moon fa-lg"></i>';
      }
      
      // Update button title/tooltip
      darkModeToggle.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
      
      // Add/remove active class
      if (isDark) {
        darkModeToggle.classList.add('active');
      } else {
        darkModeToggle.classList.remove('active');
      }
    } catch (error) {
      console.warn('Error updating theme toggle button:', error);
    }
  },
  
  /**
   * Set up keyboard shortcut for theme toggle (Shift+Alt+T)
   * @private
   */
  _setupKeyboardShortcut() {
    try {
      document.addEventListener('keydown', (event) => {
        // Shift+Alt+T for theme toggle
        if (event.shiftKey && event.altKey && event.key === 'T') {
          this.toggleTheme();
          event.preventDefault();
        }
      });
    } catch (error) {
      console.warn('Error setting up keyboard shortcut:', error);
    }
  },
  
  /**
   * Set the active theme and ensure it persists
   * @param {string} theme - Theme name ('light', 'dark', 'system')
   * @returns {boolean} - Whether theme was set successfully
   */
  setTheme(theme) {
    if (!this._themes.includes(theme)) {
      console.error(`Invalid theme: ${theme}. Available themes: ${this._themes.join(', ')}`);
      return false;
    }
    
    try {
      console.log(`Setting theme to: ${theme}`);
      
      // Save current theme
      this._currentTheme = theme;
      
      // Save preference BEFORE applying the theme to ensure persistence
      this._saveThemePreference(theme);
      
      // Apply the theme
      this.applyCurrentTheme();
      
      // Update theme toggle button
      this._updateThemeToggleButton();
      
      // Emit event if eventRegistry is available
      try {
        if (window.eventRegistry && typeof window.eventRegistry.emit === 'function') {
          window.eventRegistry.emit('theme:change', {
            theme: theme,
            effectiveTheme: this.getEffectiveTheme()
          });
        }
      } catch (e) {
        // Ignore errors with event registry
        console.debug('Error emitting theme:change event:', e);
      }
      
      // Trigger local event handlers
      this._triggerEvent('theme-change', {
        theme: theme,
        effectiveTheme: this.getEffectiveTheme()
      });
      
      return true;
    } catch (error) {
      console.error('Error setting theme:', error);
      return false;
    }
  },
  
  /**
   * Get the current theme
   * @returns {string} - Current theme name
   */
  getTheme() {
    return this._currentTheme;
  },
  
  /**
   * Get the effective theme (resolves 'system' to actual theme)
   * @returns {string} - Effective theme ('light' or 'dark')
   */
  getEffectiveTheme() {
    if (this._currentTheme === 'system') {
      return this._getSystemTheme();
    }
    
    return this._currentTheme;
  },
  
  /**
   * Get the system theme preference
   * @private
   * @returns {string} - System theme ('light' or 'dark')
   */
  _getSystemTheme() {
    try {
      if (this._systemPreference && this._systemPreference.matches) {
        return 'dark';
      }
    } catch (error) {
      console.warn('Error getting system theme preference:', error);
    }
    
    return 'light';
  },
  
  /**
   * Apply the current theme to the document consistently
   * @returns {boolean} - Whether theme was applied successfully
   */
  applyCurrentTheme() {
    try {
      const effectiveTheme = this.getEffectiveTheme();
      
      // Set CSS variables
      this._applyCssVariables(effectiveTheme);
      
      // Set theme attribute on document for CSS selectors
      document.documentElement.setAttribute('data-theme', effectiveTheme);
      document.body.setAttribute('data-theme', effectiveTheme);
      
      // Always update Bootstrap 5 data-bs-theme for better framework compatibility
      document.documentElement.setAttribute('data-bs-theme', effectiveTheme);
      
      // Set class name on body
      document.body.className = document.body.className.replace(/theme-[^\s]+/g, '');
      document.body.classList.add(`theme-${effectiveTheme}`);
      
      // Update theme-specific elements in the DOM
      this._updateThemeElements(effectiveTheme);
      
      console.log(`Applied theme: ${effectiveTheme}`);
      return true;
    } catch (error) {
      console.error('Error applying theme:', error);
      return false;
    }
  },
  
  /**
   * Apply CSS variables for the theme
   * @private
   * @param {string} theme - Theme to apply
   */
  _applyCssVariables(theme) {
    try {
      const variables = this._themeVariables[theme];
      if (!variables) {
        console.warn(`No variables defined for theme: ${theme}`);
        return;
      }
      
      // Apply to :root
      const root = document.documentElement;
      
      for (const [variable, value] of Object.entries(variables)) {
        root.style.setProperty(variable, value);
      }
    } catch (error) {
      console.error('Error applying CSS variables:', error);
    }
  },
  
  /**
   * Update theme-specific elements in the DOM
   * @private
   * @param {string} theme - Theme to apply ('light' or 'dark')
   */
  _updateThemeElements(theme) {
    try {
      // Update favicon if it exists
      this._updateFavicon(theme);
      
      // Update theme toggle button
      this._updateThemeToggleButton();
      
      // Update logo if it has a theme-specific version
      const logoImage = document.querySelector('.header-container img');
      if (logoImage) {
        const currentSrc = logoImage.getAttribute('src');
        if (currentSrc) {
          // If logo path contains '_light' or '_dark', swap it
          if (theme === 'dark' && currentSrc.includes('_light')) {
            logoImage.setAttribute('src', currentSrc.replace('_light', '_dark'));
          } else if (theme === 'light' && currentSrc.includes('_dark')) {
            logoImage.setAttribute('src', currentSrc.replace('_dark', '_light'));
          }
        }
      }
      
      // Update charts if any charting libraries are detected
      this._updateCharts(theme);
    } catch (error) {
      console.warn('Error updating theme-specific elements:', error);
    }
  },
  
  /**
   * Update favicon for theme
   * @private
   * @param {string} theme - Current theme
   */
  _updateFavicon(theme) {
    try {
      const favicon = document.querySelector('link[rel="icon"]');
      if (!favicon) return;
      
      const currentHref = favicon.getAttribute('href');
      if (!currentHref) return;
      
      // If favicon path contains '_light' or '_dark', swap it
      if (theme === 'dark' && currentHref.includes('_light')) {
        favicon.setAttribute('href', currentHref.replace('_light', '_dark'));
      } else if (theme === 'light' && currentHref.includes('_dark')) {
        favicon.setAttribute('href', currentHref.replace('_dark', '_light'));
      }
    } catch (error) {
      console.warn('Error updating favicon:', error);
    }
  },
  
  /**
   * Update charts if any charting libraries are detected
   * @private
   * @param {string} theme - Current theme
   */
  _updateCharts(theme) {
    try {
      // Check if Chart.js is available
      if (typeof Chart !== 'undefined' && Chart.defaults) {
        // Update Chart.js defaults for the theme
        const isLightTheme = theme === 'light';
        
        Chart.defaults.color = isLightTheme ? '#666666' : '#dddddd';
        Chart.defaults.borderColor = isLightTheme ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)';
        
        // Set default grid line colors
        Chart.defaults.scale.grid.color = isLightTheme ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
        
        // Refresh all charts
        if (Chart.instances) {
          Object.values(Chart.instances).forEach(chart => {
            chart.update();
          });
        }
      }
      
      // Check if Recharts is available (React-based charts)
      if (window.document.querySelectorAll('.recharts-wrapper').length > 0) {
        // Emit an event that React components can listen for
        if (window.eventRegistry && typeof window.eventRegistry.emit === 'function') {
          window.eventRegistry.emit('theme:charts-update', {
            theme: theme
          });
        }
      }
    } catch (error) {
      console.warn('Error updating charts:', error);
    }
  },
  
  /**
   * Toggle between light and dark themes and ensure persistence
   * @returns {string} - New theme name
   */
  toggleTheme() {
    const currentTheme = this.getTheme();
    let newTheme;
    
    if (currentTheme === 'system') {
      // If system, toggle based on the effective theme
      newTheme = this.getEffectiveTheme() === 'dark' ? 'light' : 'dark';
    } else {
      // Otherwise toggle directly
      newTheme = currentTheme === 'light' ? 'dark' : 'light';
    }
    
    console.log(`Toggling theme from ${currentTheme} to ${newTheme}`);
    this.setTheme(newTheme);
    return newTheme;
  },
  
  /**
   * Check if dark mode is active
   * @returns {boolean} - Whether dark mode is active
   */
  isDarkMode() {
    return this.getEffectiveTheme() === 'dark';
  },
  
  /**
   * Add a custom theme
   * @param {string} name - Theme name
   * @param {Object} variables - Theme CSS variables
   * @returns {boolean} - Whether theme was added successfully
   */
  addTheme(name, variables) {
    if (this._themes.includes(name)) {
      console.warn(`Theme ${name} already exists. Use updateTheme to modify.`);
      return false;
    }
    
    try {
      // Add theme to available themes
      this._themes.push(name);
      
      // Add theme variables
      this._themeVariables[name] = variables;
      
      console.log(`Added custom theme: ${name}`);
      return true;
    } catch (error) {
      console.error('Error adding custom theme:', error);
      return false;
    }
  },
  
  /**
   * Update a theme's variables
   * @param {string} name - Theme name
   * @param {Object} variables - Theme CSS variables
   * @returns {boolean} - Whether theme was updated successfully
   */
  updateTheme(name, variables) {
    if (!this._themes.includes(name)) {
      console.error(`Theme ${name} does not exist.`);
      return false;
    }
    
    try {
      // Update theme variables
      this._themeVariables[name] = {
        ...this._themeVariables[name] || {},
        ...variables
      };
      
      // Re-apply if this is the current theme
      if (this.getEffectiveTheme() === name) {
        this.applyCurrentTheme();
      }
      
      console.log(`Updated theme: ${name}`);
      return true;
    } catch (error) {
      console.error('Error updating theme:', error);
      return false;
    }
  },
  
  /**
   * Get available themes
   * @returns {Array<string>} - List of available themes
   */
  getAvailableThemes() {
    return [...this._themes];
  },
  
  /**
   * Get theme variables for a theme
   * @param {string} theme - Theme name
   * @returns {Object} - Theme variables
   */
  getThemeVariables(theme) {
    const effectiveTheme = theme || this.getEffectiveTheme();
    return { ...this._themeVariables[effectiveTheme] };
  },
  
  /**
   * Reset to default theme
   * @returns {boolean} - Whether reset was successful
   */
  resetToDefault() {
    try {
      // Reset to dark theme (changed from system for better consistency)
      this._currentTheme = 'dark';
      this._saveThemePreference(this._currentTheme);
      this.applyCurrentTheme();
      
      console.log('Reset to default theme (dark)');
      return true;
    } catch (error) {
      console.error('Error resetting to default theme:', error);
      return false;
    }
  },
  
  /**
   * Add an event listener for theme changes
   * @param {string} event - Event name
   * @param {Function} callback - Event callback
   * @returns {Function} - Function to remove the listener
   */
  addEventListener(event, callback) {
    if (typeof callback !== 'function') {
      console.error('Event callback must be a function');
      return () => {};
    }
    
    if (!this._eventHandlers[event]) {
      this._eventHandlers[event] = [];
    }
    
    this._eventHandlers[event].push(callback);
    
    // Return a function to remove the listener
    return () => {
      this.removeEventListener(event, callback);
    };
  },
  
  /**
   * Remove an event listener
   * @param {string} event - Event name
   * @param {Function} callback - Event callback to remove
   * @returns {boolean} - Whether removal was successful
   */
  removeEventListener(event, callback) {
    if (!this._eventHandlers[event]) {
      return false;
    }
    
    const index = this._eventHandlers[event].indexOf(callback);
    if (index !== -1) {
      this._eventHandlers[event].splice(index, 1);
      return true;
    }
    
    return false;
  },
  
  /**
   * Trigger event handlers for a specific event
   * @private
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  _triggerEvent(event, data) {
    if (!this._eventHandlers[event]) {
      return;
    }
    
    for (const callback of this._eventHandlers[event]) {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in theme manager event listener (${event}):`, error);
      }
    }
  },
  
  /**
   * Set whether to integrate with Bootstrap's theme system
   * @param {boolean} enable - Whether to enable integration
   */
  setBootstrapIntegration(enable) {
    this._bootstrapIntegration = enable;
    this.applyCurrentTheme(); // Re-apply theme to update integration
  },
  
  /**
   * Apply high contrast mode for accessibility
   * @param {boolean} enable - Whether to enable high contrast
   * @returns {boolean} - Whether the operation was successful
   */
  setHighContrastMode(enable) {
    try {
      if (enable) {
        // Apply high contrast overrides to current theme
        const baseTheme = this.getEffectiveTheme();
        const highContrastOverrides = {
          // Enhanced contrast variables
          '--text-color': baseTheme === 'dark' ? '#ffffff' : '#000000',
          '--bg-color': baseTheme === 'dark' ? '#000000' : '#ffffff',
          '--link-color': baseTheme === 'dark' ? '#ffff00' : '#0000ff',
          '--link-hover-color': baseTheme === 'dark' ? '#ffdd00' : '#000099',
          '--border-color': baseTheme === 'dark' ? '#ffffff' : '#000000',
          '--shadow-sm': 'none',
          '--shadow-md': 'none',
          '--shadow-lg': 'none',
          // Add focus indicators
          '--input-focus-border-color': baseTheme === 'dark' ? '#ffff00' : '#0000ff',
          '--input-focus-shadow': baseTheme === 'dark' ? 'rgba(255, 255, 0, 0.5)' : 'rgba(0, 0, 255, 0.5)'
        };
        
        // Apply overrides to root element
        const root = document.documentElement;
        for (const [variable, value] of Object.entries(highContrastOverrides)) {
          root.style.setProperty(variable, value);
        }
        
        // Add high contrast class to body
        document.body.classList.add('high-contrast-mode');
      } else {
        // Remove high contrast class
        document.body.classList.remove('high-contrast-mode');
        
        // Re-apply the current theme to reset variables
        this.applyCurrentTheme();
      }
      
      return true;
    } catch (error) {
      console.error('Error setting high contrast mode:', error);
      return false;
    }
  },

  /**
   * Check if high contrast mode is enabled
   * @returns {boolean} - Whether high contrast mode is enabled
   */
  isHighContrastMode() {
    return document.body.classList.contains('high-contrast-mode');
  },

  /**
     * Set font size scale for accessibility
     * @param {string} scale - Font size scale ('normal', 'large', 'x-large')
     * @returns {boolean} - Whether the operation was successful
     */
  setFontSizeScale(scale) {
    try {
      // First remove any existing font scale classes
      document.body.classList.remove('font-size-normal', 'font-size-large', 'font-size-x-large');
      
      // Add the new font scale class
      if (scale === 'large' || scale === 'x-large') {
        document.body.classList.add(`font-size-${scale}`);
      } else {
        // Default to normal
        document.body.classList.add('font-size-normal');
      }
      
      // Store the preference
      try {
        localStorage.setItem('font_size_scale', scale);
      } catch (e) {
        console.warn('Error saving font size preference:', e);
      }
      
      return true;
    } catch (error) {
      console.error('Error setting font size scale:', error);
      return false;
    }
  },

  /**
   * Load an external theme file
   * @param {string} url - URL to theme file
   * @returns {Promise<boolean>} - Whether the theme was loaded
   */
  async loadExternalTheme(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load theme: ${response.status} ${response.statusText}`);
      }
      
      const themeData = await response.json();
      
      // Validate theme data
      if (!themeData.name || !themeData.variables) {
        throw new Error('Invalid theme format: missing name or variables');
      }
      
      // Add theme
      this.addTheme(themeData.name, themeData.variables);
      
      // Apply theme if specified
      if (themeData.apply) {
        this.setTheme(themeData.name);
      }
      
      console.log(`Loaded external theme: ${themeData.name}`);
      return true;
    } catch (error) {
      console.error('Error loading external theme:', error);
      return false;
    }
  },

  /**
   * Export current theme as JSON
   * @param {string} [themeName] - Optional theme name to export (defaults to current theme)
   * @returns {Object} - Theme data object
   */
  exportTheme(themeName) {
    const theme = themeName || this.getEffectiveTheme();
    if (!this._themeVariables[theme]) {
      console.error(`Theme ${theme} does not exist`);
      return null;
    }
    
    return {
      name: theme,
      variables: { ...this._themeVariables[theme] },
      exportDate: new Date().toISOString(),
      version: '1.0'
    };
  },

  /**
   * Update theme toggle icon based on OS preference
   * @param {string} iconFamily - Icon family name ('fas', 'far', etc.)
   * @returns {boolean} - Whether update was successful
   */
  useCustomThemeIcons(iconFamily) {
    try {
      const darkModeToggle = document.getElementById('darkModeToggle');
      if (!darkModeToggle) return false;
      
      const iconElement = darkModeToggle.querySelector('i');
      if (!iconElement) return false;
      
      // Get current icon classes
      const classNames = iconElement.className.split(' ');
      
      // Find current icon family (fas, far, etc.)
      const currentFamily = classNames.find(cls => cls.startsWith('fa') && cls !== 'fa-lg' && cls !== 'fa-sun' && cls !== 'fa-moon');
      
      // Replace icon family if it's different
      if (currentFamily && currentFamily !== iconFamily) {
        iconElement.classList.remove(currentFamily);
        iconElement.classList.add(iconFamily);
        
        console.log(`Updated theme icon family to: ${iconFamily}`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error updating theme icons:', error);
      return false;
    }
  },

  /**
   * Apply a theme transition effect
   * @param {number} [duration=300] - Transition duration in milliseconds
   * @returns {boolean} - Whether transition was applied
   */
  applyThemeTransition(duration = 300) {
    try {
      // Create a style element for transitions
      const style = document.createElement('style');
      style.innerHTML = `
        body, body * {
          transition: background-color ${duration}ms ease, color ${duration}ms ease, 
                    border-color ${duration}ms ease, box-shadow ${duration}ms ease !important;
        }
      `;
      document.head.appendChild(style);
      
      // Remove the style after transition completes
      setTimeout(() => {
        document.head.removeChild(style);
      }, duration + 50);
      
      return true;
    } catch (error) {
      console.error('Error applying theme transition:', error);
      return false;
    }
  },

  /**
   * Check if theme is supported by the browser
   * @returns {boolean} - Whether theme features are supported
   */
  isThemeSupported() {
    try {
      // Check for CSS custom properties support
      const isCSSVarsSupported = window.CSS && window.CSS.supports && window.CSS.supports('--a', '0');
      
      // Check for localStorage support
      const isLocalStorageSupported = (() => {
        try {
          localStorage.setItem('test', 'test');
          localStorage.removeItem('test');
          return true;
        } catch (e) {
          return false;
        }
      })();
      
      // Check for media query support
      const isMediaQuerySupported = typeof window.matchMedia === 'function';
      
      return isCSSVarsSupported && isLocalStorageSupported && isMediaQuerySupported;
    } catch (error) {
      console.error('Error checking theme support:', error);
      return false;
    }
  },

  /**
   * Reset all custom theme preferences
   * @returns {boolean} - Whether reset was successful
   */
  resetAllPreferences() {
    try {
      // Reset to dark theme (changed from system)
      this._currentTheme = 'dark';
      
      // Remove high contrast mode
      document.body.classList.remove('high-contrast-mode');
      
      // Reset font size
      this.setFontSizeScale('normal');
      
      // Clear localStorage preferences
      localStorage.removeItem(this._storageKey);
      localStorage.removeItem('font_size_scale');
      
      // Save the dark theme preference
      this._saveThemePreference('dark');
      
      // Apply default theme
      this.applyCurrentTheme();
      
      // Emit event
      if (window.eventRegistry && typeof window.eventRegistry.emit === 'function') {
        window.eventRegistry.emit('theme:reset', {
          timestamp: new Date().toISOString()
        });
      }
      
      // Trigger local event handlers
      this._triggerEvent('preferences-reset', {
        timestamp: new Date().toISOString()
      });
      
      console.log('All theme preferences reset to defaults');
      return true;
    } catch (error) {
      console.error('Error resetting theme preferences:', error);
      return false;
    }
  }
  };


  
// Export both default and named exports
export default themeManager;
export const setTheme = themeManager.setTheme.bind(themeManager);
export const getTheme = themeManager.getTheme.bind(themeManager);
export const getEffectiveTheme = themeManager.getEffectiveTheme.bind(themeManager);
export const toggleTheme = themeManager.toggleTheme.bind(themeManager);
export const isDarkMode = themeManager.isDarkMode.bind(themeManager);
export const addTheme = themeManager.addTheme.bind(themeManager);
export const updateTheme = themeManager.updateTheme.bind(themeManager);
export const getAvailableThemes = themeManager.getAvailableThemes.bind(themeManager);
export const applyCurrentTheme = themeManager.applyCurrentTheme.bind(themeManager);
export const initialize = themeManager.initialize.bind(themeManager);
export const setHighContrastMode = themeManager.setHighContrastMode.bind(themeManager);
export const isHighContrastMode = themeManager.isHighContrastMode.bind(themeManager);
export const setFontSizeScale = themeManager.setFontSizeScale.bind(themeManager);
export const getThemeVariables = themeManager.getThemeVariables.bind(themeManager);
export const resetToDefault = themeManager.resetToDefault.bind(themeManager);
export const addEventListener = themeManager.addEventListener.bind(themeManager);
export const removeEventListener = themeManager.removeEventListener.bind(themeManager);
export const setBootstrapIntegration = themeManager.setBootstrapIntegration.bind(themeManager);
export const loadExternalTheme = themeManager.loadExternalTheme.bind(themeManager);
export const exportTheme = themeManager.exportTheme.bind(themeManager);
export const isThemeSupported = themeManager.isThemeSupported.bind(themeManager);
export const resetAllPreferences = themeManager.resetAllPreferences.bind(themeManager);