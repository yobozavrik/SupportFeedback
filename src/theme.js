const THEME_STORAGE_KEY = 'gala-theme';

const getStoredTheme = () => {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch (error) {
    console.warn('Unable to read stored theme preference.', error);
    return null;
  }
};

const storeTheme = (theme) => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    console.warn('Unable to persist theme preference.', error);
  }
};

export function createThemeManager({ toggleButton, sunIcon, moonIcon, label, prefersDarkMedia } = {}) {
  const applyTheme = (theme, options = {}) => {
    const { persist = true } = options;
    const themeToApply = theme === 'dark' ? 'dark' : 'light';
    const root = document.documentElement;
    const isDark = themeToApply === 'dark';

    root.classList.toggle('dark', isDark);

    if (toggleButton) {
      toggleButton.setAttribute('aria-pressed', String(isDark));
    }
    if (sunIcon && moonIcon) {
      sunIcon.classList.toggle('hidden', !isDark);
      moonIcon.classList.toggle('hidden', isDark);
    }
    if (label) {
      label.textContent = isDark ? 'Світла тема' : 'Темна тема';
    }

    if (persist) {
      storeTheme(themeToApply);
    }
  };

  const initialize = () => {
    const storedTheme = getStoredTheme();
    if (storedTheme === 'dark' || storedTheme === 'light') {
      applyTheme(storedTheme, { persist: false });
    } else {
      const prefersDark = prefersDarkMedia ? prefersDarkMedia.matches : false;
      applyTheme(prefersDark ? 'dark' : 'light', { persist: false });
    }

    if (toggleButton) {
      toggleButton.addEventListener('click', () => {
        const nextTheme = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
        applyTheme(nextTheme);
      });
    }

    if (prefersDarkMedia) {
      const syncWithSystem = (event) => {
        if (!getStoredTheme()) {
          applyTheme(event.matches ? 'dark' : 'light', { persist: false });
        }
      };

      if (typeof prefersDarkMedia.addEventListener === 'function') {
        prefersDarkMedia.addEventListener('change', syncWithSystem);
      } else if (typeof prefersDarkMedia.addListener === 'function') {
        prefersDarkMedia.addListener(syncWithSystem);
      }
    }
  };

  return { initialize, applyTheme };
}
