import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import {
  EnrichedTextInput,
  type EnrichedTextInputInstance,
  type OnChangeStateEvent,
} from 'react-native-enriched-html';
import type { JsonValue, Note } from '@noteandsave/workspace';
import { EditorToolbar, type EditorCommand } from '@/components/EditorToolbar';
import { ActionSheet, type ActionSheetItem } from '@/components/ActionSheet';
import { TableEditor, createTable } from '@/components/TableEditor';
import { TextPrompt } from '@/components/TextPrompt';
import { radius, spacing, useTheme } from '@/theme';
import { useWorkspaceStore } from '@/store/workspace';
import {
  documentToHtml,
  htmlToDocument,
  insertHighlightMarkup,
  replaceImageSources,
  type EditorNode,
} from '@/workspace/document';
import {
  canonicalizeAssetUri,
  resolveAssetUri,
  workspaceRepository,
} from '@/workspace/repository';

type SaveState = 'saved' | 'saving' | 'unsaved';
type PromptState = { type: 'tags' | 'link'; value: string } | null;
interface TableState {
  node: EditorNode;
  index: number;
}

const splitDocument = (content: JsonValue) => {
  const editableTypes = new Set([
    'paragraph',
    'heading',
    'bulletList',
    'orderedList',
    'taskList',
    'codeBlock',
    'blockquote',
    'horizontalRule',
    'image',
  ]);
  const document = content as unknown as EditorNode;
  const tables: TableState[] = [];
  const editable: EditorNode[] = [];
  for (const [index, node] of (document.content ?? []).entries()) {
    if (node.type === 'text' || node.type === 'hardBreak') {
      if (node.type === 'hardBreak' || node.text?.trim()) {
        editable.push({ type: 'paragraph', content: [node] });
      }
    } else if (!editableTypes.has(node.type)) {
      tables.push({ node, index });
    } else {
      editable.push(node);
    }
  }
  return {
    tables,
    editable: { type: 'doc', content: editable.length ? editable : [{ type: 'paragraph' }] } as unknown as JsonValue,
  };
};

const mergeDocument = (editable: JsonValue, tables: TableState[]): JsonValue => {
  const document = editable as unknown as EditorNode;
  const content = [...(document.content ?? [])];
  for (const table of [...tables].sort((left, right) => left.index - right.index)) {
    content.splice(Math.min(table.index, content.length), 0, table.node);
  }
  return { type: 'doc', content } as unknown as JsonValue;
};

