const moment = require('moment');

function isValidFutureDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return false;
  const now = new Date();
  return date > now;
}

function isWithinBusinessHours(dateStr, timeStr) {
  if (!dateStr || !timeStr) return false;
  const dateTime = new Date(`${dateStr}T${timeStr}`);
  if (isNaN(dateTime.getTime())) return false;
  const hour = dateTime.getHours();
  const day = dateTime.getDay();
  if (day === 0 || day === 6) {
    return hour >= 11 && hour <= 22;
  }
  return hour >= 11 && hour <= 23;
}

function generateTimeSlots(dateStr, durationMinutes = 120, intervalMinutes = 30) {
  if (!isValidFutureDate(dateStr)) return [];
  const slots = [];
  const startHour = 11;
  const endHour = 23;
  const date = new Date(dateStr);
  const day = date.getDay();
  const actualEnd = (day === 0 || day === 6) ? 22 : endHour;
  
  for (let hour = startHour; hour < actualEnd; hour++) {
    for (let min = 0; min < 60; min += intervalMinutes) {
      const timeStr = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
      if (isWithinBusinessHours(dateStr, timeStr)) {
        slots.push(timeStr);
      }
    }
  }
  return slots;
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function formatTimeDisplay(timeStr) {
  if (!timeStr) return '';
  const [hour, minute] = timeStr.split(':').map(Number);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`;
}

function calculateEndTime(timeStr, durationMinutes = 120) {
  if (!timeStr) return '';
  const [hour, minute] = timeStr.split(':').map(Number);
  const totalMinutes = hour * 60 + minute + durationMinutes;
  const endHour = Math.floor(totalMinutes / 60) % 24;
  const endMin = totalMinutes % 60;
  return `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;
}

function getNextAvailableDates(count = 14) {
  const dates = [];
  const today = new Date();
  for (let i = 1; i <= count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function validateBookingRequest(bookingData) {
  const errors = [];
  if (!bookingData.date || !isValidFutureDate(bookingData.date)) {
    errors.push('Date must be a valid future date');
  }
  if (!bookingData.time || !isWithinBusinessHours(bookingData.date, bookingData.time)) {
    errors.push('Time must be within business hours');
  }
  if (!bookingData.guests || bookingData.guests < 1 || bookingData.guests > 12) {
    errors.push('Guests must be between 1 and 12');
  }
  if (!bookingData.name || bookingData.name.trim().length < 2) {
    errors.push('Name is required');
  }
  if (!bookingData.email || !bookingData.email.includes('@')) {
    errors.push('Valid email is required');
  }
  return { valid: errors.length === 0, errors };
}

module.exports = {
  isValidFutureDate,
  isWithinBusinessHours,
  generateTimeSlots,
  formatDisplayDate,
  formatTimeDisplay,
  calculateEndTime,
  getNextAvailableDates,
  validateBookingRequest
};