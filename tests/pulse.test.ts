import { vi, describe, it, expect, beforeEach, afterEach, type Mock } from 'vitest';
import { pulse } from '../src/pulse';
import { v4 as uuidv4 } from 'uuid';

const defaultDeviceInfo = {
  category: 'desktop',
  os: 'macos',
  userAgent: 'mock-ua',
  isTouchCapable: false,
  view_port: 'desktop',
  touch: false,
  pointer: 'fine',
  hover: 'hover',
  dpr: 2,
  width: 1440,
  height: 900,
  orientation: 'landscape',
  reduced_motion: false,
  browser: {
    name: 'chrome',
    version: '126.0',
  },
} as const;

const { detectDeviceMock } = vi.hoisted(() => ({
  detectDeviceMock: vi.fn(() => ({ ...defaultDeviceInfo })),
}));

const { setupAutoEventsMock } = vi.hoisted(() => ({
  setupAutoEventsMock: vi.fn(),
}));

const { setupDataLayerListenerMock } = vi.hoisted(() => ({
  setupDataLayerListenerMock: vi.fn(),
}));

const CLIENT_COOKIE_NAME = 'pulse_client_uuid';

vi.mock('../src/plugins/device/index', () => ({
  detectDevice: detectDeviceMock,
}));

vi.mock('../src/events/index', () => ({
  setupAutoEvents: setupAutoEventsMock,
}));

vi.mock('../src/plugins/dataLayerListener', () => ({
  setupDataLayerListener: setupDataLayerListenerMock,
}));

vi.mock('uuid', async () => {
  return { v4: vi.fn(() => 'mock-uuid') };
});

function stubBlobForText() {
  const originalBlob = globalThis.Blob;

  class TestBlob {
    private parts: unknown[];
    type: string;

    constructor(parts: unknown[], options?: BlobPropertyBag) {
      this.parts = parts;
      this.type = options?.type ?? '';
    }

    async text() {
      return this.parts
        .map((part) => {
          if (typeof part === 'string') return part;
          if (ArrayBuffer.isView(part)) {
            return new TextDecoder().decode(part as ArrayBufferView);
          }
          if (part instanceof ArrayBuffer) {
            return new TextDecoder().decode(new Uint8Array(part));
          }
          return String(part);
        })
        .join('');
    }
  }

  (globalThis as any).Blob = TestBlob as unknown;

  return () => {
    (globalThis as any).Blob = originalBlob;
  };
}

