import type { AutoEventDefinition } from './types';
import type { DeviceInfo } from '../plugins/device';

const FIRST_VISIT_STORAGE_KEY = 'pulse_first_visit_at';

interface StoredFirstVisitMetadata {
  first_visit_at: string;
  client_uuid: string | null;
}

interface FirstVisitPayload extends Record<string, unknown> {
  first_visit_at: string;
  device?: DeviceInfo;
}

export const firstVisitEvent: AutoEventDefinition = {
  name: 'first_visit',
  setup: ({ analytics, debug, clientCreated }) => {
    if (typeof window !== 'object' || typeof localStorage === 'undefined') return;

    try {
      const clientUuid = analytics.client_uuid;
      if (!clientUuid) return;

      const existing = localStorage.getItem(FIRST_VISIT_STORAGE_KEY);
      let stored: StoredFirstVisitMetadata | null = null;

      if (existing) {
        try {
          const parsed = JSON.parse(existing) as Partial<StoredFirstVisitMetadata>;
          if (parsed && typeof parsed.first_visit_at === 'string') {
            stored = {
              first_visit_at: parsed.first_visit_at,
              client_uuid: typeof parsed.client_uuid === 'string' ? parsed.client_uuid : null,
            };
          }
        } catch {
          stored = {
            first_visit_at: existing,
            client_uuid: null,
          };
        }
      }

      if (stored?.client_uuid === clientUuid && !clientCreated) {
        return;
      }

      if (stored && stored.client_uuid === null && !clientCreated) {
        const upgraded: StoredFirstVisitMetadata = {
          first_visit_at: stored.first_visit_at,
          client_uuid: clientUuid,
        };
        localStorage.setItem(FIRST_VISIT_STORAGE_KEY, JSON.stringify(upgraded));
        return;
      }

      if (!stored && !clientCreated) {
        return;
      }

      const recordedAt = new Date().toISOString();
      const metadata: StoredFirstVisitMetadata = {
        first_visit_at: recordedAt,
        client_uuid: clientUuid,
      };
      localStorage.setItem(FIRST_VISIT_STORAGE_KEY, JSON.stringify(metadata));
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