export default function NoteEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const editor = useRef<EnrichedTextInputInstance>(null);
  const notes = useWorkspaceStore((state) => state.notes);
  const folders = useWorkspaceStore((state) => state.folders);
  const updateNote = useWorkspaceStore((state) => state.updateNote);
  const saveContent = useWorkspaceStore((state) => state.saveContent);
  const moveToTrash = useWorkspaceStore((state) => state.moveToTrash);
  const duplicateNote = useWorkspaceStore((state) => state.duplicateNote);
  const note = notes.find((candidate) => candidate.id === id);
  const noteId = note?.id;
  const initial = useMemo(() => note ? splitDocument(note.content) : null, [id]);
  const [title, setTitle] = useState(note?.title ?? '');
  const [tables, setTables] = useState<TableState[]>(initial?.tables ?? []);
  const [formatState, setFormatState] = useState<OnChangeStateEvent | null>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [plain, setPlain] = useState('');
  const [revision, setRevision] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [prompt, setPrompt] = useState<PromptState>(null);
  const [folderPicker, setFolderPicker] = useState(false);
  const [actionsVisible, setActionsVisible] = useState(false);
  const [keyboardOverlap, setKeyboardOverlap] = useState(0);
  const [toolbarHeight, setToolbarHeight] = useState(88);
  const saving = useRef<Promise<boolean> | null>(null);
  const allowNavigation = useRef(false);
  const editorFocused = useRef(false);
  const mounted = useRef(true);
  const container = useRef<View>(null);

  const initialHtml = useMemo(() => {
    if (!initial) return '<p></p>';
    return documentToHtml(replaceImageSources(initial.editable, resolveAssetUri));
  }, [initial]);

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  const persist = useCallback(async () => {
    if (!mounted.current || !noteId || !editor.current) return true;
    if (saving.current) await saving.current;
    saving.current = (async () => {
      if (mounted.current) setSaveState('saving');
      const html = await editor.current?.getHTML();
      if (html === undefined) return false;
      const editable = replaceImageSources(htmlToDocument(html), canonicalizeAssetUri);
      await saveContent(noteId, title.trim(), mergeDocument(editable, tables));
      if (mounted.current) setSaveState('saved');
      return true;
    })().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (/unmounted/i.test(message)) return true;
      if (mounted.current) setSaveState('unsaved');
      console.error('Could not save note', error);
      if (mounted.current) Alert.alert('Could not save note', message);
      return false;
    }).finally(() => {
      saving.current = null;
    });
    return saving.current;
  }, [noteId, saveContent, tables, title]);

  useEffect(() => {
    if (revision === 0) return;
    setSaveState('unsaved');
    const timer = setTimeout(() => void persist(), 850);
    return () => clearTimeout(timer);
  }, [persist, revision]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && saveState === 'unsaved') void persist();
    });
    return () => subscription.remove();
  }, [persist, saveState]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      requestAnimationFrame(() => {
        container.current?.measureInWindow((_x, y, _width, height) => {
          setKeyboardOverlap(Math.max(0, y + height - event.endCoordinates.screenY));
        });
      });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOverlap(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => navigation.addListener('beforeRemove', (event) => {
    if (allowNavigation.current || saveState === 'saved') return;
    event.preventDefault();
    void persist().then((saved) => {
      if (saved) {
        allowNavigation.current = true;
        navigation.dispatch(event.data.action);
      }
    });
  }), [navigation, persist, saveState]);

  useEffect(() => {
    if (!note) return;
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel={note.favorite ? 'Remove from favorites' : 'Add to favorites'}
            onPress={() => void updateNote(note.id, { favorite: !note.favorite })}
            style={styles.headerButton}
          >
            <Ionicons name={note.favorite ? 'star' : 'star-outline'} size={22} color={colors.accent} />
          </Pressable>
          <Pressable accessibilityLabel="Note actions" onPress={() => setActionsVisible(true)} style={styles.headerButton}>
            <Ionicons name="ellipsis-horizontal" size={23} color={colors.text} />
          </Pressable>
        </View>
      ),
    });
  }, [colors, navigation, note, updateNote]);

  if (!note || !initial) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.muted }}>This note is no longer available.</Text>
      </View>
    );
  }

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (result.canceled) return;
    const saved = await workspaceRepository.saveAsset(result.assets[0].uri);
    editor.current?.setImage(saved.uri, result.assets[0].width || 640, result.assets[0].height || 360);
    setRevision((value) => value + 1);
  };

  const handleCommand = async (command: EditorCommand) => {
    const instance = editor.current;
    if (!instance) return;
    const commands: Partial<Record<EditorCommand, () => void>> = {
      heading: instance.toggleH2,
      bold: instance.toggleBold,
      italic: instance.toggleItalic,
      underline: instance.toggleUnderline,
      strike: instance.toggleStrikeThrough,
      inlineCode: instance.toggleInlineCode,
      bulletList: instance.toggleUnorderedList,
      orderedList: instance.toggleOrderedList,
      checklist: () => instance.toggleCheckboxList(false),
      quote: instance.toggleBlockQuote,
      codeBlock: instance.toggleCodeBlock,
      image: () => void pickImage(),
      table: () => {
        setTables((value) => [...value, { node: createTable(), index: Number.MAX_SAFE_INTEGER }]);
        setRevision((value) => value + 1);
      },
      link: () => {
        if (selection.start === selection.end) {
          Alert.alert('Select text first', 'Select the text you want to turn into a link.');
          return;
        }
        setPrompt({ type: 'link', value: 'https://' });
      },
      highlight: async () => {
        const selected = plain.slice(selection.start, selection.end);
        if (!selected) {
          Alert.alert('Select text first', 'Select the text you want to highlight.');
          return;
        }
        const html = await instance.getHTML();
        const next = insertHighlightMarkup(html, selected);
        if (!next) {
          Alert.alert('Highlight unavailable', 'Try selecting text within a single formatting span.');
          return;
        }
        instance.setValue(next);
        setRevision((value) => value + 1);
      },
    };
    commands[command]?.();
  };

  const noteActions: ActionSheetItem[] = [
    {
      key: 'pin',
      label: note.pinned ? 'Unpin note' : 'Pin note',
      icon: note.pinned ? 'pin-outline' : 'pin',
      onPress: () => void updateNote(note.id, { pinned: !note.pinned }),
    },
    {
      key: 'folder',
      label: 'Move to folder',
      icon: 'folder-outline',
      onPress: () => setFolderPicker(true),
    },
    {
      key: 'tags',
      label: 'Edit tags',
      icon: 'pricetag-outline',
      onPress: () => setPrompt({ type: 'tags', value: note.tags.join(', ') }),
    },
    {
      key: 'duplicate',
      label: 'Duplicate note',
      icon: 'copy-outline',
      onPress: () => void persist().then(async (saved) => {
        if (!saved) return;
        const copy = await duplicateNote(note.id);
        allowNavigation.current = true;
        router.replace({ pathname: '/note/[id]', params: { id: copy.id } });
      }),
    },
    {
      key: 'trash',
      label: 'Delete note',
      detail: 'Move it to Trash',
      icon: 'trash-outline',
      destructive: true,
      onPress: () => void persist().then(async (saved) => {
        if (!saved) return;
        await moveToTrash(note.id);
        allowNavigation.current = true;
        router.back();
      }),
    },
  ];

  return (
    <View
      ref={container}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <KeyboardAwareScrollView
        bottomOffset={70}
        disableScrollOnKeyboardHide
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.editorContent, { paddingBottom: toolbarHeight + spacing.md }]}
      >
        <View style={styles.titleRow}>
          <TextInput
            value={title}
            onChangeText={(value) => {
              setTitle(value);
              setRevision((current) => current + 1);
            }}
            placeholder="Untitled"
            placeholderTextColor={colors.faint}
            multiline
            submitBehavior="blurAndSubmit"
            style={[styles.title, { color: colors.text }]}
          />
          <Text style={[styles.saveState, { color: saveState === 'unsaved' ? colors.accent : colors.faint }]}>
            {saveState === 'saving' ? 'Saving…' : saveState === 'unsaved' ? 'Unsaved' : 'Saved'}
          </Text>
        </View>
        <View style={[styles.metaRow, { borderBottomColor: colors.border }]}>
          <Pressable onPress={() => setFolderPicker(true)} style={[styles.metaChip, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="folder-outline" size={14} color={colors.accent} />
            <Text style={{ color: colors.accent }}>{folders.find((folder) => folder.id === note.folderId)?.name ?? 'No folder'}</Text>
          </Pressable>
          <Pressable onPress={() => setPrompt({ type: 'tags', value: note.tags.join(', ') })} style={[styles.metaChip, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="pricetag-outline" size={14} color={colors.accent} />
            <Text numberOfLines={1} style={{ color: colors.accent }}>{note.tags.length ? note.tags.join(', ') : 'Add tags'}</Text>
          </Pressable>
        </View>
        <EnrichedTextInput
          ref={editor}
          defaultValue={initialHtml}
          placeholder="Start writing…"
          placeholderTextColor={colors.faint}
          cursorColor={colors.accent}
          selectionColor={colors.accentSoft}
          mentionIndicators={['highlight']}
          htmlStyle={{
            h1: { fontSize: 26, bold: true },
            h2: { fontSize: 22, bold: true },
            h3: { fontSize: 19, bold: true },
            blockquote: { borderColor: colors.border, borderWidth: 3, gapWidth: 12, color: colors.muted },
            codeblock: { color: colors.text, backgroundColor: colors.code, borderRadius: 8 },
            code: { color: colors.accent, backgroundColor: colors.code },
            a: { color: colors.accent },
            mention: {
              highlight: { color: colors.text, backgroundColor: '#ffe58f', textDecorationLine: 'none' },
              noteLink: { color: colors.accent, backgroundColor: colors.accentSoft, textDecorationLine: 'underline' },
              textStyle: { color: colors.text, backgroundColor: 'transparent', textDecorationLine: 'none' },
            },
            ol: { marginLeft: 10, gapWidth: 10, markerColor: colors.text },
            ul: { bulletColor: colors.text, bulletSize: 6, marginLeft: 10, gapWidth: 10 },
            ulCheckbox: {
              boxColor: colors.text,
              boxSize: 16,
              marginLeft: 10,
              gapWidth: 10,
            },
          }}
          style={{
            minHeight: 360,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.md,
            color: colors.text,
            fontSize: 15,
            lineHeight: 26,
          }}
          scrollEnabled={false}
          androidExperimentalSynchronousEvents
          onFocus={() => {
            editorFocused.current = true;
          }}
          onBlur={() => {
            editorFocused.current = false;
          }}
          onChangeText={(event) => {
            setPlain(event.nativeEvent.value);
            if (editorFocused.current) setRevision((value) => value + 1);
          }}
          onChangeState={(event) => setFormatState(event.nativeEvent)}
          onChangeSelection={(event) => setSelection(event.nativeEvent)}
        />
        {tables.map((table, index) => table.node.type === 'table' ? (
          <TableEditor
            key={index}
            table={table.node}
            onChange={(next) => {
              setTables((current) => current.map((value, currentIndex) =>
                currentIndex === index ? { ...value, node: next as unknown as EditorNode } : value));
              setRevision((value) => value + 1);
            }}
            onRemove={() => {
              setTables((current) => current.filter((_, currentIndex) => currentIndex !== index));
              setRevision((value) => value + 1);
            }}
          />
        ) : (
          <View key={index} style={[styles.unsupported, { borderColor: colors.border, backgroundColor: colors.accentSoft }]}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>Desktop content preserved</Text>
            <Text style={{ color: colors.muted }}>This {table.node.type} block is read-only on mobile.</Text>
          </View>
        ))}
      </KeyboardAwareScrollView>
      <EditorToolbar
        state={formatState}
        bottomOffset={keyboardOverlap}
        keyboardVisible={keyboardOverlap > 0}
        onHeightChange={(height) => {
          if (keyboardOverlap > 0) return;
          setToolbarHeight((current) => Math.abs(current - height) > 1 ? height : current);
        }}
        onCommand={(command) => void handleCommand(command)}
      />
      <ActionSheet
        visible={actionsVisible}
        title={note.title || 'Untitled'}
        items={noteActions}
        onClose={() => setActionsVisible(false)}
      />
      <TextPrompt
        visible={!!prompt}
        title={prompt?.type === 'link' ? 'Add link' : 'Edit tags'}
        initialValue={prompt?.value}
        placeholder={prompt?.type === 'link' ? 'https://example.com' : 'work, ideas'}
        allowEmpty={prompt?.type === 'tags'}
        onCancel={() => setPrompt(null)}
        onSubmit={(value) => {
          if (prompt?.type === 'link') {
            editor.current?.setLink(selection.start, selection.end, plain.slice(selection.start, selection.end), value);
            setRevision((current) => current + 1);
          } else {
            const tags = [...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))];
            void updateNote(note.id, { tags });
          }
          setPrompt(null);
        }}
      />
      <Modal visible={folderPicker} transparent animationType="slide" onRequestClose={() => setFolderPicker(false)}>
        <Pressable style={[styles.sheetOverlay, { backgroundColor: colors.overlay }]} onPress={() => setFolderPicker(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.elevated }]} onPress={() => undefined}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Move to folder</Text>
            {[{ id: null, name: 'No folder' }, ...folders].map((folder) => (
              <Pressable
                key={folder.id ?? 'none'}
                onPress={() => {
                  void updateNote(note.id, { folderId: folder.id });
                  setFolderPicker(false);
                }}
                style={[styles.folderRow, { borderBottomColor: colors.border }]}
              >
                <Ionicons name={folder.id ? 'folder-outline' : 'albums-outline'} size={20} color={colors.accent} />
                <Text style={{ color: colors.text, flex: 1 }}>{folder.name}</Text>
                {note.folderId === folder.id && <Ionicons name="checkmark" size={20} color={colors.accent} />}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  editorContent: { flexGrow: 1 },
  unsupported: { marginHorizontal: spacing.md, marginBottom: spacing.md, padding: spacing.md, borderWidth: 1, borderRadius: radius.md, gap: 4 },
  titleRow: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  title: { minHeight: 54, maxHeight: 72, fontSize: 24, lineHeight: 29, fontWeight: '700', paddingVertical: 6 },
  saveState: { fontSize: 12, marginBottom: 6 },
  metaRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth },
  metaChip: { maxWidth: '48%', minHeight: 36, paddingHorizontal: 10, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 5 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '70%', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.md, paddingBottom: spacing.xl },
  sheetTitle: { fontSize: 20, fontWeight: '700', marginBottom: spacing.sm },
  folderRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
