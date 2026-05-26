const express = require('express');
const router express.Router();

router.post('/inquiry', (, res, next) => {
  try {
    const { name, email, message, cart } = req || {};
    if (!name || !email) {
      return res.status(400).json({ success: false, error: 'Name and email are required for cart inquiries.' });
    }
    const inquiryId = 'VIB-' + Date.now().toString(36).toUpperCase();
    const processedCart = Array.isArray(cart) ? cart : [];
    const total = processedCart.reduce((sum, item) => sum + (item.price || 0), 0);
    console.log(`[VibeForge] New inquiry ${inquiryId} from ${email} | Cart total: $${total}`);
    res.status(201).json({
      success: true,
      inquiryId,
      status: 'received',
      estimatedResponse: '24 hours',
      total: total.toFixed(2),
      message: 'Thank you. Our team will contact you shortly regarding licensing and delivery.'
    });
  } catch (err) {
    next(err);
  }
});

router.post('/github/sync', (req, res, next) => {
  try {
    const { branch = 'main', commitMessage = 'Auto-sync from VibeForge dashboard' } = req.body || {};
    const syncedAt = new Date().toISOString();
    const simulatedFiles = [
      'public/tracks/neon-dreams.mp3',
      'public/tracks/cyber-pulse.wav',
      'public/albums/vibeforge-vol1.zip',
      'public/assets/cover-art.png'
    ];
    console.log(`[VibeForge] GitHub sync initiated on ${branch}: ${commitMessage}`);
    setTimeout(() => {
      res.json({
        success: true,
        branch,
        commitMessage,
        syncedAt,
        filesUpdated: simulatedFiles.length,
        files: simulatedFiles,
        status: 'complete',
        message: 'Portfolio and audio assets synchronized with GitHub repository.'
      });
    }, 420);
  } catch (err) {
    next(err);
  }
});

module.exports = router;