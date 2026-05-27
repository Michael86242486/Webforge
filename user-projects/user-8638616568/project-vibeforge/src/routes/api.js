const express = require('express');
const router = express.Router();

router.post('/inquiry', (req, res) => {
  const { name, email, message, cartItems } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({
      success: false,
      error: 'Name, email, and message are required fields'
    });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid email format'
    });
  }
  const inquiryId = 'INQ-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
  const totalValue = cartItems && Array.isArray(cartItems) 
    ? cartItems.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 1), 0) 
    : 0;
  const response = {
    success: true,
    inquiryId,
    message: 'Inquiry received successfully. Our team will contact you within 24 hours.',
    details: {
      name,
      email,
      submittedAt: new Date().toISOString(),
      cartTotal: totalValue,
      itemCount: cartItems ? cartItems.length : 0
    }
  };
  res.status(201).json(response);
});

router.get('/github/sync', (req, res) => {
  const syncData = {
    success: true,
    syncId: 'SYNC-' + Date.now(),
    timestamp: new Date().toISOString(),
    repository: 'vibeforge/releases',
    status: 'completed',
    changes: {
      tracksUpdated: 3,
      beatsAdded: 2,
      metadataSynced: true,
      lastCommit: 'a7f3b2c - Updated neon waveform visuals'
    },
    files: [
      { name: 'midnight-drive.mp3', action: 'updated', size: '4.2MB' },
      { name: 'neon-pulse.wav', action: 'added', size: '8.7MB' },
      { name: 'portfolio.json', action: 'updated', size: '12KB' }
    ]
  };
  res.json(syncData);
});

router.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;