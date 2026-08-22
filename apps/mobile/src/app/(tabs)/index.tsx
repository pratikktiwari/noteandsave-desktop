import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { FilterChips } from '@/components/FilterChips';
import { NotesFeed } from '@/components/NotesFeed';
import { FloatingNewButton } from '@/components/FloatingNewButton';
import { useTheme } from '@/theme';
import { useWorkspaceStore, visibleNotes } from '@/store/workspace';

export default function NotesScreen() {
  const { colors } = useTheme();
  const notes = useWorkspaceStore((state) => state.notes);
  const filter = useWorkspaceStore((state) => state.filter);
  const setFilter = useWorkspaceStore((state) => state.setFilter);
  const initialized = useWorkspaceStore((state) => state.initialized);
  const error = useWorkspaceStore((state) => state.error);
  const filtered = visibleNotes(notes, filter);
  const emptyCopy = {
    all: {
      title: 'A clear space for your thoughts',
      message: 'Tap the plus button to create your first note or checklist.',
    },
    pinned: {
      title: 'No pinned notes',
      message: 'Long-press a note and choose Pin note to keep it here.',
    },
    favorites: {
      title: 'No favorites yet',
      message: 'Mark important notes as favorites to find them here.',
    },
    trash: {
      title: 'Trash is empty',
      message: 'Deleted notes appear here until you remove them permanently.',
    },
  }[filter];

  if (!initialized && !error) {
    return <Screen style={styles.center}><ActivityIndicator size="large" color={colors.accent} /></Screen>;
  }
  if (error) {
    return (
      <Screen style={styles.center}>
        <Text style={[styles.errorTitle, { color: colors.danger }]}>Workspace unavailable</Text>
        <Text style={[styles.error, { color: colors.muted }]}>{error}</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <FilterChips value={filter} onChange={setFilter} />
      <NotesFeed
        notes={filtered}
        emptyTitle={emptyCopy.title}
        emptyMessage={emptyCopy.message}
      />
      {filter !== 'trash' && <FloatingNewButton />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  errorTitle: { fontSize: 20, fontWeight: '700' },
  error: { textAlign: 'center', lineHeight: 22 },
});
