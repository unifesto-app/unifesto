/**
 * Event Helper Functions
 * Utilities to work with Event data from API
 */

import { Event, getEventCardPrice } from './events';

/**
 * Format event date for display
 */
export function formatEventDate(event: Event): string {
  const startDate = new Date(event.startDateTime);
  return startDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format event time for display
 */
export function formatEventTime(event: Event): string {
  const startDate = new Date(event.startDateTime);
  const endDate = new Date(event.endDateTime);
  
  const startTime = startDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
  
  const endTime = endDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
  
  return `${startTime} – ${endTime}`;
}

/**
 * Get event location display string
 */
export function getEventLocation(event: Event): string {
  if (event.type === 'ONLINE') {
    return 'Online Event';
  }
  
  if (event.venueName) {
    return event.venueName;
  }
  
  if (event.city && event.state) {
    return `${event.city}, ${event.state}`;
  }
  
  if (event.city) {
    return event.city;
  }
  
  if (event.venueAddress) {
    return event.venueAddress;
  }
  
  return 'Location TBA';
}

/**
 * Get event organizer name
 */
export function getEventOrganizer(event: Event): string {
  return event.space?.name || 'Organizer';
}

/**
 * Format event price for display
 */
export function formatEventPrice(event: Event): string {
  // Delegate to the canonical card-price logic (ticket prices first, `isFree`
  // only as a last-resort fallback) so paid events never mis-render as "Free".
  return getEventCardPrice(event).price;
}

/**
 * Check if event is ongoing
 */
export function isEventOngoing(event: Event): boolean {
  const now = new Date();
  const startDate = new Date(event.startDateTime);
  const endDate = new Date(event.endDateTime);
  
  return startDate <= now && endDate >= now;
}

/**
 * Check if event is upcoming
 */
export function isEventUpcoming(event: Event): boolean {
  const now = new Date();
  const startDate = new Date(event.startDateTime);
  
  return startDate > now;
}

/**
 * Check if event is past
 */
export function isEventPast(event: Event): boolean {
  const now = new Date();
  const endDate = new Date(event.endDateTime);
  
  return endDate < now;
}

/**
 * Get event status badge text
 */
export function getEventStatusBadge(event: Event): string | null {
  if (isEventOngoing(event)) {
    return 'Ongoing';
  }
  
  if (isEventUpcoming(event)) {
    return 'Upcoming';
  }
  
  if (isEventPast(event)) {
    return 'Past';
  }
  
  return null;
}

/**
 * Get short date format (e.g., "Mar 16")
 */
export function getShortDate(event: Event): string {
  const startDate = new Date(event.startDateTime);
  return startDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

