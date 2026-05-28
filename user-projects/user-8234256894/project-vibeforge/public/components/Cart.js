const api = require('../utils/api');

class Cart {
  constructor() {
    this.items = [];
    this.modal = document.getElementById('cart-modal');
    this.cartItemsContainer = document.getElementById('cart-items');
    this.cartTotal = document.getElementById('cart-total');
    this.cartCount = document.getElementById('cart-count');
    this.closeBtn = document.querySelector('.cart-close');
    this.checkoutBtn = document.getElementById('checkout-btn');
    this.openCartBtn = document.getElementById('open-cart-btn');

    this.init();
  }

  init() {
    this.bindEvents();
    this.render();
  }

  bindEvents() {
    if (this.openCartBtn) {
      this.openCartBtn.addEventListener('click', () => this.open());
    }
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }
    if (this.checkoutBtn) {
      this.checkoutBtn.addEventListener('click', () => this.checkout());
    }
    window.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });
  }

  open() {
    this.modal.style.display = 'flex';
    this.render();
  }

  close() {
    this.modal.style.display = 'none';
  }

  addItem(item) {
    const existingItem = this.items.find(i => i.id === item.id);
    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      this.items.push({ ...item, quantity: 1 });
    }
    this.render();
    this.showNotification(`${item.title} added to cart!`);
  }

  removeItem(id) {
    this.items = this.items.filter(item => item.id !== id);
    this.render();
  }

  updateQuantity(id, delta) {
    const item = this.items.find(i => i.id === id);
    if (item) {
      item.quantity += delta;
      if (item.quantity <= 0) {
        this.removeItem(id);
      } else {
        this.render();
      }
    }
  }

  getTotal() {
    return this.items.reduce((total, item) => total + (item.price * item.quantity), 0);
  }

  getItemCount() {
    return this.items.reduce((count, item) => count + item.quantity, 0);
  }

  async checkout() {
    if (this.items.length === 0) {
      this.showNotification('Your cart is empty!');
      return;
    }

    try {
      const response = await api.post('/api/inquiry', {
        items: this.items,
        total: this.getTotal()
      });
      this.showNotification('Inquiry submitted! We will contact you soon.');
      this.items = [];
      this.render();
      this.close();
    } catch (error) {
      this.showNotification('Failed to submit inquiry. Please try again.');
    }
  }

  render() {
    if (!this.cartItemsContainer || !this.cartTotal || !this.cartCount) return;

    this.cartItemsContainer.innerHTML = this.items.length === 0
      ? '<p class="cart-empty">Your cart is empty</p>'
      : this.items.map(item => `
        <div class="cart-item" data-id="${item.id}">
          <div class="cart-item-info">
            <h4>${item.title}</h4>
            <p>$${item.price.toFixed(2)} x ${item.quantity}</p>
          </div>
          <div class="cart-item-controls">
            <button class="cart-btn minus" data-action="decrease">-</button>
            <span>${item.quantity}</span>
            <button class="cart-btn plus" data-action="increase">+</button>
            <button class="cart-btn remove" data-action="remove">×</button>
          </div>
        </div>
      `).join('');

    this.cartTotal.textContent = `$${this.getTotal().toFixed(2)}`;
    this.cartCount.textContent = this.getItemCount();

    this.bindCartItemEvents();
  }

  bindCartItemEvents() {
    document.querySelectorAll('.cart-item').forEach(itemEl => {
      const id = itemEl.dataset.id;
      itemEl.querySelectorAll('.cart-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.dataset.action;
          if (action === 'increase') this.updateQuantity(id, 1);
          if (action === 'decrease') this.updateQuantity(id, -1);
          if (action === 'remove') this.removeItem(id);
        });
      });
    });
  }

  showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  }
}

module.exports = Cart;