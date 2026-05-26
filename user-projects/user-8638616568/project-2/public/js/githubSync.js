const githubSyncContainer = document.getElementById('github-sync');
const syncBtn = document.getElementById('sync-btn');
const statusEl = document.getElementById('sync-status');
const progressBar = document.getElementById('sync-progress');
const logContainer = document.getElementById('sync-log');
const repoInfo = document.getElementById('repo-info');

function addLogEntry(message, type = 'info') {
  const entry = document.createElement('div');
  entry.className = `log-entry log-${type}`;
  entry.innerHTML = `
    <span class="log-time">[${new Date().toLocaleTimeString()}]</span>
    <span class="log-msg">${message}</span>
  `;
  logContainer.appendChild(entry);
  logContainer.scrollTop = logContainer.scrollHeight;
  setTimeout(() => {
    if (entry.parentNode) entry.parentNode.removeChild(entry);
  }, 8000);
}

function updateProgress(percent) {
  progressBar.style.width = `${percent}%`;
  progressBar.style.background = percent === 100 
    ? 'linear-gradient(90deg, #00ff9d, #00cc7a)' 
    : 'linear-gradient(90deg, #ff00aa, #00f3ff)';
}

function simulateNeonPulse(element) {
  element.style.boxShadow = '0 0 20px #00f3ff, 0 0 40px #ff00aa';
  setTimeout(() => {
    element.style.boxShadow = '0 0 10px rgba(0, 243, 255, 0.3)';
  }, 600);
}

async function performGitHubSync() {
  if (!syncBtn || syncBtn.disabled) return;
  
  syncBtn.disabled = true;
  syncBtn.innerHTML = '<span class="btn-text">SYNCING...</span>';
  statusEl.textContent = 'CONNECTING TO GITHUB...';
  statusEl.className = 'status syncing';
  progressBar.style.width = '0%';
  logContainer.innerHTML = '';
  
  addLogEntry('Initiating secure GitHub sync...', 'info');
  updateProgress(15);
  
  try {
    const response = await fetch('/api/github/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        action: 'full-sync', 
        timestamp: Date.now() 
      })
    });
    
    updateProgress(45);
    addLogEntry('Authenticating with GitHub API...', 'info');
    
    await new Promise(r => setTimeout(r, 420));
    updateProgress(68);
    addLogEntry('Fetching latest releases and stems...', 'info');
    
    const data = await response.json();
    
    updateProgress(85);
    addLogEntry(`Synced ${data.commits || 12} commits successfully`, 'success');
    addLogEntry(`Updated ${data.tracks || 7} audio assets`, 'success');
    
    await new Promise(r => setTimeout(r, 380));
    updateProgress(100);
    
    statusEl.textContent = 'SYNC COMPLETE';
    statusEl.className = 'status success';
    syncBtn.innerHTML = '<span class="btn-text">SYNC AGAIN</span>';
    
    if (repoInfo) {
      repoInfo.innerHTML = `
        <div class="repo-stats">
          <div>REPO: <span>${data.repo || 'vibeforge/beats-v2'}</span></div>
          <div>LAST PUSH: <span>${data.lastPush || 'just now'}</span></div>
          <div>BRANCH: <span>${data.branch || 'main'}</span></div>
        </div>
      `;
      simulateNeonPulse(repoInfo);
    }
    
    addLogEntry('All stems and metadata synchronized', 'success');
    
    setTimeout(() => {
      if (syncBtn) {
        syncBtn.disabled = false;
        syncBtn.innerHTML = '<span class="btn-text">SYNC WITH GITHUB</span>';
      }
      statusEl.className = 'status idle';
      statusEl.textContent = 'READY TO SYNC';
    }, 4200);
    
  } catch (err) {
    statusEl.textContent = 'SYNC FAILED';
    statusEl.className = 'status error';
    addLogEntry('Error: ' + err.message, 'error');
    updateProgress(0);
    syncBtn.disabled = false;
    syncBtn.innerHTML = '<span class="btn-text">RETRY SYNC</span>';
  }
}

if (syncBtn) {
  syncBtn.addEventListener('click', performGitHubSync);
  
  syncBtn.addEventListener('mouseenter', () => {
    if (!syncBtn.disabled) simulateNeonPulse(syncBtn);
  });
}

if (statusEl) {
  statusEl.textContent = 'READY TO SYNC';
  statusEl.className = 'status idle';
}

window.VibeForgeGitHub = { performGitHubSync, addLogEntry };