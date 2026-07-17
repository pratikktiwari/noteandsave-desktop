import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useEditor, EditorContent, ReactNodeViewRenderer, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { ResizableImageExtension } from '../lib/resizable-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { nanoid } from 'nanoid';
import { linkPreviewPlugin } from '../lib/link-preview-plugin';
import { CodeBlockView } from './CodeBlockView';
import { saveImage, getNote as getDBNote, updateNote, type Revision } from '../lib/db';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAutosave } from '../hooks/useAutosave';
import { useNotes } from '../hooks/useNotes';
import { Toolbar } from './Toolbar';
import { TagInput } from './TagInput';
import { RevisionHistory } from './RevisionHistory';
import { SlashCommandExtension } from '../lib/slash-command';
import { NoteLink } from '../lib/note-link';
import { NoteLinkSuggestionExtension } from '../lib/note-link-suggestion';
import {
  exportToHTML,
  exportToMarkdown,
  exportToPlainText,
  exportToJSON,
  downloadFile,
} from '../lib/export';
import { markdownToJSON } from '../lib/import-markdown';
import type { Note } from '../types';

const lowlight = createLowlight(common);

const searchPluginKey = new PluginKey('search-highlight');

const SearchHighlightExtension = Extension.create({
  name: 'searchHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchPluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, oldDecorations) {
            const meta = tr.getMeta(searchPluginKey);
            if (meta !== undefined) {
              return meta;
            }
            if (tr.docChanged) {
              return oldDecorations.map(tr.mapping, tr.doc);
            }
            return oldDecorations;
          },
        },
        props: {
          decorations(state) {
            return searchPluginKey.getState(state);
          },
        },
      }),
    ];
  },
});

const LinkPreviewExtension = Extension.create({
  name: 'linkPreview',
  addProseMirrorPlugins() {
    return [linkPreviewPlugin()];
  },
});

