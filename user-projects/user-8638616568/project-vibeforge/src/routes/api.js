const express = require('express');
const router = express.Router();
const mockDatabase = require('../db/mockDatabase');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

router.get('/tracks', (req, res) => {
  const tracks = mockDatabase.getAllTracks();
  res.json({
    success: true,
    tracks: tracks,
    total: tracks.length,
    message: 'Track catalog retrieved successfully'
  });
});

router.get('/tracks/stream/:id', (req, res) => {
  const trackId = parseInt(req.params.id);
  const track = mockDatabase.getTrackById(trackId);
  if (!track) {
    return res.status(404).json({ success: false, error: 'Track not found' });
  }
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Disposition', `attachment; filename="${track.title}.mp3"`);
  res.json({
    success: true,
    streamUrl: track.previewUrl,
    track: track,
    message: 'Streaming metadata ready'
  });
});

router.post('/cart/inquire', (req, res) => {
  const { cartItems, producerEmail, message } = req.body;
  if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
    return res.status(400).json({ success: false, error: 'Cart must contain at least one item' });
  }
  if (!producerEmail || !producerEmail.includes('@')) {
    return res.status(400).json({ success: false, error: 'Valid producer email required' });
  }
  const inquiryId = 'INQ-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
  const total = cartItems.reduce((sum, item) => sum + (item.price || 0), 0);
  const inquiry = {
    inquiryId,
    timestamp: new Date().toISOString(),
    producerEmail,
    message: message || 'Interested in licensing these tracks',
    items: cartItems,
    total: total,
    status: 'pending'
  };
  mockDatabase.saveInquiry(inquiry);
  res.status(201).json({
    success: true,
    inquiryId: inquiryId,
    total: total,
    message: 'Inquiry submitted successfully. Producer will contact you within 24 hours.',
    estimatedResponse: '24 hours'
  });
});

router.get('/cart/inquiries', (req, res) => {
  const inquiries = mockDatabase.getAllInquiries();
  res.json({ success: true, inquiries: inquiries });
});

module.exports = router;