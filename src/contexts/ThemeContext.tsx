import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ThemeMode, TerminalTheme, AppSettings } from '../types';

interface ThemeContextType {
  theme: ThemeMode;
  isDark: boolean;
  terminalTheme: TerminalTheme;
  settings: AppSettings | null;
  setTheme: (mode: ThemeMode) => void;
  setTerminalTheme: (theme: TerminalTheme) => void;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>('system');
  const [isDark, setIsDark] = useState<boolean>(true);
  const [terminalTheme, setTerminalThemeState] = useState<TerminalTheme>('dark');
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    // Load initial settings
    if (window.api?.store?.getSettings) {
      window.api.store.getSettings().then((s) => {
        setSettings(s);
        setThemeState(s.theme || 'system');
        setTerminalThemeState(s.terminalTheme || 'dark');
      });
    }

    // Check system theme
    if (window.api?.system?.getTheme) {
      window.api.system.getTheme().then((curr) => {
        if (theme === 'system') {
          setIsDark(curr === 'dark');
        }
      });
    }

    // Subscribe to system theme changes
    if (window.api?.system?.onThemeChange) {
      const unsubscribe = window.api.system.onThemeChange((sysDark) => {
        if (theme === 'system') {
          setIsDark(sysDark);
        }
      });
      return () => {
        unsubscribe();
      };
    }
  }, [theme]);

  useEffect(() => {
    let effectiveDark = false;
    if (theme === 'system') {
      // Query system preference in DOM
      effectiveDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } else {
      effectiveDark = theme === 'dark';
    }

    setIsDark(effectiveDark);
    const root = document.documentElement;
    if (effectiveDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  const setTheme = async (mode: ThemeMode) => {
    setThemeState(mode);
    if (window.api?.system?.setThemeSource) {
      await window.api.system.setThemeSource(mode);
    }
    if (window.api?.store?.saveSettings) {
      await window.api.store.saveSettings({ theme: mode });
    }
    if (settings) {
      setSettings({ ...settings, theme: mode });
    }
  };

  const setTerminalTheme = async (tt: TerminalTheme) => {
    setTerminalThemeState(tt);
    if (window.api?.store?.saveSettings) {
      await window.api.store.saveSettings({ terminalTheme: tt });
    }
    if (settings) {
      setSettings({ ...settings, terminalTheme: tt });
    }
  };

  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    if (window.api?.store?.saveSettings) {
      await window.api.store.saveSettings(newSettings);
      const updated = await window.api.store.getSettings();
      setSettings(updated);
      if (newSettings.theme) setThemeState(newSettings.theme);
      if (newSettings.terminalTheme) setTerminalThemeState(newSettings.terminalTheme);
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark,
        terminalTheme,
        settings,
        setTheme,
        setTerminalTheme,
        updateSettings,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};
