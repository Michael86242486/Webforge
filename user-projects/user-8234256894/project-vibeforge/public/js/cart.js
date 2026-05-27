= require('../utils/api');

let cart = [];
let cartModal = null;
let cartItemsContainer = null;
let cartTotalElement = null;

function initCartModal(modalElement, itemsContainer, totalElement) {
    cartModal = modalElement;
    cartItemsContainer = itemsContainer;
    cartTotalElement = totalElement;
    renderCart();
}

function addToCart(track) {
    const existingItem = cart.find(item => item.id === track.id);
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ ...track, quantity: 1 });
    }
    renderCart();
    showNotification(`${track.title} added to cart!`, 'success');
    updateCartBadge();
}

function removeFromCart(trackId) {
    cart = cart.filter(item => item.id !== trackId);
    renderCart();
    showNotification('Item removed from cart', 'success');
    updateCartBadge();
}

function updateQuantity(trackId, delta) {
    const item = cart.find(item => item.id === trackId);
    if (item) {
        item.quantity += delta;
        if (item.quantity <= 0) {
            removeFromCart(trackId);
        } else {
            renderCart();
            updateCartBadge();
        }
    }
}

function getCartTotal() {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0).toFixed(2);
}

function renderCart() {
    if (!cartItemsContainer) return;

    cartItemsContainer.innerHTML = '';
    if (cart.length === 0) {
        cartItemsContainer.innerHTML = `
            <div class="cart-empty">
                <p>Your cart is empty</p>
                <p class="cart-subtext">Add some tracks to get started!</p>
            </div>
        `;
    } else {
        cart.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.className = 'cart-item glass-card';
            itemElement.innerHTML = `
                <div class="cart-item-info">
                    <h4>${item.title}</h4>
                    <p class="cart-item-artist">${item.artist || 'VibeForge'}</p>
                    <p class="cart-item-price">$${item.price.toFixed(2)}</p>
                </div>
                <div class="cart-item-controls">
                    <button class="cart-btn neon-btn" onclick="window.cart.updateQuantity('${item.id}', -1)">-</button>
                    <span class="cart-quantity">${item.quantity}</span>
                    <button class="cart-btn neon-btn" onclick="window.cart.updateQuantity('${item.id}', 1)">+</button>
                    <button class="cart-btn neon-btn error" onclick="window.cart.removeFromCart('${item.id}')">Remove</button>
                </div>
            `;
            cartItemsContainer.appendChild(itemElement);
        });
    }

    if (cartTotalElement) {
        cartTotalElement.textContent = `$${getCartTotal()}`;
    }
}

function updateCartBadge() {
    const badge = document.querySelector('.cart-badge');
    if (badge) {
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        badge.textContent = totalItems > 0 ? totalItems : '';
        badge.style.display = totalItems > 0 ? 'flex' : 'none';
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 400);
    }, 3000);
}

function submitInquiry() {
    if (cart.length === 0) {
        showNotification('Your cart is empty!', 'error');
        return;
    }

    const inquiryData = {
        items: cart.map(item => ({
            id: item.id,
            title: item.title,
            price: item.price,
            quantity: item.quantity
        })),
        total: parseFloat(getCartTotal()),
        timestamp: new Date().toISOString()
    };

    api.post('/api/inquiry', inquiryData)
        .then(response => {
            if (response.success) {
                showNotification('Inquiry submitted successfully!', 'success');
                cart = [];
                renderCart();
                updateCartBadge();
                if (cartModal) cartModal.classList.remove('active');
            } else {
                showNotification(response.message || 'Failed to submit inquiry', 'error');
            }
        })
        .catch(error => {
            showNotification('Network error. Please try again.', 'error');
            console.error('Inquiry submission error:', error);
        });
}

function openCart() {
    if (cartModal) {
        cartModal.classList.add('active');
    }
}

function closeCart() {
    if (cartModal) {
        cartModal.classList.remove('active');
    }
}

module.exports = {
    initCartModal,
    addToCart,
    removeFromCart,
    updateQuantity,
    getCartTotal,
    renderCart,
    updateCartBadge,
    submitInquiry,
    openCart,
    closeCart,
    getCart: () => [...cart]
};

// Expose to window for HTML onclick handlers
if (typeof window !== 'undefined') {
    window.cart = module.exports;
}