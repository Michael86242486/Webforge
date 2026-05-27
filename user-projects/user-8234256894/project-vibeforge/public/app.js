const api = require('./utils/api');
const TrackCard = require('./components/TrackCard.html');
const CartModal = require('./components/CartModal.html');
const AudioPlayer = require('./components/AudioPlayer.html');

document.addEventListener('DOMContentLoaded', () => {
    const trackGrid = document.getElementById('track-grid');
    const cartModal = document.getElementById('cart-modal');
    const audioPlayer = document.getElementById('audio-player');
    const openCartBtn = document.getElementById('open-cart-btn');
    const closeCartBtn = document.getElementById('close-cart-btn');
    const checkoutBtn = document.getElementById('checkout-btn');
    const cartItemsContainer = document.getElementById('cart-items');
    const cartTotalElement = document.getElementById('cart-total');
    const audioSource = document.getElementById('audio-source');
    const audioElement = document.getElementById('audio-element');
    const playPauseBtn = document.getElementById('play-pause-btn');
    const progressBar = document.getElementById('progress-bar');
    const volumeSlider = document.getElementById('volume-slider');
    const currentTimeElement = document.getElementById('current-time');
    const durationElement = document.getElementById('duration');

    let cart = [];
    let currentTrack = null;
    let isPlaying = false;
    let updateInterval;

    const tracks = [
        { id: 1, title: 'Neon Dreams', artist: 'VibeForge', price: 12.99, duration: '3:45', file: 'assets/audio/placeholder.mp3', cover: 'https://via.placeholder.com/300x300/0a0a0f/00f5d4?text=Neon+Dreams' },
        { id: 2, title: 'Cyber Pulse', artist: 'VibeForge', price: 14.99, duration: '4:20', file: 'assets/audio/placeholder.mp3', cover: 'https://via.placeholder.com/300x300/0a0a0f/7b2cbf?text=Cyber+Pulse' },
        { id: 3, title: 'Retro Wave', artist: 'VibeForge', price: 10.99, duration: '3:15', file: 'assets/audio/placeholder.mp3', cover: 'https://via.placeholder.com/300x300/0a0a0f/00ff85?text=Retro+Wave' },
        { id: 4, title: 'Synth Horizon', artist: 'VibeForge', price: 13.99, duration: '5:00', file: 'assets/audio/placeholder.mp3', cover: 'https://via.placeholder.com/300x300/0a0a0f/ffcc00?text=Synth+Horizon' },
        { id: 5, title: 'Midnight Glow', artist: 'VibeForge', price: 11.99, duration: '3:50', file: 'assets/audio/placeholder.mp3', cover: 'https://via.placeholder.com/300x300/0a0a0f/ff2e2e?text=Midnight+Glow' },
        { id: 6, title: 'Electric Vibes', artist: 'VibeForge', price: 15.99, duration: '4:40', file: 'assets/audio/placeholder.mp3', cover: 'https://via.placeholder.com/300x300/0a0a0f/00f5d4?text=Electric+Vibes' }
    ];

    function renderTracks() {
        trackGrid.innerHTML = '';
        tracks.forEach(track => {
            const trackCard = document.createElement('div');
            trackCard.className = 'track-card';
            trackCard.innerHTML = `
                <img src="${track.cover}" alt="${track.title}" class="track-cover">
                <div class="track-info">
                    <h3 class="track-title">${track.title}</h3>
                    <p class="track-artist">${track.artist}</p>
                    <p class="track-duration">${track.duration}</p>
                    <p class="track-price">$${track.price.toFixed(2)}</p>
                </div>
                <div class="track-actions">
                    <button class="btn btn-play" data-id="${track.id}">▶</button>
                    <button class="btn btn-add" data-id="${track.id}">+ Cart</button>
                </div>
            `;
            trackGrid.appendChild(trackCard);
        });

        document.querySelectorAll('.btn-play').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const trackId = parseInt(e.target.getAttribute('data-id'));
                const track = tracks.find(t => t.id === trackId);
                loadTrack(track);
            });
        });

        document.querySelectorAll('.btn-add').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const trackId = parseInt(e.target.getAttribute('data-id'));
                const track = tracks.find(t => t.id === trackId);
                addToCart(track);
            });
        });
    }

    function loadTrack(track) {
        if (currentTrack && currentTrack.id === track.id) {
            togglePlayPause();
            return;
        }
        currentTrack = track;
        audioSource.src = track.file;
        audioElement.load();
        document.getElementById('player-track-title').textContent = track.title;
        document.getElementById('player-track-artist').textContent = track.artist;
        document.getElementById('player-track-cover').src = track.cover;
        isPlaying = true;
        playPauseBtn.textContent = '❚❚';
        audioElement.play();
        clearInterval(updateInterval);
        updateInterval = setInterval(updateProgress, 1000);
    }

    function togglePlayPause() {
        if (isPlaying) {
            audioElement.pause();
            playPauseBtn.textContent = '▶';
        } else {
            audioElement.play();
            playPauseBtn.textContent = '❚❚';
        }
        isPlaying = !isPlaying;
    }

    function updateProgress() {
        if (audioElement.duration) {
            const progress = (audioElement.currentTime / audioElement.duration) * 100;
            progressBar.style.width = `${progress}%`;
            currentTimeElement.textContent = formatTime(audioElement.currentTime);
            durationElement.textContent = formatTime(audioElement.duration);
        }
    }

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    }

    function addToCart(track) {
        const existingItem = cart.find(item => item.id === track.id);
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            cart.push({ ...track, quantity: 1 });
        }
        updateCartUI();
        showNotification(`${track.title} added to cart!`);
    }

    function removeFromCart(trackId) {
        cart = cart.filter(item => item.id !== trackId);
        updateCartUI();
    }

    function updateCartUI() {
        cartItemsContainer.innerHTML = '';
        let total = 0;
        cart.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.className = 'cart-item';
            itemElement.innerHTML = `
                <img src="${item.cover}" alt="${item.title}" class="cart-item-cover">
                <div class="cart-item-info">
                    <h4>${item.title}</h4>
                    <p>$${item.price.toFixed(2)} x ${item.quantity}</p>
                </div>
                <button class="btn btn-remove" data-id="${item.id}">×</button>
            `;
            cartItemsContainer.appendChild(itemElement);
            total += item.price * item.quantity;
        });

        cartTotalElement.textContent = `$${total.toFixed(2)}`;

        document.querySelectorAll('.btn-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const trackId = parseInt(e.target.getAttribute('data-id'));
                removeFromCart(trackId);
            });
        });
    }

    function showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = message;
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 400);
        }, 3000);
    }

    function openCart() {
        cartModal.classList.add('active');
    }

    function closeCart() {
        cartModal.classList.remove('active');
    }

    function checkout() {
        if (cart.length === 0) return;
        api.post('/api/inquiry', { cart })
            .then(response => {
                showNotification('Checkout successful!');
                cart = [];
                updateCartUI();
                closeCart();
            })
            .catch(error => {
                showNotification('Checkout failed. Please try again.');
                console.error('Checkout error:', error);
            });
    }

    function syncWithGitHub() {
        api.get('/api/github/sync')
            .then(response => {
                showNotification('Synced with GitHub!');
            })
            .catch(error => {
                showNotification('Sync failed. Please try again.');
                console.error('Sync error:', error);
            });
    }

    playPauseBtn.addEventListener('click', togglePlayPause);
    openCartBtn.addEventListener('click', openCart);
    closeCartBtn.addEventListener('click', closeCart);
    checkoutBtn.addEventListener('click', checkout);
    audioElement.addEventListener('ended', () => {
        isPlaying = false;
        playPauseBtn.textContent = '▶';
        clearInterval(updateInterval);
    });
    volumeSlider.addEventListener('input', (e) => {
        audioElement.volume = e.target.value;
    });
    progressBar.parentElement.addEventListener('click', (e) => {
        const progressContainer = e.currentTarget;
        const rect = progressContainer.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        audioElement.currentTime = pos * audioElement.duration;
        updateProgress();
    });

    renderTracks();
    updateCartUI();

    module.exports = {
        addToCart,
        removeFromCart,
        loadTrack,
        togglePlayPause,
        openCart,
        closeCart,
        checkout,
        syncWithGitHub
    };
});