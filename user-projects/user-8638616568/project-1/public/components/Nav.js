const Nav = () => {
  const nav = document.createElement('nav');
  nav.className = 'nav';
  nav.innerHTML = `
    <div class="nav-container">
      <div class="nav-logo">
        <div class="logo-icon">⚡</div>
        <div class="logo-text">
          <span class="logo-main">VibeForge</span>
          <span class="logo-sub">PRODUCTIONS</span>
        </div>
      </div>
      <div class="nav-search">
        <div class="search-wrapper">
          <input type="text" id="nav-search-input" placeholder="Search tracks, beats, samples..." class="search-input">
          <div class="search-icon">⌘</div>
        </div>
      </div>
      <div class="nav-actions">
        <div class="nav-stats">
          <div class="stat-item">
            <span class="stat-value">47</span>
            <span class="stat-label">Tracks</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">128k</span>
            <span class="stat-label">Plays</span>
          </div>
        </div>
        <div class="nav-cart" id="nav-cart-btn">
          <div class="cart-icon-wrapper">
            <span class="cart-icon">🛒</span>
            <span class="cart-badge" id="cart-count">0</span>
          </div>
          <span class="cart-label">Cart</span>
        </div>
        <div class="nav-user">
          <div class="user-avatar">VF</div>
        </div>
      </div>
    </div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    .nav {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 1000;
      background: linear-gradient(135deg, rgba(10,10,20,0.95) 0%, rgba(20,10,35,0.92) 100%);
      backdrop-filter: blur(20px);
      border-bottom: 1px solid rgba(0,255,255,0.2);
      padding: 0 2rem;
    }
    .nav-container {
      max-width: 1400px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 78px;
    }
    .nav-logo {
      display: flex;
      align-items: center;
      gap: 14px;
      cursor: pointer;
    }
    .logo-icon {
      width: 46px;
      height: 46px;
      background: linear-gradient(45deg, #00f3ff, #ff00aa);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      color: #0a0a14;
      box-shadow: 0 0 25px rgba(0,243,255,0.5);
    }
    .logo-text {
      display: flex;
      flex-direction: column;
    }
    .logo-main {
      font-size: 1.65rem;
      font-weight: 800;
      background: linear-gradient(90deg, #fff, #00f3ff);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: -1.5px;
    }
    .logo-sub {
      font-size: 0.68rem;
      color: #ff00aa;
      letter-spacing: 3px;
      margin-top: -4px;
    }
    .nav-search {
      flex: 1;
      max-width: 420px;
      margin: 0 2.5rem;
    }
    .search-wrapper {
      position: relative;
    }
    .search-input {
      width: 100%;
      padding: 12px 48px 12px 20px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(0,255,255,0.25);
      border-radius: 50px;
      color: #fff;
      font-size: 0.95rem;
      outline: none;
      transition: all 0.3s ease;
    }
    .search-input:focus {
      border-color: #00f3ff;
      box-shadow: 0 0 0 4px rgba(0,243,255,0.1);
      background: rgba(255,255,255,0.09);
    }
    .search-icon {
      position: absolute;
      right: 18px;
      top: 50%;
      transform: translateY(-50%);
      color: #00f3ff;
      font-size: 1.1rem;
    }
    .nav-actions {
      display: flex;
      align-items: center;
      gap: 2rem;
    }
    .nav-stats {
      display: flex;
      gap: 1.75rem;
    }
    .stat-item {
      text-align: center;
    }
    .stat-value {
      display: block;
      font-size: 1.05rem;
      font-weight: 700;
      color: #00f3ff;
    }
    .stat-label {
      font-size: 0.65rem;
      color: rgba(255,255,255,0.5);
      letter-spacing: 1px;
    }
    .nav-cart {
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 8px 18px;
      background: rgba(255,0,170,0.1);
      border: 1px solid rgba(255,0,170,0.3);
      border-radius: 50px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .nav-cart:hover {
      background: rgba(255,0,170,0.2);
      transform: translateY(-1px);
    }
    .cart-icon-wrapper {
      position: relative;
    }
    .cart-icon {
      font-size: 1.35rem;
    }
    .cart-badge {
      position: absolute;
      top: -6px;
      right: -8px;
      background: #ff00aa;
      color: white;
      font-size: 0.65rem;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
    }
    .cart-label {
      font-size: 0.9rem;
      color: #fff;
      font-weight: 600;
    }
    .nav-user {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background: linear-gradient(135deg, #00f3ff, #ff00aa);
      padding: 2px;
      cursor: pointer;
    }
    .user-avatar {
      width: 100%;
      height: 100%;
      background: #0a0a14;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.9rem;
      color: #00f3ff;
    }
  `;
  document.head.appendChild(style);

  setTimeout(() => {
    const searchInput = nav.querySelector('#nav-search-input');
    const cartBtn = nav.querySelector('#nav-cart-btn');

    searchInput.addEventListener('input', (e) => {
      if (window.filterTracks) window.filterTracks(e.target.value);
    });

    cartBtn.addEventListener('click', () => {
      if (window.openCart) window.openCart();
    });

    if (window.updateCartCount) {
      window.updateCartCount(nav.querySelector('#cart-count'));
    }
  }, 50);

  return nav;
};

module.exports = Nav;