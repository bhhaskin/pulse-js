const SESSION_TIMESTAMP_KEY = 'pulse:last_session_timestamp';

/**
 * The inactivity window after which a session is considered expired.
 * Matches the 30 minute inactivity cutoff used by GA4.
 */
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

const canUseLocalStorage = (): boolean => {
  if (typeof window !== 'object' || typeof window.localStorage === 'undefined') return false;

  try {
    const testKey = '__pulse_session_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    return true;
  } catch (_error) {
    return false;
  }
};

export const readSessionTimestamp = (): number | null => {
  if (!canUseLocalStorage()) return null;

  try {
    const raw = window.localStorage.getItem(SESSION_TIMESTAMP_KEY);
    if (!raw) return null;

    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch (_error) {
    return null;
  }
};

export const writeSessionTimestamp = (timestamp: number): boolean => {
  if (!canUseLocalStorage()) return false;

  try {
    window.localStorage.setItem(SESSION_TIMESTAMP_KEY, String(timestamp));
    return true;
  } catch (_error) {
    return false;
  }
};
