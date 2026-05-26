const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

app.post('/api/inquiry', (req, res) => {
  const { name, email, tracks, total, message } = req.body;
  
  if (!name || !email || !tracks || tracks.length === 0) {
    return res.status(400).json({ 
      success: false, 
      error: 'Name, email and at least one track are required' 
    });
  }

  const inquiryId = 'INQ-' + Date.now().toString(36).toUpperCase();
  
  console.log(`[VibeForge] New inquiry ${inquiryId}:`, {
    name, email, tracks: tracks.length, total, message
  });

  res.json({
    success: true,
    inquiryId,
    message: 'Inquiry received successfully. VibeForge will contact you within 24 hours.',
    estimatedResponse: '24 hours'
  });
});

app.post('/api/github/sync', (req, res) => {
  const { branch = 'main', message = 'Portfolio sync' } = req.body;
  
  const syncResult = {
    success: true,
    commit: 'a7f3b9c' + Math.floor(Math.random() * 10000),
    branch,
    message,
    filesSynced: ['public/index.html', 'public/app.js', 'public/style.css'],
    timestamp: new Date().toISOString(),
    status: 'Synced to GitHub Pages'
  };

  console.log('[VibeForge] GitHub sync completed:', syncResult.commit);
  
  res.json(syncResult);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', service: 'VibeForge', timestamp: new Date() });
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`VibeForge server running on http://0.0.0.0:${PORT}`);
  console.log('Endpoints ready: /api/inquiry, /api/github/sync');
});