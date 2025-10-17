import type { AutoEventDefinition } from './types';
import { writeSessionTimestamp } from './sessionTimestamp';

const USER_ENGAGEMENT_DELAY_MS = 10_000;

export const userEngagementEvent: AutoEventDefinition = {
  name: 'user_engagement',
  setup: ({ analytics, debug }) => {
    if (typeof window !== 'object' || typeof document === 'undefined') return;

    let timerId: ReturnType<typeof setTimeout> | null = null;
    let engagedTime = 0;
    let activeStart: number | null = null;
    let isActive = false;
    let isVisible = document.visibilityState === 'visible';
    let isFocused = true;

    const clearTimer = () => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    };

    const emitEngagement = () => {
      try {
        analytics.track('auto', 'user_engagement', {
          engagement_time_msec: USER_ENGAGEMENT_DELAY_MS,
        });

        if (!writeSessionTimestamp(Date.now()) && debug) {
          console.warn('[pulse-js] failed to persist session timestamp to localStorage');
        }
      } catch (error) {
        if (debug) {
          console.warn('[pulse-js] failed to record user_engagement auto-event', error);
        }
      }
    };

    const flushEngagement = () => {
      while (engagedTime >= USER_ENGAGEMENT_DELAY_MS) {
        emitEngagement();
        engagedTime -= USER_ENGAGEMENT_DELAY_MS;
      }
    };

    const handleActiveElapsed = () => {
      if (!isActive) return;
      if (activeStart !== null) {
        const now = Date.now();
        engagedTime += Math.max(now - activeStart, 0);
        activeStart = now;
      }
      flushEngagement();
      ensureTimer();
    };

    const ensureTimer = () => {
      if (!isActive || timerId !== null) return;
      const remaining = Math.max(USER_ENGAGEMENT_DELAY_MS - engagedTime, 0);
      if (remaining === 0) {
        handleActiveElapsed();
        return;
      }
      timerId = window.setTimeout(() => {
        timerId = null;
        handleActiveElapsed();
      }, remaining);
    };

    const deactivate = () => {
      if (!isActive) return;
      isActive = false;
      clearTimer();
      if (activeStart !== null) {
        engagedTime += Math.max(Date.now() - activeStart, 0);
        activeStart = null;
      }
      flushEngagement();
    };

    const activate = () => {
      if (isActive) {
        ensureTimer();
        return;
      }
      isActive = true;
      flushEngagement();
      activeStart = Date.now();
      ensureTimer();
    };

    const updateActivityState = () => {
      const shouldBeActive = isVisible && isFocused;
      if (shouldBeActive) {
        activate();
      } else {
        deactivate();
      }
    };

    const handleVisibilityChange = () => {
      isVisible = document.visibilityState === 'visible';
      updateActivityState();
    };

    const handleFocus = () => {
      isFocused = true;
      updateActivityState();
    };

    const handleBlur = () => {
      isFocused = false;
      updateActivityState();
    };

    window.addEventListener('focus', handleFocus, true);
    window.addEventListener('blur', handleBlur, true);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    updateActivityState();

    return () => {
      clearTimer();
      isActive = false;
      activeStart = null;
      window.removeEventListener('focus', handleFocus, true);
      window.removeEventListener('blur', handleBlur, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  },
};
