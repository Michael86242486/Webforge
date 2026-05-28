const dotenv = require('dotenv');
dotenv.config();

let db = {
  bookings: [],
  connected: false
};

function connect() {
  return new Promise((resolve) => {
    setTimeout(() => {
      db.connected = true;
      console.log('Connected to in-memory database for restaurant bookings');
      resolve(db);
    }, 100);
  });
}

function getDb() {
  if (!db.connected) {
    throw new Error('Database not connected');
  }
  return db;
}

function addBooking(booking) {
  if (!db.connected) {
    throw new Error('Database not connected');
  }
  const newBooking = {
    ...booking,
    id: Date.now().toString(36) + Math.random().toString(36).substr(2),
    createdAt: new Date().toISOString(),
    status: 'confirmed'
  };
  db.bookings.push(newBooking);
  return newBooking;
}

function getBookingsByDate(date) {
  if (!db.connected) {
    throw new Error('Database not connected');
  }
  return db.bookings.filter(b => b.date === date);
}

function getAllBookings() {
  if (!db.connected) {
    throw new Error('Database not connected');
  }
  return [...db.bookings];
}

module.exports = {
  connect,
  getDb,
  addBooking,
  getBookingsByDate,
  getAllBookings
};