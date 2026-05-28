const api = require('./utils/api');
const AudioPlayer = require('./js/audioPlayer');
const Cart = require('./js/cart');
const githubSync = require('./js/githubSync');

document.addEventListener('DOMContentLoaded', () => {
    const trackGrid = document.getElementById('track-grid');
    const audioPlayer = new AudioPlayer();
    const cart = new Cart();
    const syncButton = document.getElementById('github-sync-btn');

    // Initialize UI
    initTrackGrid();
    initEventListeners();

    function initTrackGrid() {
        // Simulate fetching tracks from API
        const mockTracks = [
            { id: 1, title: 'Neon Dreams', artist: 'VibeForge', duration: '3:45', price: 12.99, audio: 'assets/audio/placeholder.mp3', cover: 'assets/images/neon-dreams.jpg' },
            { id: 2, title: 'Retro Wave', artist: 'VibeForge', duration: '4:20', price: 14.99, audio: 'assets/audio/placeholder.mp3', cover: 'assets/images/retro-wave.jpg' },
            { id: 3, title: 'Synth Horizon', artist: 'VibeForge', duration: '3:10', price: 10.99, audio: 'assets/audio/placeholder.mp3', cover: 'assets/images/synth-horizon.jpg' },
            { id: 4, title: 'Cyber Pulse', artist: 'VibeForge', duration: '2:55', price: 9.99, audio: 'assets/audio/placeholder.mp3', cover: 'assets/images/cyber-pulse.jpg' },
            { id: 5, title: 'Electric Echo', artist: 'VibeForge', duration: '3:30', price: 11.99, audio: 'assets/audio/placeholder.mp3', cover: 'assets/images/electric-echo.jpg' },
            { id: 6, title: 'Glitch Paradise', artist: 'VibeForge', duration: '4:05', price: 13.99, audio: 'assets/audio/placeholder.mp3', cover: 'assets/images/glitch-paradise.jpg' }
        ];

        mockTracks.forEach(track => {
            const trackCard = document.createElement('div');
            trackCard.className = 'track-card glassmorphism';
            trackCard.innerHTML = `
                <img src="${track.cover}" alt="${track.title}" class="track-cover" onerror="this.src='assets/images/logo.svg'">
                <div class="track-info">
                    <h3 class="neon-text">${track.title}</h3>
                    <p class="neon-subtext">${track.artist} • ${track.duration}</p>
                    <p class="neon-price">$${track.price.toFixed(2)}</p>
                </div>
                <div class="track-actions">
                    <button class="btn-neon play-btn" data-audio="${track.audio}" data-title="${track.title}">▶</button>
                    <button class="btn-neon cart-btn" data-id="${track.id}" data-title="${track.title}" data-price="${track.price}">+</button>
                </div>
            `;
            trackGrid.appendChild(trackCard);
        });

        // Attach event listeners to dynamically created buttons
        document.querySelectorAll('.play-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const audioSrc = e.target.getAttribute('data-audio');
                const title = e.target.getAttribute('data-title');
                audioPlayer.loadAndPlay(audioSrc, title);
            });
        });

        document.querySelectorAll('.cart-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                const title = e.target.getAttribute('data-title');
                const price = parseFloat(e.target.getAttribute('data-price'));
                cart.addItem({ id, title, price });
            });
        });
    }

    function initEventListeners() {
        // Audio player controls
        document.getElementById('play-pause-btn').addEventListener('click', () => audioPlayer.togglePlay());
        document.getElementById('prev-btn').addEventListener('click', () => audioPlayer.prev());
        document.getElementById('next-btn').addEventListener('click', () => audioPlayer.next());
        document.getElementById('volume-slider').addEventListener('input', (e) => audioPlayer.setVolume(e.target.value));

        // Cart modal
        document.getElementById('cart-btn').addEventListener('click', () => cart.openModal());
        document.getElementById('close-cart-modal').addEventListener('click', () => cart.closeModal());
        document.getElementById('checkout-btn').addEventListener('click', () => cart.checkout());

        // GitHub sync
        syncButton.addEventListener('click', async () => {
            syncButton.disabled = true;
            syncButton.textContent = 'Syncing...';
            try {
                const result = await githubSync.syncWithGitHub();
                alert(result.message);
            } catch (error) {
                alert(`Sync failed: ${error.message}`);
            } finally {
                syncButton.disabled = false;
                syncButton.textContent = 'Sync with GitHub';
            }
        });

        // Cart inquiry
        document.getElementById('inquiry-btn').addEventListener('click', async () => {
            try {
                const response = await api.postInquiry({ message: 'Cart inquiry from VibeForge' });
                alert(`Inquiry sent! ID: ${response.inquiryId}`);
            } catch (error) {
                alert(`Inquiry failed: ${error.message}`);
            }
        });
    }

    // Global audio player progress bar update
    setInterval(() => {
        const progressBar = document.getElementById('progress-bar');
        if (progressBar && audioPlayer.audio) {
            const progress = (audioPlayer.audio.currentTime / audioPlayer.audio.duration) * 100;
            progressBar.style.width = `${progress}%`;
        }
    }, 100);
});