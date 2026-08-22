import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Note } from '@noteandsave/workspace';
import { plainText } from '@/workspace/document';
import { radius, spacing, useTheme } from '@/theme';

interface NoteCardProps {
  note: Note;
  folderName?: string;
  onPress: () => void;
  onLongPress?: () => void;
  onMenuPress?: () => void;
}

export function NoteCard({ note, folderName, onPress, onLongPress, onMenuPress }: NoteCardProps) {
  const { colors } = useTheme();
  const preview = plainText(note.content).replace(/\s+/g, ' ').trim() || 'No additional text';
  const date = new Date(note.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.elevated }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${note.title || 'Untitled note'}, updated ${date}`}
        onPress={onPress}
        onLongPress={onLongPress}
        style={({ pressed }) => [styles.content, { backgroundColor: pressed ? colors.hover : colors.elevated }]}
      >
        <View style={[styles.titleRow, onMenuPress && styles.titleWithMenu]}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.text }]}>
            {note.title || 'Untitled'}
          </Text>
          <View style={styles.icons}>
            {note.pinned && <Ionicons name="pin" size={14} color={colors.accent} />}
            {note.favorite && <Ionicons name="star" size={14} color={colors.accent} />}
          </View>
        </View>
        <Text numberOfLines={2} style={[styles.preview, { color: colors.muted }]}>{preview}</Text>
        <View style={styles.meta}>
          <Text style={[styles.metaText, { color: colors.faint }]}>{date}</Text>
          {folderName && <Text style={[styles.folder, { color: colors.accent }]}>{folderName}</Text>}
          {note.tags.slice(0, 2).map((tag) => (
            <Text key={tag} style={[styles.tag, { color: colors.muted, backgroundColor: colors.accentSoft }]}>
              #{tag}
            </Text>
          ))}
        </View>
      </Pressable>
      {!!onMenuPress && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Actions for ${note.title || 'Untitled note'}`}
          hitSlop={8}
          onPress={onMenuPress}
          style={styles.menu}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color={colors.muted} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  content: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  titleWithMenu: { paddingRight: 30 },
  title: { flex: 1, fontSize: 18, fontWeight: '700' },
  icons: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  menu: { position: 'absolute', top: 10, right: 10, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  preview: { fontSize: 15, lineHeight: 21 },
  meta: { minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  metaText: { fontSize: 12 },
  folder: { fontSize: 12, fontWeight: '600' },
  tag: { overflow: 'hidden', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, fontSize: 12 },
});
