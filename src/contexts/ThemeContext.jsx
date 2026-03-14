import { createContext, useContext, useEffect } from 'react';
import { useAuth } from './AuthContext';

const ThemeContext = createContext(null);

const THEMES = {
  bright: {
    name: 'Bright',
    class: 'theme-bright',
  },
  dark: {
    name: 'Dark',
    class: 'theme-dark',
  },
  comfort: {
    name: 'Eye Comfort',
    class: 'theme-comfort',
  },
};

export function ThemeProvider({ children }) {
  const { user, updateTheme } = useAuth();
  const currentTheme = user?.theme || 'dark';

  useEffect(() => {
    const root = document.documentElement;
    // Remove all theme classes
    Object.values(THEMES).forEach(t => root.classList.remove(t.class));
    // Add current theme class
    const theme = THEMES[currentTheme];
    if (theme) {
      root.classList.add(theme.class);
    } else {
      root.classList.add('theme-dark');
    }
  }, [currentTheme]);

  const setTheme = async (themeKey) => {
    await updateTheme(themeKey);
  };

  const value = {
    currentTheme,
    themes: THEMES,
    setTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
