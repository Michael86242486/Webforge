const cart = {
  items: [],
  isOpen: false,
  total: 0,
};

const cartSidebar = document.getElementById('cart-sidebar');
const cartToggle = document.getElementById('cart-toggle');
const cartClose = document.getElementById('cart-close');
const cartItemsContainer = document.getElementById('cart-items');
const cartTotal = document.getElementById('cart-total');
const cartCount = document.getElementById('cart-count');
const checkoutBtn = document.getElementById('checkout-btn');

function updateCartUI() {
  cartItemsContainer.innerHTML = '';
  cart.total = 0;
  cart.items.forEach((item, index) => {
    cart.total += item.price;
    const itemElement = document.createElement('div');
    itemElement.className = 'cart-item glassmorphism';
    itemElement.innerHTML = `
      <div class="cart-item-info">
        <h4>${item.title}</h4>
        <p>$${item.price.toFixed(2)}</p>
      </div>
      <button class="remove-item" data-index="${index}">×</button>
    `;
    cartItemsContainer.appendChild(itemElement);
  });
  cartTotal.textContent = `$${cart.total.toFixed(2)}`;
  cartCount.textContent = cart.items.length;
  if (cart.items.length === 0) {
    cartItemsContainer.innerHTML = '<p class="empty-cart">Your cart is empty</p>';
  }
}

function openCart() {
  cart.isOpen = true;
  cartSidebar.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCart() {
  cart.isOpen = false;
  cartSidebar.classList.remove('open');
  document.body.style.overflow = '';
}

function addToCart(item) {
  cart.items.push(item);
  updateCartUI();
  openCart();
  showNotification(`${item.title} added to cart!`);
}

function removeFromCart(index) {
  cart.items.splice(index, 1);
  updateCartUI();
  showNotification('Item removed from cart');
}

function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.classList.add('show');
  }, 100);
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      notification.remove();
    }, 400);
  }, 3000);
}

function sendCartInquiry() {
  if (cart.items.length === 0) {
    showNotification('Your cart is empty!');
    return;
  }
  fetch('/api/cart/inquiry', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ items: cart.items, total: cart.total }),
  })
    .then(response => response.json())
    .then(data => {
      showNotification(data.message || 'Inquiry sent successfully!');
      cart.items = [];
      updateCartUI();
      closeCart();
    })
    .catch(error => {
      showNotification('Failed to send inquiry. Please try again.');
      console.error('Error:', error);
    });
}

cartToggle.addEventListener('click', openCart);
cartClose.addEventListener('click', closeCart);

cartItemsContainer.addEventListener('click', (e) => {
  if (e.target.classList.contains('remove-item')) {
    const index = parseInt(e.target.getAttribute('data-index'));
    removeFromCart(index);
  }
});

checkoutBtn.addEventListener('click', sendCartInquiry);

document.addEventListener('DOMContentLoaded', updateCartUI);

module.exports = { cart, addToCart, updateCartUI };