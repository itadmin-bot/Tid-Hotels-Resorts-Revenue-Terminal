/**
 * Consistent date formatting for the property network.
 * Uses Africa/Lagos (UTC+1) as the standard timezone for all reports and displays
 * to ensure consistency across different user devices and locations.
 */

const TIMEZONE = 'Africa/Lagos';

export const formatToLocalDate = (timestamp: number): string => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(timestamp));
};

export const formatToLocalTime = (timestamp: number): string => {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(new Date(timestamp));
};

export const formatToLocalDateTime = (timestamp: number): string => {
  return `${formatToLocalDate(timestamp)} ${formatToLocalTime(timestamp)}`;
};
