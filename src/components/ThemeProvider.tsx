import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
type GlassStyle = 'liquid' | 'opaque';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  glassStyle: GlassStyle;
  setGlassStyle: (style: GlassStyle) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [glassStyle, setGlassStyle] = useState<GlassStyle>('liquid');

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  const value = {
    theme,
    setTheme,
    glassStyle,
    setGlassStyle,
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
