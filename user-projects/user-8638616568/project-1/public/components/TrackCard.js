const TrackCard = {
  create: function(track, onPreview, onAddToCart) {
    const card = document.createElement('div');
    card.className = 'track-card glass';
    card.innerHTML = `
      <div class="track-header">
        <div class="track-art neon-glow">
          <div class="vinyl"></div>
          <button class="preview-btn" data-id="${track.id}">▶</button>
        </div>
        <div class="track-meta">
          <h3 class="track-title">${track.title}</h3>
          <p class="track-artist">${track.artist}</p>
          <div class="track-tags">
            ${track.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
          </div>
        </div>
      </div>
      <div class="track-body">
        <div class="track-stats">
          <span class="stat">BPM: ${track.bpm}</span>
          <span class="stat">KEY: ${track.key}</span>
          <span class="stat">${track.duration}</span>
        </div>
        <div class="track-price neon-text">$${track.price}</div>
      </div>
      <div class="track-actions">
        <button class="btn-preview" data-id="${track.id}">PREVIEW</button>
        <button class="btn-cart neon-btn" data-id="${track.id}">ADD TO CART</button>
      </div>
    `;

    const previewBtn = card.querySelector('.btn-preview');
    const cartBtn = card.querySelector('.btn-cart');
    const headerPreview = card.querySelector('.preview-btn');

    previewBtn.addEventListener('click', () => onPreview(track));
    headerPreview.addEventListener('click', () => onPreview(track));
    cartBtn.addEventListener('click', () => {
      cartBtn.textContent = 'ADDED ✓';
      cartBtn.disabled = true;
      setTimeout(() => {
        cartBtn.textContent = 'ADD TO CART';
        cartBtn.disabled = false;
      }, 1200);
      onAddToCart(track);
    });

    return card;
  },

  renderAll: function(container, tracks, onPreview, onAddToCart) {
    container.innerHTML = '';
    tracks.forEach(track => {
      const cardEl = this.create(track, onPreview, onAddToCart);
      container.appendChild(cardEl);
    });
  }
};

module.exports = TrackCard;