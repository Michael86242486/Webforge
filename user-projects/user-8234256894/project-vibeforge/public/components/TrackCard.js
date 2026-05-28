= require('../utils/api');

class TrackCard {
  constructor(data) {
    this.data = data;
    this.element = null;
    this.audio = null;
    this.isPlaying = false;
    this.init();
  }

  init() {
    this.createElement();
    this.bindEvents();
  }

  createElement() {
    const { id, title, artist, duration, price, cover, audioSrc } = this.data;

    this.element = document.createElement('div');
    this.element.className = 'track-card';
    this.element.dataset.id = id;

    this.element.innerHTML = `
      <div class="track-cover">
        <img src="${cover}" alt="${title} cover" class="cover-image" />
        <div class="play-overlay">
          <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </div>
        <div class="audio-info">
          <span class="duration">${duration}</span>
        </div>
      </div>
      <div class="track-details">
        <h3 class="track-title">${title}</h3>
        <p class="track-artist">${artist}</p>
        <div class="track-meta">
          <span class="price">$${price.toFixed(2)}</span>
          <button class="btn-add-cart" data-id="${id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 3h2l.4 2M7 13h10l4-8H5.4m0 0L7 13m0 0l-1.5 6M7 13l-1.5 6m0 0h9"/>
            </svg>
          </button>
        </div>
      </div>
      <audio class="audio-preview" src="${audioSrc}" preload="metadata"></audio>
    `;

    this.audio = this.element.querySelector('.audio-preview');
  }

  bindEvents() {
    const playOverlay = this.element.querySelector('.play-overlay');
    const addCartBtn = this.element.querySelector('.btn-add-cart');

    playOverlay.addEventListener('click', () => this.togglePlay());
    addCartBtn.addEventListener('click', (e) => this.handleAddToCart(e));
    this.audio.addEventListener('ended', () => this.handleEnded());
    this.audio.addEventListener('timeupdate', () => this.updateProgress());
  }

  togglePlay() {
    const playIcon = this.element.querySelector('.play-icon');
    const coverImage = this.element.querySelector('.cover-image');

    if (this.isPlaying) {
      this.audio.pause();
      playIcon.innerHTML = `<path d="M8 5v14l11-7z"/>`;
      coverImage.style.animation = 'none';
    } else {
      this.audio.play();
      playIcon.innerHTML = `
        <rect x="6" y="4" width="4" height="16"/>
        <rect x="14" y="4" width="4" height="16"/>
      `;
      coverImage.style.animation = 'pulse 1s ease-in-out infinite alternate';
    }
    this.isPlaying = !this.isPlaying;
  }

  handleEnded() {
    this.isPlaying = false;
    const playIcon = this.element.querySelector('.play-icon');
    const coverImage = this.element.querySelector('.cover-image');
    playIcon.innerHTML = `<path d="M8 5v14l11-7z"/>`;
    coverImage.style.animation = 'none';
    this.audio.currentTime = 0;
  }

  updateProgress() {
    const progress = (this.audio.currentTime / this.audio.duration) * 100;
    this.element.style.setProperty('--progress', `${progress}%`);
  }

  handleAddToCart(e) {
    e.stopPropagation();
    const trackId = this.data.id;
    api.addToCart(trackId)
      .then(response => {
        if (response.success) {
          this.element.classList.add('added-to-cart');
          setTimeout(() => {
            this.element.classList.remove('added-to-cart');
          }, 2000);
          const event = new CustomEvent('cartUpdated');
          document.dispatchEvent(event);
        }
      })
      .catch(err => {
        console.error('Failed to add to cart:', err);
      });
  }

  getElement() {
    return this.element;
  }
}

module.exports = TrackCard;