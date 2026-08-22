import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { radius, spacing, type ThemePreference, useTheme } from '@/theme';
import { workspacePath } from '@/workspace/repository';

const options: Array<{ value: ThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { colors, preference, setPreference } = useTheme();
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.sectionTitle, { color: colors.muted }]}>Appearance</Text>
        <View style={[styles.card, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
          <View style={styles.themeRow}>
            {options.map((option) => {
              const selected = option.value === preference;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => void setPreference(option.value)}
                  style={[styles.themeOption, { backgroundColor: selected ? colors.accentSoft : colors.background, borderColor: selected ? colors.accent : colors.border }]}
                >
                  <Text style={{ color: selected ? colors.accent : colors.text, fontWeight: selected ? '700' : '500' }}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.muted }]}>Workspace</Text>
        <Pressable
          onPress={() => router.push('/git')}
          style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.hover : colors.elevated, borderColor: colors.border }]}
        >
          <Ionicons name="git-branch-outline" size={22} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>Git sync</Text>
            <Text style={[styles.rowSubtitle, { color: colors.muted }]}>Optional GitHub repository sync</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.faint} />
        </Pressable>
        <View style={[styles.card, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>Local-first storage</Text>
          <Text selectable style={[styles.path, { color: colors.muted }]}>{workspacePath}</Text>
          <Text style={[styles.hint, { color: colors.faint }]}>Your workspace remains fully usable without linking Git.</Text>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.muted }]}>About</Text>
        <Pressable
          onPress={() => void Linking.openURL('https://github.com/pratikktiwari/noteandsave-desktop')}
          style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.hover : colors.elevated, borderColor: colors.border }]}
        >
          <Ionicons name="logo-github" size={22} color={colors.text} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>Note & Save</Text>
            <Text style={[styles.rowSubtitle, { color: colors.muted }]}>Android preview · workspace schema v1</Text>
          </View>
          <Ionicons name="open-outline" size={20} color={colors.faint} />
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  sectionTitle: { marginTop: spacing.md, marginLeft: 4, textTransform: 'uppercase', fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  themeRow: { flexDirection: 'row', gap: spacing.sm },
  themeOption: { flex: 1, minHeight: 46, borderWidth: 1, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: spacing.md },
  rowTitle: { fontSize: 16, fontWeight: '700' },
  rowSubtitle: { fontSize: 13, marginTop: 2 },
  path: { fontFamily: 'monospace', fontSize: 12 },
  hint: { fontSize: 13, lineHeight: 18 },
});
