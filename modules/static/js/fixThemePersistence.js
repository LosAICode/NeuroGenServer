/**
 * Theme Persistence Fix for NeuroGen Server
 * 
 * This script fixes the theme persistence issues by:
 * 1. Setting dark theme as the default
 * 2. Ensuring theme selections are properly saved to localStorage
 * 3. Overriding any attempts to change the theme without saving it
 * 4. Applying the theme immediately on page load
 * 
 * Usage: Include this script in your HTML before other scripts
 */

(function() {
  // Configuration
  const DEFAULT_THEME = 'dark';
  const STORAGE_KEY = 'theme';
  
  // Apply theme immediately to prevent flash of wrong theme
  function applyThemeImmediately() {
    try {
      // Get saved theme with default to dark
      const savedTheme = localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
      
      // Always ensure theme is saved, even if we're using the default
      if (!localStorage.getItem(STORAGE_KEY)) {
        localStorage.setItem(STORAGE_KEY, DEFAULT_THEME);
        console.log(`No theme setting found, saving default: ${DEFAULT_THEME}`);
      }

      // Apply theme attributes to document
      document.documentElement.setAttribute('data-theme', savedTheme);
      document.documentElement.setAttribute('data-bs-theme', savedTheme);
      
      console.log(`Theme applied before page load: ${savedTheme}`);
    } catch (e) {
      console.error("Error in early theme application:", e);
    }
  }

  // Apply theme immediately to prevent flash of wrong style
  applyThemeImmediately();
  
  // Ensure theme is properly applied when DOM is loaded
  document.addEventListener('DOMContentLoaded', function() {
    setupThemePersistence();
  });
  
  // Function to set up persistence mechanisms
  function setupThemePersistence() {
    try {
      // Get current theme (with default)
      const currentTheme = localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
      
      // Apply theme to body and other elements
      applyThemeToAllElements(currentTheme);
      
      // Override themeManager method if it exists or will exist
      overrideThemeManager();
      
      // Set up event listener for theme toggle button
      setupThemeToggleButton();
      
      console.log("Theme persistence mechanisms initialized");
    } catch (e) {
      console.error("Error setting up theme persistence:", e);
    }
  }
  
  // Apply theme to all relevant elements
  function applyThemeToAllElements(theme) {
    // Apply to html element
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-bs-theme', theme);
    
    // Apply to body
    document.body.setAttribute('data-theme', theme);
    
    // Update body classes
    document.body.className = document.body.className.replace(/theme-[^\s]+/g, '');
    document.body.classList.add(`theme-${theme}`);
    
    // Update theme toggle icon if it exists
    updateThemeToggleIcon(theme);
  }
  
  // Update theme toggle button icon
  function updateThemeToggleIcon(theme) {
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (!darkModeToggle) return;
    
    const isDark = theme === 'dark';
    
    // Update icon
    darkModeToggle.innerHTML = isDark ? 
      '<i class="fas fa-sun fa-lg"></i>' : 
      '<i class="fas fa-moon fa-lg"></i>';
    
    // Update tooltip
    darkModeToggle.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  }
  
  // Set up theme toggle button with persistence
  function setupThemeToggleButton() {
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (!darkModeToggle) return;
    
    // Remove any existing click handlers by cloning and replacing
    const newToggle = darkModeToggle.cloneNode(true);
    darkModeToggle.parentNode.replaceChild(newToggle, darkModeToggle);
    
    // Add our reliable handler
    newToggle.addEventListener('click', function() {
      // Get current theme
      const currentTheme = localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
      // Toggle to opposite theme
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      
      // Save to localStorage FIRST
      localStorage.setItem(STORAGE_KEY, newTheme);
      console.log(`Theme toggled to: ${newTheme}`);
      
      // Apply theme to all elements
      applyThemeToAllElements(newTheme);
      
      // Update themeManager if it exists
      if (window.themeManager && typeof window.themeManager.setTheme === 'function') {
        try {
          window.themeManager.setTheme(newTheme);
        } catch (e) {
          console.warn("Error notifying themeManager:", e);
        }
      }
    });
  }
  
  // Override themeManager methods when it's available
  function overrideThemeManager() {
    // Wait for themeManager to be defined
    const checkInterval = setInterval(function() {
      if (window.themeManager) {
        clearInterval(checkInterval);
        
        console.log("Found themeManager, adding persistence overrides");
        
        // Save original methods
        const originalSetTheme = window.themeManager.setTheme;
        const originalToggleTheme = window.themeManager.toggleTheme;
        const originalLoadPreference = window.themeManager._loadThemePreference;
        
        // Override setTheme to ensure localStorage persistence
        window.themeManager.setTheme = function(theme) {
          // Save theme to localStorage FIRST
          localStorage.setItem(STORAGE_KEY, theme);
          console.log(`Theme set via themeManager to: ${theme}`);
          
          // Call original method
          return originalSetTheme.call(window.themeManager, theme);
        };
        
        // Override toggleTheme to ensure localStorage persistence
        window.themeManager.toggleTheme = function() {
          const currentTheme = window.themeManager.getTheme();
          let newTheme;
          
          if (currentTheme === 'system') {
            newTheme = window.themeManager.getEffectiveTheme() === 'dark' ? 'light' : 'dark';
          } else {
            newTheme = currentTheme === 'dark' ? 'dark' : 'light';
          }
          
          // Save to localStorage FIRST
          localStorage.setItem(STORAGE_KEY, newTheme);
          console.log(`Theme toggled via themeManager to: ${newTheme}`);
          
          // Call original method
          return originalToggleTheme.call(window.themeManager);
        };
        
        // Override _loadThemePreference to always use 'theme' key and default to dark
        window.themeManager._loadThemePreference = function() {
          try {
            // Force storage key to be 'theme'
            window.themeManager._storageKey = STORAGE_KEY;
            
            // Get theme from localStorage, default to dark
            const savedTheme = localStorage.getItem(STORAGE_KEY);
            
            if (savedTheme && window.themeManager._themes.includes(savedTheme)) {
              window.themeManager._currentTheme = savedTheme;
              console.log(`Loaded theme from localStorage: ${savedTheme}`);
            } else {
              // No valid theme found, default to dark
              window.themeManager._currentTheme = DEFAULT_THEME;
              // Save default theme
              localStorage.setItem(STORAGE_KEY, DEFAULT_THEME);
              console.log(`No valid theme found, defaulted to: ${DEFAULT_THEME}`);
            }
          } catch (e) {
            console.warn("Error in overridden _loadThemePreference:", e);
            window.themeManager._currentTheme = DEFAULT_THEME;
            try {
              localStorage.setItem(STORAGE_KEY, DEFAULT_THEME);
            } catch (saveError) {
              console.error("Failed to save default theme:", saveError);
            }
          }
        };
        
        // Force load preferences now
        window.themeManager._loadThemePreference();
        
        // Apply the theme
        window.themeManager.applyCurrentTheme();
      }
    }, 100);
    
    // Stop checking after 10 seconds
    setTimeout(function() {
      clearInterval(checkInterval);
    }, 10000);
  }
})();