import React from 'react';
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

const LANGUAGES = [
  { value: null, label: 'Auto-detect' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'cpp', label: 'C++' },
  { value: 'c', label: 'C' },
  { value: 'java', label: 'Java' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'xml', label: 'XML' },
  { value: 'json', label: 'JSON' },
  { value: 'bash', label: 'Bash' },
  { value: 'sql', label: 'SQL' },
  { value: 'rust', label: 'Rust' },
  { value: 'go', label: 'Go' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'php', label: 'PHP' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'yaml', label: 'YAML' },
];

/**
 * Simple keyword-based language detection for common languages.
 */
function detectLanguage(code: string): string | null {
  if (!code || code.trim().length === 0) return null;

  const lines = code.split('\n').slice(0, 15).join('\n');

  // Python
  if (/\b(def |class |import |from .+ import|print\(|elif |self\.|__init__|lambda )/.test(lines)) {
    return 'python';
  }

  // HTML/XML
  if (/^\s*<!DOCTYPE|<html|<\/\w+>|<\w+[^>]*\/>/.test(lines)) {
    return 'html';
  }
  if (/^\s*<\?xml/.test(lines)) {
    return 'xml';
  }

  // CSS
  if (/^\s*[.#@][\w-]+\s*\{|:\s*(flex|grid|none|block|inline|relative|absolute)/.test(lines)) {
    return 'css';
  }

  // TypeScript
  if (/\b(interface |type .+=|: string|: number|: boolean|<T>|as const)/.test(lines)) {
    return 'typescript';
  }

  // JavaScript
  if (/\b(const |let |var |function |=>|require\(|module\.exports|console\.log|document\.|window\.)/.test(lines)) {
    return 'javascript';
  }

  // C++
  if (/\b(#include\s*<|std::|cout|cin|nullptr|class\s+\w+\s*\{|template\s*<|using namespace)/.test(lines)) {
    return 'cpp';
  }

  // C
  if (/\b(#include\s*<|printf\(|scanf\(|malloc\(|int main\()/.test(lines)) {
    return 'c';
  }

  // Java
  if (/\b(public\s+(static\s+)?class|System\.out|import java\.|void main)/.test(lines)) {
    return 'java';
  }

  // Go
  if (/\b(package\s+main|func\s+\w+|fmt\.|import\s+\()/.test(lines)) {
    return 'go';
  }

  // Rust
  if (/\b(fn\s+\w+|let\s+mut|impl\s+|use\s+std::|println!\()/.test(lines)) {
    return 'rust';
  }

  // Bash
  if (/^\s*(#!\/bin\/(ba)?sh|echo |export |if\s+\[|fi$|done$)/.test(lines)) {
    return 'bash';
  }

  // SQL
  if (/\b(SELECT|INSERT INTO|CREATE TABLE|ALTER TABLE|DROP TABLE|FROM|WHERE)\b/i.test(lines)) {
    return 'sql';
  }

  // JSON
  if (/^\s*[\[{]/.test(lines) && /"\w+":\s*/.test(lines)) {
    return 'json';
  }

  return null;
}

export function CodeBlockView({ node, updateAttributes, extension }: NodeViewProps) {
  const currentLanguage = node.attrs.language;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    updateAttributes({ language: value || null });
  };

  const handleAutoDetect = () => {
    const text = node.textContent || '';
    const detected = detectLanguage(text);
    if (detected) {
      updateAttributes({ language: detected });
    }
  };

  // Auto-detect on first render if no language is set and there's content
  React.useEffect(() => {
    if (!currentLanguage && node.textContent && node.textContent.trim().length > 10) {
      const detected = detectLanguage(node.textContent);
      if (detected) {
        updateAttributes({ language: detected });
      }
    }
  }, []);

  return (
    <NodeViewWrapper className="ws-codeblock-wrapper">
      <div className="ws-codeblock-header" contentEditable={false}>
        <select
          className="ws-codeblock-lang-select"
          value={currentLanguage || ''}
          onChange={handleChange}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.value || 'auto'} value={lang.value || ''}>
              {lang.label}
            </option>
          ))}
        </select>
        {!currentLanguage && (
          <button className="ws-codeblock-detect-btn" onClick={handleAutoDetect} title="Detect language">
            Detect
          </button>
        )}
      </div>
      <pre>
        <NodeViewContent as="code" />
      </pre>
    </NodeViewWrapper>
  );
}
