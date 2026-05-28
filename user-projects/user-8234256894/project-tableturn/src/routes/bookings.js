const express = require('express');
const router = express.Router();

let bookings = [];
let availabilityCache = new Map();

const generateTimeSlots = (date) => {
  const slots = [];
  const baseDate = new Date(date);
  for (let hour = 17; hour <= 22; hour++) {
    for (let min = 0; min < 60; min += 30) {
      const slotTime = new Date(baseDate);
      slotTime.setHours(hour, min, 0, 0);
      slots.push(slotTime.toISOString());
    }
  }
  return slots;
};

const checkAvailability = (date, time, partySize) => {
  const key = `${date}-${time}`;
  const existing = bookings.filter(b => b.date === date && b.time === time);
  const totalBooked = existing.reduce((sum, b) => sum + b.partySize, 0);
  const maxCapacity = 50;
  return (totalBooked + partySize) <= maxCapacity;
};

router.get('/availability', (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'Date parameter is required' });
  }
  const slots = generateTimeSlots(date);
  const availableSlots = slots.map(slot => {
    const time = new Date(slot).toTimeString().slice(0, 5);
    const isAvailable = checkAvailability(date, time, 1);
    return { time, available: isAvailable, capacity: 50 };
  });
  res.json({ date, slots: availableSlots });
});

router.post('/', (req, res) => {
  const { name, email, date, time, partySize, specialRequests } = req.body;
  if (!name || !email || !date || !time || !partySize) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (partySize < 1 || partySize > 12) {
    return res.status(400).json({ error: 'Party size must be between 1 and 12' });
  }
  if (!checkAvailability(date, time, partySize)) {
    return res.status(409).json({ error: 'Time slot not available' });
  }
  const booking = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2),
    name,
    email,
    date,
    time,
    partySize,
    specialRequests: specialRequests || '',
    status: 'confirmed',
    createdAt: new Date().toISOString()
  };
  bookings.push(booking);
  availabilityCache.delete(date);
  res.status(201).json({ success: true, booking });
});

router.get('/', (req, res) => {
  res.json({ bookings: bookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) });
});

router.get('/:id', (req, res) => {
  const booking = bookings.find(b => b.id === req.params.id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }
  res.json({ booking });
});

router.delete('/:id', (req, res) => {
  const index = bookings.findIndex(b => b.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Booking not found' });
  }
  const cancelled = bookings.splice(index, 1)[0];
  res.json({ success: true, message: 'Booking cancelled', booking: cancelled });
});

module.exports = router;