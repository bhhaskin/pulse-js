import { firstVisitEvent } from './firstVisit';
import { sessionStartEvent } from './sessionStart';
import { userEngagementEvent } from './userEngagement';
import { scrollEvent } from './scroll';
import { pageViewEvent } from './pageView';
import { outboundClickEvent } from './outboundClick';
import type { AutoEventName, AutoEventDefinition, AutoEventContext, AnalyticsLike } from './types';

const registry: Record<AutoEventName, AutoEventDefinition> = {
  first_visit: firstVisitEvent,
  session_start: sessionStartEvent,
  page_view: pageViewEvent,
  user_engagement: userEngagementEvent,
  scroll: scrollEvent,
  outbound_click: outboundClickEvent,
};

export interface AutoEventsOptions {
  events: AutoEventName[];
  sessionCreated: boolean;
  debug: boolean;
  initTimestamp: number;
  clientCreated: boolean;
}

export function setupAutoEvents(
  analytics: AnalyticsLike,
  { events, sessionCreated, debug, initTimestamp, clientCreated }: AutoEventsOptions
): void {
  if (!Array.isArray(events) || events.length === 0) return;

  const uniqueEvents = Array.from(new Set(events)).filter((event): event is AutoEventName => event in registry);
  if (uniqueEvents.length === 0) return;

  const baseContext: AutoEventContext = {
    analytics,
    sessionCreated,
    initTimestamp,
    debug,
    clientCreated,
  };

  uniqueEvents.forEach((eventName) => {
    const definition = registry[eventName];
    try {
      definition.setup(baseContext);
    } catch (error) {
      if (debug) {
        console.warn(`[pulse-js] auto-event '${eventName}' setup failed`, error);
      }
    }
  });
}

export { type AutoEventName } from './types';
