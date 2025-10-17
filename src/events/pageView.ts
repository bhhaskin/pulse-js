import type { AutoEventDefinition } from './types';

const getPagePayload = (): Record<string, unknown> => {
  const { document } = window;
  const payload: Record<string, unknown> = {};

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
