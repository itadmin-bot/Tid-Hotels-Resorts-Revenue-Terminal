
export const formatDate = (date: number | Date) => {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date(date));
};

export const formatTime = (date: number | Date) => {
  return new Intl.DateTimeFormat('en-GB', { 
    timeZone: 'Africa/Lagos',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(date));
};
