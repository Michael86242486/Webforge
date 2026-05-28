const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const inquiryRouter = require('./routes/inquiry');
const githubRouter = require('./routes/github');
const errorHandler = require('./middleware/errorHandler');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/inquiry', inquiryRouter);
app.use('/api/github/sync', githubRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'VibeForge', timestamp: new Date().toISOString() });
});

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../public/index.html'));
  } else {
    next();
  }
});

app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`VibeForge server running on http://0.0.0.0:${PORT}`);
  console.log('Retro-neon portfolio platform ready for producers');
});