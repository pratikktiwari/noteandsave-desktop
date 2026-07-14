import React, { useMemo, useState } from 'react';

interface TagInputProps {
  tags: string[];
  allTags: string[];
  onChange: (tags: string[]) => void;
  createdAt?: number;
}

function normalizeTag(tag: string) {
  return tag.trim();
}

export function TagInput({ tags, allTags, onChange, createdAt }: TagInputProps) {
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const currentTags = useMemo(() => new Set(tags.map((tag) => tag.toLowerCase())), [tags]);

  const suggestions = useMemo(() => {
    const seen = new Set<string>();

    return allTags
      .map(normalizeTag)
      .filter(Boolean)
      .filter((tag) => {
        const key = tag.toLowerCase();
        if (currentTags.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.localeCompare(b));
  }, [allTags, currentTags]);

  const visibleSuggestions = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return [];

    return suggestions.filter((tag) => tag.toLowerCase().includes(query)).slice(0, 6);
  }, [suggestions, value]);

  const addTag = (rawTag: string) => {
    const tag = normalizeTag(rawTag);
    if (!tag || currentTags.has(tag.toLowerCase())) {
      setValue('');
      return;
    }

    onChange([...tags, tag]);
    setValue('');
  };

  const removeTag = (tagToRemove: string) => {
    onChange(tags.filter((tag) => tag !== tagToRemove));
  };

  return (
    <div className="ws-tag-input">
      <div className="ws-tag-input__label-row">
        <div className="ws-tag-input__label">Tags</div>
        {createdAt && (
          <div className="ws-tag-input__created-date">
            {new Date(createdAt).toLocaleDateString(undefined, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </div>
        )}
      </div>
      <div className="ws-tag-input__field">
        <div className="ws-tag-input__tags">
          {tags.map((tag) => (
            <span key={tag} className="ws-tag ws-tag--sm">
              <span>{tag}</span>
              <button
                type="button"
                className="ws-tag__remove"
                onClick={() => removeTag(tag)}
                aria-label={`Remove ${tag} tag`}
              >
                ×
              </button>
            </span>
          ))}
          <div className="ws-tag-input__input-wrap">
            <input
              type="text"
              className="ws-tag-input__input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => window.setTimeout(() => setIsFocused(false), 100)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag(value);
                }

                if (e.key === 'Backspace' && !value && tags.length > 0) {
                  removeTag(tags[tags.length - 1]);
                }
              }}
              placeholder={tags.length === 0 ? 'Add a tag…' : 'Add tag…'}
              aria-label="Add tag"
            />
            {isFocused && visibleSuggestions.length > 0 && (
              <div className="ws-tag-input__suggestions">
                {visibleSuggestions.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="ws-tag-input__suggestion"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => addTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
