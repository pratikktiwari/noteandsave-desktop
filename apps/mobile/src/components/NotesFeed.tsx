import React, { useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Note } from '@noteandsave/workspace';
import { NoteCard } from './NoteCard';
import { ActionSheet, type ActionSheetItem } from './ActionSheet';
import { spacing, useTheme } from '@/theme';
import { useWorkspaceStore } from '@/store/workspace';

interface NotesFeedProps {
  notes: Note[];
  emptyTitle: string;
  emptyMessage: string;
}

export function NotesFeed({ notes, emptyTitle, emptyMessage }: NotesFeedProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const folders = useWorkspaceStore((state) => state.folders);
  const loading = useWorkspaceStore((state) => state.loading);
  const refresh = useWorkspaceStore((state) => state.refresh);
  const updateNote = useWorkspaceStore((state) => state.updateNote);
  const moveToTrash = useWorkspaceStore((state) => state.moveToTrash);
  const restoreNote = useWorkspaceStore((state) => state.restoreNote);
  const permanentlyDeleteNote = useWorkspaceStore((state) => state.permanentlyDeleteNote);
  const duplicateNote = useWorkspaceStore((state) => state.duplicateNote);
  const [actionNote, setActionNote] = useState<Note | null>(null);
  const folderNames = useMemo(() => new Map(folders.map((folder) => [folder.id, folder.name])), [folders]);

  const actions: ActionSheetItem[] = actionNote?.deleted
    ? [
      {
        key: 'restore',
        label: 'Restore note',
        detail: 'Return it to All notes',
        icon: 'arrow-undo-outline',
        onPress: () => void restoreNote(actionNote.id),
      },
      {
        key: 'delete',
        label: 'Delete permanently',
        detail: 'This cannot be undone',
        icon: 'trash-outline',
        destructive: true,
        onPress: () => Alert.alert('Delete permanently?', 'This note cannot be recovered.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => void permanentlyDeleteNote(actionNote.id) },
        ]),
      },
    ]
    : actionNote ? [
      {
        key: 'pin',
        label: actionNote.pinned ? 'Unpin note' : 'Pin note',
        icon: actionNote.pinned ? 'pin-outline' : 'pin',
        onPress: () => void updateNote(actionNote.id, { pinned: !actionNote.pinned }),
      },
      {
        key: 'favorite',
        label: actionNote.favorite ? 'Remove from favorites' : 'Add to favorites',
        icon: actionNote.favorite ? 'star-outline' : 'star',
        onPress: () => void updateNote(actionNote.id, { favorite: !actionNote.favorite }),
      },
      {
        key: 'duplicate',
        label: 'Duplicate note',
        icon: 'copy-outline',
        onPress: () => void duplicateNote(actionNote.id),
      },
      {
        key: 'trash',
        label: 'Delete note',
        detail: 'Move it to Trash',
        icon: 'trash-outline',
        destructive: true,
        onPress: () => void moveToTrash(actionNote.id),
      },
    ] : [];

  return (
    <>
      <FlatList
        data={notes}
        keyExtractor={(note) => note.id}
        contentContainerStyle={[styles.content, notes.length === 0 && styles.emptyContent]}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={colors.accent} />}
        renderItem={({ item }) => (
          <NoteCard
            note={item}
            folderName={item.folderId ? folderNames.get(item.folderId) : undefined}
            onPress={() => router.push({ pathname: '/note/[id]', params: { id: item.id } })}
            onLongPress={() => setActionNote(item)}
            onMenuPress={() => setActionNote(item)}
          />
        )}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>{emptyTitle}</Text>
            <Text style={[styles.emptyMessage, { color: colors.muted }]}>{emptyMessage}</Text>
          </View>
        )}
      />
      <ActionSheet
        visible={!!actionNote}
        title={actionNote?.title || 'Untitled'}
        items={actions}
        onClose={() => setActionNote(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: 112 },
  emptyContent: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { textAlign: 'center', fontSize: 20, fontWeight: '700' },
  emptyMessage: { textAlign: 'center', fontSize: 15, lineHeight: 22 },
});
