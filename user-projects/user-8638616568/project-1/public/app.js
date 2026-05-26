const audio = new Audio('/assets/audio/sample.mp3');
let currentTrack = null;
let isPlaying = false;
let cart = [];
let tracks = [
  { id: 1, title: "Neon Drift", bpm: 128, price: 49, duration: "3:42", genre: "Synthwave" },
  { id: 2, title: "Midnight Pulse", bpm: 140, price: 59, duration: "4:15", genre: "Retrowave" },
  { id: 3, title: "Vapor Realm", bpm: 120, price: 39, duration: "2:58", genre: "Chillwave" },
  { id: 4, title: "Cyber Static", bpm: 135, price: 69, duration: "5:03", genre: "Darkwave" }
];

function initApp() {
  renderTracks();
  setupAudioControls();
  setupCart();
  setupNavListeners();
  setupInquiryForm();
  updateCartCount();
  console.log('%c[VibeForge] Retro-neon portfolio initialized', 'color:#00f3ff');
}

function renderTracks() {
  const grid = document.getElementById('track-grid');
  if (!grid) return;
  grid.innerHTML = '';
  tracks.forEach(track => {
    const card = document.createElement('div');
    card.className = 'track-card glass';
    card.innerHTML = `
      <div class="track-header">
        <h3>${track.title}</h3>
        <span class="genre">${track.genre}</span>
      </div>
      <div class="track-meta">
        <span>${track.bpm} BPM</span>
        <span>${track.duration}</span>
      </div>
      <div class="track-actions">
        <button class="btn-preview" data-id="${track.id}">▶ Preview</button>
        <button class="btn-cart" data-id="${track.id}">+ $${track.price}</button>
      </div>
    `;
    grid.appendChild(card);
  });
  grid.querySelectorAll('.btn-preview').forEach(btn => {
    btn.addEventListener('click', () => previewTrack(parseInt(btn.dataset.id)));
  });
  grid.querySelectorAll('.btn-cart').forEach(btn => {
    btn.addEventListener('click', () => addToCart(parseInt(btn.dataset.id)));
  });
}

function previewTrack(id) {
  const track = tracks.find(t => t.id === id);
  if (!track) return;
  currentTrack = track;
  document.getElementById('now-playing').textContent = track.title;
  audio.currentTime = 0;
  if (isPlaying) audio.pause();
  audio.play().then(() => {
    isPlaying = true;
    document.getElementById('play-btn').textContent = '⏸';
    startWaveform();
  }).catch(() => {
    alert('Preview ready — connect real audio source in production');
  });
}

function setupAudioControls() {
  const playBtn = document.getElementById('play-btn');
  const progress = document.getElementById('progress');
  if (!playBtn || !progress) return;

  playBtn.addEventListener('click', () => {
    if (!currentTrack) {
      previewTrack(1);
      return;
    }
    if (isPlaying) {
      audio.pause();
      isPlaying = false;
      playBtn.textContent = '▶';
    } else {
      audio.play().then(() => {
        isPlaying = true;
        playBtn.textContent = '⏸';
        startWaveform();
      });
    }
  });

  audio.addEventListener('timeupdate', () => {
    if (audio.duration) {
      progress.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
    }
  });

  audio.addEventListener('ended', () => {
    isPlaying = false;
    playBtn.textContent = '▶';
    progress.style.width = '0%';
    stopWaveform();
  });
}

let waveInterval = null;
function startWaveform() {
  const bars = document.querySelectorAll('.wave-bar');
  if (!bars.length) return;
  stopWaveform();
  waveInterval = setInterval(() => {
    bars.forEach(bar => {
      bar.style.height = `${Math.random() * 28 + 8}px`;
    });
  }, 120);
}

function stopWaveform() {
  if (waveInterval) clearInterval(waveInterval);
  document.querySelectorAll('.wave-bar').forEach(bar => bar.style.height = '12px');
}

function addToCart(id) {
  const track = tracks.find(t => t.id === id);
  if (!track || cart.find(c => c.id === id)) return;
  cart.push(track);
  updateCartCount();
  showToast(`${track.title} added to cart`);
}

function updateCartCount() {
  const countEl = document.getElementById('cart-count');
  if (countEl) countEl.textContent = cart.length;
}

function setupCart() {
  const cartBtn = document.getElementById('cart-btn');
  const modal = document.getElementById('cart-modal');
  const closeBtn = document.getElementById('close-cart');
  const checkoutBtn = document.getElementById('checkout-btn');

  if (cartBtn) cartBtn.addEventListener('click', () => {
    renderCart();
    modal.style.display = 'flex';
  });
  if (closeBtn) closeBtn.addEventListener('click', () => modal.style.display = 'none');
  if (checkoutBtn) checkoutBtn.addEventListener('click', submitInquiry);
}

function renderCart() {
  const container = document.getElementById('cart-items');
  if (!container) return;
  container.innerHTML = '';
  let total = 0;
  cart.forEach((item, index) => {
    total += item.price;
    const row = document.createElement('div');
    row.className = 'cart-row';
    row.innerHTML = `
      <span>${item.title}</span>
      <span>$${item.price}</span>
      <button data-idx="${index}">×</button>
    `;
    row.querySelector('button').addEventListener('click', () => {
      cart.splice(index, 1);
      updateCartCount();
      renderCart();
    });
    container.appendChild(row);
  });
  document.getElementById('cart-total').textContent = `$${total}`;
}

async function submitInquiry() {
  if (!cart.length) return;
  try {
    const res = await fetch('/api/inquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: cart, timestamp: Date.now() })
    });
    const data = await res.json();
    alert(`Inquiry #${data.id} submitted successfully. VibeForge will contact you.`);
    cart = [];
    updateCartCount();
    document.getElementById('cart-modal').style.display = 'none';
  } catch (e) {
    alert('Inquiry sent (demo mode)');
    cart = [];
    updateCartCount();
    document.getElementById('cart-modal').style.display = 'none';
  }
}

function setupNavListeners() {
  const syncBtn = document.getElementById('github-sync');
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      syncBtn.textContent = 'Syncing...';
      await fetch('/api/github/sync', { method: 'POST' });
      setTimeout(() => {
        syncBtn.textContent = 'Synced ✓';
        setTimeout(() => syncBtn.textContent = 'Sync GitHub', 1800);
      }, 800);
    });
  }
}

function setupInquiryForm() {
  const form = document.getElementById('quick-inquiry');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await fetch('/api/inquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'quick', message: form.message.value })
    });
    alert('Message received. Thank you.');
    form.reset();
  });
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}

document.addEventListener('DOMContentLoaded', initApp);