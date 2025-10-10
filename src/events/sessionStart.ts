import type { AutoEventDefinition } from './types';
import { readSessionTimestamp, SESSION_TIMEOUT_MS, writeSessionTimestamp } from './sessionTimestamp';

export const sessionStartEvent: AutoEventDefinition = {
  name: 'session_start',
  setup: ({ analytics, sessionCreated, debug, initTimestamp }) => {
    const now = Date.now();
    const lastSessionTimestamp = readSessionTimestamp();
    const inactiveTooLong =
      typeof lastSessionTimestamp === 'number' && now - lastSessionTimestamp >= SESSION_TIMEOUT_MS;
    const shouldTrackSessionStart = sessionCreated || inactiveTooLong;

    if (!shouldTrackSessionStart) return;

    if (!writeSessionTimestamp(now) && debug) {
      console.warn('[pulse-js] failed to persist session timestamp to localStorage');
    }

    try {
      const device = analytics.device();
      const payload: Record<string, unknown> = {
        session_started_at: new Date(initTimestamp).toISOString(),
      };

      if (device) {
        payload.device = device;
      }

      analytics.track('auto', 'session_start', payload);
    } catch (error) {
      if (debug) {
        console.warn('[pulse-js] failed to record session_start auto-event', error);
      }
    }
  },
};
