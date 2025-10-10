import { describe, it, expect } from 'vitest';
import { detectDevice } from '../../../src/plugins/device/detectDevice';

type NavigatorMock = {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
};

type PointerOption = 'fine' | 'coarse' | 'none';
type HoverOption = 'hover' | 'none';
type OrientationOption = 'portrait' | 'landscape';

const createNavigator = (overrides: NavigatorMock): NavigatorMock => overrides;

interface WindowOptions {
  width: number;
  height: number;
  dpr?: number;
  pointer?: PointerOption;
  hover?: HoverOption;
  orientation?: OrientationOption;
  reducedMotion?: boolean;
}

const createWindow = ({
  width,
  height,
  dpr = 1,
  pointer = 'fine',
  hover = 'hover',
  orientation,
  reducedMotion = false,
}: WindowOptions): Window => {
  const resolvedOrientation = orientation ?? (width >= height ? 'landscape' : 'portrait');

  const matchMedia = (query: string): MediaQueryList => {
    const normalized = query.toLowerCase();

    const matches = (() => {
      if (normalized.includes('(pointer: coarse)')) return pointer === 'coarse';
      if (normalized.includes('(pointer: fine)')) return pointer === 'fine';
      if (normalized.includes('(pointer: none)')) return pointer === 'none';
      if (normalized.includes('(hover: hover)')) return hover === 'hover';
      if (normalized.includes('(hover: none)')) return hover === 'none';
      if (normalized.includes('(prefers-reduced-motion: reduce)')) return reducedMotion;
      if (normalized.includes('(prefers-reduced-motion: no-preference)')) return !reducedMotion;
      if (normalized.includes('(orientation: portrait)')) return resolvedOrientation === 'portrait';
      if (normalized.includes('(orientation: landscape)')) return resolvedOrientation === 'landscape';
      return false;
    })();

    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    } as MediaQueryList;
  };

  return {
    innerWidth: width,
    innerHeight: height,
    devicePixelRatio: dpr,
    matchMedia,
  } as unknown as Window;
};

describe('detectDevice', () => {
  it('classifies desktop browsers and yields viewport metadata', () => {
    const navigatorMock = createNavigator({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    });

    const windowMock = createWindow({
      width: 1280,
      height: 800,
      dpr: 2,
      pointer: 'fine',
      hover: 'hover',
      orientation: 'landscape',
      reducedMotion: false,
    });

    const device = detectDevice({ navigator: navigatorMock as unknown as Navigator, window: windowMock });

    expect(device).toEqual({
      category: 'desktop',
      os: 'macos',
      userAgent: navigatorMock.userAgent,
      isTouchCapable: false,
      view_port: 'desktop',
      touch: false,
      pointer: 'fine',
      hover: 'hover',
      dpr: 2,
      width: 1280,
      height: 800,
      orientation: 'landscape',
      reduced_motion: false,
      browser: {
        name: 'safari',
        version: '17.0',
      },
    });
  });

  it('detects mobile devices with coarse pointer and reduced motion', () => {
    const navigatorMock = createNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      platform: 'iPhone',
      maxTouchPoints: 5,
    });

    const windowMock = createWindow({
      width: 390,
      height: 844,
      dpr: 3,
      pointer: 'coarse',
      hover: 'none',
      orientation: 'portrait',
      reducedMotion: true,
    });

    const device = detectDevice({ navigator: navigatorMock as unknown as Navigator, window: windowMock });

    expect(device).toEqual({
      category: 'mobile',
      os: 'ios',
      userAgent: navigatorMock.userAgent,
      isTouchCapable: true,
      view_port: 'mobile',
      touch: true,
      pointer: 'coarse',
      hover: 'none',
      dpr: 3,
      width: 390,
      height: 844,
      orientation: 'portrait',
      reduced_motion: true,
      browser: {
        name: 'safari',
        version: '17.0',
      },
    });
  });

  it('detects tablets when Android mobile token is absent', () => {
    const navigatorMock = createNavigator({
      userAgent: 'Mozilla/5.0 (Linux; Android 12; SM-T970) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
    });

    const windowMock = createWindow({
      width: 900,
      height: 1280,
      dpr: 2,
      pointer: 'coarse',
      hover: 'none',
      orientation: 'portrait',
    });

    const device = detectDevice({ navigator: navigatorMock as unknown as Navigator, window: windowMock });

    expect(device).toEqual({
      category: 'tablet',
      os: 'android',
      userAgent: navigatorMock.userAgent,
      isTouchCapable: true,
      view_port: 'tablet',
      touch: true,
      pointer: 'coarse',
      hover: 'none',
      dpr: 2,
      width: 900,
      height: 1280,
      orientation: 'portrait',
      reduced_motion: false,
      browser: {
        name: 'chrome',
        version: '123.0.0.0',
      },
    });
  });

  it('flags bots without interaction metadata', () => {
    const navigatorMock = createNavigator({
      userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      platform: 'Unknown',
      maxTouchPoints: 0,
    });

    const windowMock = createWindow({
      width: 1365,
      height: 1024,
      pointer: 'none',
      hover: 'none',
    });

    const device = detectDevice({ navigator: navigatorMock as unknown as Navigator, window: windowMock });

    expect(device).toEqual({
      category: 'bot',
      os: 'other',
      userAgent: navigatorMock.userAgent,
      isTouchCapable: false,
      view_port: 'desktop',
      touch: false,
      pointer: 'none',
      hover: 'none',
      dpr: 1,
      width: 1365,
      height: 1024,
      orientation: 'landscape',
      reduced_motion: false,
      browser: {
        name: 'bot',
        version: null,
      },
    });
  });

  it('returns null if userAgent missing', () => {
    const navigatorMock = createNavigator({
      userAgent: '',
    });

    const device = detectDevice({ navigator: navigatorMock as unknown as Navigator });
    expect(device).toBeNull();
  });
});
