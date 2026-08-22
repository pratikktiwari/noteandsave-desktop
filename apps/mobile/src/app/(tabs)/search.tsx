import React, { useEffect } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { NotesFeed } from '@/components/NotesFeed';
import { radius, spacing, useTheme } from '@/theme';
import { useWorkspaceStore, visibleNotes } from '@/store/workspace';

export default function SearchScreen() {
  const { colors } = useTheme();
  const notes = useWorkspaceStore((state) => state.notes);
  const query = useWorkspaceStore((state) => state.query);
  const setQuery = useWorkspaceStore((state) => state.setQuery);
  const search = useWorkspaceStore((state) => state.search);
  const searchResultIds = useWorkspaceStore((state) => state.searchResultIds);
  useEffect(() => {
    const timer = setTimeout(() => void search(query), 180);
    return () => clearTimeout(timer);
  }, [query, search]);
  const resultSet = new Set(searchResultIds);
  const results = query.trim() ? visibleNotes(notes, 'all').filter((note) => resultSet.has(note.id)) : [];

  return (
    <Screen>
      <View style={[styles.search, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
        <Ionicons name="search" size={20} color={colors.muted} />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          value={query}
          onChangeText={setQuery}
          placeholder="Search titles, text, and tags"
          placeholderTextColor={colors.faint}
          style={[styles.input, { color: colors.text }]}
        />
        {!!query && <Ionicons name="close-circle" size={20} color={colors.faint} onPress={() => setQuery('')} />}
      </View>
      <NotesFeed
        notes={results}
        emptyTitle={query ? 'No matches' : 'Search your workspace'}
        emptyMessage={query ? 'Try a different word or tag.' : 'Results appear as you type.'}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    margin: spacing.md,
    marginBottom: 0,
    minHeight: 50,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: 12 },
});