describe('pulse', () => {
  const defaultAutoEvents = [
    'first_visit',
    'session_start',
    'page_view',
    'user_engagement',
    'scroll',
    'outbound_click',
  ];

  let originalSendBeacon: Navigator['sendBeacon'] | undefined;
  let originalFetch: typeof fetch | undefined;
  let originalBlob: typeof Blob;
  let originalUserAgentDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    (pulse as any).initialized = false;
    (pulse as any).deviceInfo = null;
    (pulse as any).clientUuid = null;
    (pulse as any).config = {
      debug: false,
      apiEndpoint: 'http://localhost',
      autoEvents: [...defaultAutoEvents],
      batchSize: 10,
      flushInterval: 2000,
      batching: true,
    };
    (pulse as any).eventQueue = [];
    (pulse as any).flushTimer = null;
    localStorage.clear();
    vi.clearAllMocks();
    detectDeviceMock.mockReset();
    detectDeviceMock.mockImplementation(() => ({ ...defaultDeviceInfo }));
    (uuidv4 as unknown as Mock).mockReset();
    (uuidv4 as unknown as Mock).mockReturnValue('mock-uuid');
    setupAutoEventsMock.mockReset();
    setupDataLayerListenerMock.mockReset();
    originalSendBeacon = window.navigator.sendBeacon;
    originalFetch = globalThis.fetch;
    originalBlob = globalThis.Blob;
    document.cookie = `${CLIENT_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    originalUserAgentDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'userAgent');
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      get() {
        return 'mock-ua';
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window.navigator, 'sendBeacon', {
      configurable: true,
      value: originalSendBeacon,
    });
    (globalThis as any).fetch = originalFetch;
    (window as unknown as { fetch?: typeof fetch }).fetch = originalFetch as typeof fetch | undefined;
    (globalThis as any).Blob = originalBlob;
    document.cookie = `${CLIENT_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    if (originalUserAgentDescriptor) {
      Object.defineProperty(window.navigator, 'userAgent', originalUserAgentDescriptor);
    }
    vi.useRealTimers();
  });

  it('is not initialized by default', () => {
    expect(pulse.isInitialized()).toBe(false);
  });

  it('initializes, sets session id, and wires auto-events', async () => {
    await pulse.init({ apiEndpoint: 'http://test.local' });

    expect(pulse.isInitialized()).toBe(true);
    expect(localStorage.getItem('pulse_session_uuid')).toBe('mock-uuid');
    expect(setupDataLayerListenerMock).toHaveBeenCalledTimes(1);
    expect(setupDataLayerListenerMock).toHaveBeenCalledWith(pulse);
    expect(setupAutoEventsMock).toHaveBeenCalledTimes(1);
    expect(setupAutoEventsMock).toHaveBeenCalledWith(
      pulse,
      expect.objectContaining({
        events: defaultAutoEvents,
        sessionCreated: true,
      })
    );
  });

  it('does not override an existing session id', async () => {
    localStorage.setItem('pulse_session_uuid', 'existing-id');
    document.cookie = `${CLIENT_COOKIE_NAME}=existing-client; path=/`;

    await pulse.init({ batchSize: 2 });

    expect(localStorage.getItem('pulse_session_uuid')).toBe('existing-id');
    expect((uuidv4 as unknown as Mock)).not.toHaveBeenCalled();
    expect(setupAutoEventsMock).toHaveBeenCalledWith(
      pulse,
      expect.objectContaining({
        sessionCreated: false,
      })
    );
  });

  it('respects custom auto event configuration', async () => {
    await pulse.init({ autoEvents: ['session_start'] });

    expect(setupAutoEventsMock).toHaveBeenCalledWith(
      pulse,
      expect.objectContaining({
        events: ['session_start'],
      })
    );
  });

  it('detects device information lazily', async () => {
    await pulse.init();
    expect(detectDeviceMock).not.toHaveBeenCalled();

    const device = pulse.device();
    expect(detectDeviceMock).toHaveBeenCalledTimes(1);
    expect(device).toEqual(defaultDeviceInfo);
  });

  it('caches device information after the first lookup', async () => {
    await pulse.init();

    const first = pulse.device();
    const second = pulse.device();

    expect(detectDeviceMock).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('retries device detection if the first attempt returns null', async () => {
    detectDeviceMock.mockImplementationOnce(() => null).mockImplementation(() => ({ ...defaultDeviceInfo }));

    await pulse.init();

    expect(pulse.device()).toBeNull();
    expect(detectDeviceMock).toHaveBeenCalledTimes(1);

    expect(pulse.device()).toEqual(defaultDeviceInfo);
    expect(detectDeviceMock).toHaveBeenCalledTimes(2);
  });

  it('exposes session_uuid when present in localStorage', async () => {
    expect(pulse.session_uuid).toBeNull();

    await pulse.init();

    expect(localStorage.getItem('pulse_session_uuid')).toBe('mock-uuid');
    expect(pulse.session_uuid).toBe('mock-uuid');
  });

  it('session_uuid getter mirrors existing localStorage values', () => {
    localStorage.setItem('pulse_session_uuid', 'manual-session-id');
    expect(pulse.session_uuid).toBe('manual-session-id');
    expect(localStorage.getItem('pulse_session_uuid')).toBe('manual-session-id');
  });

  it('defaults api endpoint to localhost', () => {
    expect(pulse.apiEndpoint).toBe('http://localhost');
  });

  it('ensures a client uuid cookie exists on init when missing', async () => {
    expect(pulse.client_uuid).toBeNull();

    await pulse.init();

    const cookieEntry = document.cookie
      .split(';')
      .map((c) => c.trim())
      .find((entry) => entry.startsWith(`${CLIENT_COOKIE_NAME}=`));

    expect(cookieEntry).toBeDefined();
    expect(pulse.client_uuid).toBe('mock-uuid');
  });

  it('reads client uuid from existing cookie without regenerating', async () => {
    document.cookie = `${CLIENT_COOKIE_NAME}=existing-client; path=/`;
    localStorage.setItem('pulse_session_uuid', 'existing-session');

    await pulse.init();

    expect(pulse.client_uuid).toBe('existing-client');
    expect((uuidv4 as unknown as Mock)).not.toHaveBeenCalled();
  });

  it('batches events and uses sendBeacon when batch size is reached', async () => {
    await pulse.init();

    const sendBeaconMock = vi.fn(() => true);
    Object.defineProperty(window.navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeaconMock,
    });

    const fetchMock = vi.fn();
    (globalThis as any).fetch = fetchMock;
    (window as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const restoreBlob = stubBlobForText();

    try {
      for (let i = 0; i < 10; i += 1) {
        pulse.track('event', `event_${i}`, { index: i });
      }

      expect(sendBeaconMock).toHaveBeenCalledTimes(1);
      const [, blob] = sendBeaconMock.mock.calls[0];
      const payload = JSON.parse(await (blob as { text: () => Promise<string> }).text());
      expect(payload.events).toHaveLength(10);
      expect(payload.events[0]).toMatchObject({
        eventType: 'event',
        eventName: 'event_0',
        clientUuid: 'mock-uuid',
        sessionUuid: 'mock-uuid',
      });
      expect(payload.events[0].userAgent).toBe('mock-ua');
      expect(payload.events[0].payload.device).toEqual(defaultDeviceInfo);
      expect(payload.events[1]?.userAgent).toBeUndefined();
      expect(payload.events[1]?.payload.device).toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      restoreBlob();
    }
  });

  it('flushes remaining events after the flush interval using fetch fallback', async () => {
    vi.useFakeTimers();

    Object.defineProperty(window.navigator, 'sendBeacon', {
      configurable: true,
      value: undefined,
    });

    const fetchMock = vi.fn(() => Promise.resolve(undefined));
    (globalThis as any).fetch = fetchMock;

    await pulse.init({ flushInterval: 50 });

    pulse.track('event', 'delayed_event', { foo: 'bar' });

    expect(fetchMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(50);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = init?.body as string;
    const payload = JSON.parse(body);
    expect(payload.events).toHaveLength(1);
    expect(payload.events[0]).toMatchObject({
      eventName: 'delayed_event',
      clientUuid: 'mock-uuid',
      sessionUuid: 'mock-uuid',
    });
    expect(payload.events[0].userAgent).toBe('mock-ua');
    expect(payload.events[0].payload.device).toEqual(defaultDeviceInfo);
  });

  it('sends immediately when batching is disabled', async () => {
    await pulse.init({ batching: false });

    const sendBeaconMock = vi.fn(() => true);
    Object.defineProperty(window.navigator, 'sendBeacon', {
      configurable: true,
      value: sendBeaconMock,
    });

    const fetchMock = vi.fn();
    (globalThis as any).fetch = fetchMock;

    const restoreBlob = stubBlobForText();

    try {
      pulse.track('event', 'immediate_event', { foo: 'bar' });

      expect(sendBeaconMock).toHaveBeenCalledTimes(1);
      const [, blob] = sendBeaconMock.mock.calls[0];
      const payload = JSON.parse(await (blob as { text: () => Promise<string> }).text());
      expect(payload.events).toHaveLength(1);
      expect(payload.events[0]).toMatchObject({
        eventName: 'immediate_event',
        clientUuid: 'mock-uuid',
        sessionUuid: 'mock-uuid',
      });
      expect(payload.events[0].userAgent).toBe('mock-ua');
      expect(payload.events[0].payload.device).toEqual(defaultDeviceInfo);
      expect((pulse as any).eventQueue).toHaveLength(0);
      expect((pulse as any).flushTimer).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      restoreBlob();
    }
  });

  it('omits metadata on subsequent events within the same session', async () => {
    await pulse.init({ batchSize: 5 });

    const restoreBlob = stubBlobForText();

    try {
      pulse.track('custom', 'first', {});
      pulse.track('custom', 'second', {});
    } finally {
      restoreBlob();
    }

    const queue = (pulse as any).eventQueue as Array<Record<string, unknown>>;
    expect(queue).toHaveLength(2);
    expect(queue[0]).toMatchObject({
      eventName: 'first',
      userAgent: 'mock-ua',
    });
    expect(queue[0].payload.device).toEqual(defaultDeviceInfo);
    expect(queue[1]).toMatchObject({
      eventName: 'second',
    });
    expect(queue[1].userAgent).toBeUndefined();
    expect(queue[1].payload.device).toBeUndefined();

    if ((pulse as any).flushTimer) {
      clearTimeout((pulse as any).flushTimer);
      (pulse as any).flushTimer = null;
    }
  });
});
