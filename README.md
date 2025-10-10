# @bhhaskin/pulse-js

Tiny analytics client for browsers. Send events with Beacon/fetch to your backend. 

---

## Features

- **Push-based tracking**  
  - Intercepts and dispatches `window.pulse_dataLayer.push()` events  
- **Device Detection**  
  - Categorizes the current user agent as desktop, mobile, tablet, or bot  
  - Surfaces viewport + interaction metadata (`view_port`, `touch`, `pointer`, `hover`, `dpr`, `width`, `height`, `orientation`, `reduced_motion`) via `pulse.device()`  
- **Session Tracking**  
  - Generates `pulse_session_uuid` identifiers and keeps them fresh  
  - Emits lifecycle auto-events (e.g. `first_visit`, `session_start`, `user_engagement`)
  - Persists a long-lived `pulse_client_uuid` cookie to recognize returning visitors

---

## Installation

Install via your preferred package manager:

```bash
yarn add @bhhaskin/pulse-js
```

---

## Update

```bash
yarn upgrade @bhhaskin/pulse-js
```

---

## Running Tests

```bash
yarn test
```

---

## Usage

### 1. Initialize in your app

```ts
import { pulse } from '@bhhaskin/pulse-js';

await pulse.init({
  apiEndpoint: 'https://example.com' // or env-based
});
```

This sets up:

- Session ID (`pulse_session_uuid`)  
- Auto-event listeners (`first_visit`, `session_start`, `page_view`, `user_engagement`, `scroll`, `outbound_click`)  
- `pulse_dataLayer` event listener  

---

### 2. Push events with `window.pulse_dataLayer`

All tracking should go through this array:

```ts
window.pulse_dataLayer.push(['event', 'page_view', {
  page_type: 'sign_up',
  page_version: 'v1_0'
}]);
```

Or, using a helper function:

```ts
function pulsePush(...args: any[]) {
  window.pulse_dataLayer = window.pulse_dataLayer || [];
  window.pulse_dataLayer.push(args);
}

pulsePush('event', 'page_view', {
  page_type: 'sign_up',
  page_version: 'v1_0'
});
```

### 3. Access device characteristics

```ts
const device = pulse.device();

if (device) {
  console.log(device.view_port); // e.g. 'mobile'
  console.log(device.pointer, device.hover);
}
```

`pulse.device()` performs detection lazily and caches the result for the current session.

Available fields:

```ts
type DeviceInfo = {
  category: 'desktop' | 'tablet' | 'mobile' | 'bot' | 'unknown';
  os: 'macos' | 'windows' | 'ios' | 'android' | 'linux' | 'other' | 'unknown';
  userAgent: string;
  isTouchCapable: boolean;
  view_port: 'desktop' | 'tablet' | 'mobile' | 'unknown';
  touch: boolean;          // Alias for isTouchCapable, based on touch points + pointer media queries
  pointer: 'fine' | 'coarse' | 'none' | 'unknown';
  hover: 'hover' | 'none' | 'unknown';
  dpr: number;             // window.devicePixelRatio
  width: number;           // window.innerWidth
  height: number;          // window.innerHeight
  orientation: 'portrait' | 'landscape' | 'unknown';
  reduced_motion: boolean; // prefers-reduced-motion media query
  browser: {               // detected browser family + version (best effort)
    name: 'chrome' | 'safari' | 'firefox' | 'edge' | 'opera' | 'ie' | 'bot' | 'unknown';
    version: string | null;
  };
};
```

- Detection is entirely passive (no network calls) and safe to call any time after `init()` has run in a browser context.
- On the server (or if `navigator.userAgent` is missing) the function returns `null` and subsequent calls will retry.

### 4. React integration (with context)

```tsx
'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { pulse } from '@bhhaskin/pulse-js';

type AnalyticsContextValue = {
  sessionUuid: string | null;
  clientUuid: string | null;
  device: ReturnType<(typeof pulse)['device']>;
};

const AnalyticsContext = createContext<AnalyticsContextValue>({
  sessionUuid: null,
  clientUuid: null,
  device: null,
});

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState<AnalyticsContextValue>({
    sessionUuid: null,
    clientUuid: null,
    device: null,
  });

  useEffect(() => {
    window.pulse_dataLayer = window.pulse_dataLayer || [];
    window.pulsePush = function (...args: unknown[]) {
      window.pulse_dataLayer.push(args as any);
    };

    const apiEndpoint = process.env.BACKEND_ORIGIN ?? 'https://example.com';

    pulse
      .init({ apiEndpoint })
      .then(() => {
        setValue({
          sessionUuid: pulse.session_uuid,
          clientUuid: pulse.client_uuid,
          device: pulse.device(),
        });
      })
      .catch((err) => {
        console.error('pulse init failed:', err);
      });
  }, []);

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics(): AnalyticsContextValue {
  return useContext(AnalyticsContext);
}
```

### 5. Auto events

`pulse` ships with a small set of automatic tracking hooks that run as soon as `init()` completes. They emit events with the `eventType` `auto`—no `window.pulse_dataLayer` push required.

- `first_visit` – fires the first time the SDK sees a browser, storing `first_visit_at` in localStorage and attaching the detected device when available.
- `session_start` – runs whenever a session UUID is created or a visitor returns after 30 minutes of inactivity; payload includes `session_started_at` and device data.
- `page_view` – records the current URL, path, title, and referrer, adding device metadata only when the session is new.
- `user_engagement` – triggers after 10 seconds of active time on the page (pauses when the tab blurs) and posts `engagement_time_msec`.
- `scroll` – captures the first time a user scrolls past 90% of the page with scroll depth metrics (`scroll_depth_ratio`, `scroll_depth_percent`, `scroll_x/y`, viewport sizes).
- `outbound_click` – listens for in-page clicks on anchors that lead away from the current origin and records link URL, domain, trimmed text, and any `target` value.

You can opt out or limit these by passing an `autoEvents` array to `pulse.init()`:

```ts
pulse.init({
  autoEvents: ['page_view', 'user_engagement'], // or [] to disable
});
```

---

## Notes

⚠️ You should **not call** `pulse.track()` directly — all event tracking must go through the `window.pulse_dataLayer` interface.
