const cart = [];
let cartTotal = 0;

function initCart() {
  const savedCart = localStorage.getItem('vibeforgeCart');
  if (savedCart) {
    cart.push(...JSON.parse(savedCart));
  }
  updateCartCount();
  setupCartListeners();
}

function setupCartListeners() {
  document.addEventListener('click', function(e) {
    if (e.target.classList.contains('add-to-cart')) {
      const trackId = e.target.dataset.trackId;
      const trackTitle = e.target.dataset.trackTitle;
      const trackPrice = parseFloat(e.target.dataset.trackPrice);
      const trackGenre = e.target.dataset.trackGenre || 'Electronic';
      addToCart({
        id: trackId,
        title: trackTitle,
        price: trackPrice,
        genre: trackGenre,
        quantity: 1
      });
    }
    if (e.target.classList.contains('remove-from-cart')) {
      removeFromCart(e.target.dataset.trackId);
    }
    if (e.target.id === 'submit-inquiry') {
      submitInquiry();
    }
    if (e.target.id === 'clear-cart') {
      clearCart();
    }
    if (e.target.id === 'toggle-cart') {
      toggleCartModal();
    }
  });

  document.addEventListener('input', function(e) {
    if (e.target.classList.contains('cart-quantity')) {
      updateQuantity(e.target.dataset.trackId, parseInt(e.target.value));
    }
  });
}

function addToCart(track) {
  const existing = cart.findIndex(item => item.id === track.id);
  if (existing !== -1) {
    cart[existing].quantity += 1;
  } else {
    cart.push(track);
  }
  saveCart();
  updateCartCount();
  showCartNotification(track.title);
  renderCart();
}

function removeFromCart(trackId) {
  const index = cart.findIndex(item => item.id === trackId);
  if (index !== -1) {
    cart.splice(index, 1);
    saveCart();
    updateCartCount();
    renderCart();
  }
}

function updateQuantity(trackId, newQuantity) {
  if (newQuantity < 1) newQuantity = 1;
  const item = cart.find(i => i.id === trackId);
  if (item) {
    item.quantity = newQuantity;
    saveCart();
    renderCart();
  }
}

function saveCart() {
  localStorage.setItem('vibeforgeCart', JSON.stringify(cart));
}

function updateCartCount() {
  const countEl = document.getElementById('cart-count');
  if (countEl) {
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    countEl.textContent = totalItems;
  }
}

function calculateTotal() {
  cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  return cartTotal;
}

function renderCart() {
  const cartContainer = document.getElementById('cart-items');
  const totalEl = document.getElementById('cart-total');
  if (!cartContainer) return;

  cartContainer.innerHTML = '';
  if (cart.length === 0) {
    cartContainer.innerHTML = `
      <div class="empty-cart">
        <p>Your cart is empty. Add some premium beats.</p>
      </div>
    `;
    if (totalEl) totalEl.textContent = '$0.00';
    return;
  }

  cart.forEach(item => {
    const itemEl = document.createElement('div');
    itemEl.className = 'cart-item glass';
    itemEl.innerHTML = `
      <div class="cart-item-info">
        <h4>${item.title}</h4>
        <span class="genre-tag">${item.genre}</span>
      </div>
      <div class="cart-item-controls">
        <input type="number" class="cart-quantity neon-input" 
               data-track-id="${item.id}" value="${item.quantity}" min="1" max="10">
        <span class="item-price">$${(item.price * item.quantity).toFixed(2)}</span>
        <button class="remove-from-cart neon-btn danger" data-track-id="${item.id}">×</button>
      </div>
    `;
    cartContainer.appendChild(itemEl);
  });

  if (totalEl) {
    totalEl.textContent = '$' + calculateTotal().toFixed(2);
  }
}

function showCartNotification(title) {
  const notif = document.createElement('div');
  notif.className = 'cart-notification neon-glow';
  notif.innerHTML = `Added <strong>${title}</strong> to cart`;
  document.body.appendChild(notif);
  setTimeout(() => {
    notif.classList.add('fade-out');
    setTimeout(() => notif.remove(), 300);
  }, 2000);
}

function toggleCartModal() {
  const modal = document.getElementById('cart-modal');
  if (!modal) return;
  modal.classList.toggle('active');
  if (modal.classList.contains('active')) {
    renderCart();
  }
}

function clearCart() {
  cart.length = 0;
  localStorage.removeItem('vibeforgeCart');
  updateCartCount();
  renderCart();
}

function submitInquiry() {
  if (cart.length === 0) {
    alert('Cart is empty. Add tracks before submitting inquiry.');
    return;
  }

  const inquiryData = {
    tracks: [...cart],
    total: calculateTotal(),
    timestamp: new Date().toISOString(),
    contact: {
      name: document.getElementById('inquiry-name')?.value || 'Anonymous Producer',
      email: document.getElementById('inquiry-email')?.value || 'contact@vibeforge.dev',
      message: document.getElementById('inquiry-message')?.value || 'Interested in licensing these tracks.'
    }
  };

  fetch('/api/inquiry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inquiryData)
  })
  .then(res => res.json())
  .then(data => {
    const statusEl = document.getElementById('inquiry-status');
    if (statusEl) {
      statusEl.innerHTML = `<span class="success">Inquiry #${data.inquiryId} submitted successfully. VibeForge will contact you within 24 hours.</span>`;
    }
    clearCart();
    setTimeout(() => {
      const modal = document.getElementById('cart-modal');
      if (modal) modal.classList.remove('active');
    }, 1500);
  })
  .catch(err => {
    const statusEl = document.getElementById('inquiry-status');
    if (statusEl) statusEl.innerHTML = `<span class="error">Error submitting inquiry. Please try again.</span>`;
  });
}

document.addEventListener('DOMContentLoaded', initCart);