import type { AutoEventDefinition } from './types';
import type { DeviceInfo } from '../plugins/device';

const FIRST_VISIT_STORAGE_KEY = 'pulse_first_visit_at';

interface FirstVisitPayload extends Record<string, unknown> {
  first_visit_at: string;
  device?: DeviceInfo;
}

export const firstVisitEvent: AutoEventDefinition = {
  name: 'first_visit',
  setup: ({ analytics, debug }) => {
    if (typeof window !== 'object' || typeof localStorage === 'undefined') return;

    try {
      const existing = localStorage.getItem(FIRST_VISIT_STORAGE_KEY);
      if (existing) return;

      const recordedAt = new Date().toISOString();
      localStorage.setItem(FIRST_VISIT_STORAGE_KEY, recordedAt);
      const payload: FirstVisitPayload = {
        first_visit_at: recordedAt,
      };

      const device = analytics.device();
      if (device) {
        payload.device = device;
      }

      analytics.track('auto', 'first_visit', payload);
    } catch (error) {
      if (debug) {
        console.warn('[pulse-js] failed to record first_visit auto-event', error);
      }
    }
  },
};
