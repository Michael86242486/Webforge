const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const inquiryRouter = require('./routes/inquiry');
const githubRouter = require('./routes/github');
const errorHandler = require('./middleware/errorHandler');

app.use('/api/inquiry', inquiryRouter);
app.use('/api/github', githubRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'VibeForge', timestamp: new Date().toISOString() });
});

app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile('index.html', { root: 'public' });
  }
  next();
});

app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`VibeForge server running on http://0.0.0.0:${PORT}`);
  console.log('Endpoints ready: /api/inquiry, /api/github/sync');
});