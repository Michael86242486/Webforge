// public/app.js
const audioPlayer = require('./audioPlayer.js');
const cart = require('./cart.js');

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const trackCards = document.querySelectorAll('.track-card');
    const cartButton = document.getElementById('cart-button');
    const cartModal = document.getElementById('cart-modal');
    const closeCartButton = document.getElementById('close-cart');
    const checkoutButton = document.getElementById('checkout-button');
    const githubSyncButton = document.getElementById('github-sync');
    const githubStatus = document.getElementById('github-status');
    const inquiryForm = document.getElementById('inquiry-form');
    const inquiryResponse = document.getElementById('inquiry-response');

    // State
    let currentTrack = null;
    let isPlaying = false;

    // Initialize Audio Player
    audioPlayer.init();

    // Initialize Cart
    cart.init();

    // Event Listeners
    trackCards.forEach(card => {
        const playButton = card.querySelector('.play-button');
        const addToCartButton = card.querySelector('.add-to-cart');
        const trackId = card.dataset.trackId;
        const trackTitle = card.querySelector('.track-title').textContent;
        const trackPrice = parseFloat(card.querySelector('.track-price').textContent.replace('$', ''));

        playButton.addEventListener('click', () => {
            if (currentTrack === trackId) {
                if (isPlaying) {
                    audioPlayer.pause();
                    playButton.innerHTML = '<i class="fas fa-play"></i>';
                    isPlaying = false;
                } else {
                    audioPlayer.play(trackId);
                    playButton.innerHTML = '<i class="fas fa-pause"></i>';
                    isPlaying = true;
                }
            } else {
                if (currentTrack) {
                    const prevPlayButton = document.querySelector(`.track-card[data-track-id="${currentTrack}"] .play-button`);
                    prevPlayButton.innerHTML = '<i class="fas fa-play"></i>';
                }
                audioPlayer.load(trackId, () => {
                    audioPlayer.play(trackId);
                    playButton.innerHTML = '<i class="fas fa-pause"></i>';
                    isPlaying = true;
                    currentTrack = trackId;
                });
            }
        });

        addToCartButton.addEventListener('click', () => {
            cart.addItem({ id: trackId, title: trackTitle, price: trackPrice });
            updateCartUI();
            showNotification(`${trackTitle} added to cart!`);
        });
    });

    cartButton.addEventListener('click', () => {
        cartModal.classList.add('active');
        updateCartModal();
    });

    closeCartButton.addEventListener('click', () => {
        cartModal.classList.remove('active');
    });

    checkoutButton.addEventListener('click', () => {
        const cartItems = cart.getItems();
        if (cartItems.length === 0) {
            showNotification('Your cart is empty!');
            return;
        }
        fetch('/api/inquiry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: cartItems })
        })
        .then(response => response.json())
        .then(data => {
            inquiryResponse.textContent = `Inquiry sent! Reference: ${data.reference}`;
            inquiryResponse.style.color = '#00ff88';
            cart.clear();
            updateCartUI();
            updateCartModal();
            cartModal.classList.remove('active');
            showNotification('Inquiry submitted successfully!');
        })
        .catch(error => {
            inquiryResponse.textContent = 'Error submitting inquiry.';
            inquiryResponse.style.color = '#ff4444';
            console.error('Error:', error);
        });
    });

    githubSyncButton.addEventListener('click', () => {
        githubStatus.textContent = 'Syncing...';
        githubStatus.style.color = '#ffff00';
        fetch('/api/github/sync')
            .then(response => response.json())
            .then(data => {
                githubStatus.textContent = data.status === 'success' ? 'Synced!' : 'Sync failed!';
                githubStatus.style.color = data.status === 'success' ? '#00ff88' : '#ff4444';
                showNotification(data.message);
            })
            .catch(error => {
                githubStatus.textContent = 'Sync failed!';
                githubStatus.style.color = '#ff4444';
                console.error('Error:', error);
            });
    });

    inquiryForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(inquiryForm);
        const data = Object.fromEntries(formData);
        fetch('/api/inquiry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(response => response.json())
        .then(data => {
            inquiryResponse.textContent = `Thank you! We'll get back to you soon. Reference: ${data.reference}`;
            inquiryResponse.style.color = '#00ff88';
            inquiryForm.reset();
            showNotification('Inquiry submitted!');
        })
        .catch(error => {
            inquiryResponse.textContent = 'Error submitting inquiry.';
            inquiryResponse.style.color = '#ff4444';
            console.error('Error:', error);
        });
    });

    // Helper Functions
    function updateCartUI() {
        const itemCount = cart.getItemCount();
        cartButton.querySelector('.cart-count').textContent = itemCount;
        cartButton.querySelector('.cart-count').style.display = itemCount > 0 ? 'inline' : 'none';
    }

    function updateCartModal() {
        const cartItems = cart.getItems();
        const cartItemsContainer = document.getElementById('cart-items');
        const cartTotal = document.getElementById('cart-total');

        cartItemsContainer.innerHTML = '';
        let total = 0;

        cartItems.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.className = 'cart-item glassmorphism';
            itemElement.innerHTML = `
                <span>${item.title}</span>
                <span>$${item.price.toFixed(2)}</span>
                <button class="remove-item" data-id="${item.id}">×</button>
            `;
            cartItemsContainer.appendChild(itemElement);
            total += item.price;

            itemElement.querySelector('.remove-item').addEventListener('click', () => {
                cart.removeItem(item.id);
                updateCartUI();
                updateCartModal();
                showNotification(`${item.title} removed from cart.`);
            });
        });

        cartTotal.textContent = `$${total.toFixed(2)}`;
    }

    function showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'notification glassmorphism';
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }

    // Initial UI Update
    updateCartUI();
});

module.exports = {};