const Cart = (() => {
  let cart = [];
  let modal = null;

  function createModal() {
    if (modal) return modal;

    modal = document.createElement('div');
    modal.className = 'cart-modal';
    modal.innerHTML = `
      <div class="cart-overlay"></div>
      <div class="cart-content glass">
        <div class="cart-header">
          <h2>🛒 VibeForge Cart</h2>
          <button class="close-btn">✕</button>
        </div>
        <div class="cart-items"></div>
        <div class="cart-summary">
          <div class="total-row">
            <span>Total</span>
            <span class="total-price neon-text">$0.00</span>
          </div>
        </div>
        <div class="inquiry-form">
          <h3>Submit License Inquiry</h3>
          <input type="text" id="inq-name" placeholder="Your Name" required>
          <input type="email" id="inq-email" placeholder="Email Address" required>
          <textarea id="inq-message" placeholder="Project details, usage terms..." rows="3"></textarea>
          <button class="submit-btn neon-btn">Send Inquiry</button>
        </div>
        <div class="cart-footer">
          <button class="clear-btn">Clear Cart</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('.close-btn').onclick = hide;
    modal.querySelector('.cart-overlay').onclick = hide;
    modal.querySelector('.clear-btn').onclick = clearCart;
    modal.querySelector('.submit-btn').onclick = submitInquiry;

    return modal;
  }

  function show() {
    const m = createModal();
    m.style.display = 'flex';
    renderItems();
  }

  function hide() {
    if (modal) modal.style.display = 'none';
  }

  function addItem(track) {
    if (!cart.find(i => i.id === track.id)) {
      cart.push({ ...track, quantity: 1 });
      localStorage.setItem('vibeforge_cart', JSON.stringify(cart));
      updateCartCount();
    }
  }

  function removeItem(id) {
    cart = cart.filter(i => i.id !== id);
    localStorage.setItem('vibeforge_cart', JSON.stringify(cart));
    renderItems();
    updateCartCount();
  }

  function clearCart() {
    cart = [];
    localStorage.setItem('vibeforge_cart', JSON.stringify(cart));
    renderItems();
    updateCartCount();
  }

  function calculateTotal() {
    return cart.reduce((sum, item) => sum + item.price, 0);
  }

  function renderItems() {
    if (!modal) return;
    const container = modal.querySelector('.cart-items');
    container.innerHTML = '';

    if (cart.length === 0) {
      container.innerHTML = '<p class="empty">Your cart is empty. Add tracks from the dashboard.</p>';
    } else {
      cart.forEach(item => {
        const div = document.createElement('div');
        div.className = 'cart-item glass';
        div.innerHTML = `
          <div class="item-info">
            <span class="track-title">${item.title}</span>
            <span class="track-genre">${item.genre}</span>
          </div>
          <div class="item-price neon-text">$${item.price}</div>
          <button class="remove-btn">Remove</button>
        `;
        div.querySelector('.remove-btn').onclick = () => removeItem(item.id);
        container.appendChild(div);
      });
    }

    modal.querySelector('.total-price').textContent = `$${calculateTotal().toFixed(2)}`;
  }

  function updateCartCount() {
    const countEl = document.getElementById('cart-count');
    if (countEl) countEl.textContent = cart.length;
  }

  async function submitInquiry() {
    const name = document.getElementById('inq-name').value;
    const email = document.getElementById('inq-email').value;
    const message = document.getElementById('inq-message').value;

    if (!name || !email || cart.length === 0) {
      alert('Please fill all fields and add tracks to cart.');
      return;
    }

    try {
      const res = await fetch('/api/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email, message,
          tracks: cart,
          total: calculateTotal()
        })
      });

      if (res.ok) {
        alert('Inquiry submitted successfully! We will contact you within 24h.');
        clearCart();
        hide();
      } else {
        alert('Submission failed. Please try again.');
      }
    } catch (e) {
      alert('Network error submitting inquiry.');
    }
  }

  function init() {
    const saved = localStorage.getItem('vibeforge_cart');
    if (saved) cart = JSON.parse(saved);
    updateCartCount();
    window.VibeCart = { show, addItem, getCart: () => cart };
  }

  return { init, show, addItem };
})();

if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', Cart.init);
}

module.exports = Cart;