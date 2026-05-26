const AudioPlayer = require('./AudioPlayer');
const Cart = require('./Cart');

class PortfolioGrid {
  constructor(containerId, tracks = [], onTrackSelect, onAddToCart) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`Container #${containerId} not found`);
    }
    this.tracks = tracks;
    this.onTrackSelect = onTrackSelect;
    this.onAddToCart = onAddToCart;
    this.selectedTrack = null;
    this.init();
  }

  init() {
    this.renderGrid();
    this.bindEvents();
    this.applyNeonEffects();
  }

  renderGrid() {
    this.container.innerHTML = '';
    this.container.className = 'portfolio-grid';

    this.tracks.forEach((track, index) => {
      const card = document.createElement('div');
      card.className = 'grid-card glassmorphism';
      card.dataset.index = index;

      const artwork = document.createElement('div');
      artwork.className = 'card-artwork';
      artwork.style.backgroundImage = `url('${track.artwork || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="%230a0a1a"/><circle cx="100" cy="100" r="80" fill="none" stroke="%2300f7ff" stroke-width="2"/><circle cx="100" cy="100" r="60" fill="none" stroke="%23ff00f7" stroke-width="2"/><circle cx="100" cy="100" r="40" fill="none" stroke="%23f7ff00" stroke-width="2"/></svg>'}')`;

      const info = document.createElement('div');
      info.className = 'card-info';

      const title = document.createElement('h3');
      title.className = 'card-title neon-text';
      title.textContent = track.title || 'Untitled Track';

      const artist = document.createElement('p');
      artist.className = 'card-artist neon-text-subtle';
      artist.textContent = track.artist || 'VibeForge';

      const price = document.createElement('p');
      price.className = 'card-price neon-text-accent';
      price.textContent = track.price ? `$${track.price.toFixed(2)}` : 'Free';

      const actions = document.createElement('div');
      actions.className = 'card-actions';

      const playBtn = document.createElement('button');
      playBtn.className = 'btn-neon play-btn';
      playBtn.innerHTML = '<span class="icon">▶</span>';
      playBtn.title = 'Preview';

      const cartBtn = document.createElement('button');
      cartBtn.className = 'btn-neon cart-btn';
      cartBtn.innerHTML = '<span class="icon">+</span>';
      cartBtn.title = 'Add to Cart';

      actions.appendChild(playBtn);
      actions.appendChild(cartBtn);

      info.appendChild(title);
      info.appendChild(artist);
      info.appendChild(price);
      info.appendChild(actions);

      card.appendChild(artwork);
      card.appendChild(info);

      this.container.appendChild(card);
    });
  }

  bindEvents() {
    this.container.addEventListener('click', (e) => {
      const card = e.target.closest('.grid-card');
      if (!card) return;

      const index = parseInt(card.dataset.index);
      const track = this.tracks[index];

      if (e.target.closest('.play-btn')) {
        this.selectedTrack = track;
        if (this.onTrackSelect) {
          this.onTrackSelect(track);
        }
      }

      if (e.target.closest('.cart-btn')) {
        if (this.onAddToCart) {
          this.onAddToCart(track);
        }
      }
    });
  }

  applyNeonEffects() {
    const style = document.createElement('style');
    style.textContent = `
      .portfolio-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        gap: 24px;
        padding: 24px;
        max-width: 1400px;
        margin: 0 auto;
      }

      .grid-card {
        background: rgba(10, 10, 26, 0.6);
        border: 1px solid rgba(0, 247, 255, 0.2);
        border-radius: 12px;
        overflow: hidden;
        transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        backdrop-filter: blur(10px);
        box-shadow: 0 8px 32px rgba(0, 247, 255, 0.1);
      }

      .grid-card:hover {
        transform: translateY(-8px);
        border-color: rgba(0, 247, 255, 0.6);
        box-shadow: 0 12px 40px rgba(0, 247, 255, 0.2);
      }

      .card-artwork {
        height: 180px;
        background-size: cover;
        background-position: center;
        position: relative;
        overflow: hidden;
      }

      .card-artwork::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(to top, rgba(10, 10, 26, 0.8), transparent);
      }

      .card-info {
        padding: 16px;
      }

      .card-title {
        margin: 0 0 8px 0;
        font-size: 1.1rem;
        font-weight: 700;
        color: #00f7ff;
        text-shadow: 0 0 8px rgba(0, 247, 255, 0.6);
      }

      .card-artist {
        margin: 0 0 8px 0;
        font-size: 0.9rem;
        color: #ff00f7;
        text-shadow: 0 0 4px rgba(255, 0, 247, 0.4);
      }

      .card-price {
        margin: 0 0 12px 0;
        font-size: 1rem;
        font-weight: 600;
        color: #f7ff00;
        text-shadow: 0 0 6px rgba(247, 255, 0, 0.6);
      }

      .card-actions {
        display: flex;
        gap: 8px;
      }

      .btn-neon {
        flex: 1;
        padding: 8px 12px;
        border: none;
        border-radius: 6px;
        background: rgba(10, 10, 26, 0.6);
        color: #fff;
        font-size: 1rem;
        cursor: pointer;
        transition: all 0.3s ease;
        position: relative;
        overflow: hidden;
      }

      .btn-neon::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, rgba(0, 247, 255, 0.2), rgba(255, 0, 247, 0.2));
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .btn-neon:hover::before {
        opacity: 1;
      }

      .btn-neon.play-btn:hover {
        box-shadow: 0 0 12px rgba(0, 247, 255, 0.6);
      }

      .btn-neon.cart-btn:hover {
        box-shadow: 0 0 12px rgba(255, 0, 247, 0.6);
      }

      .btn-neon .icon {
        display: block;
        font-size: 1.2rem;
      }

      @media (max-width: 768px) {
        .portfolio-grid {
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 16px;
          padding: 16px;
        }
      }

      @media (max-width: 480px) {
        .portfolio-grid {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  updateTracks(tracks) {
    this.tracks = tracks;
    this.renderGrid();
  }

  highlightSelected(trackId) {
    const cards = this.container.querySelectorAll('.grid-card');
    cards.forEach(card => {
      const index = parseInt(card.dataset.index);
      const track = this.tracks[index];
      if (track.id === trackId) {
        card.style.borderColor = '#00f7ff';
        card.style.boxShadow = '0 0 20px rgba(0, 247, 255, 0.4)';
      } else {
        card.style.borderColor = 'rgba(0, 247, 255, 0.2)';
        card.style.boxShadow = '0 8px 32px rgba(0, 247, 255, 0.1)';
      }
    });
  }
}

module.exports = PortfolioGrid;