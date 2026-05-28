const bookings = [];
let nextId = 1;

class Booking {
  constructor(data) {
    this.id = nextId++;
    this.name = data.name;
    this.email = data.email;
    this.phone = data.phone;
    this.date = data.date;
    this.time = data.time;
    this.guests = parseInt(data.guests, 10);
    this.tableType = data.tableType || 'standard';
    this.specialRequests = data.specialRequests || '';
    this.status = 'confirmed';
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  static create(data) {
    const booking = new Booking(data);
    bookings.push(booking);
    return booking;
  }

  static findAll() {
    return [...bookings];
  }

  static findById(id) {
    return bookings.find(b => b.id === parseInt(id, 10)) || null;
  }

  static findByEmail(email) {
    return bookings.filter(b => b.email.toLowerCase() === email.toLowerCase());
  }

  static findByDate(date) {
    return bookings.filter(b => b.date === date);
  }

  static update(id, updates) {
    const booking = Booking.findById(id);
    if (!booking) return null;
    Object.assign(booking, updates);
    booking.updatedAt = new Date().toISOString();
    return booking;
  }

  static cancel(id) {
    const booking = Booking.findById(id);
    if (!booking) return null;
    booking.status = 'cancelled';
    booking.updatedAt = new Date().toISOString();
    return booking;
  }

  static delete(id) {
    const index = bookings.findIndex(b => b.id === parseInt(id, 10));
    if (index === -1) return false;
    bookings.splice(index, 1);
    return true;
  }

  static getAvailability(date, time) {
    const existing = bookings.filter(b => 
      b.date === date && 
      b.time === time && 
      b.status === 'confirmed'
    );
    const maxTables = 12;
    return Math.max(0, maxTables - existing.length);
  }

  static getStats() {
    const total = bookings.length;
    const confirmed = bookings.filter(b => b.status === 'confirmed').length;
    const cancelled = bookings.filter(b => b.status === 'cancelled').length;
    const today = new Date().toISOString().split('T')[0];
    const todayBookings = bookings.filter(b => b.date === today).length;
    
    return { total, confirmed, cancelled, todayBookings };
  }
}

module.exports = Booking;