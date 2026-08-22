import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActionSheet, type ActionSheetItem } from './ActionSheet';
import { useTheme } from '@/theme';
import { useWorkspaceStore } from '@/store/workspace';

export function FloatingNewButton({ folderId }: { folderId?: string | null }) {
  const { colors } = useTheme();
  const router = useRouter();
  const createNote = useWorkspaceStore((state) => state.createNote);
  const [visible, setVisible] = useState(false);

  const create = async (type: 'note' | 'checklist') => {
    const note = await createNote(type, folderId ?? null);
    router.push({ pathname: '/note/[id]', params: { id: note.id } });
  };

  const actions: ActionSheetItem[] = [
    {
      key: 'note',
      label: 'New note',
      detail: 'Start with a blank page',
      icon: 'document-text-outline',
      onPress: () => void create('note'),
    },
    {
      key: 'checklist',
      label: 'New checklist',
      detail: 'Start with a task list',
      icon: 'checkbox-outline',
      onPress: () => void create('checklist'),
    },
  ];

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create note"
        onPress={() => setVisible(true)}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.accent, opacity: pressed ? 0.86 : 1 },
        ]}
      >
        <Ionicons name="add" size={30} color={colors.background} />
      </Pressable>
      <ActionSheet visible={visible} title="Create" items={actions} onClose={() => setVisible(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
});
