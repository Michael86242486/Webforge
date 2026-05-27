= new (window.AudioContext || window.webkitAudioContext)();
let audio = null;
let source = null;
let analyser = null;
let dataArray = null;
let canvasCtx = null;
let animationId = null;
let isPlaying = false;
let currentTrack = null;

const audioPlayer = {
  init: function() {
    audio = new Audio();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);

    source = audioContext.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(audioContext.destination);

    this.bindEvents();
    this.setupWaveformCanvas();
  },

  bindEvents: function() {
    document.querySelectorAll('.track-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.add-to-cart')) return;
        const trackPath = card.dataset.audio;
        this.loadTrack(trackPath);
      });
    });

    document.getElementById('play-pause-btn').addEventListener('click', () => this.togglePlay());
    document.getElementById('prev-btn').addEventListener('click', () => this.prevTrack());
    document.getElementById('next-btn').addEventListener('click', () => this.nextTrack());
    document.getElementById('progress-bar').addEventListener('click', (e) => this.seek(e));
    audio.addEventListener('ended', () => this.nextTrack());
    audio.addEventListener('timeupdate', () => this.updateProgress());
    audio.addEventListener('loadedmetadata', () => this.updateTrackInfo());
  },

  setupWaveformCanvas: function() {
    const canvas = document.getElementById('waveform-canvas');
    if (!canvas) return;
    canvasCtx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    window.addEventListener('resize', () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    });
  },

  loadTrack: function(trackPath) {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    audio.src = trackPath;
    currentTrack = trackPath;
    isPlaying = false;
    document.getElementById('play-pause-btn').innerHTML = '▶';
    audio.load();
    this.updateTrackInfo();
    if (isPlaying) {
      audio.play().then(() => {
        isPlaying = true;
        document.getElementById('play-pause-btn').innerHTML = '❚❚';
        this.drawWaveform();
      }).catch(err => console.error('Playback failed:', err));
    }
  },

  togglePlay: function() {
    if (!audio.src) return;
    if (isPlaying) {
      audio.pause();
      isPlaying = false;
      document.getElementById('play-pause-btn').innerHTML = '▶';
      if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
    } else {
      audio.play().then(() => {
        isPlaying = true;
        document.getElementById('play-pause-btn').innerHTML = '❚❚';
        this.drawWaveform();
      }).catch(err => console.error('Playback failed:', err));
    }
  },

  drawWaveform: function() {
    if (!canvasCtx || !analyser || !dataArray) return;
    analyser.getByteFrequencyData(dataArray);
    const canvas = document.getElementById('waveform-canvas');
    const width = canvas.width;
    const height = canvas.height;
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

    animationId = requestAnimationFrame(() => this.drawWaveform());
  },

  updateProgress: function() {
    if (audio.duration) {
      const progress = (audio.currentTime / audio.duration) * 100;
      document.getElementById('progress-bar').value = progress;
      const currentTime = this.formatTime(audio.currentTime);
      const duration = this.formatTime(audio.duration);
      document.getElementById('time-display').textContent = `${currentTime} / ${duration}`;
    }
  },

  seek: function(e) {
    if (!audio.duration) return;
    const rect = e.target.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pos * audio.duration;
    this.updateProgress();
  },

  formatTime: function(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
  },

  updateTrackInfo: function() {
    if (!audio.src) return;
    const trackName = currentTrack.split('/').pop().replace('.mp3', '');
    document.getElementById('now-playing').textContent = trackName || 'Unknown Track';
  },

  prevTrack: function() {
    const tracks = Array.from(document.querySelectorAll('.track-card')).map(card => card.dataset.audio);
    const currentIndex = tracks.indexOf(currentTrack);
    const prevIndex = (currentIndex - 1 + tracks.length) % tracks.length;
    this.loadTrack(tracks[prevIndex]);
    if (isPlaying) {
      audio.play().then(() => {
        isPlaying = true;
        document.getElementById('play-pause-btn').innerHTML = '❚❚';
        this.drawWaveform();
      });
    }
  },

  nextTrack: function() {
    const tracks = Array.from(document.querySelectorAll('.track-card')).map(card => card.dataset.audio);
    const currentIndex = tracks.indexOf(currentTrack);
    const nextIndex = (currentIndex + 1) % tracks.length;
    this.loadTrack(tracks[nextIndex]);
    if (isPlaying) {
      audio.play().then(() => {
        isPlaying = true;
        document.getElementById('play-pause-btn').innerHTML = '❚❚';
        this.drawWaveform();
      });
    }
  }
};

module.exports = audioPlayer;