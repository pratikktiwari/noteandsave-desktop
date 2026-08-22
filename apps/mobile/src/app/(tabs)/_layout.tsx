import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';

const icons = {
  index: ['document-text-outline', 'document-text'] as const,
  search: ['search-outline', 'search'] as const,
  folders: ['folder-outline', 'folder'] as const,
  settings: ['settings-outline', 'settings'] as const,
};

export default function TabLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.navigation },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarStyle: {
          backgroundColor: colors.navigation,
          borderTopColor: colors.border,
          height: 62 + insets.bottom,
          paddingTop: 7,
          paddingBottom: Math.max(insets.bottom, 7),
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, focused, size }) => {
          const pair = icons[route.name as keyof typeof icons] ?? icons.index;
          return <Ionicons name={pair[focused ? 1 : 0]} color={color} size={size} />;
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: 'Notes', headerTitle: 'Note & Save' }} />
      <Tabs.Screen name="search" options={{ title: 'Search' }} />
      <Tabs.Screen name="folders" options={{ title: 'Folders' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
