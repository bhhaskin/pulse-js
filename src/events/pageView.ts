import type { AutoEventDefinition } from './types';

const getPagePayload = (): Record<string, unknown> => {
  const { location, document } = window;
  const payload: Record<string, unknown> = {
    page_location: location.href,
    page_path: location.pathname,
  };

  if (document?.title) {
    payload.page_title = document.title;
  }

  if (document?.referrer) {
    payload.page_referrer = document.referrer;
  }

  return payload;
};

export const pageViewEvent: AutoEventDefinition = {
  name: 'page_view',
  setup: ({ analytics, debug, sessionCreated }) => {
    if (typeof window !== 'object' || typeof document === 'undefined') return;

    try {
      const payload = getPagePayload();
      if (sessionCreated) {
        const device = analytics.device();
        if (device) {
          payload.device = device;
        }
      }

      analytics.track('auto', 'page_view', payload);
    } catch (error) {
      if (debug) {
        console.warn('[pulse-js] failed to record page_view auto-event', error);
      }
    }
  },
};
