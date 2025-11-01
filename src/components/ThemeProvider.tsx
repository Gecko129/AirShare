import { createContext, useContext, useEffect, useMemo, useState } from 'react';

 type Theme = 'light' | 'dark';
 type GlassStyle = 'liquid' | 'opaque';
 
 interface ThemeContextType {
   theme: Theme;
   setTheme: (theme: Theme) => void;
   glassStyle: GlassStyle;
   setGlassStyle: (style: GlassStyle) => void;
 }
 
 const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
 
 // Key used to persist the user-selected theme
 const THEME_STORAGE_KEY = 'airshare-theme';
 
 function getInitialTheme(): Theme {
   try {
     const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
     if (stored === 'light' || stored === 'dark') return stored;
     const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
     return prefersDark ? 'dark' : 'light';
   } catch {
     return 'light';
   }
 }
 
 export function ThemeProvider({ children }: { children: React.ReactNode }) {
   const [theme, setThemeState] = useState<Theme>(getInitialTheme);
   const [glassStyle, setGlassStyle] = useState<GlassStyle>('liquid');
 
   // Apply theme class to <html> and persist the choice
   useEffect(() => {
     const root = window.document.documentElement;
     root.classList.remove('light', 'dark');
     root.classList.add(theme);
     try {
       localStorage.setItem(THEME_STORAGE_KEY, theme);
     } catch {}
   }, [theme]);
 
   const setTheme = (t: Theme) => setThemeState(t);
 
   const value = useMemo(
     () => ({
       theme,
       setTheme,
       glassStyle,
       setGlassStyle,
     }),
     [theme, glassStyle],
   );
 
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
