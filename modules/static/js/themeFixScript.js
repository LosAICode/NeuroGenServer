/**
 * Theme Persistence Fix for NeuroGen Server
 * 
 * This script ensures theme settings persist correctly across page refreshes.
 * It should be included at the top of your HTML file, before other scripts.
 */

(function() {
  // Apply theme immediately to prevent flash of wrong theme
  function applyThemeImmediately() {
    try {
      // Always force 'dark' as the default theme
      const preferredTheme = localStorage.getItem('theme') || 'dark';
      
      // Ensure theme is saved in localStorage
      if (!localStorage.getItem('theme')) {
        localStorage.setItem('theme', 'dark');
        console.log("No theme setting found, defaulting to dark theme");
      }

      // Apply theme attributes to document
      document.documentElement.setAttribute('data-theme', preferredTheme);
      document.documentElement.setAttribute('data-bs-theme', preferredTheme);
      
      console.log(`Theme set to ${preferredTheme} before page load`);
    } catch (e) {
      console.error("Error in early theme application:", e);
    }
  }

  // Apply theme before DOM loads to prevent theme flicker
  applyThemeImmediately();

  // Also apply when the DOM is ready
  document.addEventListener('DOMContentLoaded', function() {
    try {
      // Get theme preference again (in case it changed)
      const theme = localStorage.getItem('theme') || 'dark';
      
      // Apply to body (can only be done after DOM is ready)
      document.body.setAttribute('data-theme', theme);
      
      // Add theme class to body
      document.body.className = document.body.className.replace(/theme-[^\s]+/g, '');
      document.body.classList.add(`theme-${theme}`);
      
      // Handle theme toggle button
      const darkModeToggle = document.getElementById('darkModeToggle');
      if (darkModeToggle) {
        // Set correct icon based on current theme
        const isDark = theme === 'dark';
        darkModeToggle.innerHTML = isDark ? 
          '<i class="fas fa-sun fa-lg"></i>' : 
          '<i class="fas fa-moon fa-lg"></i>';
        darkModeToggle.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
        
        // Add manual click handler for theme toggle that ensures persistence
        if (!darkModeToggle._hasThemePersistenceHandler) {
          darkModeToggle.addEventListener('click', function() {
            // Get current theme
            const currentTheme = localStorage.getItem('theme') || 'dark';
            // Toggle to opposite theme
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            
            // Save new theme to localStorage BEFORE making any DOM changes
            localStorage.setItem('theme', newTheme);
            console.log(`Theme manually changed to: ${newTheme}`);
            
            // Apply theme changes
            document.documentElement.setAttribute('data-theme', newTheme);
            document.documentElement.setAttribute('data-bs-theme', newTheme);
            document.body.setAttribute('data-theme', newTheme);
            
            // Update body class
            document.body.className = document.body.className.replace(/theme-[^\s]+/g, '');
            document.body.classList.add(`theme-${newTheme}`);
            
            // Update icon
            const isDark = newTheme === 'dark';
            this.innerHTML = isDark ? 
              '<i class="fas fa-sun fa-lg"></i>' : 
              '<i class="fas fa-moon fa-lg"></i>';
            this.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
            
            // Notify themeManager if available (non-blocking)
            setTimeout(() => {
              try {
                if (window.themeManager && typeof window.themeManager.setTheme === 'function') {
                  window.themeManager.setTheme(newTheme);
                }
              } catch (error) {
                console.warn("Could not notify themeManager of manual theme change:", error);
              }
            }, 0);
          });
          darkModeToggle._hasThemePersistenceHandler = true;
        }
      }
      
      console.log("Theme persistence handler fully initialized");
    } catch (e) {
      console.error("Error setting up theme persistence:", e);
    }
  });
})();