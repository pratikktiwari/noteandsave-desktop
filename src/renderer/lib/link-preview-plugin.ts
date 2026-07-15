import { Plugin, PluginKey } from '@tiptap/pm/state';
import { EditorView } from '@tiptap/pm/view';

const linkPreviewPluginKey = new PluginKey('linkPreview');

/**
 * A ProseMirror plugin that shows a tooltip with the target URL
 * when the user hovers over a hyperlink in the editor.
 */
export function linkPreviewPlugin(): Plugin {
  let tooltipEl: HTMLDivElement | null = null;
  let hideTimeout: ReturnType<typeof setTimeout> | null = null;

  function createTooltip(view: EditorView): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'ws-link-preview-tooltip';
    el.style.display = 'none';
    view.dom.parentElement?.appendChild(el);
    return el;
  }

  function showTooltip(
    tooltip: HTMLDivElement,
    href: string,
    linkEl: HTMLElement,
    view: EditorView,
  ) {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }

    tooltip.textContent = href;
    tooltip.style.display = 'block';

    // Position tooltip below the link
    const linkRect = linkEl.getBoundingClientRect();
    const parentRect = view.dom.parentElement?.getBoundingClientRect();
    if (!parentRect) return;

    const top = linkRect.bottom - parentRect.top + 4;
    const left = linkRect.left - parentRect.left;

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
  }

  function hideTooltip(tooltip: HTMLDivElement) {
    hideTimeout = setTimeout(() => {
      tooltip.style.display = 'none';
    }, 150);
  }

  return new Plugin({
    key: linkPreviewPluginKey,
    view(editorView) {
      tooltipEl = createTooltip(editorView);

      const handleMouseOver = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        const linkElement = target.closest('a[href]') as HTMLAnchorElement | null;

        if (linkElement && tooltipEl) {
          const href = linkElement.getAttribute('href');
          if (href) {
            showTooltip(tooltipEl, href, linkElement, editorView);
          }
        }
      };

      const handleMouseOut = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        const relatedTarget = event.relatedTarget as HTMLElement | null;

        // Only hide if we're leaving a link and not entering another link
        if (target.closest('a[href]') && !relatedTarget?.closest('a[href]')) {
          if (tooltipEl) {
            hideTooltip(tooltipEl);
          }
        }
      };

      editorView.dom.addEventListener('mouseover', handleMouseOver);
      editorView.dom.addEventListener('mouseout', handleMouseOut);

      return {
        destroy() {
          editorView.dom.removeEventListener('mouseover', handleMouseOver);
          editorView.dom.removeEventListener('mouseout', handleMouseOut);
          if (hideTimeout) clearTimeout(hideTimeout);
          tooltipEl?.remove();
          tooltipEl = null;
        },
      };
    },
  });
}
