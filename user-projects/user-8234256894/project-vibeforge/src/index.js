const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

app.post('/api/inquiry', (req, res) => {
  const { items, email, name, message } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'Cart is empty' });
  }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ success: false, error: 'Valid email required' });
  }
  const total = items.reduce((sum, item) => sum + (item.price || 0), 0);
  const orderId = 'VF-' + Date.now().toString(36).toUpperCase();
  res.status(200).json({
    success: true,
    orderId,
    total,
    email,
    name: name || 'Producer',
    itemCount: items.length,
    message: message || 'Inquiry received. We will contact you within 24 hours.',
    timestamp: new Date().toISOString()
  });
});

app.post('/api/github/sync', (req, res) => {
  const { branch = 'main', repo = 'vibeforge/releases' } = req.body || {};
  const mockFiles = [
    { path: 'tracks/heatwave.mp3', status: 'updated', size: '4.2MB' },
    { path: 'tracks/neon-dreams.mp3', status: 'added', size: '3.8MB' },
    { path: 'assets/cover-art.jpg', status: 'updated', size: '1.1MB' }
  ];
  res.status(200).json({
    success: true,
    synced: mockFiles.length,
    branch,
    repo,
    files: mockFiles,
    commit: 'a7f3b9c',
    timestamp: new Date().toISOString(),
    message: 'GitHub synchronization simulated successfully'
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`VibeForge server running on http://0.0.0.0:${PORT}`);
});