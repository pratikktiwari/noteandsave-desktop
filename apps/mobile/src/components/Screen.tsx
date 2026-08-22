import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';

export function Screen({ children, style, ...props }: ViewProps) {
  const { colors, isDark } = useTheme();
  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.safe, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={[styles.content, style]} {...props}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1 },
});
