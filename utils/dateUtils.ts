const TIMEZONE = 'Africa/Lagos';

export const formatDate = (date: number | Date) => {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date(date));
};

export const formatTime = (date: number | Date) => {
  return new Intl.DateTimeFormat('en-GB', { 
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(new Date(date));
};

export const formatToLocalDate = (timestamp: number): string => {
  return formatDate(timestamp);
};

export const formatToLocalTime = (timestamp: number): string => {
  return formatTime(timestamp);
};

export const formatToLocalDateTime = (timestamp: number): string => {
  return `${formatToLocalDate(timestamp)} ${formatToLocalTime(timestamp)}`;
};

export const getDayRange = (dateStr: string) => {
  // Explicitly set to Lagos timezone (UTC+1)
  const start = new Date(`${dateStr}T00:00:00+01:00`).getTime();
  const end = new Date(`${dateStr}T23:59:59.999+01:00`).getTime();
  return { start, end };
};
