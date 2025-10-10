import type { AutoEventDefinition } from './types';
import { writeSessionTimestamp } from './sessionTimestamp';

const USER_ENGAGEMENT_DELAY_MS = 10_000;

export const userEngagementEvent: AutoEventDefinition = {
  name: 'user_engagement',
  setup: ({ analytics, debug, initTimestamp }) => {
    if (typeof window !== 'object' || typeof document === 'undefined') return;

    let timerId: ReturnType<typeof setTimeout> | null = null;
    let fired = false;

    const cleanup = () => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }

      window.removeEventListener('focus', handleFocus, true);
      window.removeEventListener('blur', handleBlur, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };

    const fire = () => {
      if (fired) return;
      fired = true;
      cleanup();

      try {
        const engagementTime = Math.max(Date.now() - initTimestamp, 0);
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
      timerId = window.setTimeout(fire, USER_ENGAGEMENT_DELAY_MS);
    };

    const cancel = () => {
      if (timerId === null) return;
      clearTimeout(timerId);
      timerId = null;
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
