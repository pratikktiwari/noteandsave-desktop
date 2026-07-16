import { Plugin, PluginKey } from '@tiptap/pm/state';
import { EditorView } from '@tiptap/pm/view';

const linkPreviewPluginKey = new PluginKey('linkPreview');

const TOOLTIP_OFFSET_Y = 8;
const HIDE_DELAY_MS = 150;

/**
 * A ProseMirror plugin that shows a tooltip with the target URL
 * when the user hovers over a hyperlink in the editor.
 */
export function linkPreviewPlugin(): Plugin {
  let tooltipEl: HTMLDivElement | null = null;
  let hideTimeout: ReturnType<typeof setTimeout> | null = null;

  function createTooltip(view: EditorView): HTMLDivElement | null {
    const parent = view.dom.parentElement;
    if (!parent) return null;
    const el = document.createElement('div');
    el.className = 'ws-link-preview-tooltip';
    el.style.display = 'none';
    parent.appendChild(el);
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

    // Position tooltip below the link, aligned to link start
    const linkRect = linkEl.getBoundingClientRect();
    const container = tooltip.offsetParent as HTMLElement || view.dom.parentElement;
    const containerRect = container?.getBoundingClientRect();
    if (!containerRect) return;

    const top = linkRect.bottom - containerRect.top + container.scrollTop + TOOLTIP_OFFSET_Y;
    const left = linkRect.left - containerRect.left + container.scrollLeft;

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
  }

  function hideTooltip(tooltip: HTMLDivElement) {
    hideTimeout = setTimeout(() => {
      tooltip.style.display = 'none';
    }, HIDE_DELAY_MS);
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
