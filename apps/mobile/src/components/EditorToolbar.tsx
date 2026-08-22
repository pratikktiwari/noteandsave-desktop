import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { OnChangeStateEvent } from 'react-native-enriched-html';
import { radius, spacing, useTheme } from '@/theme';

export type EditorCommand =
  | 'heading'
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'inlineCode'
  | 'bulletList'
  | 'orderedList'
  | 'checklist'
  | 'quote'
  | 'codeBlock'
  | 'highlight'
  | 'link'
  | 'image'
  | 'table';

const buttons: Array<{ command: EditorCommand; label: string; active?: keyof OnChangeStateEvent }> = [
  { command: 'heading', label: 'H', active: 'h2' },
  { command: 'bold', label: 'B', active: 'bold' },
  { command: 'italic', label: 'I', active: 'italic' },
  { command: 'underline', label: 'U', active: 'underline' },
  { command: 'strike', label: 'S', active: 'strikeThrough' },
  { command: 'inlineCode', label: '<>', active: 'inlineCode' },
  { command: 'bulletList', label: '• List', active: 'unorderedList' },
  { command: 'orderedList', label: '1. List', active: 'orderedList' },
  { command: 'checklist', label: '☐', active: 'checkboxList' },
  { command: 'quote', label: '❝', active: 'blockQuote' },
  { command: 'codeBlock', label: '{ }', active: 'codeBlock' },
  { command: 'highlight', label: 'Mark' },
  { command: 'link', label: 'Link' },
  { command: 'image', label: 'Image' },
  { command: 'table', label: 'Table' },
];

export function EditorToolbar({
  state,
  onCommand,
  bottomOffset = 0,
  keyboardVisible = false,
  onHeightChange,
}: {
  state: OnChangeStateEvent | null;
  onCommand: (command: EditorCommand) => void;
  bottomOffset?: number;
  keyboardVisible?: boolean;
  onHeightChange?: (height: number) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.navigation,
          borderTopColor: colors.border,
          bottom: bottomOffset,
          paddingBottom: keyboardVisible ? spacing.xs : Math.max(insets.bottom, spacing.sm),
        },
      ]}
      onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)}
    >
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        {buttons.map((button) => {
          const activeValue = button.active ? state?.[button.active] : undefined;
          const active = typeof activeValue === 'object' && 'isActive' in activeValue && activeValue.isActive;
          return (
            <Pressable
              key={button.command}
              accessibilityRole="button"
              accessibilityLabel={button.command}
              accessibilityState={{ selected: active }}
              onPress={() => onCommand(button.command)}
              style={[styles.button, { backgroundColor: active ? colors.accentSoft : colors.elevated, borderColor: active ? colors.accent : colors.border }]}
            >
              <Text style={[styles.label, { color: active ? colors.accent : colors.text }]}>{button.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
    elevation: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  scroll: { flexGrow: 0 },
  content: { minHeight: 62, alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md },
  button: { minWidth: 42, minHeight: 40, paddingHorizontal: 10, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14, fontWeight: '700' },
});
