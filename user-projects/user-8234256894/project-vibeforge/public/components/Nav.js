const path = require('path');

class Nav {
  constructor() {
    this.navElement = null;
    this.isOpen = false;
    this.init();
  }

  init() {
    this.injectHTML();
    this.bindEvents();
    this.applyNeonTheme();
  }

  injectHTML() {
    const navHTML = `
      <nav class="neon-nav">
        <div class="neon-nav-header">
          <div class="neon-logo-container">
            <img src="../assets/images/logo.svg" alt="VibeForge Logo" class="neon-logo" />
            <span class="neon-brand">VibeForge</span>
          </div>
          <button class="neon-menu-toggle" aria-label="Toggle Navigation">
            <span class="neon-menu-icon"></span>
          </button>
        </div>
        <ul class="neon-nav-links">
          <li class="neon-nav-item">
            <a href="#" class="neon-nav-link" data-section="home">
              <span class="neon-link-icon">🏠</span>
              <span class="neon-link-text">Home</span>
            </a>
          </li>
          <li class="neon-nav-item">
            <a href="#" class="neon-nav-link" data-section="tracks">
              <span class="neon-link-icon">🎵</span>
              <span class="neon-link-text">Tracks</span>
            </a>
          </li>
          <li class="neon-nav-item">
            <a href="#" class="neon-nav-link" data-section="albums">
              <span class="neon-link-icon">💿</span>
              <span class="neon-link-text">Albums</span>
            </a>
          </li>
          <li class="neon-nav-item">
            <a href="#" class="neon-nav-link" data-section="cart">
              <span class="neon-link-icon">🛒</span>
              <span class="neon-link-text">Cart</span>
              <span class="neon-cart-badge">0</span>
            </a>
          </li>
          <li class="neon-nav-item">
            <a href="#" class="neon-nav-link" data-section="sync">
              <span class="neon-link-icon">🔄</span>
              <span class="neon-link-text">GitHub Sync</span>
            </a>
          </li>
          <li class="neon-nav-item">
            <a href="#" class="neon-nav-link" data-section="settings">
              <span class="neon-link-icon">⚙️</span>
              <span class="neon-link-text">Settings</span>
            </a>
          </li>
        </ul>
        <div class="neon-nav-footer">
          <a href="#" class="neon-social-link" aria-label="Twitter">
            <span class="neon-social-icon">🐦</span>
          </a>
          <a href="#" class="neon-social-link" aria-label="Instagram">
            <span class="neon-social-icon">📷</span>
          </a>
          <a href="#" class="neon-social-link" aria-label="SoundCloud">
            <span class="neon-social-icon">☁️</span>
          </a>
        </div>
      </nav>
    `;
    document.body.insertAdjacentHTML('afterbegin', navHTML);
    this.navElement = document.querySelector('.neon-nav');
  }

  bindEvents() {
    const toggleBtn = this.navElement.querySelector('.neon-menu-toggle');
    const navLinks = this.navElement.querySelectorAll('.neon-nav-link');

    toggleBtn.addEventListener('click', () => this.toggleNav());
    navLinks.forEach(link => {
      link.addEventListener('click', (e) => this.handleNavClick(e));
    });

    document.addEventListener('click', (e) => {
      if (!this.navElement.contains(e.target) && this.isOpen) {
        this.closeNav();
      }
    });
  }

  toggleNav() {
    this.isOpen = !this.isOpen;
    this.navElement.classList.toggle('neon-nav-open', this.isOpen);
    document.body.classList.toggle('neon-nav-lock', this.isOpen);
  }

  closeNav() {
    this.isOpen = false;
    this.navElement.classList.remove('neon-nav-open');
    document.body.classList.remove('neon-nav-lock');
  }

  handleNavClick(e) {
    e.preventDefault();
    const section = e.target.closest('.neon-nav-link').dataset.section;
    this.closeNav();
    this.emitSectionChange(section);
  }

  emitSectionChange(section) {
    const event = new CustomEvent('nav:section-change', { detail: { section } });
    document.dispatchEvent(event);
  }

