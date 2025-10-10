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

  beforeEach(() => {
    localStorage.clear();
    trackMock = vi.fn();
    deviceMock = vi.fn(() => deviceInfo);
    sessionId = 'session-1';
    analytics = {
      track: trackMock,
      device: deviceMock,
      get session_uuid() {
        return sessionId;
      },
      get client_uuid() {
        return 'client-1';
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
    });

    const recordedAt = localStorage.getItem('pulse_first_visit_at');
    expect(recordedAt).not.toBeNull();
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
    });

    expect(localStorage.getItem('pulse_first_visit_at')).toBe(recordedAt);
    expect(trackMock).not.toHaveBeenCalled();
  });

  it('records session_start only when a session is created', () => {
    setupAutoEvents(analytics, {
      events: ['session_start'],
      sessionCreated: true,
      debug: false,
      initTimestamp: 1_700_000_000_000,
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
    });

    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith(
      'auto',
      'page_view',
      expect.objectContaining({
        page_location: window.location.href,
        page_path: window.location.pathname,
        page_title: 'Page Title',
      })
    );

    const payload = trackMock.mock.calls[0][2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('device');
  });

  it('includes device metadata on page_view when session is newly created', () => {
    setupAutoEvents(analytics, {
      events: ['page_view'],
      sessionCreated: true,
      debug: false,
      initTimestamp: Date.now(),
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
    });

    expect(trackMock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10_000);

    expect(trackMock).toHaveBeenCalledTimes(1);
    expect(trackMock).toHaveBeenCalledWith(
      'auto',
      'user_engagement',
      expect.objectContaining({ engagement_time_msec: 10_000 })
    );
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
