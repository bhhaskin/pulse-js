import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setupAutoEvents } from '../../src/events/index';
import type { AnalyticsLike } from '../../src/events/types';
import type { DeviceInfo } from '../../src/plugins/device';

const deviceInfo: DeviceInfo = {
  category: 'desktop',
  os: 'macos',
  userAgent: 'test-agent',
  isTouchCapable: false,
  view_port: 'desktop',
  touch: false,
  pointer: 'fine',
  hover: 'hover',
  dpr: 2,
  width: 1280,
  height: 720,
  orientation: 'landscape',
  reduced_motion: false,
  browser: {
    name: 'chrome',
    version: '99.0',
  },
};

describe('auto events', () => {
  let trackMock: ReturnType<typeof vi.fn>;
  let deviceMock: ReturnType<typeof vi.fn>;
  let sessionId: string | null;
  let clientId: string | null;
  let analytics: AnalyticsLike;
  let restoreFns: Array<() => void>;

  const overrideNumberAccessor = (target: Record<string, unknown>, key: string, initial: number) => {
    let current = initial;
    const original = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, {
      configurable: true,
      get: () => current,
      set: (next: unknown) => {
        current = Number(next);
      },
    });

    restoreFns.push(() => {
      if (original) {
        Object.defineProperty(target, key, original);
      } else {
        delete target[key];
      }
    });

    return {
      set(next: number) {
        current = next;
      },
    };
  };

  const overrideStaticNumber = (target: Record<string, unknown>, key: string, value: number) => {
    const original = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, {
      configurable: true,
      value,
      writable: true,
    });

    restoreFns.push(() => {
      if (original) {
        Object.defineProperty(target, key, original);
      } else {
        delete target[key];
      }
    });
  };

  const overrideStringAccessor = (target: Record<string, unknown>, key: string, initial: string) => {
    let current = initial;
    const original = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, {
      configurable: true,
      get: () => current,
      set: (next: unknown) => {
        current = String(next);
      },
    });

    restoreFns.push(() => {
      if (original) {
        Object.defineProperty(target, key, original);
      } else {
        delete target[key];
      }
    });

    return {
      set(next: string) {
        current = next;
      },
    };
  };

  beforeEach(() => {
    localStorage.clear();
    trackMock = vi.fn();
    deviceMock = vi.fn(() => deviceInfo);
    sessionId = 'session-1';
    clientId = 'client-1';
    analytics = {
      track: trackMock,
      device: deviceMock,
      get session_uuid() {
        return sessionId;
      },
      get client_uuid() {
        return clientId;
      },
    } satisfies AnalyticsLike;
    restoreFns = [];
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    restoreFns.forEach((restore) => restore());
  });

  it('records first_visit only once and stores timestamp', () => {
    setupAutoEvents(analytics, {
      events: ['first_visit'],
      sessionCreated: false,
      debug: false,
      initTimestamp: Date.now(),
      clientCreated: true,
    });

    const storedRaw = localStorage.getItem('pulse_first_visit_at');
    expect(storedRaw).not.toBeNull();
    const stored = JSON.parse(storedRaw!);
    expect(stored).toMatchObject({
      client_uuid: 'client-1',
    });
    const recordedAt = stored.first_visit_at;
    expect(typeof recordedAt).toBe('string');
    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith(
      'auto',
      'first_visit',
      expect.objectContaining({
        device: deviceInfo,
        first_visit_at: recordedAt,
      })
    );

    const firstVisitPayload = trackMock.mock.calls[0][2] as Record<string, unknown>;
    expect(firstVisitPayload.session_id).toBeUndefined();
    trackMock.mockClear();

    setupAutoEvents(analytics, {
      events: ['first_visit'],
      sessionCreated: false,
      debug: false,
      initTimestamp: Date.now(),
      clientCreated: false,
    });

    expect(JSON.parse(localStorage.getItem('pulse_first_visit_at')!)).toMatchObject({
      client_uuid: 'client-1',
      first_visit_at: recordedAt,
    });
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('does not record first_visit when storage is empty but client already exists', () => {
    setupAutoEvents(analytics, {
      events: ['first_visit'],
      sessionCreated: false,
      debug: false,
      initTimestamp: Date.now(),
      clientCreated: false,
    });

    expect(localStorage.getItem('pulse_first_visit_at')).toBeNull();
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('records first_visit again when client uuid changes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));

    setupAutoEvents(analytics, {
      events: ['first_visit'],
      sessionCreated: false,
      debug: false,
      initTimestamp: Date.now(),
      clientCreated: true,
    });

    trackMock.mockClear();
    vi.setSystemTime(new Date('2024-01-02T12:34:56.000Z'));
    clientId = 'client-2';

    setupAutoEvents(analytics, {
      events: ['first_visit'],
      sessionCreated: false,
      debug: false,
      initTimestamp: Date.now(),
      clientCreated: true,
    });

    expect(trackMock).toHaveBeenCalledTimes(1);
    const payload = trackMock.mock.calls[0][2] as Record<string, unknown>;
    expect(payload).toMatchObject({
      first_visit_at: new Date('2024-01-02T12:34:56.000Z').toISOString(),
      device: deviceInfo,
    });

    const stored = JSON.parse(localStorage.getItem('pulse_first_visit_at')!);
    expect(stored).toMatchObject({
      client_uuid: 'client-2',
      first_visit_at: new Date('2024-01-02T12:34:56.000Z').toISOString(),
    });
  });

  it('records first_visit for a new client id even if cookie pre-exists', () => {
    const legacyTimestamp = new Date('2024-01-03T00:00:00.000Z').toISOString();
    localStorage.setItem(
      'pulse_first_visit_at',
      JSON.stringify({ first_visit_at: legacyTimestamp, client_uuid: 'old-client' })
    );

    clientId = 'client-2';

    setupAutoEvents(analytics, {
      events: ['first_visit'],
      sessionCreated: false,
      debug: false,
      initTimestamp: Date.now(),
      clientCreated: false,
    });

    expect(trackMock).toHaveBeenCalledTimes(1);
    const payload = trackMock.mock.calls[0][2] as Record<string, unknown>;
    expect(payload.first_visit_at).not.toBe(legacyTimestamp);
    expect(payload).toMatchObject({
      device: deviceInfo,
    });

    const stored = JSON.parse(localStorage.getItem('pulse_first_visit_at')!);
    expect(stored.client_uuid).toBe('client-2');
  });

  it('records session_start only when a session is created', () => {
    setupAutoEvents(analytics, {
      events: ['session_start'],
      sessionCreated: true,
      debug: false,
      initTimestamp: 1_700_000_000_000,
      clientCreated: false,
    });

    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith(
      'auto',
      'session_start',
      expect.objectContaining({
        device: deviceInfo,
        session_started_at: new Date(1_700_000_000_000).toISOString(),
      })
    );

    const sessionStartPayload = trackMock.mock.calls[0][2] as Record<string, unknown>;
    expect(sessionStartPayload.session_id).toBeUndefined();
    trackMock.mockClear();

    setupAutoEvents(analytics, {
      events: ['session_start'],
      sessionCreated: false,
      debug: false,
      initTimestamp: Date.now(),
      clientCreated: false,
    });

    expect(trackMock).not.toHaveBeenCalled();
  });

  it('records page_view immediately without redundant device metadata', () => {
    const originalTitle = document.title;
    document.title = 'Page Title';
    restoreFns.push(() => {
      document.title = originalTitle;
    });

    setupAutoEvents(analytics, {
      events: ['page_view'],
      sessionCreated: false,
      debug: false,
      initTimestamp: Date.now(),
      clientCreated: false,
    });

    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith(
      'auto',
      'page_view',
      expect.objectContaining({
        page_title: 'Page Title',
      })
    );

    const payload = trackMock.mock.calls[0][2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('device');
    expect(payload).not.toHaveProperty('page_location');
    expect(payload).not.toHaveProperty('page_path');
  });

  it('includes device metadata on page_view when session is newly created', () => {
    setupAutoEvents(analytics, {
      events: ['page_view'],
      sessionCreated: true,
      debug: false,
      initTimestamp: Date.now(),
      clientCreated: false,
    });

    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith(
      'auto',
      'page_view',
      expect.objectContaining({
        device: deviceInfo,
      })
    );
  });

  it('records outbound_click when navigating to an external url', () => {
    const link = document.createElement('a');
    link.href = 'https://external.example.com/somewhere';
    link.textContent = 'Visit external';
    link.addEventListener('click', (event) => event.preventDefault());
    document.body?.appendChild(link);
    restoreFns.push(() => link.remove());

    setupAutoEvents(analytics, {
      events: ['outbound_click'],
      sessionCreated: false,
      debug: false,
      initTimestamp: Date.now(),
      clientCreated: false,
    });

    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith(
      'auto',
      'outbound_click',
      expect.objectContaining({
        link_url: 'https://external.example.com/somewhere',
        link_domain: 'external.example.com',
      })
    );

    const payload = trackMock.mock.calls[0][2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('device');

    const outboundPayload = trackMock.mock.calls[0][2] as Record<string, unknown>;
    expect(outboundPayload.link_text).toBe('Visit external');
  });

  it('records user_engagement after the threshold', () => {
    vi.useFakeTimers();

    setupAutoEvents(analytics, {
      events: ['user_engagement'],
      sessionCreated: false,
      debug: false,
      initTimestamp: Date.now(),
      clientCreated: false,
    });

    expect(trackMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10_000);

    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith(
      'auto',
      'user_engagement',
      expect.objectContaining({ engagement_time_msec: 10_000 })
    );

    vi.advanceTimersByTime(10_000);

    expect(trackMock).toHaveBeenCalledTimes(2);
    expect(trackMock).toHaveBeenLastCalledWith(
      'auto',
      'user_engagement',
      expect.objectContaining({ engagement_time_msec: 10_000 })
    );
  });

  it('accumulates user_engagement across visibility changes', () => {
    vi.useFakeTimers();

    const documentRecord = document as unknown as Record<string, unknown>;
    const visibilityOverride = overrideStringAccessor(
      documentRecord,
      'visibilityState',
      String(document.visibilityState ?? 'visible')
    );
    visibilityOverride.set('visible');

    setupAutoEvents(analytics, {
      events: ['user_engagement'],
      sessionCreated: false,
      debug: false,
      initTimestamp: Date.now(),
      clientCreated: false,
    });

    vi.advanceTimersByTime(5_000);
    expect(trackMock).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('blur'));
    visibilityOverride.set('hidden');
    document.dispatchEvent(new Event('visibilitychange'));

    vi.advanceTimersByTime(60_000);
    expect(trackMock).not.toHaveBeenCalled();

    visibilityOverride.set('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));

    vi.advanceTimersByTime(5_000);

    expect(trackMock).toHaveBeenCalledTimes(1);
    const payload = trackMock.mock.calls[0][2] as Record<string, unknown>;
    expect(payload.engagement_time_msec).toBe(10_000);

    vi.advanceTimersByTime(10_000);

    expect(trackMock).toHaveBeenCalledTimes(2);
    const second = trackMock.mock.calls[1][2] as Record<string, unknown>;
    expect(second.engagement_time_msec).toBe(10_000);
  });

  it('keeps firing user_engagement while the page stays active', () => {
    vi.useFakeTimers();

    setupAutoEvents(analytics, {
      events: ['user_engagement'],
      sessionCreated: false,
      debug: false,
      initTimestamp: Date.now(),
      clientCreated: false,
    });

    vi.advanceTimersByTime(30_000);

    expect(trackMock).toHaveBeenCalledTimes(3);
    trackMock.mock.calls.forEach(([, , payload]) => {
      const engagement = (payload as Record<string, unknown>).engagement_time_msec;
      expect(engagement).toBe(10_000);
    });
  });

  it('records scroll after reaching 90% page depth', () => {
    const windowRecord = window as unknown as Record<string, unknown>;
    const documentElementRecord = document.documentElement as unknown as Record<string, unknown>;
    const bodyRecord = (document.body ?? document.createElement('body')) as unknown as Record<string, unknown>;

    const innerHeightOverride = overrideNumberAccessor(windowRecord, 'innerHeight', 100);
    const scrollYOverride = overrideNumberAccessor(windowRecord, 'scrollY', 0);
    overrideNumberAccessor(windowRecord, 'scrollX', 0);
    overrideStaticNumber(documentElementRecord, 'scrollHeight', 1000);
    overrideStaticNumber(bodyRecord, 'scrollHeight', 1000);

    if (!document.body) {
      document.appendChild(bodyRecord as unknown as HTMLElement);
    }

    setupAutoEvents(analytics, {
      events: ['scroll'],
      sessionCreated: false,
      debug: false,
      initTimestamp: Date.now(),
      clientCreated: false,
    });

    expect(trackMock).not.toHaveBeenCalled();

    scrollYOverride.set(700);
    window.dispatchEvent(new Event('scroll'));
    expect(trackMock).not.toHaveBeenCalled();

    scrollYOverride.set(800);
    window.dispatchEvent(new Event('scroll'));

    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith(
      'auto',
      'scroll',
      expect.objectContaining({
        scroll_depth_percent: 90,
        scroll_depth_ratio: 0.9,
      })
    );

    scrollYOverride.set(900);
    window.dispatchEvent(new Event('scroll'));
    expect(trackMock).toHaveBeenCalledTimes(1);

    // avoid unused variable lint for innerHeightOverride
    innerHeightOverride.set(100);
  });
});
