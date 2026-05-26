// VibeForge App - Main Frontend Controller
// Retro-neon portfolio logic: API integration, UI orchestration, audio controls

(function() {
  'use strict';

  const API_BASE = '/api';
  let currentUser = { id: 'vf-' + Date.now(), name: 'Guest Producer' };
  let tracks = [];
  let isPlayerInitialized = false;

  function initializeApp() {
    console.log('%c[VibeForge] Initializing retro-neon dashboard...', 'color:#00f3ff');
    
    loadTracks();
    setupNavigation();
    setupGlobalListeners();
    initializeAudioIntegration();
    loadCartState();
    setupGitHubSync();
    
    // Dynamic greeting
    const greeting = document.getElementById('user-greeting');
    if (greeting) {
      greeting.textContent = `Welcome back, ${currentUser.name}`;
      greeting.classList.add('neon-pulse');
    }
    
    // Auto-fetch portfolio stats
    fetchPortfolioStats();
  }

  function loadTracks() {
    tracks = [
      { id: 1, title: "Neon Drift", duration: "3:42", price: 24.99, genre: "Synthwave", waveform: [0.2,0.8,0.4,0.9,0.3,0.7] },
      { id: 2, title: "Midnight Voltage", duration: "4:15", price: 19.99, genre: "Retrowave", waveform: [0.5,0.3,0.9,0.6,0.8,0.4] },
      { id: 3, title: "Cyber Pulse", duration: "2:58", price: 29.99, genre: "Electronic", waveform: [0.7,0.2,0.6,0.9,0.5,0.8] }
    ];
    
    renderTrackGrid();
  }

  function renderTrackGrid() {
    const grid = document.getElementById('track-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    tracks.forEach(track => {
      const card = document.createElement('div');
      card.className = 'track-card glass';
      card.innerHTML = `
        <div class="track-header">
          <h3>${track.title}</h3>
          <span class="genre-tag">${track.genre}</span>
        </div>
        <div class="track-meta">
          <span>${track.duration}</span>
          <span class="price">$${track.price}</span>
        </div>
        <div class="track-actions">
          <button class="neon-btn play-btn" data-track-id="${track.id}">▶ Preview</button>
          <button class="neon-btn cart-btn" data-track-id="${track.id}">Add to Cart</button>
        </div>
      `;
      
      card.querySelector('.play-btn').addEventListener('click', () => handleTrackPreview(track));
      card.querySelector('.cart-btn').addEventListener('click', () => addToCart(track));
      
      grid.appendChild(card);
    });
  }

  function handleTrackPreview(track) {
    const playerContainer = document.getElementById('audio-player');
    if (!playerContainer) return;
    
    playerContainer.classList.add('active');
    
    // Delegate to audioPlayer module
    if (window.VibeForgeAudio) {
      window.VibeForgeAudio.loadTrack(track);
      window.VibeForgeAudio.play();
    } else {
      // Fallback inline player
      simulateInlinePlayback(track);
    }
    
    updateNowPlaying(track);
  }

  function simulateInlinePlayback(track) {
    const status = document.getElementById('player-status');
    if (status) {
      status.textContent = `Playing: ${track.title}`;
      status.style.color = '#00f3ff';
    }
    
    setTimeout(() => {
      if (status) status.textContent = 'Preview ended';
    }, 8000);
  }

  function updateNowPlaying(track) {
    const nowPlaying = document.getElementById('now-playing');
    if (nowPlaying) {
      nowPlaying.innerHTML = `
        <div class="now-playing-content">
          <span class="track-name">${track.title}</span>
          <span class="live-indicator">● LIVE</span>
        </div>
      `;
    }
  }

  function addToCart(track) {
    if (window.VibeForgeCart) {
      window.VibeForgeCart.addItem(track);
    } else {
      // Fallback
      let cart = JSON.parse(localStorage.getItem('vibeforge_cart') || '[]');
      cart.push(track);
      localStorage.setItem('vibeforge_cart', JSON.stringify(cart));
      updateCartCount(cart.length);
    }
  }

  function updateCartCount(count) {
    const counter = document.getElementById('cart-count');
    if (counter) counter.textContent = count;
  }

  function loadCartState() {
    const cart = JSON.parse(localStorage.getItem('vibeforge_cart') || '[]');
    updateCartCount(cart.length);
  }

  function setupNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = link.getAttribute('href').substring(1);
        document.getElementById(target)?.scrollIntoView({ behavior: 'smooth' });
        
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
      });
    });
  }

  function setupGlobalListeners() {
    // Inquiry form
    const inquiryForm = document.getElementById('inquiry-form');
    if (inquiryForm) {
      inquiryForm.addEventListener('submit', handleInquirySubmit);
    }
    
    // Search functionality
    const searchInput = document.getElementById('track-search');
    if (searchInput) {
      searchInput.addEventListener('input', debounce(filterTracks, 300));
    }
  }

  async function handleInquirySubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {
      cartItems: JSON.parse(localStorage.getItem('vibeforge_cart') || '[]'),
      message: formData.get('message') || 'Portfolio licensing inquiry',
      user: currentUser
    };
    
    try {
      const res = await fetch(`${API_BASE}/inquiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      showToast(data.message || 'Inquiry submitted successfully!', 'success');
      localStorage.removeItem('vibeforge_cart');
      updateCartCount(0);
    } catch (err) {
      showToast('Connection error. Please try again.', 'error');
    }
  }

  function setupGitHubSync() {
    const syncBtn = document.getElementById('github-sync-btn');
    if (syncBtn) {
      syncBtn.addEventListener('click', async () => {
        syncBtn.disabled = true;
        syncBtn.textContent = 'Syncing...';
        
        try {
          const res = await fetch(`${API_BASE}/github/sync`, { method: 'POST' });
          const data = await res.json();
          
          if (window.VibeForgeGitHub) {
            window.VibeForgeGitHub.showSyncResult(data);
          } else {
            showToast(`Synced ${data.commits} commits`, 'success');
          }
        } catch (err) {
          showToast('Sync failed', 'error');
        }
        
        syncBtn.disabled = false;
        syncBtn.textContent = 'Sync with GitHub';
      });
    }
  }

  async function fetchPortfolioStats() {
    try {
      const res = await fetch(`${API_BASE}/github/sync`);
      const data = await res.json();
      
      const statsEl = document.getElementById('portfolio-stats');
      if (statsEl) {
        statsEl.innerHTML = `
          <div>Beats Released: <strong>${data.totalTracks || 47}</strong></div>
          <div>GitHub Stars: <strong>${data.stars || 1240}</strong></div>
        `;
      }
    } catch (e) {}
  }

  function filterTracks() {
    const term = document.getElementById('track-search').value.toLowerCase();
    const cards = document.querySelectorAll('.track-card');
    
    cards.forEach(card => {
      const title = card.querySelector('h3').textContent.toLowerCase();
      card.style.display = title.includes(term) ? 'block' : 'none';
    });
  }

  function initializeAudioIntegration() {
    // Ensure audioPlayer.js is loaded and ready
    if (!isPlayerInitialized && window.VibeForgeAudio) {
      window.VibeForgeAudio.init();
      isPlayerInitialized = true;
    }
    
    document.addEventListener('audioTrackEnded', () => {
      const status = document.getElementById('player-status');
      if (status) status.textContent = 'Ready for next preview';
    });
  }

  function debounce(fn, delay) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  // Boot application
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
  } else {
    initializeApp();
  }

  // Expose public API
  window.VibeForgeApp = {
    refreshTracks: loadTracks,
    submitInquiry: handleInquirySubmit,
    syncGitHub: setupGitHubSync
  };
})();