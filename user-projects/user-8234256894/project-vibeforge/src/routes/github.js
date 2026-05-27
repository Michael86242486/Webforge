const express = require('express');
const router = express.Router();

const mockRepos = [
  {
    id: 784291,
    name: "vibeforge-beats",
    full_name: "vibeforge/vibeforge-beats",
    description: "Core sample packs and stems for VibeForge releases",
    private: false,
    html_url: "https://github.com/vibeforge/vibeforge-beats",
    clone_url: "https://github.com/vibeforge/vibeforge-beats.git",
    updated_at: "2025-01-12T14:33:00Z",
    language: "Python",
    stargazers_count: 1247,
    forks_count: 189,
    open_issues_count: 3,
    topics: ["music-production", "audio", "samples", "beats"]
  },
  {
    id: 784292,
    name: "vibeforge-monetize",
    full_name: "vibeforge/vibeforge-monetize",
    description: "Secure checkout and inquiry handling for track licensing",
    private: true,
    html_url: "https://github.com/vibeforge/vibeforge-monetize",
    clone_url: "https://github.com/vibeforge/vibeforge-monetize.git",
    updated_at: "2025-01-11T09:17:00Z",
    language: "JavaScript",
    stargazers_count: 892,
    forks_count: 76,
    open_issues_count: 1,
    topics: ["express", "payments", "licensing"]
  }
];

router.post('/sync', (req, res) => {
  const { repo, branch = 'main' } = req.body || {};
  
  setTimeout(() => {
    const syncedRepo = mockRepos.find(r => r.name === repo) || mockRepos[0];
    
    const syncResult = {
      success: true,
      message: "GitHub synchronization completed successfully",
      timestamp: new Date().toISOString(),
      synced_repo: {
        ...syncedRepo,
        branch: branch,
        last_commit: {
          sha: "a7f3c9e2d1b8f4a5c6e7d8f9a0b1c2d3e4f5a6b7",
          message: "feat: updated neon waveform visualizer and cart inquiry flow",
          author: "VibeForge",
          date: new Date().toISOString()
        },
        files_changed: 7,
        lines_added: 184,
        lines_removed: 42
      },
      status: "synced",
      next_sync: new Date(Date.now() + 3600000).toISOString()
    };
    
    res.status(200).json(syncResult);
  }, 420);
});

router.get('/repos', (req, res) => {
  res.status(200).json({
    success: true,
    repos: mockRepos,
    total: mockRepos.length
  });
});

module.exports = router;