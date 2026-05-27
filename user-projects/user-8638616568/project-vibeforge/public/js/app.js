const cart = require('./cart');
const audioPlayer = require('./audioPlayer');

document.addEventListener('DOMContentLoaded', () => {
    const trackGrid = document.querySelector('.track-grid');
    const cartSidebar = document.querySelector('.cart-sidebar');
    const cartToggle = document.querySelector('.cart-toggle');
    const cartClose = document.querySelector('.cart-close');
    const cartItemsContainer = document.querySelector('.cart-items');
    const cartTotal = document.querySelector('.cart-total');
    const checkoutBtn = document.querySelector('.checkout-btn');
    const audioPreview = document.querySelector('.audio-preview');
    const playerContainer = document.querySelector('.player-container');

    let tracks = [];
    let currentTrack = null;

    // Fetch tracks from API
    async function fetchTracks() {
        try {
            const response = await fetch('/api/tracks');
            if (!response.ok) throw new Error('Failed to fetch tracks');
            tracks = await response.json();
            renderTracks();
        } catch (error) {
            console.error('Error fetching tracks:', error);
            showError('Failed to load tracks. Please try again later.');
        }
    }

    // Render tracks to grid
    function renderTracks() {
        trackGrid.innerHTML = '';
        tracks.forEach(track => {
            const trackCard = document.createElement('div');
            trackCard.className = 'track-card glassmorphism';
            trackCard.innerHTML = `
                <div class="track-artwork" style="background: linear-gradient(135deg, ${track.color1 || '#00ff9d'}, ${track.color2 || '#ff2a6d'});"></div>
                <h3 class="track-title">${track.title}</h3>
                <p class="track-artist">${track.artist}</p>
                <p class="track-price">$${track.price.toFixed(2)}</p>
                <div class="track-actions">
                    <button class="btn-neon preview-btn" data-id="${track.id}">PREVIEW</button>
                    <button class="btn-neon add-btn" data-id="${track.id}">ADD TO CART</button>
                </div>
            `;
            trackGrid.appendChild(trackCard);
        });

        // Add event listeners
        document.querySelectorAll('.preview-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const trackId = e.target.getAttribute('data-id');
                const track = tracks.find(t => t.id === trackId);
                if (track) {
                    currentTrack = track;
                    audioPlayer.loadTrack(track);
                    audioPlayer.play();
                    updatePlayerUI(track);
                }
            });
        });

        document.querySelectorAll('.add-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const trackId = e.target.getAttribute('data-id');
                const track = tracks.find(t => t.id === trackId);
                if (track) {
                    cart.addItem(track);
                    updateCartUI();
                    showSuccess(`${track.title} added to cart!`);
                }
            });
        });
    }

    // Update player UI
    function updatePlayerUI(track) {
        playerContainer.querySelector('.player-title').textContent = track.title;
        playerContainer.querySelector('.player-artist').textContent = track.artist;
        playerContainer.style.display = 'flex';
    }

    // Update cart UI
    function updateCartUI() {
        cartItemsContainer.innerHTML = '';
        const items = cart.getItems();
        let total = 0;

        items.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.className = 'cart-item glassmorphism';
            itemElement.innerHTML = `
                <div class="cart-item-info">
                    <h4>${item.title}</h4>
                    <p>${item.artist}</p>
                </div>
                <div class="cart-item-price">$${item.price.toFixed(2)}</div>
                <button class="btn-remove" data-id="${item.id}">×</button>
            `;
            cartItemsContainer.appendChild(itemElement);
            total += item.price;
        });

        cartTotal.textContent = `$${total.toFixed(2)}`;

        // Add remove event listeners
        document.querySelectorAll('.btn-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const trackId = e.target.getAttribute('data-id');
                cart.removeItem(trackId);
                updateCartUI();
            });
        });
    }

    // Toggle cart sidebar
    function toggleCart() {
        cartSidebar.classList.toggle('open');
    }

    // Show error message
    function showError(message) {
        const errorElement = document.createElement('div');
        errorElement.className = 'notification error';
        errorElement.textContent = message;
        document.body.appendChild(errorElement);
        setTimeout(() => errorElement.remove(), 3000);
    }

    // Show success message
    function showSuccess(message) {
        const successElement = document.createElement('div');
        successElement.className = 'notification success';
        successElement.textContent = message;
        document.body.appendChild(successElement);
        setTimeout(() => successElement.remove(), 3000);
    }

    // Checkout
    async function checkout() {
        const items = cart.getItems();
        if (items.length === 0) {
            showError('Your cart is empty!');
            return;
        }

        try {
            const response = await fetch('/api/cart/inquiry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items })
            });

            if (!response.ok) throw new Error('Checkout failed');

            const result = await response.json();
            showSuccess('Checkout successful! We will contact you soon.');
            cart.clear();
            updateCartUI();
            toggleCart();
        } catch (error) {
            console.error('Checkout error:', error);
            showError('Checkout failed. Please try again.');
        }
    }

    // Event listeners
    cartToggle.addEventListener('click', toggleCart);
    cartClose.addEventListener('click', toggleCart);
    checkoutBtn.addEventListener('click', checkout);

    // Initialize
    fetchTracks();
    audioPlayer.init();
    updateCartUI();
});

module.exports = {};