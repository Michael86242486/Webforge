= new Audio();
let currentTrack = null;
let isPlaying = false;
let progressInterval = null;

function initAudioPlayer() {
  audio.volume = 0.7;
  audio.addEventListener('ended', handleTrackEnd);
  audio.addEventListener('timeupdate', updateProgress);
  audio.addEventListener('loadedmetadata', updateDuration);
}

function loadTrack(track) {
  if (currentTrack === track) return;
  audio.src = track.previewUrl;
  currentTrack = track;
  isPlaying = false;
  clearInterval(progressInterval);
  updatePlayerUI();
}

function togglePlay() {
  if (!currentTrack) return;
  if (isPlaying) {
    audio.pause();
  } else {
    audio.play().catch(e => console.error('Playback failed:', e));
  }
  isPlaying = !isPlaying;
  updatePlayerUI();
}

function handleTrackEnd() {
  isPlaying = false;
  updatePlayerUI();
  clearInterval(progressInterval);
}

function updateProgress() {
  if (!currentTrack) return;
  const progressBar = document.getElementById('progress-bar');
  const progressFill = document.getElementById('progress-fill');
  const currentTimeEl = document.getElementById('current-time');
  if (progressBar && progressFill && currentTimeEl) {
    const percent = (audio.currentTime / audio.duration) * 100;
    progressFill.style.width = `${percent}%`;
    currentTimeEl.textContent = formatTime(audio.currentTime);
  }
}

function updateDuration() {
  const durationEl = document.getElementById('duration');
  if (durationEl) {
    durationEl.textContent = formatTime(audio.duration);
  }
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

function setProgress(e) {
  if (!currentTrack || !audio.duration) return;
  const progressBar = document.getElementById('progress-bar');
  const rect = progressBar.getBoundingClientRect();
  const pos = (e.clientX - rect.left) / rect.width;
  audio.currentTime = pos * audio.duration;
  updateProgress();
}

function setVolume(volume) {
  audio.volume = volume;
  const volumeSlider = document.getElementById('volume-slider');
  if (volumeSlider) {
    volumeSlider.value = volume;
  }
  const volumeIcon = document.getElementById('volume-icon');
  if (volumeIcon) {
    volumeIcon.textContent = volume > 0.5 ? '🔊' : volume > 0 ? '🔈' : '🔇';
  }
}

function updatePlayerUI() {
  const playBtn = document.getElementById('play-btn');
  const trackTitle = document.getElementById('track-title');
  const trackArtist = document.getElementById('track-artist');
  const trackImage = document.getElementById('track-image');

  if (playBtn) {
    playBtn.textContent = isPlaying ? '⏸' : '▶';
    playBtn.style.color = isPlaying ? '#ff2a6d' : '#00f5d4';
  }
  if (trackTitle && currentTrack) trackTitle.textContent = currentTrack.title;
  if (trackArtist && currentTrack) trackArtist.textContent = currentTrack.artist;
  if (trackImage && currentTrack) trackImage.src = currentTrack.artworkUrl;

  if (isPlaying && !progressInterval) {
    progressInterval = setInterval(updateProgress, 1000);
  } else if (!isPlaying && progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
}

function bindControls() {
  const playBtn = document.getElementById('play-btn');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const progressBar = document.getElementById('progress-bar');
  const volumeSlider = document.getElementById('volume-slider');

  if (playBtn) playBtn.addEventListener('click', togglePlay);
  if (prevBtn) prevBtn.addEventListener('click', () => console.log('Previous track'));
  if (nextBtn) nextBtn.addEventListener('click', () => console.log('Next track'));
  if (progressBar) progressBar.addEventListener('click', setProgress);
  if (volumeSlider) volumeSlider.addEventListener('input', (e) => setVolume(parseFloat(e.target.value)));
}

function attachToDOM() {
  const container = document.getElementById('audio-player-container');
  if (!container) return;

  container.innerHTML = `
    <div class="audio-player">
      <div class="track-info">
        <img id="track-image" src="../assets/images/logo.svg" alt="Track Artwork" class="track-image">
        <div class="track-details">
          <h3 id="track-title" class="track-title">Select a track</h3>
          <p id="track-artist" class="track-artist">VibeForge</p>
        </div>
      </div>
      <div class="player-controls">
        <button id="prev-btn" class="control-btn" title="Previous">⏮</button>
        <button id="play-btn" class="control-btn play-btn" title="Play/Pause">▶</button>
        <button id="next-btn" class="control-btn" title="Next">⏭</button>
      </div>
      <div class="progress-container">
        <span id="current-time" class="time">0:00</span>
        <div id="progress-bar" class="progress-bar">
          <div id="progress-fill" class="progress-fill"></div>
        </div>
        <span id="duration" class="time">0:00</span>
      </div>
      <div class="volume-control">
        <span id="volume-icon" class="volume-icon">🔊</span>
        <input type="range" id="volume-slider" class="volume-slider" min="0" max="1" step="0.01" value="0.7">
      </div>
    </div>
  `;

  bindControls();
  initAudioPlayer();
}

function setTrack(track) {
  loadTrack(track);
}

module.exports = {
  init: attachToDOM,
  setTrack,
  togglePlay,
  setVolume,
  loadTrack
};