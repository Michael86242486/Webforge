// public/app.js
const api = require('./utils/api');

document.addEventListener('DOMContentLoaded', () => {
    const trackGrid = document.getElementById('track-grid');
    const cartModal = document.getElementById('cart-modal');
    const cartButton = document.getElementById('cart-button');
    const closeCartButton = document.getElementById('close-cart');
    const cartItemsContainer = document.getElementById('cart-items');
    const cartTotalElement = document.getElementById('cart-total');
    const checkoutButton = document.getElementById('checkout-button');
    const githubSyncButton = document.getElementById('github-sync-button');
    const githubStatusElement = document.getElementById('github-status');
    const audioPlayer = document.getElementById('audio-player');
    const nowPlayingTitle = document.getElementById('now-playing-title');
    const nowPlayingArtist = document.getElementById('now-playing-artist');
    const playPauseButton = document.getElementById('play-pause-button');
    const progressBar = document.getElementById('progress-bar');
    const currentTimeElement = document.getElementById('current-time');
    const durationElement = document.getElementById('duration');
    const volumeSlider = document.getElementById('volume-slider');
    const waveformCanvas = document.getElementById('waveform-canvas');
    const waveformCtx = waveformCanvas.getContext('2d');

    let cart = [];
    let currentTrack = null;
    let audioContext = null;
    let analyser = null;
    let audioSource = null;
    let animationId = null;
    let isPlaying = false;
    let currentAudio = null;

    // Initialize audio context
    function initAudioContext() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
        }
    }

    // Load tracks from API or mock data
    async function loadTracks() {
        try {
            const response = await api.getTracks();
            renderTracks(response.tracks || mockTracks);
        } catch (error) {
            console.error('Failed to load tracks:', error);
            renderTracks(mockTracks);
        }
    }

    // Mock tracks data
    const mockTracks = [
        { id: 1, title: 'Neon Dreams', artist: 'VibeForge', price: 12.99, duration: '3:45', audio: 'assets/audio/placeholder.mp3', cover: 'https://via.placeholder.com/300x300/0a0a0f/00f5ff?text=Neon+Dreams' },
        { id: 2, title: 'Cyber Sunset', artist: 'VibeForge', price: 9.99, duration: '4:20', audio: 'assets/audio/placeholder.mp3', cover: 'https://via.placeholder.com/300x300/0a0a0f/ff2a6d?text=Cyber+Sunset' },
        { id: 3, title: 'Retro Wave', artist: 'VibeForge', price: 14.99, duration: '3:15', audio: 'assets/audio/placeholder.mp3', cover: 'https://via.placeholder.com/300x300/0a0a0f/00ff85?text=Retro+Wave' },
        { id: 4, title: 'Synth Horizon', artist: 'VibeForge', price: 11.99, duration: '5:00', audio: 'assets/audio/placeholder.mp3', cover: 'https://via.placeholder.com/300x300/0a0a0f/00f5ff?text=Synth+Horizon' },
        { id: 5, title: 'Electric Pulse', artist: 'VibeForge', price: 8.99, duration: '2:50', audio: 'assets/audio/placeholder.mp3', cover: 'https://via.placeholder.com/300x300/0a0a0f/ff2a6d?text=Electric+Pulse' },
        { id: 6, title: 'Midnight Protocol', artist: 'VibeForge', price: 13.99, duration: '4:40', audio: 'assets/audio/placeholder.mp3', cover: 'https://via.placeholder.com/300x300/0a0a0f/00ff85?text=Midnight+Protocol' }
    ];

    // Render tracks to the grid
    function renderTracks(tracks) {
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
                    <button class="btn btn-play" data-track='${JSON.stringify(track)}'>
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="btn btn-cart" data-track='${JSON.stringify(track)}'>
                        <i class="fas fa-shopping-cart"></i>
                    </button>
                </div>
            `;
            trackGrid.appendChild(trackCard);
        });

        // Add event listeners for play and cart buttons
        document.querySelectorAll('.btn-play').forEach(button => {
            button.addEventListener('click', (e) => {
                const track = JSON.parse(e.target.closest('button').dataset.track);
                playTrack(track);
            });
        });

        document.querySelectorAll('.btn-cart').forEach(button => {
            button.addEventListener('click', (e) => {
                const track = JSON.parse(e.target.closest('button').dataset.track);
                addToCart(track);
            });
        });
    }

    // Play a track
    function playTrack(track) {
        if (currentTrack && currentTrack.id === track.id) {
            togglePlayPause();
            return;
        }

        currentTrack = track;
        nowPlayingTitle.textContent = track.title;
        nowPlayingArtist.textContent = track.artist;

        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }

        currentAudio = new Audio(track.audio);
        currentAudio.volume = volumeSlider.value / 100;

        currentAudio.addEventListener('loadedmetadata', () => {
            durationElement.textContent = formatTime(currentAudio.duration);
            progressBar.max = currentAudio.duration;
            initWaveform();
        });

        currentAudio.addEventListener('timeupdate', () => {
            currentTimeElement.textContent = formatTime(currentAudio.currentTime);
            progressBar.value = currentAudio.currentTime;
            drawWaveform();
        });

        currentAudio.addEventListener('ended', () => {
            isPlaying = false;
            playPauseButton.innerHTML = '<i class="fas fa-play"></i>';
            cancelAnimationFrame(animationId);
        });

        initAudioContext();
        audioSource = audioContext.createMediaElementSource(currentAudio);
        audioSource.connect(analyser);
        analyser.connect(audioContext.destination);

        currentAudio.play()
            .then(() => {
                isPlaying = true;
                playPauseButton.innerHTML = '<i class="fas fa-pause"></i>';
                startWaveformAnimation();
            })
            .catch(error => {
                console.error('Error playing track:', error);
            });
    }

    // Toggle play/pause
    function togglePlayPause() {
        if (!currentAudio) return;

        if (isPlaying) {
            currentAudio.pause();
            playPauseButton.innerHTML = '<i class="fas fa-play"></i>';
        } else {
            currentAudio.play()
                .then(() => {
                    playPauseButton.innerHTML = '<i class="fas fa-pause"></i>';
                    startWaveformAnimation();
                })
                .catch(error => {
                    console.error('Error resuming track:', error);
                });
        }
        isPlaying = !isPlaying;
    }

    // Format time (seconds to MM:SS)
    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // Initialize waveform canvas
    function initWaveform() {
        waveformCanvas.width = waveformCanvas.parentElement.clientWidth;
        waveformCanvas.height = 100;
        waveformCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
    }

    // Draw waveform
    function drawWaveform() {
        if (!analyser) return;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        waveformCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
        const barWidth = (waveformCanvas.width / bufferLength) * 2.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * waveformCanvas.height;
            const hue = i / bufferLength * 360;
            waveformCtx.fillStyle = `hsl(${hue}, 100%, 50%)`;
            waveformCtx.fillRect(x, waveformCanvas.height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }
    }

    // Start waveform animation
    function startWaveformAnimation() {
        if (animationId) {
            cancelAnimationFrame(animationId);
        }
        function animate() {
            drawWaveform();
            animationId = requestAnimationFrame(animate);
        }
        animate();
    }

    // Add track to cart
    function addToCart(track) {
        const existingItem = cart.find(item => item.id === track.id);
        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            cart.push({ ...track, quantity: 1 });
        }
        updateCartUI();
        showCartNotification();
    }

    // Remove track from cart
    function removeFromCart(trackId) {
        cart = cart.filter(item => item.id !== trackId);
        updateCartUI();
    }

    // Update cart UI
    function updateCartUI() {
        cartItemsContainer.innerHTML = '';
        let total = 0;

        cart.forEach(item => {
            const cartItem = document.createElement('div');
            cartItem.className = 'cart-item';
            cartItem.innerHTML = `
                <img src="${item.cover}" alt="${item.title}" class="cart-item-cover">
                <div class="cart-item-info">
                    <h4>${item.title}</h4>
                    <p>$${item.price.toFixed(2)} x ${item.quantity}</p>
                </div>
                <button class="btn btn-remove" data-id="${item.id}">
                    <i class="fas fa-trash"></i>
                </button>
            `;
            cartItemsContainer.appendChild(cartItem);
            total += item.price * item.quantity;
        });

        cartTotalElement.textContent = `$${total.toFixed(2)}`;

        // Add event listeners for remove buttons
        document.querySelectorAll('.btn-remove').forEach(button => {
            button.addEventListener('click', (e) => {
                const trackId = parseInt(e.target.closest('button').dataset.id);
                removeFromCart(trackId);
            });
        });
    }

    // Show cart notification
    function showCartNotification() {
        const notification = document.createElement('div');
        notification.className = 'cart-notification';
        notification.textContent = 'Added to cart!';
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 400);
        }, 2000);
    }

    // Open cart modal
    function openCartModal() {
        cartModal.classList.add('active');
    }

    // Close cart modal
    function closeCartModal() {
        cartModal.classList.remove('active');
    }

    // Checkout
    async function checkout() {
        if (cart.length === 0) return;

        try {
            const response = await api.submitInquiry(cart);
            alert('Inquiry submitted successfully!');
            cart = [];
            updateCartUI();
            closeCartModal();
        } catch (error) {
            console.error('Checkout failed:', error);
            alert('Checkout failed. Please try again.');
        }
    }

    // Sync with GitHub
    async function syncWithGitHub() {
        try {
            githubSyncButton.disabled = true;
            githubSyncButton.textContent = 'Syncing...';
            githubStatusElement.textContent = 'Syncing with GitHub...';
            githubStatusElement.style.color = '#00f5ff';

            const response = await api.syncGitHub();
            githubStatusElement.textContent = 'Sync successful!';
            githubStatusElement.style.color = '#00ff85';

            setTimeout(() => {
                githubStatusElement.textContent = 'Last synced: ' + new Date().toLocaleTimeString();
                githubStatusElement.style.color = '#e0e0e0';
                githubSyncButton.disabled = false;
                githubSyncButton.textContent = 'Sync with GitHub';
            }, 3000);
        } catch (error) {
            console.error('GitHub sync failed:', error);
            githubStatusElement.textContent = 'Sync failed!';
            githubStatusElement.style.color = '#ff3e3e';
            githubSyncButton.disabled = false;
            githubSyncButton.textContent = 'Sync with GitHub';

            setTimeout(() => {
                githubStatusElement.textContent = 'Last synced: Never';
                githubStatusElement.style.color = '#e0e0e0';
            }, 3000);
        }
    }

    // Event listeners
    cartButton.addEventListener('click', openCartModal);
    closeCartButton.addEventListener('click', closeCartModal);
    checkoutButton.addEventListener('click', checkout);
    githubSyncButton.addEventListener('click', syncWithGitHub);
    playPauseButton.addEventListener('click', togglePlayPause);

    progressBar.addEventListener('input', () => {
        if (currentAudio) {
            currentAudio.currentTime = progressBar.value;
        }
    });

    volumeSlider.addEventListener('input', () => {
        if (currentAudio) {
            currentAudio.volume = volumeSlider.value / 100;
        }
    });

    // Close cart modal when clicking outside
    cartModal.addEventListener('click', (e) => {
        if (e.target === cartModal) {
            closeCartModal();
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && e.target === document.body) {
            e.preventDefault();
            togglePlayPause();
        }
        if (e.code === 'Escape') {
            closeCartModal();
        }
    });

    // Initialize
    loadTracks();
    updateCartUI();
    initWaveform();

    // Handle window resize
    window.addEventListener('resize', () => {
        initWaveform();
    });

    // Load Font Awesome for icons
    const fontAwesome = document.createElement('link');
    fontAwesome.rel = 'stylesheet';
    fontAwesome.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
    document.head.appendChild(fontAwesome);
});