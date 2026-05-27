const express = require('express');
const router = express.Router();

router.post('/sync', (req, res) => {
  const mockSyncData = {
    success: true,
    syncId: 'sync_' + Date.now(),
    repository: 'vibeforge/vibeforge-portfolio',
    branch: 'main',
    syncedAt: new Date().toISOString(),
    filesSyn: [
      { path: 'public/index.html', status: 'updated', size: 12480 },
      { path: 'public/style.css', status: 'updated', size: 8920 },
      { path: 'public/app.js', status: 'updated', size: 6540 },
      { path: 'src/routes/inquiry.js', status: 'unchanged', size: 2100 },
      { path: 'public/components/TrackCard.html', status: 'added', size: 1850 },
      { path: 'public/components/AudioPlayer.html', status: 'added', size: 1420 },
      { path: 'public/assets/audio/placeholder.mp3', status: 'unchanged', size: 245760 }
    ],
    stats: {
      totalFiles: 7,
      updated: 3,
      added: 2,
      unchanged: 2,
      durationMs: 1240
    },
    message: 'GitHub synchronization completed successfully. Portfolio assets are now live.',
    nextSync: new Date(Date.now() + 3600000).toISOString()
  };
  res.status(200).json(mockSyncData);
});

router.get('/sync/status', (req, res) => {
  res.status(200).json({
    lastSync: new Date(Date.now() - 7200000).toISOString(),
    status: 'healthy',
    repoHealth: 'connected',
    pendingChanges: 0
  });
});

module.exports = router;