import type { AutoEventDefinition } from './types';
import { writeSessionTimestamp } from './sessionTimestamp';

const USER_ENGAGEMENT_DELAY_MS = 10_000;

export const userEngagementEvent: AutoEventDefinition = {
  name: 'user_engagement',
  setup: ({ analytics, debug }) => {
    if (typeof window !== 'object' || typeof document === 'undefined') return;

    let timerId: ReturnType<typeof setTimeout> | null = null;
    let fired = false;
    let engagedTime = 0;
    let activeStart: number | null = null;

    const finalizeActivePeriod = () => {
      if (activeStart === null) return;
      const now = Date.now();
      engagedTime += Math.max(now - activeStart, 0);
      activeStart = null;
    };

    const cleanup = () => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }

      activeStart = null;

      window.removeEventListener('focus', handleFocus, true);
      window.removeEventListener('blur', handleBlur, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };

    const fire = () => {
      if (fired) return;
      fired = true;
      finalizeActivePeriod();
      cleanup();

      try {
        const engagementTime = Math.max(engagedTime, USER_ENGAGEMENT_DELAY_MS);
        analytics.track('auto', 'user_engagement', {
          engagement_time_msec: engagementTime,
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

    const schedule = () => {
      if (fired) return;
      if (timerId !== null) return;
      const remaining = Math.max(USER_ENGAGEMENT_DELAY_MS - engagedTime, 0);
      if (remaining === 0) {
        fire();
        return;
      }
      activeStart = Date.now();
      timerId = window.setTimeout(() => {
        timerId = null;
        fire();
      }, remaining);
    };

    const cancel = () => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      finalizeActivePeriod();
      if (engagedTime >= USER_ENGAGEMENT_DELAY_MS) {
        fire();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        schedule();
      } else {
        cancel();
      }
    };

    const handleFocus = () => {
      schedule();
    };

    const handleBlur = () => {
      cancel();
    };

    window.addEventListener('focus', handleFocus, true);
    window.addEventListener('blur', handleBlur, true);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (document.visibilityState === 'visible') {
      schedule();
    }

    return cleanup;
  },
};
