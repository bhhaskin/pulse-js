// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PulseDataLayerEntry = [eventType: string, eventName: string, payload?: Record<string, any>];

type PulseInstance = {
  track: (eventType: string, eventName: string, payload?: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    pulse_dataLayer?: PulseDataLayerEntry[];
    __pulse_dataLayer_hooked?: boolean;
  }
}

export function setupDataLayerListener(analyticsInstance: PulseInstance): void {
  if (typeof window !== 'object') return;

  const dataLayer = window.pulse_dataLayer;
  if (!Array.isArray(dataLayer)) return;
  if (window.__pulse_dataLayer_hooked) return;

  window.__pulse_dataLayer_hooked = true;

  const handleEntry = (entry: unknown) => {
    if (
      Array.isArray(entry) &&
      typeof entry[0] === 'string' &&
      typeof entry[1] === 'string'
    ) {
      const [eventType, eventName, payload] = entry;
      analyticsInstance.track(eventType, eventName, payload ?? {});
    }
  };

  // Replay existing events
  dataLayer.forEach(handleEntry);

  // Patch push to intercept new events
  const originalPush = dataLayer.push;
  dataLayer.push = function (...args: PulseDataLayerEntry[]) {
    const result = originalPush.apply(this, args);
    args.forEach(handleEntry);
    return result;
  };
}
