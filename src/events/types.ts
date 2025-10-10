import type { DeviceInfo } from '../plugins/device';

export type AutoEventName =
  | 'first_visit'
  | 'session_start'
  | 'page_view'
  | 'user_engagement'
  | 'scroll'
  | 'outbound_click';

export interface AnalyticsLike {
  track: (eventType: string, eventName: string, payload?: Record<string, unknown>) => void;
  device: () => DeviceInfo | null;
  readonly session_uuid: string | null;
  readonly client_uuid: string | null;
}

export interface AutoEventContext {
  analytics: AnalyticsLike;
  sessionCreated: boolean;
  initTimestamp: number;
  debug: boolean;
}

export type AutoEventSetupResult = void | (() => void);

export interface AutoEventDefinition {
  name: AutoEventName;
  setup: (context: AutoEventContext) => AutoEventSetupResult;
}
