// public/app.js
const api = require('./utils/api');
const audioPlayer = require('./js/audioPlayer');
const cart = require('./js/cart');
const githubSync = require('./js/githubSync');

// DOM Elements
const trackGrid = document.getElementById('track-grid');
const audioPlayerBar = document.getElementById('audio-player-bar');
const cartButton = document.getElementById('cart-button');
const cartModal = document.getElementById('cart-modal');
const closeCartModal = document.getElementById('close-cart-modal');
const checkoutButton = document.getElementById('checkout-button');
const githubSyncButton = document.getElementById('github-sync-button');
const syncStatus = document.getElementById('sync-status');

// State
let tracks = [];
let currentTrack = null;
let isPlaying = false;

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    loadTracks();
    setupEventListeners();
    audioPlayer.init();
    cart.init();
    githubSync.init();
});

// Load Tracks from API
function loadTracks() {
    api.fetchTracks()
        .then(data => {
            tracks = data;
            renderTrackGrid();
        })
        .catch(error => {
            console.error('Failed to load tracks:', error);
            showSyncStatus('Failed to load tracks. Retrying...', 'error');
            setTimeout(loadTracks, 5000);
        });
}

// Render Track Grid
function renderTrackGrid() {
    trackGrid.innerHTML = '';
    tracks.forEach(track => {
        const trackCard = document.createElement('div');
        trackCard.className = 'track-card';
        trackCard.innerHTML = `
            <div class="track-cover" style="background: linear-gradient(135deg, ${track.color1 || '#00f5d4'}, ${track.color2 || '#ff2a6d'});">
                <img src="${track.cover || 'assets/images/default-cover.png'}" alt="${track.title}" />
                <div class="play-overlay">
                    <button class="play-button" data-id="${track.id}">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                            <path d="M8 5v14l11-7z"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="track-info">
                <h3>${track.title}</h3>
                <p>${track.artist || 'VibeForge'}</p>
                <div class="track-meta">
                    <span class="duration">${track.duration || '3:30'}</span>
                    <span class="price">$${track.price || '4.99'}</span>
                </div>
            </div>
            <button class="add-to-cart" data-id="${track.id}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                    <path d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-1.5 6M7 13l-1.5 6m0 0h9"/>
                </svg>
                Add to Cart
            </button>
        `;
        trackGrid.appendChild(trackCard);
    });

    // Attach event listeners to dynamically created elements
    document.querySelectorAll('.play-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const trackId = e.target.closest('.play-button').dataset.id;
            playTrack(trackId);
        });
    });

    document.querySelectorAll('.add-to-cart').forEach(button => {
        button.addEventListener('click', (e) => {
            const trackId = e.target.closest('.add-to-cart').dataset.id;
            const track = tracks.find(t => t.id === trackId);
            cart.addItem(track);
            showCartModal();
        });
    });
}

// Play Track
function playTrack(trackId) {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;

    currentTrack = track;
    isPlaying = true;
    audioPlayer.loadTrack(track);
    audioPlayer.play();
    updatePlayerBar();
}

// Update Player Bar
function updatePlayerBar() {
    if (!currentTrack) return;
    const playerTitle = audioPlayerBar.querySelector('.player-title');
    const playerArtist = audioPlayerBar.querySelector('.player-artist');
    const playerCover = audioPlayerBar.querySelector('.player-cover');

    playerTitle.textContent = currentTrack.title;
    playerArtist.textContent = currentTrack.artist || 'VibeForge';
    playerCover.style.background = `linear-gradient(135deg, ${currentTrack.color1 || '#00f5d4'}, ${currentTrack.color2 || '#ff2a6d'})`;
    playerCover.innerHTML = `<img src="${currentTrack.cover || 'assets/images/default-cover.png'}" alt="${currentTrack.title}" />`;
}

// Setup Event Listeners
function setupEventListeners() {
    // Cart Modal
    cartButton.addEventListener('click', showCartModal);
    closeCartModal.addEventListener('click', hideCartModal);
    checkoutButton.addEventListener('click', () => {
        cart.checkout();
        hideCartModal();
    });

    // GitHub Sync
    githubSyncButton.addEventListener('click', () => {
        githubSync.sync()
            .then(() => showSyncStatus('Sync successful!', 'success'))
            .catch(() => showSyncStatus('Sync failed. Retrying...', 'error'));
    });

    // Audio Player Controls
    audioPlayerBar.querySelector('.player-play').addEventListener('click', () => {
        if (isPlaying) {
            audioPlayer.pause();
            isPlaying = false;
        } else {
            if (currentTrack) {
                audioPlayer.play();
                isPlaying = true;
            }
        }
    });

    audioPlayerBar.querySelector('.player-next').addEventListener('click', () => {
        // Simple next track logic (cycle through tracks)
        if (!currentTrack) return;
        const currentIndex = tracks.findIndex(t => t.id === currentTrack.id);
        const nextIndex = (currentIndex + 1) % tracks.length;
        playTrack(tracks[nextIndex].id);
    });

    audioPlayerBar.querySelector('.player-prev').addEventListener('click', () => {
        // Simple previous track logic (cycle through tracks)
        if (!currentTrack) return;
        const currentIndex = tracks.findIndex(t => t.id === currentTrack.id);
        const prevIndex = (currentIndex - 1 + tracks.length) % tracks.length;
        playTrack(tracks[prevIndex].id);
    });
}

// Show Cart Modal
function showCartModal() {
    cartModal.classList.add('active');
    cart.render();
}

// Hide Cart Modal
function hideCartModal() {
    cartModal.classList.remove('active');
}

// Show Sync Status
function showSyncStatus(message, type) {
    syncStatus.textContent = message;
    syncStatus.className = `sync-status ${type}`;
    setTimeout(() => {
        if (syncStatus.textContent === message) {
            syncStatus.textContent = '';
            syncStatus.className = 'sync-status';
        }
    }, 3000);
}

// Expose public methods for other modules
module.exports = {
    playTrack,
    updatePlayerBar,
    showSyncStatus
};