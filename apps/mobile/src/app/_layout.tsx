import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { AutoSyncController } from '@/components/AutoSyncController';
import { ThemeProvider, useTheme } from '@/theme';
import { useWorkspaceStore } from '@/store/workspace';

function RootNavigator() {
  const { colors } = useTheme();
  const initialize = useWorkspaceStore((state) => state.initialize);
  useEffect(() => {
    void initialize();
  }, [initialize]);

  return (
    <>
      <AutoSyncController />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.navigation },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="note/[id]" options={{ title: '', headerBackTitle: 'Notes' }} />
        <Stack.Screen name="folder/[id]" options={{ title: 'Folder' }} />
        <Stack.Screen name="git" options={{ title: 'Git sync' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <KeyboardProvider>
      <ThemeProvider><RootNavigator /></ThemeProvider>
    </KeyboardProvider>
  );
}
