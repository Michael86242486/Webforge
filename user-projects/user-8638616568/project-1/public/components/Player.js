const Player = {
  init: function(containerId, audioSrc) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    container.innerHTML = `
      <div class="player glass">
        <div class="player-header">
          <div class="track-info">
            <div class="track-title">NEON PULSE</div>
            <div class="track-artist">VibeForge • 2024</div>
          </div>
          <div class="player-status">PREVIEW</div>
        </div>
        
        <canvas id="wave-canvas" width="600" height="80"></canvas>
        
        <div class="player-controls">
          <button class="ctrl-btn" id="play-btn">▶</button>
          <button class="ctrl-btn" id="pause-btn">⏸</button>
          <div class="progress-container">
            <div class="progress-bar">
              <div class="progress-fill" id="progress-fill"></div>
            </div>
            <div class="time-display">
              <span id="current-time">0:00</span>
              <span>/</span>
              <span id="duration">2:45</span>
            </div>
          </div>
          <div class="volume-control">
            <span>🔊</span>
            <input type="range" id="volume" min="0" max="1" step="0.1" value="0.8">
          </div>
        </div>
      </div>
    `;

    const audio = new Audio(audioSrc);
    const canvas = container.querySelector('#wave-canvas');
    const ctx = canvas.getContext('2d');
    const playBtn = container.querySelector('#play-btn');
    const pauseBtn = container.querySelector('#pause-btn');
    const progressFill = container.querySelector('#progress-fill');
    const currentTimeEl = container.querySelector('#current-time');
    const durationEl = container.querySelector('#duration');
    const volumeSlider = container.querySelector('#volume');

    let isPlaying = false;
    let animationFrame = null;

    function drawWave() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#00f3ff';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#00f3ff';

      const time = Date.now() / 300;
      ctx.beginPath();
      
      for (let x = 0; x < canvas.width; x += 3) {
        const y = 40 + Math.sin(x * 0.02 + time) * 18 + 
                  Math.sin(x * 0.05 + time * 1.5) * 10;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.strokeStyle = '#ff00aa';
      ctx.shadowColor = '#ff00aa';
      ctx.beginPath();
      for (let x = 0; x < canvas.width; x += 3) {
        const y = 40 + Math.cos(x * 0.03 + time * 0.8) * 14;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      if (isPlaying) {
        animationFrame = requestAnimationFrame(drawWave);
      }
    }

    function updateProgress() {
      if (!audio.duration) return;
      const percent = (audio.currentTime / audio.duration) * 100;
      progressFill.style.width = percent + '%';
      
      const mins = Math.floor(audio.currentTime / 60);
      const secs = Math.floor(audio.currentTime % 60);
      currentTimeEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    function togglePlay() {
      if (isPlaying) {
        audio.pause();
        cancelAnimationFrame(animationFrame);
        isPlaying = false;
        playBtn.style.display = 'inline-block';
        pauseBtn.style.display = 'none';
      } else {
        audio.play();
        isPlaying = true;
        drawWave();
        playBtn.style.display = 'none';
        pauseBtn.style.display = 'inline-block';
      }
    }

    playBtn.addEventListener('click', togglePlay);
    pauseBtn.addEventListener('click', togglePlay);

    audio.addEventListener('timeupdate', updateProgress);
    
    audio.addEventListener('loadedmetadata', () => {
      const mins = Math.floor(audio.duration / 60);
      const secs = Math.floor(audio.duration % 60);
      durationEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    });

    audio.addEventListener('ended', () => {
      isPlaying = false;
      cancelAnimationFrame(animationFrame);
      playBtn.style.display = 'inline-block';
      pauseBtn.style.display = 'none';
      progressFill.style.width = '0%';
    });

    volumeSlider.addEventListener('input', () => {
      audio.volume = volumeSlider.value;
    });

    const progressContainer = container.querySelector('.progress-container');
    progressContainer.addEventListener('click', (e) => {
      const rect = progressContainer.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const percent = clickX / rect.width;
      audio.currentTime = percent * audio.duration;
    });

    // initial draw
    drawWave();
    pauseBtn.style.display = 'none';
    audio.volume = 0.8;

    return {
      play: () => { if (!isPlaying) togglePlay(); },
      pause: () => { if (isPlaying) togglePlay(); },
      setVolume: (v) => { audio.volume = v; volumeSlider.value = v; }
    };
  }
};

module.exports = Player;