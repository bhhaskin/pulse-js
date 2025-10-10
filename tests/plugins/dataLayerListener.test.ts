import { describe, it, beforeEach, vi, expect } from 'vitest';
import { setupDataLayerListener } from '../../src/plugins/dataLayerListener';

// Mock analytics instance
const mockAnalytics = {
  track: vi.fn()
};

describe('setupDataLayerListener', () => {
  beforeEach(() => {
    // Reset globals and mocks
    window.pulse_dataLayer = [];
    delete window.__pulse_dataLayer_hooked;
    mockAnalytics.track.mockReset();
  });

  it('does nothing if window.pulse_dataLayer is missing', () => {
    // @ts-expect-error: simulate undefined
    delete window.pulse_dataLayer;
    setupDataLayerListener(mockAnalytics as any);
    expect(mockAnalytics.track).not.toHaveBeenCalled();
  });

  it('does nothing if already hooked', () => {
    window.__pulse_dataLayer_hooked = true;
    setupDataLayerListener(mockAnalytics as any);
    expect(mockAnalytics.track).not.toHaveBeenCalled();
  });

  it('replays existing events', () => {
    window.pulse_dataLayer = [
      ['event', 'page_view', { page: '/home' }],
      ['funnel_event', 'step_submit', { step: 2 }]
    ];
    setupDataLayerListener(mockAnalytics as any);
    expect(mockAnalytics.track).toHaveBeenCalledTimes(2);
    expect(mockAnalytics.track).toHaveBeenCalledWith('event', 'page_view', { page: '/home' });
    expect(mockAnalytics.track).toHaveBeenCalledWith('funnel_event', 'step_submit', { step: 2 });
  });

  it('intercepts pushed events', () => {
    window.pulse_dataLayer = [];
    setupDataLayerListener(mockAnalytics as any);
    window.pulse_dataLayer.push(['event', 'page_view', { page: '/about' }]);

    expect(mockAnalytics.track).toHaveBeenCalledTimes(1);
    expect(mockAnalytics.track).toHaveBeenCalledWith('event', 'page_view', { page: '/about' });
  });

  it('skips invalid entries', () => {
    window.pulse_dataLayer = [
      ['event'],                   // too few elements
      ['event', 123],             // invalid eventName
      ['event', 'page_view'],     // valid
    ];
    setupDataLayerListener(mockAnalytics as any);
    expect(mockAnalytics.track).toHaveBeenCalledTimes(1);
    expect(mockAnalytics.track).toHaveBeenCalledWith('event', 'page_view', {});
  });
});
