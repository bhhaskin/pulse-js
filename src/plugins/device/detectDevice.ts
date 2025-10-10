const TOUCH_POINT_THRESHOLD = 1;

const DESKTOP_MIN_WIDTH = 1024;
const TABLET_MIN_WIDTH = 768;

type NavigatorLike = Pick<Navigator, 'userAgent' | 'platform'> & Partial<Pick<Navigator, 'maxTouchPoints'>>;
type WindowLike = Pick<Window, 'innerWidth' | 'innerHeight' | 'devicePixelRatio' | 'matchMedia'>;

type PointerCapability = 'fine' | 'coarse' | 'none' | 'unknown';
type HoverCapability = 'hover' | 'none' | 'unknown';
type ViewportCategory = 'desktop' | 'tablet' | 'mobile' | 'unknown';
type Orientation = 'portrait' | 'landscape' | 'unknown';
type BrowserName = 'chrome' | 'safari' | 'firefox' | 'edge' | 'opera' | 'ie' | 'bot' | 'unknown';

export type DeviceCategory = 'mobile' | 'tablet' | 'desktop' | 'bot' | 'unknown';
export type DeviceOS = 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'other' | 'unknown';

export interface BrowserInfo {
  name: BrowserName;
  version: string | null;
}

export interface DeviceInfo {
  category: DeviceCategory;
  os: DeviceOS;
  userAgent: string;
  isTouchCapable: boolean;
  view_port: ViewportCategory;
  touch: boolean;
  pointer: PointerCapability;
  hover: HoverCapability;
  dpr: number;
  width: number;
  height: number;
  orientation: Orientation;
  reduced_motion: boolean;
  browser: BrowserInfo;
}

export interface DeviceDetectionOverrides {
  navigator?: NavigatorLike | null;
  window?: WindowLike | null;
}

const BOT_REGEX = /(bot|crawl|spider|slurp|preview|scanner|google web preview|bingpreview|yandex|baiduspider|duckduckbot|semrush|ahrefs)/i;
const TABLET_REGEX = /(ipad|tablet|kindle|silk|playbook)/i;
const MOBILE_REGEX = /(mobi|iphone|ipod|android.*mobile|windows phone|blackberry|bb10|opera mini|mobile safari)/i;

function resolveNavigator(): NavigatorLike | null {
  if (typeof navigator === 'undefined') return null;
  return navigator;
}

function resolveWindow(): WindowLike | null {
  if (typeof window === 'undefined') return null;
  return window;
}

function pickUserAgent(navigatorLike: NavigatorLike | null): string {
  if (!navigatorLike) return '';
  return navigatorLike.userAgent ?? '';
}

function pickPlatform(navigatorLike: NavigatorLike | null): string {
  if (!navigatorLike) return '';
  return navigatorLike.platform ?? '';
}

function pickMaxTouchPoints(navigatorLike: NavigatorLike | null): number {
  if (!navigatorLike) return 0;
  const value = navigatorLike.maxTouchPoints;
  if (typeof value === 'number') return value;
  return 0;
}

function detectCategory(
  userAgent: string,
  platform: string,
  maxTouchPoints: number
): DeviceCategory {
  if (!userAgent) return 'unknown';

  if (BOT_REGEX.test(userAgent)) return 'bot';

  const isIPadOnIOS13 = /macintosh/i.test(userAgent) && maxTouchPoints > TOUCH_POINT_THRESHOLD;
  const isTabletUA = TABLET_REGEX.test(userAgent) ||
    (/android/i.test(userAgent) && !/mobile/i.test(userAgent)) ||
    isIPadOnIOS13;

  if (isTabletUA) return 'tablet';

  if (MOBILE_REGEX.test(userAgent)) return 'mobile';

  if (platform) return 'desktop';

  return 'unknown';
}

function detectOs(userAgent: string): DeviceOS {
  if (!userAgent) return 'unknown';

  if (/windows phone/i.test(userAgent)) return 'windows';
  if (/windows nt/i.test(userAgent)) return 'windows';
  if (/android/i.test(userAgent)) return 'android';
  if (/(ipad|iphone|ipod)/i.test(userAgent)) return 'ios';
  if (/mac os x|macintosh|mac_powerpc/i.test(userAgent)) return 'macos';
  if (/linux/i.test(userAgent)) return 'linux';

  if (BOT_REGEX.test(userAgent)) return 'other';

  return 'unknown';
}

function extractVersion(userAgent: string, pattern: RegExp): string | null {
  const match = userAgent.match(pattern);
  if (!match) return null;
  const version = match[1]?.replace(/_/g, '.');
  return version ?? null;
}

