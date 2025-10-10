import type { AutoEventDefinition } from './types';

const isInteractiveEvent = (event: MouseEvent): boolean => event.button === 0 && !event.defaultPrevented;

const findAnchor = (target: EventTarget | null): HTMLAnchorElement | null => {
  if (!target) return null;
  if (target instanceof HTMLAnchorElement) return target;
  if (target instanceof Element) {
    return target.closest('a');
  }

  return null;
};

const resolveUrl = (href: string): URL | null => {
  try {
    return new URL(href, window.location.href);
  } catch (_error) {
    return null;
  }
};

const isOutbound = (url: URL): boolean => url.origin !== window.location.origin;

interface OutboundClickPayload extends Record<string, unknown> {
  link_url: string;
  link_domain: string;
  link_text?: string;
  link_target?: string;
}

export const outboundClickEvent: AutoEventDefinition = {
  name: 'outbound_click',
  setup: ({ analytics, debug }) => {
    if (typeof window !== 'object' || typeof document === 'undefined') return;

    const handleClick = (event: MouseEvent) => {
      if (!isInteractiveEvent(event)) return;

      const anchor = findAnchor(event.target);
      if (!anchor?.href) return;

      const url = resolveUrl(anchor.href);
      if (!url || !isOutbound(url)) return;

      try {
        const payload: OutboundClickPayload = {
          link_url: url.href,
          link_domain: url.hostname,
        };

        if (anchor.textContent) {
          const text = anchor.textContent.trim();
          if (text) {
            payload.link_text = text;
          }
        }

        if (anchor.target) {
          payload.link_target = anchor.target;
        }

        analytics.track('auto', 'outbound_click', payload);
      } catch (error) {
        if (debug) {
          console.warn('[pulse-js] failed to record outbound_click auto-event', error);
        }
      }
    };

    document.addEventListener('click', handleClick, true);

    return () => {
      document.removeEventListener('click', handleClick, true);
    };
  },
};
