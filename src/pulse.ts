import { detectDevice, DeviceInfo } from './plugins/device/index.js';
import { setupDataLayerListener } from './plugins/dataLayerListener';
import { setupAutoEvents, type AutoEventName } from './events/index.js';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_AUTO_EVENTS: AutoEventName[] = [
  'first_visit',
  'session_start',
  'page_view',
  'user_engagement',
  'scroll',
  'outbound_click',
];
const CLIENT_COOKIE_NAME = 'pulse_client_uuid';
const CLIENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2; // 2 years

interface AnalyticsConfig {
  debug?: boolean;
  apiEndpoint?: string;
  autoEvents?: AutoEventName[];
  batchSize?: number;
  flushInterval?: number;
  batching?: boolean;
}

type QueuedEvent = {
  eventType: string;
  eventName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>;
  sessionUuid: string | null;
  clientUuid: string | null;
  url: string;
  sentAt: string;
};

class Pulse {
  private initialized = false;
  private config: AnalyticsConfig = {
    debug: false,
    apiEndpoint: 'http://localhost',
    autoEvents: [...DEFAULT_AUTO_EVENTS],
    batchSize: 10,
    flushInterval: 2000,
    batching: true,
  };

  private deviceInfo: DeviceInfo | null = null;
  private eventQueue: QueuedEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushListenersRegistered = false;
  private metadataSentForSession: string | null = null;
  private clientUuid: string | null = null;
  private clientUuidCreated = false;

  get apiEndpoint(): string {
    return this.config.apiEndpoint!;
  }

  get session_uuid(): string | null {
    return localStorage.getItem('pulse_session_uuid');
  }

  get client_uuid(): string | null {
    if (this.clientUuid) return this.clientUuid;
    const fromCookie = this.readClientUuidFromCookie();
    if (fromCookie) {
      this.clientUuid = fromCookie;
      return fromCookie;
    }

    return null;
  }

  track(
    eventType: string,
    eventName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: Record<string, any> = {}
  ): void {
    const navigatorRef = typeof navigator !== 'undefined' ? navigator : undefined;
    const locationRef = typeof window !== 'undefined' ? window.location : undefined;

    if (!navigatorRef || !locationRef) {
      return;
    }

    const sessionUuid = this.session_uuid;
    const clientUuid = this.ensureClientUuid();
    const enrichedPayload = { ...payload };

    const data: QueuedEvent = {
      eventType,
      eventName,
      payload: enrichedPayload,
      sessionUuid,
      clientUuid,
      url: locationRef.href,
      sentAt: new Date().toISOString(),
    };

    const metadataKey = sessionUuid ?? '__no_session__';
    const shouldAttachMetadata = this.metadataSentForSession !== metadataKey;
    if (shouldAttachMetadata) {
      if (navigatorRef.userAgent && enrichedPayload.user_agent === undefined) {
        enrichedPayload.user_agent = navigatorRef.userAgent;
      }
      const deviceInfo = this.device();
      if (deviceInfo) {
        enrichedPayload.device = deviceInfo;
      }
      this.metadataSentForSession = metadataKey;
    }

    const batchingEnabled = this.config.batching !== false;

    if (!batchingEnabled) {
      if (this.config.debug) {
        console.groupCollapsed(`[pulse-js] immediate -> '${eventType}:${eventName}'`);
        console.log('Payload:', data);
        console.groupEnd();
      }
      this.dispatchBatch([data]);
      return;
    }

    this.eventQueue.push(data);

    const batchSize = this.getBatchSize();
    if (this.eventQueue.length >= batchSize) {
      this.flushEventQueue('size');
    } else {
      this.scheduleFlush();
    }

    if (this.config.debug) {
      console.groupCollapsed(`[pulse-js] queued -> '${eventType}:${eventName}'`);
      console.log('Queued event payload:', data);
      console.log('Current queue length:', this.eventQueue.length);
      console.groupEnd();
    }
  }