  applyNeonTheme() {
    const style = document.createElement('style');
    style.textContent = `
      .neon-nav {
        --neon-pink: #ff2a6d;
        --neon-blue: #05d9e8;
        --neon-purple: #d300c5;
        --neon-yellow: #f9f002;
        --neon-green: #00ff9d;
        --neon-dark: #0a0412;
        --neon-glass: rgba(10, 4, 18, 0.6);
        --neon-glow: 0 0 10px;
        --neon-transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);

        position: fixed;
        top: 0;
        left: 0;
        width: 80px;
        height: 100vh;
        background: var(--neon-glass);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border-right: 1px solid rgba(5, 217, 232, 0.2);
        z-index: 1000;
        display: flex;
        flex-direction: column;
        transition: var(--neon-transition);
        box-shadow: var(--neon-glow) rgba(5, 217, 232, 0.3);
        overflow: hidden;
      }

      .neon-nav-open {
        width: 250px;
      }

      .neon-nav-header {
        padding: 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid rgba(5, 217, 232, 0.2);
      }

      .neon-logo-container {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .neon-logo {
        width: 40px;
        height: 40px;
        filter: drop-shadow(0 0 5px var(--neon-blue));
      }

      .neon-brand {
        color: var(--neon-blue);
        font-family: 'Orbitron', sans-serif;
        font-size: 1.5rem;
        font-weight: 700;
        text-shadow: var(--neon-glow) var(--neon-blue);
        opacity: 0;
        transition: var(--neon-transition);
      }

      .neon-nav-open .neon-brand {
        opacity: 1;
      }

      .neon-menu-toggle {
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 5px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--neon-blue);
        transition: var(--neon-transition);
      }

      .neon-menu-toggle:hover {
        transform: scale(1.1);
        text-shadow: var(--neon-glow) var(--neon-blue);
      }

      .neon-menu-icon {
        display: block;
        width: 24px;
        height: 2px;
        background: var(--neon-blue);
        position: relative;
        box-shadow: var(--neon-glow) var(--neon-blue);
      }

      .neon-menu-icon::before,
      .neon-menu-icon::after {
        content: '';
        position: absolute;
        width: 24px;
        height: 2px;
        background: var(--neon-blue);
        box-shadow: var(--neon-glow) var(--neon-blue);
      }

      .neon-menu-icon::before {
        top: -7px;
      }

      .neon-menu-icon::after {
        top: 7px;
      }

      .neon-nav-links {
        list-style: none;
        padding: 20px 0;
        margin: 0;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 5px;
        overflow-y: auto;
      }

      .neon-nav-item {
        padding: 0 10px;
      }

      .neon-nav-link {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 15px;
        color: var(--neon-blue);
        text-decoration: none;
        border-radius: 8px;
        transition: var(--neon-transition);
        position: relative;
        overflow: hidden;
      }

      .neon-nav-link::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 3px;
        height: 100%;
        background: var(--neon-pink);
        transform: scaleY(0);
        transition: var(--neon-transition);
      }

      .neon-nav-link:hover {
        background: rgba(5, 217, 232, 0.1);
        box-shadow: var(--neon-glow) rgba(5, 217, 232, 0.2);
      }

      .neon-nav-link:hover::before {
        transform: scaleY(1);
      }

      .neon-nav-link.active {
        background: rgba(5, 217, 232, 0.2);
        box-shadow: var(--neon-glow) rgba(5, 217, 232, 0.4);
      }

      .neon-nav-link.active::before {
        transform: scaleY(1);
      }

      .neon-link-icon {
        font-size: 1.2rem;
        min-width: 24px;
        text-align: center;
      }

      .neon-link-text {
        opacity: 0;
        transition: var(--neon-transition);
        white-space: nowrap;
      }

      .neon-nav-open .neon-link-text {
        opacity: 1;
      }

      .neon-cart-badge {
        position: absolute;
        top: 5px;
        right: 5px;
        background: var(--neon-pink);
        color: white;
        font-size: 0.7rem;
        font-weight: bold;
        padding: 2px 6px;
        border-radius: 10px;
        box-shadow: var(--neon-glow) var(--neon-pink);
      }

      .neon-nav-footer {
        padding: 20px;
        display: flex;
        justify-content: center;
        gap: 15px;
        border-top: 1px solid rgba(5, 217, 232, 0.2);
      }

      .neon-social-link {
        color: var(--neon-blue);
        font-size: 1.2rem;
        transition: var(--neon-transition);
        opacity: 0;
        transform: scale(0.8);
      }

      .neon-nav-open .neon-social-link {
        opacity: 1;
        transform: scale(1);
      }

      .neon-social-link:hover {
        text-shadow: var(--neon-glow) var(--neon-blue);
        transform: scale(1.2);
      }

      @media (max-width: 768px) {
        .neon-nav {
          width: 80px;
        }

        .neon-nav-open {
          width: 100%;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

module.exports = Nav;