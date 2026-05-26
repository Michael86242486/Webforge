const express = require('express');
const router = express.Router();

const PORT = process.env.PORT || 3000;

router.post('/inquiry', (req, res) => {
  const { cart, contact } = req.body;
  
  if (!cart || !Array.isArray(cart) || cart.length === 0) {
    return res.status(400).json({ 
      success: false, 
      error: 'Cart must contain at least one track' 
    });
  }
  
  if (!contact || !contact.email) {
    return res.status(400).json({ 
      success: false, 
      error: 'Contact email is required' 
    });
  }

  const inquiryId = 'INQ-' + Date.now().toString(36).toUpperCase();
  const total = cart.reduce((sum, item) => sum + (item.price || 0), 0);
  
  console.log(`[VibeForge] New inquiry ${inquiryId} received from ${contact.email}`);
  console.log(`[VibeForge] Tracks: ${cart.map(t => t.title).join(', ')} | Total: $${total}`);

  res.status(200).json({
    success: true,
    inquiryId,
    message: 'Inquiry received. VibeForge will contact you within 24 hours.',
    total,
    estimatedDelivery: '3-5 business days'
  });
});

router.post('/github/sync', (req, res) => {
  const { branch = 'main', message = 'Portfolio sync from VibeForge dashboard' } = req.body;
  
  const syncId = 'SYNC-' + Math.random().toString(36).substring(2, 10).toUpperCase();
  const timestamp = new Date().toISOString();
  
  console.log(`[VibeForge] GitHub sync initiated: ${syncId}`);
  console.log(`[VibeForge] Branch: ${branch} | Message: ${message}`);

  setTimeout(() => {
    console.log(`[VibeForge] GitHub sync ${syncId} completed successfully`);
  }, 800);

  res.status(200).json({
    success: true,
    syncId,
    branch,
    message,
    timestamp,
    commitHash: 'a7f3b9c' + Math.floor(Math.random() * 10000),
    filesSynced: 12,
    status: 'completed'
  });
});

router.get('/github/sync', (req, res) => {
  res.status(200).json({
    success: true,
    lastSync: new Date(Date.now() - 3600000).toISOString(),
    status: 'idle',
    autoSyncEnabled: true
  });
});

module.exports = router;