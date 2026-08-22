import React, { useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { TextPrompt } from '@/components/TextPrompt';
import { radius, spacing, useTheme } from '@/theme';
import { useWorkspaceStore } from '@/store/workspace';

export default function FoldersScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const folders = useWorkspaceStore((state) => state.folders);
  const notes = useWorkspaceStore((state) => state.notes);
  const createFolder = useWorkspaceStore((state) => state.createFolder);
  const renameFolder = useWorkspaceStore((state) => state.renameFolder);
  const deleteFolder = useWorkspaceStore((state) => state.deleteFolder);
  const [prompt, setPrompt] = useState<{ mode: 'create' | 'rename'; id?: string; value?: string } | null>(null);

  const actions = (id: string, name: string) => Alert.alert(name, undefined, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Rename', onPress: () => setPrompt({ mode: 'rename', id, value: name }) },
    {
      text: 'Delete folder',
      style: 'destructive',
      onPress: () => Alert.alert('Delete folder?', 'Notes will move to All notes.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void deleteFolder(id) },
      ]),
    },
  ]);

  return (
    <Screen>
      <FlatList
        data={folders}
        keyExtractor={(folder) => folder.id}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        renderItem={({ item }) => {
          const count = notes.filter((note) => !note.deleted && note.folderId === item.id).length;
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/folder/[id]', params: { id: item.id } })}
              onLongPress={() => actions(item.id, item.name)}
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.hover : colors.elevated, borderColor: colors.border }]}
            >
              <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
                <Ionicons name="folder" size={22} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
                <Text style={{ color: colors.muted }}>{count} {count === 1 ? 'note' : 'notes'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.faint} />
            </Pressable>
          );
        }}
        ListEmptyComponent={(
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No folders yet</Text>
            <Text style={[styles.emptyText, { color: colors.muted }]}>Folders keep related notes together.</Text>
          </View>
        )}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create folder"
        onPress={() => setPrompt({ mode: 'create' })}
        style={[styles.add, { backgroundColor: colors.accent }]}
      >
        <Ionicons name="folder-open-outline" size={23} color={colors.background} />
        <Text style={{ color: colors.background, fontWeight: '700' }}>New folder</Text>
      </Pressable>
      <TextPrompt
        visible={!!prompt}
        title={prompt?.mode === 'rename' ? 'Rename folder' : 'New folder'}
        initialValue={prompt?.value}
        placeholder="Folder name"
        onCancel={() => setPrompt(null)}
        onSubmit={(value) => {
          if (prompt?.mode === 'rename' && prompt.id) void renameFolder(prompt.id, value);
          else void createFolder(value);
          setPrompt(null);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: 100 },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: 14 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  name: { fontSize: 17, fontWeight: '700' },
  add: { position: 'absolute', right: 20, bottom: 24, minHeight: 52, borderRadius: radius.pill, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 8, elevation: 4 },
  empty: { alignItems: 'center', marginTop: 120, gap: 6 },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptyText: { fontSize: 15 },
});
