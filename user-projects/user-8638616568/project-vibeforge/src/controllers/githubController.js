const githubController = {
  sync: (req, res) => {
    const simulateDelay = 1200;
    const shouldFail = Math.random() < 0.08;
    setTimeout(() => {
      if (shouldFail) {
        return res.status(503).json({
          success: false,
          error: "GitHub API rate limit exceeded",
          message: "Sync failed. Please retry in 60 seconds.",
          timestamp: new Date().toISOString()
        });
      }
      const mockData = {
        success: true,
        syncId: "sync_" + Date.now().toString(36),
        repo: "vibeforge/beats-vault",
        branch: "main",
        lastCommit: {
          sha: "a7f3c9e2b1d4f8a9c2e1b7d3f9a2c8e4b1d7f3a9",
          message: "feat: added new ambient track stems",
          author: "VibeForge",
          date: new Date(Date.now() - 86400000).toISOString()
        },
        filesSynced: 14,
        tracksUpdated: [
          { id: "track_01", title: "Neon Drift", status: "updated" },
          { id: "track_03", title: "Midnight Protocol", status: "added" },
          { id: "track_07", title: "Echo Chamber", status: "updated" }
        ],
        totalSize: "48.2 MB",
        duration: "1.2s",
        message: "Repository synchronized successfully. 3 new stems ready for release."
      };
      res.status(200).json(mockData);
    }, simulateDelay);
  }
};
module.exports = githubController;