const cartState = {
  items: [],
  total: 0,
  taxRate: 0.08,
  shipping: 0,
};

function updateCartDisplay() {
  const cartItemsContainer = document.getElementById('cart-items');
  const cartTotalElement = document.getElementById('cart-total');
  const cartCountElement = document.getElementById('cart-count');
  const cartSubtotalElement = document.getElementById('cart-subtotal');
  const cartTaxElement = document.getElementById('cart-tax');
  const cartShippingElement = document.getElementById('cart-shipping');

  if (!cartItemsContainer || !cartTotalElement || !cartCountElement) return;

  cartItemsContainer.innerHTML = '';
  let subtotal = 0;

  cartState.items.forEach((item, index) => {
    subtotal += item.price * item.quantity;
    const itemElement = document.createElement('div');
    itemElement.className = 'cart-item glassmorphism';
    itemElement.innerHTML = `
      <div class="cart-item-info">
        <span class="cart-item-name neon-text">${item.name}</span>
        <span class="cart-item-price neon-text">$${item.price.toFixed(2)}</span>
      </div>
      <div class="cart-item-controls">
        <button class="cart-btn neon-btn" onclick="updateQuantity(${index}, -1)">-</button>
        <span class="cart-item-quantity neon-text">${item.quantity}</span>
        <button class="cart-btn neon-btn" onclick="updateQuantity(${index}, 1)">+</button>
        <button class="cart-btn neon-btn-danger" onclick="removeItem(${index})">×</button>
      </div>
    `;
    cartItemsContainer.appendChild(itemElement);
  });

  const tax = subtotal * cartState.taxRate;
  const total = subtotal + tax + cartState.shipping;

  cartState.total = total;
  cartState.subtotal = subtotal;
  cartState.tax = tax;

  if (cartSubtotalElement) cartSubtotalElement.textContent = `$${subtotal.toFixed(2)}`;
  if (cartTaxElement) cartTaxElement.textContent = `$${tax.toFixed(2)}`;
  if (cartShippingElement) cartShippingElement.textContent = cartState.shipping === 0 ? 'FREE' : `$${cartState.shipping.toFixed(2)}`;
  cartTotalElement.textContent = `$${total.toFixed(2)}`;
  cartCountElement.textContent = cartState.items.reduce((sum, item) => sum + item.quantity, 0);
}

function addItem(name, price) {
  const existingItemIndex = cartState.items.findIndex(item => item.name === name);
  if (existingItemIndex >= 0) {
    cartState.items[existingItemIndex].quantity += 1;
  } else {
    cartState.items.push({ name, price, quantity: 1 });
  }
  updateCartDisplay();
  saveCartToStorage();
  showCartNotification(`${name} added to cart!`);
}

function removeItem(index) {
  cartState.items.splice(index, 1);
  updateCartDisplay();
  saveCartToStorage();
  showCartNotification('Item removed from cart.');
}

function updateQuantity(index, change) {
  if (index < 0 || index >= cartState.items.length) return;
  const newQuantity = cartState.items[index].quantity + change;
  if (newQuantity <= 0) {
    removeItem(index);
  } else {
    cartState.items[index].quantity = newQuantity;
    updateCartDisplay();
    saveCartToStorage();
  }
}

function clearCart() {
  cartState.items = [];
  updateCartDisplay();
  saveCartToStorage();
  showCartNotification('Cart cleared.');
}

function saveCartToStorage() {
  try {
    localStorage.setItem('vibeforge_cart', JSON.stringify(cartState));
  } catch (e) {
    console.error('Could not save cart to localStorage:', e);
  }
}

function loadCartFromStorage() {
  try {
    const saved = localStorage.getItem('vibeforge_cart');
    if (saved) {
      const parsed = JSON.parse(saved);
      cartState.items = parsed.items || [];
      cartState.total = parsed.total || 0;
      cartState.subtotal = parsed.subtotal || 0;
      cartState.tax = parsed.tax || 0;
      cartState.shipping = parsed.shipping || 0;
    }
  } catch (e) {
    console.error('Could not load cart from localStorage:', e);
  }
  updateCartDisplay();
}

function showCartNotification(message) {
  const notification = document.getElementById('cart-notification');
  if (!notification) return;
  notification.textContent = message;
  notification.classList.add('show');
  setTimeout(() => {
    notification.classList.remove('show');
  }, 2000);
}

function checkout() {
  if (cartState.items.length === 0) {
    showCartNotification('Your cart is empty!');
    return;
  }

  fetch('/api/inquiry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: cartState.items,
      subtotal: cartState.subtotal,
      tax: cartState.tax,
      shipping: cartState.shipping,
      total: cartState.total,
    }),
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        showCartNotification('Checkout successful! Thank you!');
        clearCart();
      } else {
        showCartNotification('Checkout failed. Please try again.');
      }
    })
    .catch(error => {
      console.error('Checkout error:', error);
      showCartNotification('Checkout error. Please try again.');
    });
}

function initCart() {
  loadCartFromStorage();
  const addToCartButtons = document.querySelectorAll('.add-to-cart');
  addToCartButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      const name = e.target.getAttribute('data-name');
      const price = parseFloat(e.target.getAttribute('data-price'));
      if (name && !isNaN(price)) {
        addItem(name, price);
      }
    });
  });
}

module.exports = {
  cartState,
  addItem,
  removeItem,
  updateQuantity,
  clearCart,
  updateCartDisplay,
  checkout,
  initCart,
  loadCartFromStorage,
  saveCartToStorage,
};