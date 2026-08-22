import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { JsonValue } from '@noteandsave/workspace';
import type { EditorNode } from '@/workspace/document';
import { radius, spacing, useTheme } from '@/theme';

const cellText = (cell: EditorNode) =>
  cell.content?.flatMap((paragraph) => paragraph.content?.map((node) => node.text ?? '') ?? []).join('') ?? '';

const textCell = (text: string, header: boolean): EditorNode => ({
  type: header ? 'tableHeader' : 'tableCell',
  attrs: { colspan: 1, rowspan: 1 },
  content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
});

export const createTable = (rows = 2, columns = 2): EditorNode => ({
  type: 'table',
  content: Array.from({ length: rows }, (_, row) => ({
    type: 'tableRow',
    content: Array.from({ length: columns }, () => textCell('', row === 0)),
  })),
});

export function TableEditor({
  table,
  onChange,
  onRemove,
}: {
  table: EditorNode;
  onChange: (table: JsonValue) => void;
  onRemove: () => void;
}) {
  const { colors } = useTheme();
  const rows = table.content ?? [];
  const updateCell = (rowIndex: number, cellIndex: number, value: string) => {
    const next = rows.map((row, currentRow) => ({
      ...row,
      content: (row.content ?? []).map((cell, currentCell) =>
        currentRow === rowIndex && currentCell === cellIndex ? textCell(value, rowIndex === 0) : cell),
    }));
    onChange({ ...table, content: next } as unknown as JsonValue);
  };
  const addRow = () => {
    const columns = rows[0]?.content?.length ?? 2;
    onChange({ ...table, content: [...rows, { type: 'tableRow', content: Array.from({ length: columns }, () => textCell('', false)) }] } as unknown as JsonValue);
  };
  const addColumn = () => {
    onChange({
      ...table,
      content: rows.map((row, index) => ({ ...row, content: [...(row.content ?? []), textCell('', index === 0)] })),
    } as unknown as JsonValue);
  };

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.elevated }]}>
      <ScrollView horizontal>
        <View>
          {rows.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.row}>
              {(row.content ?? []).map((cell, cellIndex) => (
                <TextInput
                  key={cellIndex}
                  value={cellText(cell)}
                  onChangeText={(value) => updateCell(rowIndex, cellIndex, value)}
                  placeholder={rowIndex === 0 ? 'Heading' : 'Cell'}
                  placeholderTextColor={colors.faint}
                  style={[styles.cell, { color: colors.text, borderColor: colors.border, fontWeight: rowIndex === 0 ? '700' : '400', backgroundColor: rowIndex === 0 ? colors.accentSoft : colors.background }]}
                />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
      <View style={styles.actions}>
        <Pressable onPress={addRow} style={[styles.action, { borderColor: colors.border }]}><Text style={{ color: colors.text }}>+ Row</Text></Pressable>
        <Pressable onPress={addColumn} style={[styles.action, { borderColor: colors.border }]}><Text style={{ color: colors.text }}>+ Column</Text></Pressable>
        <Pressable onPress={onRemove} style={[styles.action, { borderColor: colors.danger }]}><Text style={{ color: colors.danger }}>Remove</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.md, marginBottom: spacing.md, padding: spacing.sm, borderWidth: 1, borderRadius: radius.md, gap: spacing.sm },
  row: { flexDirection: 'row' },
  cell: { width: 150, minHeight: 48, borderWidth: StyleSheet.hairlineWidth, padding: 10 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { minHeight: 40, paddingHorizontal: 12, borderWidth: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
