const express = require('express');
const router = express.Router();

.post('/inquiry', (req, res) => {
  const { name, email, trackId, message, cartItems } = req.body;
  if (!name || !email || !message) {
    return res.status(400).json({ success: false, error: 'Missing required fields: name, email, message' });
  }
  const inquiryId = 'INQ-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
  const inquiry = {
    id: inquiryId,
    name,
    email,
    trackId: trackId || null,
    message,
    cartItems: cartItems || [],
    status: 'received',
    timestamp: new Date().toISOString(),
    estimatedResponse: '24-48 hours'
  };
  console.log('[VibeForge] New cart inquiry received:', inquiry);
  res.status(201).json({
    success: true,
    message: 'Inquiry submitted successfully. Our team will contact you shortly.',
    inquiry
  });
});

router.post('/github/sync', (req, res) => {
  const { repo, branch, commitMessage } = req.body;
  const syncId = 'SYNC-' + Date.now();
  const result = {
    success: true,
    syncId,
    repo: repo || 'vibeforge/beats-private',
    branch: branch || 'main',
    commitMessage: commitMessage || 'Auto-sync: Updated track metadata and stems',
    syncedFiles: [
      'tracks/heatwave-v2.mp3',
      'tracks/neon-dreams-stems.zip',
      'metadata/catalog.json'
    ],
    commitHash: 'a7f3b9c' + Math.floor(Math.random() * 1000000).toString(16),
    timestamp: new Date().toISOString(),
    status: 'completed'
  };
  console.log('[VibeForge] GitHub sync simulation completed:', result);
  res.json(result);
});

router.get('/inquiry/:id', (req, res) => {
  const { id } = req.params;
  res.json({
    success: true,
    inquiry: {
      id,
      status: 'in-progress',
      lastUpdated: new Date().toISOString()
    }
  });
});

module.exports = router;