function detectBrowser(userAgent: string): BrowserInfo {
  const normalized = userAgent.toLowerCase();

  if (BOT_REGEX.test(userAgent)) {
    return { name: 'bot', version: null };
  }

  if (/edg\//.test(normalized)) {
    return {
      name: 'edge',
      version: extractVersion(userAgent, /Edg\/([0-9\.]+)/i),
    };
  }

  if (/(opr|opera)\//i.test(userAgent)) {
    return {
      name: 'opera',
      version: extractVersion(userAgent, /(?:OPR|Opera)\/([0-9\.]+)/i),
    };
  }

  if (/crios\//i.test(userAgent)) {
    return {
      name: 'chrome',
      version: extractVersion(userAgent, /CriOS\/([0-9\.]+)/i),
    };
  }

  if (/chrome\//i.test(userAgent) && !/chromium/i.test(userAgent) && !/edg\//i.test(userAgent) && !/opr\//i.test(userAgent)) {
    return {
      name: 'chrome',
      version: extractVersion(userAgent, /Chrome\/([0-9\.]+)/i),
    };
  }

  if (/firefox\//i.test(userAgent)) {
    return {
      name: 'firefox',
      version: extractVersion(userAgent, /Firefox\/([0-9\.]+)/i),
    };
  }

  if (/fxios\//i.test(userAgent)) {
    return {
      name: 'firefox',
      version: extractVersion(userAgent, /FxiOS\/([0-9\.]+)/i),
    };
  }

  if (/safari/i.test(userAgent) && /version\//i.test(userAgent) && !/chrome\//i.test(userAgent)) {
    return {
      name: 'safari',
      version: extractVersion(userAgent, /Version\/([0-9\.]+)/i),
    };
  }

  if (/msie /i.test(userAgent)) {
    return {
      name: 'ie',
      version: extractVersion(userAgent, /MSIE ([0-9\.]+)/i),
    };
  }

  if (/trident\//i.test(userAgent)) {
    return {
      name: 'ie',
      version: extractVersion(userAgent, /rv:([0-9\.]+)/i),
    };
  }

  return { name: 'unknown', version: null };
}

function matchMedia(windowLike: WindowLike | null, query: string): boolean {
  if (!windowLike || typeof windowLike.matchMedia !== 'function') return false;
  try {
    return windowLike.matchMedia(query).matches;
  } catch {
    return false;
  }
}

function detectPointer(windowLike: WindowLike | null): PointerCapability {
  if (!windowLike) return 'unknown';
  if (matchMedia(windowLike, '(pointer: coarse)')) return 'coarse';
  if (matchMedia(windowLike, '(pointer: fine)')) return 'fine';
  if (matchMedia(windowLike, '(pointer: none)')) return 'none';
  return 'unknown';
}

function detectHover(windowLike: WindowLike | null): HoverCapability {
  if (!windowLike) return 'unknown';
  if (matchMedia(windowLike, '(hover: hover)')) return 'hover';
  if (matchMedia(windowLike, '(hover: none)')) return 'none';
  return 'unknown';
}

function detectReducedMotion(windowLike: WindowLike | null): boolean {
  return matchMedia(windowLike, '(prefers-reduced-motion: reduce)');
}

function detectOrientation(windowLike: WindowLike | null, width: number, height: number): Orientation {
  if (!windowLike) {
    if (width && height) return width >= height ? 'landscape' : 'portrait';
    return 'unknown';
  }

  if (matchMedia(windowLike, '(orientation: portrait)')) return 'portrait';
  if (matchMedia(windowLike, '(orientation: landscape)')) return 'landscape';

  if (width && height) return width >= height ? 'landscape' : 'portrait';

  return 'unknown';
}

function detectViewportCategory(width: number): ViewportCategory {
  if (!width) return 'unknown';
  if (width >= DESKTOP_MIN_WIDTH) return 'desktop';
  if (width >= TABLET_MIN_WIDTH) return 'tablet';
  return 'mobile';
}

function detectTouchCapability(maxTouchPoints: number, pointer: PointerCapability): boolean {
  if (maxTouchPoints > TOUCH_POINT_THRESHOLD) return true;
  if (pointer === 'coarse') return true;
  return false;
}

function pickWidth(windowLike: WindowLike | null): number {
  if (!windowLike) return 0;
  return typeof windowLike.innerWidth === 'number' ? windowLike.innerWidth : 0;
}

function pickHeight(windowLike: WindowLike | null): number {
  if (!windowLike) return 0;
  return typeof windowLike.innerHeight === 'number' ? windowLike.innerHeight : 0;
}

function pickDevicePixelRatio(windowLike: WindowLike | null): number {
  if (!windowLike) return 1;
  const ratio = windowLike.devicePixelRatio;
  return typeof ratio === 'number' && !Number.isNaN(ratio) ? ratio : 1;
}

export function detectDevice(overrides?: DeviceDetectionOverrides): DeviceInfo | null {
  const navigatorLike = overrides?.navigator ?? resolveNavigator();
  const windowLike = overrides?.window ?? resolveWindow();
  const userAgent = pickUserAgent(navigatorLike);

  if (!userAgent) return null;

  const normalizedUA = userAgent.toLowerCase();
  const platform = pickPlatform(navigatorLike);
  const maxTouchPoints = pickMaxTouchPoints(navigatorLike);

  const width = pickWidth(windowLike);
  const height = pickHeight(windowLike);
  const pointer = detectPointer(windowLike);
  const hover = detectHover(windowLike);
  const touch = detectTouchCapability(maxTouchPoints, pointer);
  const dpr = pickDevicePixelRatio(windowLike);
  const orientation = detectOrientation(windowLike, width, height);
  const viewPort = detectViewportCategory(width);
  const reducedMotion = detectReducedMotion(windowLike);

  const category = detectCategory(normalizedUA, platform?.toLowerCase?.() ?? '', maxTouchPoints);
  const os = detectOs(normalizedUA);
  const browser = detectBrowser(userAgent);

  return {
    category,
    os,
    userAgent,
    isTouchCapable: touch,
    view_port: viewPort,
    touch,
    pointer,
    hover,
    dpr,
    width,
    height,
    orientation,
    reduced_motion: reducedMotion,
    browser,
  };
}
