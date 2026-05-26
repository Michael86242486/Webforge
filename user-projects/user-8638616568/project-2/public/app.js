const AudioPlayer = require('./components/AudioPlayer');
const Cart = require('./components/Cart');
const PortfolioGrid = require('./components/PortfolioGrid');
const apiClient = require('./utils/apiClient');

// DOM Elements
const audioPlayerContainer = document.getElementById('audio-player-container');
const cartContainer = document.getElementById('cart-container');
const portfolioGridContainer = document.getElementById('portfolio-grid-container');
const trackPreviewButtons = document.querySelectorAll('.track-preview-btn');
const addToCartButtons = document.querySelectorAll('.add-to-cart-btn');
const cartIcon = document.getElementById('cart-icon');
const cartCount = document.getElementById('cart-count');
const inquiryForm = document.getElementById('inquiry-form');
const githubSyncBtn = document.getElementById('github-sync-btn');

// State
let currentTrack = null;
let cart = [];
let portfolioItems = [];

// Initialize Components
const audioPlayer = new AudioPlayer(audioPlayerContainer);
const cartComponent = new Cart(cartContainer);
const portfolioGrid = new PortfolioGrid(portfolioGridContainer);

// Fetch Portfolio Items
async function fetchPortfolioItems() {
    try {
        const response = await apiClient.get('/api/portfolio');
        portfolioItems = response.data;
        portfolioGrid.render(portfolioItems);
    } catch (error) {
        console.error('Failed to fetch portfolio items:', error);
        portfolioGrid.render([]);
    }
}

// Handle Track Preview
function handleTrackPreview(trackId) {
    const track = portfolioItems.find(item => item.id === trackId);
    if (track) {
        currentTrack = track;
        audioPlayer.loadTrack(track);
        audioPlayer.play();
    }
}

// Handle Add to Cart
function handleAddToCart(trackId) {
    const track = portfolioItems.find(item => item.id === trackId);
    if (track && !cart.some(item => item.id === trackId)) {
        cart.push(track);
        cartComponent.updateCart(cart);
        updateCartCount();
        showNotification(`${track.title} added to cart!`);
    }
}

// Update Cart Count
function updateCartCount() {
    cartCount.textContent = cart.length;
}

// Show Notification
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
        }, 300);
    }, 2500);
}

// Handle Inquiry Form Submission
async function handleInquirySubmit(event) {
    event.preventDefault();
    const formData = new FormData(inquiryForm);
    const data = Object.fromEntries(formData.entries());

    try {
        const response = await apiClient.post('/api/inquiry', data);
        showNotification('Inquiry submitted successfully!');
        inquiryForm.reset();
    } catch (error) {
        console.error('Failed to submit inquiry:', error);
        showNotification('Failed to submit inquiry. Please try again.');
    }
}

// Handle GitHub Sync
async function handleGitHubSync() {
    try {
        const response = await apiClient.post('/api/github/sync');
        showNotification('GitHub sync initiated!');
    } catch (error) {
        console.error('Failed to sync with GitHub:', error);
        showNotification('GitHub sync failed. Please try again.');
    }
}

// Event Listeners
trackPreviewButtons.forEach(button => {
    button.addEventListener('click', () => {
        const trackId = button.dataset.trackId;
        handleTrackPreview(trackId);
    });
});

addToCartButtons.forEach(button => {
    button.addEventListener('click', () => {
        const trackId = button.dataset.trackId;
        handleAddToCart(trackId);
    });
});

cartIcon.addEventListener('click', () => {
    cartComponent.toggleCart();
});

inquiryForm.addEventListener('submit', handleInquirySubmit);
githubSyncBtn.addEventListener('click', handleGitHubSync);

// Initialize App
async function init() {
    await fetchPortfolioItems();
    updateCartCount();
    cartComponent.updateCart(cart);
}

init();

// Expose for debugging
window.VibeForgeApp = {
    audioPlayer,
    cartComponent,
    portfolioGrid,
    fetchPortfolioItems,
    handleTrackPreview,
    handleAddToCart,
    updateCartCount,
    showNotification
};

module.exports = {
    init,
    handleTrackPreview,
    handleAddToCart,
    updateCartCount,
    showNotification
};