export function Editor() {
  const { state, dispatch } = useWorkspace();
  const { notes, renameNote } = useNotes();
  const [currentNote, setCurrentNote] = useState<Note | null>(null);
  const currentNoteRef = useRef<Note | null>(null);
  const debouncedSaveRef = useRef<() => void>(() => undefined);
  const isSettingContentRef = useRef(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [spellCheck, setSpellCheck] = useState(true);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [linkContextMenu, setLinkContextMenu] = useState<{ x: number; y: number; href: string } | null>(null);
  const [showFind, setShowFind] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findResults, setFindResults] = useState<{ total: number; current: number }>({ total: 0, current: 0 });
  const findInputRef = useRef<HTMLInputElement>(null);

  const handleEditorContextMenu = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const linkEl = target.closest('a[href]') as HTMLAnchorElement | null;
    if (linkEl) {
      const href = linkEl.getAttribute('href');
      if (href) {
        e.preventDefault();
        e.stopPropagation();
        setLinkContextMenu({ x: e.clientX, y: e.clientY, href });
      }
    }
  }, []);

  const handleCopyLink = useCallback(() => {
    if (linkContextMenu) {
      navigator.clipboard.writeText(linkContextMenu.href);
      setLinkContextMenu(null);
    }
  }, [linkContextMenu]);

  useEffect(() => {
    if (!linkContextMenu) return;
    const close = () => setLinkContextMenu(null);
    document.addEventListener('click', close);
    document.addEventListener('contextmenu', close);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('contextmenu', close);
    };
  }, [linkContextMenu]);

  // Ctrl+F / Cmd+F to open find bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowFind(true);
        setTimeout(() => findInputRef.current?.focus(), 50);
      }
      if (e.key === 'Escape' && showFind) {
        setShowFind(false);
        setFindQuery('');
        setFindResults({ total: 0, current: 0 });
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showFind]);

  const handleNoteLinkClick = useCallback((noteId: string) => {
    dispatch({ type: 'SET_ACTIVE_NOTE', payload: noteId });
  }, [dispatch]);

  // Find active note — check state first, fall back to IndexedDB
  const prevNoteIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!state.activeNoteId) {
      setCurrentNote(null);
      currentNoteRef.current = null;
      prevNoteIdRef.current = null;
      prevNoteIdRef.current = null;
      return;
    }

    const setNote = (note: Note) => {
      setCurrentNote(note);
      currentNoteRef.current = note;
      setTitleValue(note.title);
    };

    const note = notes.find((n) => n.id === state.activeNoteId);
    if (note) {
      setNote(note);
    } else {
      // Note might not be in the current filtered list (e.g. scratchpad)
      getDBNote(state.activeNoteId).then((dbNote) => {
        if (dbNote) {
          setNote(dbNote);
        } else {
          setCurrentNote(null);
          currentNoteRef.current = null;
        }
      });
    }
  }, [state.activeNoteId]);

  // Keep ref in sync for onUpdate callback
  useEffect(() => {
    currentNoteRef.current = currentNote;
  }, [currentNote]);

  useEffect(() => {
    setShowExport(false);
    setShowImport(false);
    setImportText('');
    setShowHistory(false);
  }, [state.activeNoteId]);

  const handleImageFile = async (file: File) => {
    const id = nanoid();
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      // Store in IndexedDB
      await saveImage({ id, blob: file, mimeType: file.type, createdAt: Date.now() });
      // Insert into editor as base64 (for simplicity in local-first)
      editor?.chain().focus().setImage({ src: base64, alt: file.name }).run();
    };
    reader.readAsDataURL(file);
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        code: {
          HTMLAttributes: {
            spellcheck: 'false',
          },
        },
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Highlight.configure({
        multicolor: false,
      }),
      Underline,
      TextStyle,
      Color,
      Link.configure({
        openOnClick: true,
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      ResizableImageExtension.configure({
        inline: false,
        allowBase64: true,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({
        placeholder: 'Start writing...',
      }),
      CodeBlockLowlight.extend({
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockView);
        },
      }).configure({
        lowlight,
      }),
      SlashCommandExtension,
      NoteLink.configure({
        onNoteLinkClick: handleNoteLinkClick,
      }),
      NoteLinkSuggestionExtension.configure({
        suggestion: {
          char: '[[',
          allowSpaces: true,
          items: ({ query }: { query: string }) => {
            return notes
              .filter((n) => !n.deleted && n.id !== currentNoteRef.current?.id)
              .filter((n) => n.title.toLowerCase().includes(query.toLowerCase()))
              .slice(0, 10)
              .map((n) => ({ id: n.id, title: n.title }));
          },
        },
      }),
      LinkPreviewExtension,
      SearchHighlightExtension,
    ],
    content: currentNote?.content || { type: 'doc', content: [{ type: 'paragraph' }] },
    editorProps: {
      attributes: {
        spellcheck: spellCheck ? 'true' : 'false',
      },
      transformPastedHTML(html) {
        // When pasting a single paragraph from the editor, the clipboard contains
        // a block-level <p> wrapper which TipTap inserts as a new block, creating
        // extra empty lines above and below. Strip the wrapper to paste inline.
        const trimmed = html.trim();
        // Only unwrap if there's exactly one <p> tag (no multiple paragraphs)
        const pTagCount = (trimmed.match(/<p[\s>]/gi) || []).length;
        if (pTagCount === 1) {
          const singleParagraphMatch = trimmed.match(/^<p[^>]*>([\s\S]*?)<\/p>$/i);
          if (singleParagraphMatch) {
            return singleParagraphMatch[1];
          }
        }
        return html;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (!moved && event.dataTransfer?.files?.length) {
          const files = Array.from(event.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
          if (files.length === 0) return false;
          files.forEach((file) => handleImageFile(file));
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              handleImageFile(file);
              return true;
            }
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      if (isSettingContentRef.current) return;
      const note = currentNoteRef.current;
      if (!note) return;
      const content = editor.getJSON();
      const updated: Note = {
        ...note,
        content,
        updatedAt: Date.now(),
      };
      setCurrentNote(updated);
      dispatch({ type: 'UPDATE_NOTE', payload: updated });
      debouncedSaveRef.current();
    },
  });

  // Attach contextmenu listener for link right-click
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    dom.addEventListener('contextmenu', handleEditorContextMenu);
    return () => {
      dom.removeEventListener('contextmenu', handleEditorContextMenu);
    };
  }, [editor, handleEditorContextMenu]);

  const { debouncedSave, saveNow } = useAutosave(currentNote);

  // Keep debouncedSave ref in sync so onUpdate closure always calls latest
  useEffect(() => {
    debouncedSaveRef.current = debouncedSave;
  }, [debouncedSave]);

  // Sync editor content when note actually switches
  useEffect(() => {
    if (!editor || !currentNote) return;
    if (prevNoteIdRef.current === currentNote.id) return;
    prevNoteIdRef.current = currentNote.id;
    queueMicrotask(() => {
      isSettingContentRef.current = true;
      editor.commands.setContent(currentNote.content || { type: 'doc', content: [{ type: 'paragraph' }] });
      isSettingContentRef.current = false;
    });
  }, [editor, currentNote]);

  // Sync spellcheck attribute when toggle changes
  useEffect(() => {
    if (!editor) return;
    editor.view.dom.setAttribute('spellcheck', spellCheck ? 'true' : 'false');
  }, [editor, spellCheck]);

  // Find in editor helpers (must be after useEditor)
  const updateSearchDecorations = useCallback((query: string, currentIdx: number) => {
    if (!editor) return;
    if (!query.trim()) {
      const { tr } = editor.state;
      tr.setMeta(searchPluginKey, DecorationSet.empty);
      editor.view.dispatch(tr);
      return;
    }
    const lowerQuery = query.toLowerCase();
    const decorations: Decoration[] = [];
    let matchIndex = 0;
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText) return;
      const text = (node.text || '').toLowerCase();
      let idx = text.indexOf(lowerQuery);
      while (idx !== -1) {
        const from = pos + idx;
        const to = from + query.length;
        const className = matchIndex === currentIdx ? 'ws-search-match ws-search-match--current' : 'ws-search-match';
        decorations.push(Decoration.inline(from, to, { class: className }));
        matchIndex++;
        idx = text.indexOf(lowerQuery, idx + 1);
      }
    });
    const { tr } = editor.state;
    tr.setMeta(searchPluginKey, DecorationSet.create(editor.state.doc, decorations));
    editor.view.dispatch(tr);
  }, [editor]);

  const scrollToMatch = useCallback((query: string, occurrence: number) => {
    if (!editor || !query.trim()) return;
    const lowerQuery = query.toLowerCase();
    let found = 0;
    let targetFrom = -1;
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText || targetFrom !== -1) return;
      const text = (node.text || '').toLowerCase();
      let idx = text.indexOf(lowerQuery);
      while (idx !== -1) {
        if (found === occurrence) {
          targetFrom = pos + idx;
          return false;
        }
        found++;
        idx = text.indexOf(lowerQuery, idx + 1);
      }
    });
    if (targetFrom !== -1) {
      const domAtPos = editor.view.domAtPos(targetFrom);
      if (domAtPos?.node) {
        const el = domAtPos.node instanceof HTMLElement ? domAtPos.node : domAtPos.node.parentElement;
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [editor]);

  const handleFind = useCallback((query: string) => {
    setFindQuery(query);
    if (!editor || !query.trim()) {
      setFindResults({ total: 0, current: 0 });
      updateSearchDecorations('', -1);
      return;
    }
    const lowerQuery = query.toLowerCase();
    let count = 0;
    editor.state.doc.descendants((node) => {
      if (!node.isText) return;
      const text = (node.text || '').toLowerCase();
      let idx = text.indexOf(lowerQuery);
      while (idx !== -1) {
        count++;
        idx = text.indexOf(lowerQuery, idx + 1);
      }
    });
    setFindResults({ total: count, current: count > 0 ? 1 : 0 });
    updateSearchDecorations(query, 0);
    if (count > 0) {
      scrollToMatch(query, 0);
    }
  }, [editor, updateSearchDecorations, scrollToMatch]);

  const handleFindNext = useCallback(() => {
    if (findResults.total === 0) return;
    const next = findResults.current >= findResults.total ? 1 : findResults.current + 1;
    setFindResults((prev) => ({ ...prev, current: next }));
    updateSearchDecorations(findQuery, next - 1);
    scrollToMatch(findQuery, next - 1);
  }, [findResults, findQuery, updateSearchDecorations, scrollToMatch]);

  const handleFindPrev = useCallback(() => {
    if (findResults.total === 0) return;
    const prev = findResults.current <= 1 ? findResults.total : findResults.current - 1;
    setFindResults((r) => ({ ...r, current: prev }));
    updateSearchDecorations(findQuery, prev - 1);
    scrollToMatch(findQuery, prev - 1);
  }, [findResults, findQuery, updateSearchDecorations, scrollToMatch]);

  const handleRestoreRevision = (revision: Revision) => {
    if (!currentNote || !editor) return;

    const updated: Note = {
      ...currentNote,
      content: revision.content,
      updatedAt: Date.now(),
    };

    setCurrentNote(updated);
    dispatch({ type: 'UPDATE_NOTE', payload: updated });
    editor.commands.setContent(revision.content);
    setShowHistory(false);
  };

  const handleTitleSubmit = () => {
    if (currentNote && titleValue.trim() && titleValue !== currentNote.title) {
      const newTitle = titleValue.trim();
      renameNote(currentNote.id, newTitle);
      const updated = { ...currentNote, title: newTitle, updatedAt: Date.now() };
      setCurrentNote(updated);
      currentNoteRef.current = updated;
    }
    setIsEditingTitle(false);
  };

  const handleTagsChange = (tags: string[]) => {
    if (!currentNote) return;

    const updated: Note = {
      ...currentNote,
      tags,
      updatedAt: Date.now(),
    };

    setCurrentNote(updated);
    dispatch({ type: 'UPDATE_NOTE', payload: updated });
    debouncedSave();
  };

  const handleExport = (format: 'html' | 'markdown' | 'text' | 'json') => {
    if (!currentNote || !editor) return;
    const filename = currentNote.title.replace(/[^a-zA-Z0-9]/g, '_');

    switch (format) {
      case 'html':
        downloadFile(exportToHTML(currentNote, editor.getHTML()), `${filename}.html`, 'text/html');
        break;
      case 'markdown':
        downloadFile(exportToMarkdown(currentNote), `${filename}.md`, 'text/markdown');
        break;
      case 'text':
        downloadFile(exportToPlainText(currentNote), `${filename}.txt`, 'text/plain');
        break;
      case 'json':
        downloadFile(exportToJSON(currentNote), `${filename}.json`, 'application/json');
        break;
    }
    setShowExport(false);
  };

  const handleImportMarkdown = (markdown: string) => {
    if (!editor || !currentNote || !markdown.trim()) return;
    const content = markdownToJSON(markdown);
    editor.commands.setContent(content);
    const updated: Note = {
      ...currentNote,
      content,
      updatedAt: Date.now(),
    };
    setCurrentNote(updated);
    dispatch({ type: 'UPDATE_NOTE', payload: updated });
    debouncedSave();
    setShowImport(false);
    setImportText('');
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      handleImportMarkdown(text);
    };
    reader.readAsText(file);
    // Reset file input so same file can be re-imported
    event.target.value = '';
  };

  if (!currentNote) {
    return (
      <div className="ws-editor ws-editor--empty">
        <div className="ws-editor__placeholder">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <p>Select a note or create a new one</p>
          <p className="ws-editor__privacy-note">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            100% private — your data is stored locally in your browser and never sent anywhere.
          </p>
        </div>
      </div>
    );
  }

  const isScratchpad = currentNote.type === 'scratchpad';

  return (
    <div className="ws-editor">
      <RevisionHistory
        isOpen={showHistory}
        noteId={currentNote.id}
        onClose={() => setShowHistory(false)}
        onRestore={handleRestoreRevision}
      />
      <div className="ws-editor__header">
        {state.viewMode === 'grid' && (
          <button
            className="ws-editor__back-to-grid"
            onClick={() => dispatch({ type: 'SET_ACTIVE_NOTE', payload: null })}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
            All Notes
          </button>
        )}
        <div className="ws-editor__title-row">
          {isEditingTitle && !isScratchpad ? (
            <input
              ref={titleInputRef}
              className="ws-editor__title-input"
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTitleSubmit();
                if (e.key === 'Escape') { setTitleValue(currentNote.title); setIsEditingTitle(false); }
              }}
              autoFocus
            />
          ) : (
            <h2
              className="ws-editor__title"
              onClick={() => !isScratchpad && setIsEditingTitle(true)}
              title={isScratchpad ? undefined : 'Click to rename'}
            >
              {currentNote.title}
            </h2>
          )}
          <div className="ws-editor__meta">
            <span className="ws-editor__save-status">
              {state.saveStatus === 'saving' && 'Saving...'}
              {state.saveStatus === 'saved' && 'Saved'}
            </span>
            <button
              className="ws-editor__history-btn"
              onClick={() => {
                setShowHistory(true);
                setShowExport(false);
                setShowImport(false);
              }}
              aria-label="Open revision history"
              title="History"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 3-6.708" />
                <polyline points="3 3 3 9 9 9" />
                <path d="M12 7v5l3 3" />
              </svg>
            </button>
            <div className="ws-editor__import-wrapper">
              <button
                className="ws-editor__import-btn"
                onClick={() => {
                  setShowImport((value) => {
                    const nextValue = !value;
                    if (nextValue) { setShowExport(false); setShowHistory(false); }
                    return nextValue;
                  });
                }}
                aria-label="Import from markdown"
                title="Import Markdown"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </button>
              {showImport && (
                <div className="ws-editor__import-modal">
                  <div className="ws-editor__import-modal-header">
                    <span>Import Markdown</span>
                    <button
                      className="ws-editor__import-modal-close"
                      onClick={() => { setShowImport(false); setImportText(''); }}
                      aria-label="Close import"
                    >
                      ×
                    </button>
                  </div>
                  <div className="ws-editor__import-modal-body">
                    <button
                      className="ws-editor__import-file-btn"
                      onClick={() => importFileRef.current?.click()}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      Select .md file
                    </button>
                    <input
                      ref={importFileRef}
                      type="file"
                      accept=".md,.markdown,.txt"
                      style={{ display: 'none' }}
                      onChange={handleImportFile}
                    />
                    <div className="ws-editor__import-divider">or paste markdown below</div>
                    <textarea
                      className="ws-editor__import-textarea"
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      placeholder="Paste your markdown here..."
                      rows={8}
                    />
                    <button
                      className="ws-editor__import-submit-btn"
                      onClick={() => handleImportMarkdown(importText)}
                      disabled={!importText.trim()}
                    >
                      Import
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="ws-editor__export-wrapper">
              <button
                className="ws-editor__export-btn"
                onClick={() => {
                  setShowExport((value) => {
                    const nextValue = !value;
                    if (nextValue) { setShowHistory(false); setShowImport(false); }
                    return nextValue;
                  });
                }}
                aria-label="Export note"
                title="Export"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
              {showExport && (
                <div className="ws-editor__export-menu" onMouseLeave={() => setShowExport(false)}>
                  <button onClick={() => handleExport('html')}>HTML</button>
                  <button onClick={() => handleExport('markdown')}>Markdown</button>
                  <button onClick={() => handleExport('text')}>Plain Text</button>
                  <button onClick={() => handleExport('json')}>JSON</button>
                </div>
              )}
            </div>
          </div>
        </div>
        <TagInput
          tags={currentNote.tags}
          allTags={notes.flatMap((note) => note.tags)}
          onChange={handleTagsChange}
          createdAt={currentNote.createdAt}
        />
        <Toolbar editor={editor} spellCheck={spellCheck} onToggleSpellCheck={() => setSpellCheck((v) => !v)} />
        {showFind && (
          <div className="ws-editor__find-bar">
            <input
              ref={findInputRef}
              className="ws-editor__find-input"
              type="text"
              placeholder="Find in note..."
              value={findQuery}
              onChange={(e) => handleFind(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.shiftKey ? handleFindPrev() : handleFindNext();
                }
                if (e.key === 'Escape') {
                  setShowFind(false);
                  setFindQuery('');
                  setFindResults({ total: 0, current: 0 });
                }
              }}
              autoFocus
            />
            <span className="ws-editor__find-count">
              {findQuery ? `${findResults.current}/${findResults.total}` : ''}
            </span>
            <button className="ws-editor__find-btn" onClick={handleFindPrev} title="Previous (Shift+Enter)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 15l-6-6-6 6"/></svg>
            </button>
            <button className="ws-editor__find-btn" onClick={handleFindNext} title="Next (Enter)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            <button className="ws-editor__find-btn" onClick={() => { setShowFind(false); setFindQuery(''); setFindResults({ total: 0, current: 0 }); updateSearchDecorations('', -1); }} title="Close (Esc)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        )}
      </div>
      <div className="ws-editor__content">
        <EditorContent editor={editor} />
        {linkContextMenu && (
          <div
            className="ws-editor__link-context-menu"
            style={{ top: linkContextMenu.y, left: linkContextMenu.x }}
          >
            <button onClick={handleCopyLink}>Copy link</button>
            <button onClick={() => { window.open(linkContextMenu.href, '_blank'); setLinkContextMenu(null); }}>Open link</button>
            <button onClick={() => { editor?.chain().focus().extendMarkRange('link').unsetLink().run(); setLinkContextMenu(null); }}>Remove link</button>
          </div>
        )}
      </div>
    </div>
  );
}
