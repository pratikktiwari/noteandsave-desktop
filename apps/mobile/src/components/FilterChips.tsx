import React from 'react';
import { ScrollView, StyleSheet, Text, Pressable } from 'react-native';
import { radius, spacing, useTheme } from '@/theme';
import type { NoteFilter } from '@/store/workspace';

const filters: Array<{ value: NoteFilter; label: string }> = [
  { value: 'all', label: 'All notes' },
  { value: 'pinned', label: 'Pinned' },
  { value: 'favorites', label: 'Favorites' },
  { value: 'trash', label: 'Trash' },
];

export function FilterChips({ value, onChange }: { value: NoteFilter; onChange: (value: NoteFilter) => void }) {
  const { colors } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      {filters.map((filter) => {
        const active = filter.value === value;
        return (
          <Pressable
            key={filter.value}
            onPress={() => onChange(filter.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[
              styles.chip,
              { borderColor: active ? colors.accent : colors.border, backgroundColor: active ? colors.accentSoft : colors.elevated },
            ]}
          >
            <Text style={{ color: active ? colors.accent : colors.muted, fontWeight: active ? '700' : '500' }}>
              {filter.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  content: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
