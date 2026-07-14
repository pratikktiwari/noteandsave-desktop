import React, { useState, useRef, useEffect } from 'react';
import type { Editor } from '@tiptap/react';

interface ToolbarProps {
  editor: Editor | null;
}

interface ToolbarButton {
  label: string;
  icon: React.ReactNode;
  action: () => void;
  isActive?: boolean;
}

export function Toolbar({ editor }: ToolbarProps) {
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const linkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showLinkInput && linkInputRef.current) {
      linkInputRef.current.focus();
    }
  }, [showLinkInput]);

  if (!editor) return null;

  const applyLink = () => {
    if (linkUrl) {
      try {
        const resolvedUrl = linkUrl.match(/^https?:\/\/|^mailto:/i) ? linkUrl : `https://${linkUrl}`;
        const parsed = new URL(resolvedUrl);
        const allowedProtocols = ['http:', 'https:', 'mailto:'];
        if (allowedProtocols.includes(parsed.protocol)) {
          editor.chain().focus().setLink({ href: resolvedUrl }).run();
        }
      } catch {
        // Invalid URL, do nothing
      }
    }
    setShowLinkInput(false);
    setLinkUrl('');
  };

  const cancelLink = () => {
    setShowLinkInput(false);
    setLinkUrl('');
    editor.commands.focus();
  };

  const buttons: ToolbarButton[] = [
    {
      label: 'Bold',
      icon: <strong>B</strong>,
      action: () => editor.chain().focus().toggleBold().run(),
      isActive: editor.isActive('bold'),
    },
    {
      label: 'Italic',
      icon: <em>I</em>,
      action: () => editor.chain().focus().toggleItalic().run(),
      isActive: editor.isActive('italic'),
    },
    {
      label: 'Underline',
      icon: <span style={{ textDecoration: 'underline' }}>U</span>,
      action: () => editor.chain().focus().toggleUnderline().run(),
      isActive: editor.isActive('underline'),
    },
    {
      label: 'Strikethrough',
      icon: <span style={{ textDecoration: 'line-through' }}>S</span>,
      action: () => editor.chain().focus().toggleStrike().run(),
      isActive: editor.isActive('strike'),
    },
    {
      label: 'Highlight',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <rect x="2" y="16" width="20" height="4" rx="1" opacity="0.4" />
          <text x="6" y="14" fontSize="14" fontWeight="bold">H</text>
        </svg>
      ),
      action: () => editor.chain().focus().toggleHighlight().run(),
      isActive: editor.isActive('highlight'),
    },
    {
      label: 'Inline Code',
      icon: <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>&lt;/&gt;</span>,
      action: () => editor.chain().focus().toggleCode().run(),
      isActive: editor.isActive('code'),
    },
  ];

  const headingButtons: ToolbarButton[] = [
    {
      label: 'Heading 1',
      icon: 'H1',
      action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      isActive: editor.isActive('heading', { level: 1 }),
    },
    {
      label: 'Heading 2',
      icon: 'H2',
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      isActive: editor.isActive('heading', { level: 2 }),
    },
    {
      label: 'Heading 3',
      icon: 'H3',
      action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      isActive: editor.isActive('heading', { level: 3 }),
    },
  ];

  const listButtons: ToolbarButton[] = [
    {
      label: 'Bullet List',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <circle cx="4" cy="6" r="1" fill="currentColor" />
          <circle cx="4" cy="12" r="1" fill="currentColor" />
          <circle cx="4" cy="18" r="1" fill="currentColor" />
        </svg>
      ),
      action: () => editor.chain().focus().toggleBulletList().run(),
      isActive: editor.isActive('bulletList'),
    },
    {
      label: 'Numbered List',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="10" y1="6" x2="21" y2="6" />
          <line x1="10" y1="12" x2="21" y2="12" />
          <line x1="10" y1="18" x2="21" y2="18" />
          <text x="2" y="8" fontSize="8" fill="currentColor" stroke="none">1</text>
          <text x="2" y="14" fontSize="8" fill="currentColor" stroke="none">2</text>
          <text x="2" y="20" fontSize="8" fill="currentColor" stroke="none">3</text>
        </svg>
      ),
      action: () => editor.chain().focus().toggleOrderedList().run(),
      isActive: editor.isActive('orderedList'),
    },
    {
      label: 'Checklist',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 11l3 3L22 4" />
          <rect x="3" y="11" width="8" height="8" rx="1" />
        </svg>
      ),
      action: () => editor.chain().focus().toggleTaskList().run(),
      isActive: editor.isActive('taskList'),
    },
  ];

  const blockButtons: ToolbarButton[] = [
    {
      label: 'Code Block',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      ),
      action: () => editor.chain().focus().toggleCodeBlock().run(),
      isActive: editor.isActive('codeBlock'),
    },
    {
      label: 'Quote',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
          <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
        </svg>
      ),
      action: () => editor.chain().focus().toggleBlockquote().run(),
      isActive: editor.isActive('blockquote'),
    },
    {
      label: 'Divider',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="2" y1="12" x2="22" y2="12" />
        </svg>
      ),
      action: () => editor.chain().focus().setHorizontalRule().run(),
    },
    {
      label: 'Link',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      ),
      action: () => {
        if (editor.isActive('link')) {
          editor.chain().focus().unsetLink().run();
        } else {
          setLinkUrl('');
          setShowLinkInput(true);
        }
      },
      isActive: editor.isActive('link'),
    },
    {
      label: 'Table',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="15" x2="21" y2="15" />
          <line x1="9" y1="3" x2="9" y2="21" />
          <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
      ),
      action: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
  ];

  return (
    <div className="ws-toolbar" role="toolbar" aria-label="Formatting toolbar">
      <div className="ws-toolbar__group">
        {buttons.map((btn) => (
          <button
            key={btn.label}
            className={`ws-toolbar__btn ${btn.isActive ? 'ws-toolbar__btn--active' : ''}`}
            onClick={btn.action}
            title={btn.label}
            aria-label={btn.label}
            aria-pressed={btn.isActive}
          >
            {btn.icon}
          </button>
        ))}
      </div>
      <div className="ws-toolbar__separator" />
      <div className="ws-toolbar__group">
        {headingButtons.map((btn) => (
          <button
            key={btn.label}
            className={`ws-toolbar__btn ${btn.isActive ? 'ws-toolbar__btn--active' : ''}`}
            onClick={btn.action}
            title={btn.label}
            aria-label={btn.label}
            aria-pressed={btn.isActive}
          >
            {btn.icon}
          </button>
        ))}
      </div>
      <div className="ws-toolbar__separator" />
      <div className="ws-toolbar__group">
        {listButtons.map((btn) => (
          <button
            key={btn.label}
            className={`ws-toolbar__btn ${btn.isActive ? 'ws-toolbar__btn--active' : ''}`}
            onClick={btn.action}
            title={btn.label}
            aria-label={btn.label}
            aria-pressed={btn.isActive}
          >
            {btn.icon}
          </button>
        ))}
      </div>
      <div className="ws-toolbar__separator" />
      <div className="ws-toolbar__group">
        {blockButtons.map((btn) => (
          <button
            key={btn.label}
            className={`ws-toolbar__btn ${btn.isActive ? 'ws-toolbar__btn--active' : ''}`}
            onClick={btn.action}
            title={btn.label}
            aria-label={btn.label}
            aria-pressed={btn.isActive}
          >
            {btn.icon}
          </button>
        ))}
      </div>
      {showLinkInput && (
        <div className="ws-toolbar__link-input">
          <input
            ref={linkInputRef}
            type="url"
            placeholder="Enter URL..."
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyLink();
              } else if (e.key === 'Escape') {
                cancelLink();
              }
            }}
          />
          <button
            className="ws-toolbar__link-input-btn"
            onClick={applyLink}
          >
            Apply
          </button>
          <button
            className="ws-toolbar__link-input-btn ws-toolbar__link-input-btn--cancel"
            onClick={cancelLink}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
