const validateBooking = (req, res, next) => {
  const { fullName, email, phone, date, time, guests, specialRequests } = req.body;
  const = [];

  if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
    errors.push({ field: 'fullName', message: 'Full name is required and must be at least 2 characters' });
  }

  if (!email || typeof email !== 'string') {
    errors.push({ field: 'email', message: 'Email is required' });
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      errors.push({ field: 'email', message: 'Please provide a valid email address' });
    }
  }

  if (!phone || typeof phone !== 'string') {
    errors.push({ field: 'phone', message: 'Phone number is required' });
  } else {
    const phoneRegex = /^[\d\s\-\+\(\)]{7,20}$/;
    if (!phoneRegex.test(phone.trim())) {
      errors.push({ field: 'phone', message: 'Please provide a valid phone number' });
    }
  }

  if (!date || typeof date !== 'string') {
    errors.push({ field: 'date', message: 'Reservation date is required' });
  } else {
    const selectedDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (isNaN(selectedDate.getTime())) {
      errors.push({ field: 'date', message: 'Invalid date format' });
    } else if (selectedDate < today) {
      errors.push({ field: 'date', message: 'Reservation date must be in the future' });
    }
  }

  if (!time || typeof time !== 'string') {
    errors.push({ field: 'time', message: 'Reservation time is required' });
  } else {
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(time)) {
      errors.push({ field: 'time', message: 'Time must be in HH:MM format' });
    }
  }

  if (!guests) {
    errors.push({ field: 'guests', message: 'Number of guests is required' });
  } else {
    const guestCount = parseInt(guests, 10);
    if (isNaN(guestCount) || guestCount < 1 || guestCount > 20) {
      errors.push({ field: 'guests', message: 'Number of guests must be between 1 and 20' });
    }
  }

  if (specialRequests && typeof specialRequests !== 'string') {
    errors.push({ field: 'specialRequests', message: 'Special requests must be a string' });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors
    });
  }

  req.body.fullName = fullName.trim();
  req.body.email = email.trim().toLowerCase();
  req.body.phone = phone.trim();
  req.body.specialRequests = specialRequests ? specialRequests.trim() : '';

  next();
};

const validateAvailability = (req, res, next) => {
  const { date, time, guests } = req.query;
  const errors = [];

  if (!date || typeof date !== 'string') {
    errors.push({ field: 'date', message: 'Date query parameter is required' });
  }

  if (!time || typeof time !== 'string') {
    errors.push({ field: 'time', message: 'Time query parameter is required' });
  }

  if (!guests) {
    errors.push({ field: 'guests', message: 'Guests query parameter is required' });
  } else {
    const guestCount = parseInt(guests, 10);
    if (isNaN(guestCount) || guestCount < 1 || guestCount > 20) {
      errors.push({ field: 'guests', message: 'Guests must be between 1 and 20' });
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: 'Availability validation failed',
      details: errors
    });
  }

  next();
};

module.exports = {
  validateBooking,
  validateAvailability
};