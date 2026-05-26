const WaveSurfer = require('wavesurfer.js');

class AudioPlayer {
  constructor(containerId, track) {
    this.container = document.getElementById(containerId);
    this.track = track;
    this.isPlaying = false;
    this.waveSurfer = null;
    this.volume = 0.7;
    this.init();
  }

  init() {
    this.renderUI();
    this.setupWaveform();
    this.bindEvents();
    this.applyNeonTheme();
  }

  renderUI() {
    this.container.innerHTML = `
      <div class="audio-player">
        <div class="player-header">
          <h3 class="track-title neon-text">${this.track.title}</h3>
          <span class="artist-name neon-text">${this.track.artist}</span>
        </div>
        <div class="waveform-container glass-card">
          <div id="waveform-${this.track.id}" class="waveform"></div>
        </div>
        <div class="player-controls">
          <button class="control-btn neon-btn" data-action="play">
            <i class="icon">▶</i>
          </button>
          <button class="control-btn neon-btn" data-action="pause">
            <i class="icon">❚❚</i>
          </button>
          <button class="control-btn neon-btn" data-action="stop">
            <i class="icon">■</i>
          </button>
          <div class="volume-control">
            <i class="icon">🔊</i>
            <input type="range" min="0" max="1" step="0.01" value="${this.volume}" class="volume-slider">
          </div>
          <span class="time-display">0:00 / ${this.formatTime(this.track.duration)}</span>
        </div>
      </div>
    `;
  }

  setupWaveform() {
    this.waveSurfer = WaveSurfer.create({
      container: `#waveform-${this.track.id}`,
      waveColor: '#0ff',
      progressColor: '#f0f',
      cursorColor: '#ff0',
      barWidth: 2,
      barRadius: 3,
      cursorWidth: 1,
      height: 100,
      barGap: 2,
      responsive: true,
      hideScrollbar: true,
      normalize: true,
      partialRender: true,
      audioContext: new (window.AudioContext || window.webkitAudioContext)(),
    });

    this.waveSurfer.load(this.track.audioUrl);
    this.waveSurfer.on('ready', () => {
      this.container.querySelector('.time-display').textContent = `0:00 / ${this.formatTime(this.waveSurfer.getDuration())}`;
    });
    this.waveSurfer.on('audioprocess', () => {
      this.container.querySelector('.time-display').textContent = `${this.formatTime(this.waveSurfer.getCurrentTime())} / ${this.formatTime(this.waveSurfer.getDuration())}`;
    });
    this.waveSurfer.on('seek', () => {
      this.container.querySelector('.time-display').textContent = `${this.formatTime(this.waveSurfer.getCurrentTime())} / ${this.formatTime(this.waveSurfer.getDuration())}`;
    });
  }

  bindEvents() {
    this.container.querySelectorAll('.control-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.target.closest('button').dataset.action;
        this.handleAction(action);
      });
    });

    const volumeSlider = this.container.querySelector('.volume-slider');
    volumeSlider.addEventListener('input', (e) => {
      this.volume = parseFloat(e.target.value);
      this.waveSurfer.setVolume(this.volume);
    });
  }

  handleAction(action) {
    switch (action) {
      case 'play':
        this.waveSurfer.play();
        this.isPlaying = true;
        this.updateButtonStates();
        break;
      case 'pause':
        this.waveSurfer.pause();
        this.isPlaying = false;
        this.updateButtonStates();
        break;
      case 'stop':
        this.waveSurfer.stop();
        this.isPlaying = false;
        this.updateButtonStates();
        break;
    }
  }

  updateButtonStates() {
    const playBtn = this.container.querySelector('[data-action="play"]');
    const pauseBtn = this.container.querySelector('[data-action="pause"]');
    playBtn.style.display = this.isPlaying ? 'none' : 'block';
    pauseBtn.style.display = this.isPlaying ? 'block' : 'none';
  }

  formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
  }

  applyNeonTheme() {
    const style = document.createElement('style');
    style.textContent = `
      .audio-player {
        width: 100%;
        max-width: 600px;
        margin: 0 auto;
        font-family: 'Orbitron', 'Courier New', monospace;
        color: #fff;
        padding: 20px;
        border-radius: 15px;
        background: rgba(10, 10, 30, 0.6);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(0, 255, 255, 0.2);
        box-shadow: 0 0 20px rgba(0, 255, 255, 0.3);
        transition: all 0.3s ease;
      }
      .audio-player:hover {
        box-shadow: 0 0 30px rgba(0, 255, 255, 0.5);
        border: 1px solid rgba(0, 255, 255, 0.4);
      }
      .player-header {
        text-align: center;
        margin-bottom: 15px;
      }
      .track-title {
        font-size: 1.4rem;
        margin: 0;
        text-shadow: 0 0 10px #0ff, 0 0 20px #0ff;
        letter-spacing: 2px;
      }
      .artist-name {
        font-size: 0.9rem;
        opacity: 0.8;
        text-shadow: 0 0 5px #f0f;
      }
      .waveform-container {
        margin: 15px 0;
        border-radius: 10px;
        padding: 10px;
        background: rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(255, 0, 255, 0.2);
      }
      .waveform {
        width: 100%;
        height: 100px;
      }
      .player-controls {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 10px;
        margin-top: 15px;
      }
      .control-btn {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: none;
        background: rgba(0, 255, 255, 0.2);
        color: #0ff;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.8rem;
      }
      .control-btn:hover {
        background: rgba(0, 255, 255, 0.4);
        transform: scale(1.1);
        box-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
      }
      .control-btn:active {
        transform: scale(0.95);
      }
      .volume-control {
        display: flex;
        align-items: center;
        gap: 5px;
        margin-left: 10px;
      }
      .volume-slider {
        width: 80px;
        -webkit-appearance: none;
        height: 4px;
        background: rgba(255, 0, 255, 0.3);
        border-radius: 5px;
        outline: none;
      }
      .volume-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #f0f;
        cursor: pointer;
        box-shadow: 0 0 10px rgba(255, 0, 255, 0.7);
      }
      .time-display {
        font-family: 'Orbitron', monospace;
        font-size: 0.8rem;
        color: #0ff;
        text-shadow: 0 0 5px #0ff;
        margin-left: 10px;
      }
      .neon-text {
        text-shadow: 0 0 5px currentColor, 0 0 10px currentColor;
      }
      .neon-btn {
        box-shadow: 0 0 10px rgba(0, 255, 255, 0.5);
      }
      .glass-card {
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
      }
      @media (max-width: 600px) {
        .audio-player {
          padding: 15px;
        }
        .player-controls {
          flex-wrap: wrap;
          justify-content: center;
        }
        .volume-control {
          margin-top: 10px;
          width: 100%;
          justify-content: center;
        }
      }
    `;
    document.head.appendChild(style);
  }

  destroy() {
    if (this.waveSurfer) {
      this.waveSurfer.destroy();
    }
    this.container.innerHTML = '';
  }
}

module.exports = AudioPlayer;