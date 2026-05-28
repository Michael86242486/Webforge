= require('../utils/api');

class CartModal {
  constructor() {
    this.cart = [];
    this.modal = document.getElementById('cartModal');
    this.itemsContainer = document.getElementById('cartItems');
    this.totalElement = document.getElementById('cartTotal');
    this.closeButton = document.querySelector('.cart-close');
    this.checkoutButton = document.getElementById('checkoutBtn');
    this.openButton = document.getElementById('openCartBtn');
    this.bindEvents();
    this.loadCart();
  }

  bindEvents() {
    this.openButton.addEventListener('click', () => this.open());
    this.closeButton.addEventListener('click', () => this.close());
    this.checkoutButton.addEventListener('click', () => this.checkout());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
    window.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });
  }

  open() {
    this.modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    this.render();
  }

  close() {
    this.modal.style.display = 'none';
    document.body.style.overflow = 'auto';
  }

  addItem(item) {
    this.cart.push(item);
    localStorage.setItem('vibeforge_cart', JSON.stringify(this.cart));
    this.render();
    this.showNotification(`${item.title} added to cart!`);
  }

  removeItem(index) {
    this.cart.splice(index, 1);
    localStorage.setItem('vibeforge_cart', JSON.stringify(this.cart));
    this.render();
  }

  loadCart() {
    const savedCart = localStorage.getItem('vibeforge_cart');
    if (savedCart) {
      this.cart = JSON.parse(savedCart);
    }
  }

  render() {
    if (!this.itemsContainer || !this.totalElement) return;

    this.itemsContainer.innerHTML = '';
    let total = 0;

    this.cart.forEach((item, index) => {
      total += item.price;
      const itemElement = document.createElement('div');
      itemElement.className = 'cart-item';
      itemElement.innerHTML = `
        <div class="cart-item-info">
          <span class="cart-item-title">${item.title}</span>
          <span class="cart-item-price">$${item.price.toFixed(2)}</span>
        </div>
        <button class="cart-item-remove" data-index="${index}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff2a6d" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      `;
      this.itemsContainer.appendChild(itemElement);
      itemElement.querySelector('.cart-item-remove').addEventListener('click', () => this.removeItem(index));
    });

    this.totalElement.textContent = `$${total.toFixed(2)}`;
  }

  checkout() {
    if (this.cart.length === 0) {
      this.showNotification('Your cart is empty!', 'error');
      return;
    }

    const inquiryData = {
      items: this.cart,
      total: this.cart.reduce((sum, item) => sum + item.price, 0),
      timestamp: new Date().toISOString()
    };

    api.post('/api/inquiry', inquiryData)
      .then(response => {
        if (response.ok) {
          this.showNotification('Checkout successful! We will contact you soon.', 'success');
          this.cart = [];
          localStorage.removeItem('vibeforge_cart');
          this.render();
          this.close();
        } else {
          throw new Error('Checkout failed');
        }
      })
      .catch(error => {
        this.showNotification('Checkout failed. Please try again.', 'error');
        console.error('Checkout error:', error);
      });
  }

  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('show');
    }, 10);

    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
}

module.exports = CartModal;