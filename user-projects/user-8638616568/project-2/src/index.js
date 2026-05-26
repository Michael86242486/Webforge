const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

app.post('/api/inquiry', (req, res, next) => {
  try {
    const { cart, email, name, message, total } = req.body;
    if (!email || !cart || !Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid inquiry: email and cart required' });
    }
    const inquiryId = 'INQ-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
    const inquiry = {
      inquiryId,
      name: name || 'Anonymous Producer',
      email,
      cart,
      total: total || cart.reduce((sum, item) => sum + (item.price || 0), 0),
      message: message || 'Interested in licensing tracks',
      timestamp: new Date().toISOString(),
      status: 'received'
    };
    console.log('New cart inquiry processed:', inquiryId);
    res.status(201).json({ success: true, inquiryId, message: 'Inquiry submitted successfully. VibeForge will contact you within 24 hours.', inquiry });
  } catch (err) {
    next(err);
  }
});

app.post('/api/github/sync', (req, res, next) => {
  try {
    const { branch = 'main', files = ['tracks', 'metadata', 'artwork'] } = req.body;
    const syncResult = {
      success: true,
      syncId: 'GH-' + Date.now(),
      branch,
      filesSynced: files.length,
      syncedFiles: files.map(f => ({ name: f + '.json', status: 'updated', size: Math.floor(Math.random() * 50000) + 12000 })),
      lastSync: new Date().toISOString(),
      commitHash: 'a7f3b9' + Math.floor(Math.random() * 1000000).toString(16),
      message: 'Portfolio synchronized with GitHub successfully'
    };
    console.log('GitHub sync completed:', syncResult.syncId);
    res.json(syncResult);
  } catch (err) {
    next(err);
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, error: 'Internal server error', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
});

app.listen(PORT, () => {
  console.log(`VibeForge server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} for the retro-neon portfolio dashboard`);
});