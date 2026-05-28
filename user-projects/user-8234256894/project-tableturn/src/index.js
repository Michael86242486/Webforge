const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const morgan = require('morgan');

dotenv.config();

const app = express();

app.use(morgan('combined'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static('public'));

const bookingsRouter = require('./routes/bookings');
app.use('/api/bookings', bookingsRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Restaurant booking API running', timestamp: new Date().toISOString() });
});

app.get('*', (req, res) => {
  if (req.accepts('html')) {
    res.sendFile('index.html', { root: 'public' });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log('Restaurant booking site ready with red glassmorphism theme');
});