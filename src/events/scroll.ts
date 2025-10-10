import type { AutoEventDefinition } from './types';

const SCROLL_DEPTH_THRESHOLD = 0.9;

export const scrollEvent: AutoEventDefinition = {
  name: 'scroll',
  setup: ({ analytics, debug }) => {
    if (typeof window !== 'object' || typeof document === 'undefined') return;

    const listenerOptions: AddEventListenerOptions = { passive: true };

    const computeScrollHeight = () => {
      const body = document.body;
      const docEl = document.documentElement;

      const candidates = [
        body?.scrollHeight ?? 0,
        docEl?.scrollHeight ?? 0,
        body?.offsetHeight ?? 0,
        docEl?.offsetHeight ?? 0,
        docEl?.clientHeight ?? 0,
        body?.clientHeight ?? 0,
        window.innerHeight ?? 0,
      ];

      const max = Math.max(...candidates);
      return max > 0 ? max : window.innerHeight ?? 0;
    };

    const computeScrollProgress = () => {
      const scrollHeight = computeScrollHeight();
      if (scrollHeight <= 0) return 1;

      const viewport = window.innerHeight ?? 0;
      const scrollTop = window.scrollY ?? window.pageYOffset ?? 0;
      const covered = scrollTop + viewport;
      if (viewport === 0 && scrollTop === 0) return 0;
      return Math.max(0, Math.min(covered / scrollHeight, 1));
    };

    const recordScroll = (progress: number) => {
      try {
        analytics.track('auto', 'scroll', {
          scroll_y: Math.round(window.scrollY ?? 0),
          scroll_x: Math.round(window.scrollX ?? 0),
          viewport_height: Math.round(window.innerHeight ?? 0),
          viewport_width: Math.round(window.innerWidth ?? 0),
          scroll_depth_ratio: Number(progress.toFixed(4)),
          scroll_depth_percent: Math.round(progress * 100),
        });
      } catch (error) {
        if (debug) {
          console.warn('[pulse-js] failed to record scroll auto-event', error);
        }
      }
    };

    const cleanup = () => {
      window.removeEventListener('scroll', handleScroll, listenerOptions);
    };

    const tryFire = () => {
      const progress = computeScrollProgress();
      if (progress < SCROLL_DEPTH_THRESHOLD) return false;

      cleanup();
      recordScroll(progress);
      return true;
    };

    const initialScrollTop = window.scrollY ?? window.pageYOffset ?? 0;
    const initialScrollLeft = window.scrollX ?? window.pageXOffset ?? 0;
    let hasUserScrolled = false;

    const handleScroll = () => {
      const currentScrollTop = window.scrollY ?? window.pageYOffset ?? 0;
      const currentScrollLeft = window.scrollX ?? window.pageXOffset ?? 0;

      if (!hasUserScrolled) {
        if (currentScrollTop !== initialScrollTop || currentScrollLeft !== initialScrollLeft) {
          hasUserScrolled = true;
        } else {
          return;
        }
      }

      tryFire();
    };

    window.addEventListener('scroll', handleScroll, listenerOptions);
    return cleanup;
  },
};