  private scheduleFlush() {
    if (this.flushTimer !== null) return;

    const flushInterval = this.getFlushInterval();
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushEventQueue('timer');
    }, flushInterval);
  }

  private flushEventQueue(trigger: 'size' | 'timer' | 'manual' = 'timer') {
    const batchSize = this.getBatchSize();

    if (trigger !== 'size' && this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (trigger === 'size') {
      while (this.eventQueue.length >= batchSize) {
        const batch = this.eventQueue.splice(0, batchSize);
        this.dispatchBatch(batch);
      }

      if (this.eventQueue.length === 0 && this.flushTimer !== null) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
      } else if (this.eventQueue.length > 0) {
        this.scheduleFlush();
      }

      return;
    }

    while (this.eventQueue.length > 0) {
      const batch = this.eventQueue.splice(0, batchSize);
      this.dispatchBatch(batch);
    }
  }

  private getBatchSize() {
    const configured = this.config.batchSize ?? 10;
    return configured > 0 ? configured : 10;
  }

  private getFlushInterval() {
    const configured = this.config.flushInterval ?? 2000;
    return configured > 0 ? configured : 2000;
  }

  private dispatchBatch(batch: QueuedEvent[]) {
    if (batch.length === 0) return;

    const endpoint = this.apiEndpoint;
    const navigatorRef = typeof navigator !== 'undefined' ? navigator : undefined;
    const body = JSON.stringify({
      events: batch,
      batchSentAt: new Date().toISOString(),
    });
    const blob = new Blob([body], { type: 'application/json' });

    const success = navigatorRef?.sendBeacon?.(endpoint, blob);

    if (!success) {
      if (typeof fetch !== 'function') {
        if (this.config.debug) {
          console.warn(
            `[pulse-js] fetch fallback unavailable for batch of ${batch.length} event(s)`
          );
        }
        return;
      }

      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch((err) => {
        if (this.config.debug) {
          console.warn(
            `[pulse-js] fetch fallback failed for batch of ${batch.length} event(s)`,
            err
          );
        }
      });
    }
  }

  private registerFlushListeners() {
    if (this.flushListenersRegistered) return;
    if (typeof window === 'undefined') return;

    const flushPending = () => this.flushEventQueue('manual');

    window.addEventListener?.('pagehide', flushPending);
    window.addEventListener?.('beforeunload', flushPending);

    if (typeof document !== 'undefined') {
      document.addEventListener?.('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          flushPending();
        }
      });
    }

    this.flushListenersRegistered = true;
  }

  private readClientUuidFromCookie(): string | null {
    if (typeof document === 'undefined' || typeof document.cookie !== 'string') return null;

    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [rawName, ...rest] = cookie.trim().split('=');
      if (rawName === CLIENT_COOKIE_NAME) {
        return decodeURIComponent(rest.join('='));
      }
    }

    return null;
  }

  private ensureClientUuid(): string | null {
    if (typeof document === 'undefined') {
      this.clientUuidCreated = false;
      return null;
    }

    const existing = this.readClientUuidFromCookie();
    if (existing) {
      this.clientUuid = existing;
      this.clientUuidCreated = false;
      return existing;
    }

    const newId = uuidv4();
    document.cookie = `${CLIENT_COOKIE_NAME}=${encodeURIComponent(
      newId
    )}; path=/; max-age=${CLIENT_COOKIE_MAX_AGE}; SameSite=Lax`;
    this.clientUuid = newId;
    this.clientUuidCreated = true;
    return newId;
  }

  async init(userConfig?: AnalyticsConfig) {
    if (this.initialized) return;

    const initTimestamp = Date.now();
    const mergedAutoEvents = userConfig?.autoEvents ?? this.config.autoEvents ?? DEFAULT_AUTO_EVENTS;
    this.ensureClientUuid();
    const clientCreated = this.clientUuidCreated;

    this.config = {
      ...this.config,
      ...userConfig,
      autoEvents: [...mergedAutoEvents],
    };
    this.initialized = true;

    const existing = localStorage.getItem('pulse_session_uuid');
    let sessionCreated = false;
    if (!existing) {
      const newSessionId = uuidv4();
      localStorage.setItem('pulse_session_uuid', newSessionId);
      sessionCreated = true;
      this.metadataSentForSession = null;
    } else {
      this.metadataSentForSession = existing;
    }

    setupDataLayerListener(this);

    setupAutoEvents(this, {
      events: this.config.autoEvents ?? DEFAULT_AUTO_EVENTS,
      sessionCreated,
      debug: Boolean(this.config.debug),
      initTimestamp,
      clientCreated,
    });

    if (this.config.batching === false) {
      if (this.eventQueue.length > 0) {
        this.flushEventQueue('manual');
      }
      if (this.flushTimer !== null) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
      }
    } else {
      this.registerFlushListeners();
    }
  }

  isInitialized() {
    return this.initialized;
  }

  device(): DeviceInfo | null {
    if (this.deviceInfo) return this.deviceInfo;
    const info = detectDevice();
    if (info) {
      this.deviceInfo = info;
      return info;
    }

    return null;
  }
}

export const pulse = new Pulse();
