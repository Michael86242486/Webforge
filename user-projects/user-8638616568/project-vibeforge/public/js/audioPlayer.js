const audioContext = new (window.AudioContext || window.webkitAudioContext)();
let audioElement = null;
let isPlaying = false;
let currentTrack = null;
let progressInterval = null;
let analyser = null;
let dataArray = null;
let canvasCtx = null;
let animationId = null;

function initAudioPlayer() {
  audioElement = document.getElementById('audio-preview');
  const playPauseBtn = document.getElementById('play-pause-btn');
  const progressBar = document.getElementById('progress-bar');
  const progressContainer = document.getElementById('progress-container');
  const currentTimeDisplay = document.getElementById('current-time');
  const durationDisplay = document.getElementById('duration');
  const volumeSlider = document.getElementById('volume-slider');
  const canvas = document.getElementById('visualizer');
  const trackTitle = document.getElementById('track-title');
  const trackArtist = document.getElementById('track-artist');

  if (canvas) {
    canvasCtx = canvas.getContext('2d');
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
  }

  playPauseBtn.addEventListener('click', togglePlayPause);
  progressContainer.addEventListener('click', seek);
  volumeSlider.addEventListener('input', setVolume);

  audioElement.addEventListener('loadedmetadata', () => {
    durationDisplay.textContent = formatTime(audioElement.duration);
    if (currentTrack) {
      trackTitle.textContent = currentTrack.title || 'Unknown Track';
      trackArtist.textContent = currentTrack.artist || 'Unknown Artist';
    }
  });

  audioElement.addEventListener('timeupdate', () => {
    currentTimeDisplay.textContent = formatTime(audioElement.currentTime);
    const progress = (audioElement.currentTime / audioElement.duration) * 100;
    progressBar.style.width = `${progress}%`;
  });

  audioElement.addEventListener('ended', () => {
    isPlaying = false;
    playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  });

  audioElement.addEventListener('play', () => {
    isPlaying = true;
    playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
    startVisualizer();
  });

  audioElement.addEventListener('pause', () => {
    isPlaying = false;
    playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  });
}

function loadTrack(track) {
  if (!track || !track.previewUrl) return;

  currentTrack = track;
  audioElement.src = track.previewUrl;
  audioElement.load();

  const trackTitle = document.getElementById('track-title');
  const trackArtist = document.getElementById('track-artist');
  trackTitle.textContent = track.title || 'Unknown Track';
  trackArtist.textContent = track.artist || 'Unknown Artist';

  if (isPlaying) {
    audioElement.play().catch(e => console.error('Playback failed:', e));
  }
}

function togglePlayPause() {
  if (!audioElement.src) return;

  if (isPlaying) {
    audioElement.pause();
  } else {
    audioElement.play().catch(e => console.error('Playback failed:', e));
  }
}

function seek(e) {
  if (!audioElement.duration) return;

  const rect = e.currentTarget.getBoundingClientRect();
  const pos = (e.clientX - rect.left) / rect.width;
  audioElement.currentTime = pos * audioElement.duration;
}

function setVolume() {
  const volume = parseFloat(this.value);
  audioElement.volume = volume;
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

function startVisualizer() {
  if (!analyser || !canvasCtx || !audioElement) return;

  const source = audioContext.createMediaElementSource(audioElement);
  source.connect(analyser);
  analyser.connect(audioContext.destination);

  function draw() {
    animationId = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(dataArray);

    const width = canvasCtx.canvas.width;
    const height = canvasCtx.canvas.height;
    canvasCtx.clearRect(0, 0, width, height);

    const barWidth = (width / dataArray.length) * 2.5;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
      const barHeight = (dataArray[i] / 255) * height;
      const hue = i / dataArray.length * 360;
      canvasCtx.fillStyle = `hsl(${hue}, 100%, 50%)`;
      canvasCtx.fillRect(x, height - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }
  }

  draw();
}

function stopVisualizer() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  if (analyser) {
    analyser.disconnect();
  }
}

function cleanup() {
  stopVisualizer();
  if (audioElement) {
    audioElement.pause();
    audioElement.src = '';
  }
  if (progressInterval) {
    clearInterval(progressInterval);
  }
}

module.exports = {
  init: initAudioPlayer,
  loadTrack,
  togglePlayPause,
  cleanup
};