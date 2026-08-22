import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';

const light = {
  background: '#fffdfc',
  navigation: '#fffdf7',
  elevated: '#ffffff',
  hover: '#faf5ef',
  text: '#272320',
  muted: '#7a6a5a',
  faint: '#a99080',
  border: '#e5ddd0',
  accent: '#694111',
  accentSoft: '#f7ece5',
  accentSofter: '#f7ecd9',
  danger: '#b42318',
  overlay: 'rgba(48, 43, 38, 0.5)',
  code: '#f7ece5',
};

const dark = {
  background: 'hsl(224, 10%, 10%)',
  navigation: 'hsl(224, 14%, 16%)',
  elevated: 'hsl(224, 12%, 14%)',
  hover: 'hsl(224, 10%, 18%)',
  text: 'hsl(224, 6%, 88%)',
  muted: 'hsl(224, 6%, 65%)',
  faint: 'hsl(224, 6%, 45%)',
  border: 'hsl(224, 10%, 22%)',
  accent: '#e8a96a',
  accentSoft: 'hsl(224, 10%, 16%)',
  accentSofter: 'hsl(224, 10%, 19%)',
  danger: '#f97066',
  overlay: 'rgba(14, 15, 18, 0.72)',
  code: 'hsl(224, 10%, 16%)',
};

export type ThemeColors = typeof light;

interface ThemeContextValue {
  colors: ThemeColors;
  isDark: boolean;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const THEME_KEY = 'noteandsave.theme';

export function ThemeProvider({ children }: React.PropsWithChildren) {
  const getScheme = () => {
    const scheme = Appearance.getColorScheme();
    return scheme === 'light' || scheme === 'dark' ? scheme : null;
  };
  const [systemScheme, setSystemScheme] = useState<'light' | 'dark' | null>(getScheme);
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    void AsyncStorage.getItem(THEME_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') setPreferenceState(stored);
    });
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme === 'light' || colorScheme === 'dark' ? colorScheme : null);
    });
    return () => subscription.remove();
  }, []);

  const setPreference = async (next: ThemePreference) => {
    setPreferenceState(next);
    await AsyncStorage.setItem(THEME_KEY, next);
  };

  const isDark = preference === 'dark' || (preference === 'system' && systemScheme === 'dark');
  const value = useMemo(
    () => ({ colors: isDark ? dark : light, isDark, preference, setPreference }),
    [isDark, preference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider');
  return value;
}

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;
