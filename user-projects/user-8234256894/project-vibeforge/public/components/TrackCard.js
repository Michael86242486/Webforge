const api = require('../utils/api');

class TrackCard {
  constructor(data, container) {
    this.data = data;
    this.container = container;
    this.audio = new Audio(`assets/audio/${data.preview}`);
    this.isPlaying = false;
    this.cardElement = null;
    this.waveform = null;
    this.playButton = null;
    this.progressBar = null;
    this.progress = 0;
    this.animationId = null;
    this.init();
  }

  init() {
    this.createCard();
    this.bindEvents();
    this.setupWaveform();
  }

  createCard() {
    this.cardElement = document.createElement('div');
    this.cardElement.className = 'track-card glassmorph';
    this.cardElement.innerHTML = `
      <div class="track-card-header">
        <img src="assets/images/${this.data.cover || 'default-cover.png'}" alt="${this.data.title}" class="track-cover">
        <div class="track-info">
          <h3 class="track-title neon-text">${this.data.title}</h3>
          <p class="track-artist neon-subtext">${this.data.artist || 'VibeForge'}</p>
        </div>
      </div>
      <div class="track-card-body">
        <div class="waveform-container">
          <canvas class="waveform" width="300" height="60"></canvas>
        </div>
        <div class="track-meta">
          <span class="track-bpm neon-subtext">BPM: ${this.data.bpm || '120'}</span>
          <span class="track-key neon-subtext">Key: ${this.data.key || 'C Minor'}</span>
          <span class="track-duration neon-subtext">${this.formatTime(this.data.duration || 180)}</span>
        </div>
      </div>
      <div class="track-card-footer">
        <div class="progress-container">
          <div class="progress-bar" style="width: 0%;"></div>
        </div>
        <div class="track-actions">
          <button class="btn btn-play neon-btn" aria-label="Play">
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <button class="btn btn-cart neon-btn" aria-label="Add to Cart">
            <svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/></svg>
          </button>
        </div>
      </div>
    `;
    this.container.appendChild(this.cardElement);
    this.cacheElements();
  }

  cacheElements() {
    this.waveform = this.cardElement.querySelector('.waveform');
    this.playButton = this.cardElement.querySelector('.btn-play');
    this.progressBar = this.cardElement.querySelector('.progress-bar');
    this.progressContainer = this.cardElement.querySelector('.progress-container');
  }

  bindEvents() {
    this.playButton.addEventListener('click', () => this.togglePlay());
    this.cardElement.querySelector('.btn-cart').addEventListener('click', () => this.addToCart());
    this.progressContainer.addEventListener('click', (e) => this.seek(e));
    this.audio.addEventListener('ended', () => this.stop());
    this.audio.addEventListener('timeupdate', () => this.updateProgress());
    this.audio.addEventListener('loadedmetadata', () => this.setupWaveform());
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  play() {
    this.audio.currentTime = this.progress * this.audio.duration / 100;
    this.audio.play().then(() => {
      this.isPlaying = true;
      this.playButton.innerHTML = `
        <svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
      `;
      this.animateWaveform();
    }).catch(err => {
      console.error('Playback failed:', err);
    });
  }

  pause() {
    this.audio.pause();
    this.isPlaying = false;
    this.playButton.innerHTML = `
      <svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
    `;
    this.cancelAnimation();
  }

  stop() {
    this.pause();
    this.progress = 0;
    this.progressBar.style.width = '0%';
    this.audio.currentTime = 0;
  }

  updateProgress() {
    this.progress = (this.audio.currentTime / this.audio.duration) * 100;
    this.progressBar.style.width = `${this.progress}%`;
  }

  seek(e) {
    if (!this.audio.duration) return;
    const rect = this.progressContainer.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    this.progress = pos * 100;
    this.audio.currentTime = (pos * this.audio.duration);
    this.progressBar.style.width = `${this.progress}%`;
  }

  setupWaveform() {
    if (!this.waveform || !this.audio.duration) return;
    const ctx = this.waveform.getContext('2d');
    ctx.clearRect(0, 0, this.waveform.width, this.waveform.height);
    ctx.strokeStyle = '#0ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const segments = 60;
    const width = this.waveform.width / segments;
    for (let i = 0; i < segments; i++) {
      const x = i * width;
      const height = Math.random() * this.waveform.height * 0.8;
      ctx.moveTo(x, this.waveform.height / 2 - height / 2);
      ctx.lineTo(x, this.waveform.height / 2 + height / 2);
    }
    ctx.stroke();
  }

  animateWaveform() {
    this.cancelAnimation();
    const ctx = this.waveform.getContext('2d');
    let phase = 0;
    const animate = () => {
      ctx.clearRect(0, 0, this.waveform.width, this.waveform.height);
      ctx.strokeStyle = '#0ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const segments = 60;
      const width = this.waveform.width / segments;
      for (let i = 0; i < segments; i++) {
        const x = i * width;
        const height = this.waveform.height * 0.4 * (0.5 + 0.5 * Math.sin(phase + i * 0.2));
        ctx.moveTo(x, this.waveform.height / 2 - height / 2);
        ctx.lineTo(x, this.waveform.height / 2 + height / 2);
      }
      ctx.stroke();
      phase += 0.1;
      this.animationId = requestAnimationFrame(animate);
    };
    animate();
  }

  cancelAnimation() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  addToCart() {
    api.post('/api/inquiry', {
      trackId: this.data.id,
      title: this.data.title,
      price: this.data.price || 29.99,
      artist: this.data.artist || 'VibeForge'
    }).then(response => {
      this.playButton.classList.add('added');
      setTimeout(() => this.playButton.classList.remove('added'), 1000);
      this.dispatchEvent('cartUpdated', { track: this.data });
    }).catch(err => {
      console.error('Cart error:', err);
    });
  }

  dispatchEvent(name, detail) {
    const event = new CustomEvent(name, { detail, bubbles: true });
    this.cardElement.dispatchEvent(event);
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  destroy() {
    this.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.cardElement.remove();
  }
}

module.exports = TrackCard;