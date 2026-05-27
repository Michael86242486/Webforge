const api = require('../utils/api');

const githubSync = {
  init: function() {
    this.cache = {
      syncButton: document.getElementById('github-sync-btn'),
      statusText: document.getElementById('github-sync-status'),
      lastSync: document.getElementById('github-last-sync'),
      repoList: document.getElementById('github-repo-list'),
      notification: document.getElementById('github-notification')
    };

    if (!this.cache.syncButton) return;

    this.cache.syncButton.addEventListener('click', () => this.handleSync());
    this.loadLastSync();
    this.renderRepoList();
  },

  handleSync: function() {
    this.updateStatus('syncing', 'Syncing with GitHub...');
    this.cache.syncButton.disabled = true;
    this.cache.syncButton.classList.add('syncing');

    api.post('/api/github/sync')
      .then(response => {
        if (response.success) {
          this.updateStatus('success', 'Sync successful!');
          this.cache.lastSync.textContent = new Date().toLocaleString();
          this.renderRepoList(response.repos);
          this.showNotification('Sync complete! New repos loaded.', 'success');
        } else {
          throw new Error(response.message || 'Sync failed');
        }
      })
      .catch(error => {
        this.updateStatus('error', 'Sync failed: ' + error.message);
        this.showNotification('Sync failed. Please try again.', 'error');
      })
      .finally(() => {
        this.cache.syncButton.disabled = false;
        this.cache.syncButton.classList.remove('syncing');
        setTimeout(() => this.resetStatus(), 5000);
      });
  },

  updateStatus: function(type, message) {
    this.cache.statusText.textContent = message;
    this.cache.statusText.className = 'github-status ' + type;
  },

  resetStatus: function() {
    this.cache.statusText.textContent = 'Ready to sync';
    this.cache.statusText.className = 'github-status';
  },

  loadLastSync: function() {
    api.get('/api/github/sync')
      .then(response => {
        if (response.lastSync) {
          this.cache.lastSync.textContent = new Date(response.lastSync).toLocaleString();
        }
      })
      .catch(() => {
        this.cache.lastSync.textContent = 'Never';
      });
  },

  renderRepoList: function(repos) {
    if (!this.cache.repoList) return;

    let reposToRender = repos || [
      { name: 'vibeforge-beats', stars: 42, forks: 8, updated: '2026-05-20' },
      { name: 'neon-synth-pack', stars: 27, forks: 5, updated: '2026-05-18' },
      { name: 'retro-wave-samples', stars: 15, forks: 2, updated: '2026-05-15' }
    ];

    this.cache.repoList.innerHTML = reposToRender.map(repo => `
      <div class="repo-item glass-card">
        <div class="repo-header">
          <span class="repo-name neon-text">${repo.name}</span>
          <span class="repo-stars">★ ${repo.stars}</span>
        </div>
        <div class="repo-meta">
          <span>🍴 ${repo.forks}</span>
          <span>🔄 ${repo.updated}</span>
        </div>
      </div>
    `).join('');
  },

  showNotification: function(message, type) {
    if (!this.cache.notification) return;

    this.cache.notification.textContent = message;
    this.cache.notification.className = 'github-notification ' + type;
    this.cache.notification.style.display = 'block';

    setTimeout(() => {
      this.cache.notification.style.display = 'none';
    }, 4000);
  }
};

module.exports = githubSync;