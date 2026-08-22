import React from 'react';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { Screen } from '@/components/Screen';
import { NotesFeed } from '@/components/NotesFeed';
import { FloatingNewButton } from '@/components/FloatingNewButton';
import { useWorkspaceStore } from '@/store/workspace';

export default function FolderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const folders = useWorkspaceStore((state) => state.folders);
  const notes = useWorkspaceStore((state) => state.notes);
  const folder = folders.find((candidate) => candidate.id === id);
  React.useEffect(() => {
    navigation.setOptions({ title: folder?.name ?? 'Folder' });
  }, [folder?.name, navigation]);
  const filtered = notes.filter((note) => !note.deleted && note.folderId === id);
  return (
    <Screen>
      <NotesFeed notes={filtered} emptyTitle="This folder is empty" emptyMessage="Create a note here or move an existing note into this folder." />
      <FloatingNewButton folderId={id} />
    </Screen>
  );
}
