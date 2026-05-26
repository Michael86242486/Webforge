const glassEffect = {
  background: 'rgba(255, 255, 255, 0.1)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)'
};

const neonAccent = {
  primary: '#0ff',
  secondary: '#f0f',
  warning: '#ff0',
  success: '#0f0',
  error: '#f00'
};

const Cart = function() {
  this.items = [];
  this.total = 0;
  this.cartElement = null;
  this.totalElement = null;
  this.itemsElement = null;
  this.init();
};

Cart.prototype.init = function() {
  this.cartElement = document.getElementById('cart');
  this.totalElement = document.getElementById('cart-total');
  this.itemsElement = document.getElementById('cart-items');

  if (!this.cartElement || !this.totalElement || !this.itemsElement) {
    console.error('Cart elements not found in the DOM');
    return;
  }

  this.render();
  this.bindEvents();
};

Cart.prototype.bindEvents = function() {
  const addButtons = document.querySelectorAll('.add-to-cart');
  addButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      const trackId = e.target.getAttribute('data-track-id');
      const trackName = e.target.getAttribute('data-track-name');
      const trackPrice = parseFloat(e.target.getAttribute('data-track-price'));
      this.addItem({ id: trackId, name: trackName, price: trackPrice });
    });
  });

  const removeButtons = document.querySelectorAll('.remove-from-cart');
  removeButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      const trackId = e.target.getAttribute('data-track-id');
      this.removeItem(trackId);
    });
  });

  const checkoutButton = document.getElementById('checkout-button');
  if (checkoutButton) {
    checkoutButton.addEventListener('click', () => {
      this.checkout();
    });
  }
};

Cart.prototype.addItem = function(item) {
  const existingItem = this.items.find(i => i.id === item.id);
  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    this.items.push({ ...item, quantity: 1 });
  }
  this.updateTotal();
  this.render();
  this.saveToStorage();
  this.triggerUpdate();
};

Cart.prototype.removeItem = function(trackId) {
  this.items = this.items.filter(item => {
    if (item.id === trackId) {
      item.quantity -= 1;
      return item.quantity > 0;
    }
    return true;
  });
  this.updateTotal();
  this.render();
  this.saveToStorage();
  this.triggerUpdate();
};

Cart.prototype.updateTotal = function() {
  this.total = this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  this.totalElement.textContent = `$${this.total.toFixed(2)}`;
};

Cart.prototype.render = function() {
  this.itemsElement.innerHTML = '';
  if (this.items.length === 0) {
    this.itemsElement.innerHTML = '<li class="cart-empty">Your cart is empty</li>';
    return;
  }

  this.items.forEach(item => {
    const li = document.createElement('li');
    li.className = 'cart-item';
    li.innerHTML = `
      <div class="cart-item-info">
        <span class="cart-item-name">${item.name}</span>
        <span class="cart-item-price">$${item.price.toFixed(2)}</span>
        <span class="cart-item-quantity">x${item.quantity}</span>
      </div>
      <button class="remove-from-cart" data-track-id="${item.id}">×</button>
    `;
    this.itemsElement.appendChild(li);
  });
};

Cart.prototype.saveToStorage = function() {
  localStorage.setItem('vibeforge_cart', JSON.stringify(this.items));
};

Cart.prototype.loadFromStorage = function() {
  const saved = localStorage.getItem('vibeforge_cart');
  if (saved) {
    this.items = JSON.parse(saved);
    this.updateTotal();
    this.render();
  }
};

Cart.prototype.triggerUpdate = function() {
  const event = new CustomEvent('cartUpdated', { detail: { items: this.items, total: this.total } });
  document.dispatchEvent(event);
};

Cart.prototype.checkout = function() {
  if (this.items.length === 0) {
    alert('Your cart is empty!');
    return;
  }

  const apiClient = require('../utils/apiClient');
  apiClient.post('/api/inquiry', { cart: this.items, total: this.total })
    .then(response => {
      if (response.success) {
        this.items = [];
        this.total = 0;
        this.render();
        this.saveToStorage();
        this.triggerUpdate();
        alert('Checkout successful! We will contact you soon.');
      } else {
        alert('Checkout failed. Please try again.');
      }
    })
    .catch(error => {
      console.error('Checkout error:', error);
      alert('An error occurred during checkout.');
    });
};

Cart.prototype.clear = function() {
  this.items = [];
  this.total = 0;
  this.render();
  this.saveToStorage();
  this.triggerUpdate();
};

module.exports = Cart;