const AudioPlayer = (function() {
    // Private variables
    let audio = null;
    let waveformCanvas = null;
    let waveformCtx = null;
    let isPlaying = false;
    let currentTrack = null;
    let animationId = null;
    let audioContext = null;
    let analyser = null;
    let dataArray = null;
    let source = null;

    // DOM Elements
    let playPauseBtn = null;
    let progressBar = null;
    let progressContainer = null;
    let timeDisplay = null;
    let volumeSlider = null;
    let trackTitle = null;
    let trackArtist = null;
    let waveformContainer = null;

    // Colors
    const neonPink = '#ff2a6d';
    const neonBlue = '#05d9e8';
    const neonPurple = '#d300c5';
    const darkBg = '#0d0221';
    const glassBg = 'rgba(13, 2, 33, 0.6)';
    const glassBorder = 'rgba(5, 217, 232, 0.3)';

    // Initialize the audio player
    function init() {
        _setupDOM();
        _setupAudioContext();
        _bindEvents();
        _renderWaveformPlaceholder();
    }

    // Setup DOM elements
    function _setupDOM() {
        playPauseBtn = document.querySelector('.audio-player .play-pause-btn');
        progressBar = document.querySelector('.audio-player .progress-bar');
        progressContainer = document.querySelector('.audio-player .progress-container');
        timeDisplay = document.querySelector('.audio-player .time-display');
        volumeSlider = document.querySelector('.audio-player .volume-slider');
        trackTitle = document.querySelector('.audio-player .track-title');
        trackArtist = document.querySelector('.audio-player .track-artist');
        waveformContainer = document.querySelector('.audio-player .waveform-container');
        waveformCanvas = document.createElement('canvas');
        waveformContainer.appendChild(waveformCanvas);
        waveformCtx = waveformCanvas.getContext('2d');
    }

    // Setup audio context
    function _setupAudioContext() {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        dataArray = new Uint8Array(analyser.frequencyBinCount);
    }

    // Bind event listeners
    function _bindEvents() {
        playPauseBtn.addEventListener('click', _togglePlayPause);
        progressContainer.addEventListener('click', _seek);
        volumeSlider.addEventListener('input', _setVolume);
        audio = new Audio();
        audio.addEventListener('ended', _onTrackEnded);
        audio.addEventListener('loadedmetadata', _onMetadataLoaded);
        audio.addEventListener('timeupdate', _updateProgress);
        audio.addEventListener('error', _onError);
    }

    // Toggle play/pause
    function _togglePlayPause() {
        if (!currentTrack) return;

        if (isPlaying) {
            audio.pause();
            _disconnectAudioNodes();
        } else {
            if (audio.src !== currentTrack) {
                audio.src = currentTrack;
            }
            audio.play().then(() => {
                _connectAudioNodes();
            }).catch(err => {
                console.error('Playback failed:', err);
            });
        }
        isPlaying = !isPlaying;
        _updatePlayPauseIcon();
    }

    // Connect audio nodes for visualization
    function _connectAudioNodes() {
        source = audioContext.createMediaElementSource(audio);
        source.connect(analyser);
        analyser.connect(audioContext.destination);
        _startVisualization();
    }

    // Disconnect audio nodes
    function _disconnectAudioNodes() {
        if (source) {
            source.disconnect();
            source = null;
        }
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    }

    // Start waveform visualization
    function _startVisualization() {
        function draw() {
            animationId = requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArray);
            _drawWaveform();
        }
        draw();
    }

    // Draw waveform
    function _drawWaveform() {
        const width = waveformCanvas.width;
        const height = waveformCanvas.height;
        waveformCtx.clearRect(0, 0, width, height);

        const barWidth = (width / dataArray.length) * 2.5;
        let x = 0;

        for (let i = 0; i < dataArray.length; i++) {
            const barHeight = (dataArray[i] / 255) * height;
            const hue = i / dataArray.length * 360;
            waveformCtx.fillStyle = `hsl(${hue}, 100%, 50%)`;
            waveformCtx.fillRect(x, height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }
    }

    // Draw placeholder waveform
    function _renderWaveformPlaceholder() {
        const width = waveformContainer.clientWidth;
        const height = waveformContainer.clientHeight;
        waveformCanvas.width = width;
        waveformCanvas.height = height;
        waveformCtx.fillStyle = glassBorder;
        waveformCtx.fillRect(0, 0, width, height);
    }

    // Update play/pause icon
    function _updatePlayPauseIcon() {
        const icon = playPauseBtn.querySelector('i');
        if (isPlaying) {
            icon.className = 'fas fa-pause';
            playPauseBtn.style.color = neonPink;
            playPauseBtn.style.boxShadow = `0 0 15px ${neonPink}`;
        } else {
            icon.className = 'fas fa-play';
            playPauseBtn.style.color = neonBlue;
            playPauseBtn.style.boxShadow = `0 0 15px ${neonBlue}`;
        }
    }

    // Seek in track
    function _seek(e) {
        if (!audio.duration) return;
        const rect = progressContainer.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        audio.currentTime = pos * audio.duration;
        _updateProgress();
    }

    // Set volume
    function _setVolume() {
        audio.volume = volumeSlider.value;
    }

    // Update progress bar
    function _updateProgress() {
        if (!audio.duration) return;
        const progress = (audio.currentTime / audio.duration) * 100;
        progressBar.style.width = `${progress}%`;
        _updateTimeDisplay();
    }

    // Update time display
    function _updateTimeDisplay() {
        const currentMinutes = Math.floor(audio.currentTime / 60);
        const currentSeconds = Math.floor(audio.currentTime % 60).toString().padStart(2, '0');
        const durationMinutes = Math.floor(audio.duration / 60);
        const durationSeconds = Math.floor(audio.duration % 60).toString().padStart(2, '0');
        timeDisplay.textContent = `${currentMinutes}:${currentSeconds} / ${durationMinutes}:${durationSeconds}`;
    }

    // Handle track ended
    function _onTrackEnded() {
        isPlaying = false;
        _updatePlayPauseIcon();
        _disconnectAudioNodes();
    }

    // Handle metadata loaded
    function _onMetadataLoaded() {
        _updateTimeDisplay();
        _resizeWaveform();
    }

    // Handle error
    function _onError(err) {
        console.error('Audio error:', err);
        isPlaying = false;
        _updatePlayPauseIcon();
        _disconnectAudioNodes();
    }

    // Resize waveform canvas
    function _resizeWaveform() {
        const width = waveformContainer.clientWidth;
        const height = waveformContainer.clientHeight;
        waveformCanvas.width = width;
        waveformCanvas.height = height;
    }

    // Load track
    function loadTrack(track) {
        if (!track || !track.src) return;

        currentTrack = track.src;
        trackTitle.textContent = track.title || 'Unknown Track';
        trackArtist.textContent = track.artist || 'Unknown Artist';
        audio.src = track.src;
        audio.load();
        isPlaying = false;
        _updatePlayPauseIcon();
        _resizeWaveform();
    }

    // Public API
    return {
        init,
        loadTrack,
        play: () => { if (currentTrack) _togglePlayPause(); },
        pause: () => { if (isPlaying) _togglePlayPause(); },
        getCurrentTrack: () => currentTrack,
        getIsPlaying: () => isPlaying,
        setVolume: (volume) => { volumeSlider.value = volume; audio.volume = volume; },
        resize: _resizeWaveform
    };
})();

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    AudioPlayer.init();
    window.addEventListener('resize', AudioPlayer.resize);
});

module.exports = AudioPlayer;