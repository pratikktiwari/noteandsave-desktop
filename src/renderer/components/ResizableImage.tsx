import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

export function ResizableImage({ node, updateAttributes, selected }: NodeViewProps) {
  const { src, alt, title, width } = node.attrs;
  const imgRef = useRef<HTMLImageElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent, _direction: 'left' | 'right') => {
      event.preventDefault();
      event.stopPropagation();
      setIsResizing(true);
      startXRef.current = event.clientX;
      startWidthRef.current = imgRef.current?.offsetWidth || 0;
    },
    []
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (event: MouseEvent) => {
      const diff = event.clientX - startXRef.current;
      const newWidth = Math.max(100, startWidthRef.current + diff);
      updateAttributes({ width: newWidth });
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, updateAttributes]);

  return (
    <NodeViewWrapper className="resizable-image-wrapper" data-drag-handle>
      <div
        className={`resizable-image${selected ? ' resizable-image--selected' : ''}${isResizing ? ' resizable-image--resizing' : ''}`}
        style={{ width: width ? `${width}px` : undefined }}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt || ''}
          title={title || ''}
          draggable={false}
        />
        {selected && (
          <>
            <div
              className="resizable-image__handle resizable-image__handle--left"
              onMouseDown={(e) => handleMouseDown(e, 'left')}
            />
            <div
              className="resizable-image__handle resizable-image__handle--right"
              onMouseDown={(e) => handleMouseDown(e, 'right')}
            />
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}
