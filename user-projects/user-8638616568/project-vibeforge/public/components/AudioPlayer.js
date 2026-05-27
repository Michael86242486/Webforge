const AudioPlayer = (function() {
    // Private variables
    let audio = null;
    let progressBar = null;
    let playPauseBtn = null;
    let volumeSlider = null;
    let currentTrack = null;
    let isPlaying = false;
    let waveformCanvas = null;
    let waveformCtx = null;
    let animationId = null;
    let audioContext = null;
    let analyser = null;
    let dataArray = null;

    // Color scheme: Retro-neon
    const colors = {
        primary: '#0ff',
        secondary: '#f0f',
        accent: '#ff0',
        background: '#0a0a1a',
        surface: 'rgba(10, 10, 26, 0.7)',
        text: '#fff',
        textSecondary: '#aaa',
        success: '#0f0',
        error: '#f00'
    };

    // Initialize the audio player
    function init(options) {
        if (!options || !options.containerId) {
            console.error('AudioPlayer: containerId is required');
            return;
        }

        const container = document.getElementById(options.containerId);
        if (!container) {
            console.error(`AudioPlayer: Container #${options.containerId} not found`);
            return;
        }

        // Create audio context for waveform
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);

        // Render player UI
        renderUI(container);

        // Set up event listeners
        setupEventListeners();

        // Load initial track if provided
        if (options.track) {
            loadTrack(options.track);
        }
    }

    // Render the player UI
    function renderUI(container) {
        container.innerHTML = `
            <div class="audio-player">
                <div class="player-header">
                    <h3 class="track-title">No Track Selected</h3>
                    <div class="player-controls">
                        <button class="btn btn-previous" aria-label="Previous track">
                            <svg viewBox="0 0 24 24" fill="${colors.primary}" width="20" height="20">
                                <path d="M6 6h2v12H6V6zm3 0v12l8-6-8-6z"/>
                            </svg>
                        </button>
                        <button class="btn btn-play-pause" aria-label="Play/Pause">
                            <svg viewBox="0 0 24 24" fill="${colors.primary}" width="24" height="24">
                                <path d="M8 5v14l11-7z"/>
                            </svg>
                        </button>
                        <button class="btn btn-next" aria-label="Next track">
                            <svg viewBox="0 0 24 24" fill="${colors.primary}" width="20" height="20">
                                <path d="M6 18l8-6-8-6v12zM16 6v12h2V6h-2z"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="player-body">
                    <canvas class="waveform" width="400" height="100"></canvas>
                    <div class="progress-container">
                        <span class="time current-time">0:00</span>
                        <div class="progress-bar-container">
                            <div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                                <div class="progress-fill"></div>
                            </div>
                        </div>
                        <span class="time duration">0:00</span>
                    </div>
                </div>
                <div class="player-footer">
                    <div class="volume-control">
                        <svg viewBox="0 0 24 24" fill="${colors.primary}" width="18" height="18">
                            <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                        </svg>
                        <input type="range" class="volume-slider" min="0" max="1" step="0.01" value="0.7">
                    </div>
                </div>
            </div>
        `;

        // Cache DOM elements
        playPauseBtn = container.querySelector('.btn-play-pause');
        progressBar = container.querySelector('.progress-bar');
        waveformCanvas = container.querySelector('.waveform');
        waveformCtx = waveformCanvas.getContext('2d');
        volumeSlider = container.querySelector('.volume-slider');

        // Apply styles
        applyStyles(container);
    }

    // Apply retro-neon styles
    function applyStyles(container) {
        const style = document.createElement('style');
        style.textContent = `
            .audio-player {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                width: 100%;
                max-width: 500px;
                background: ${colors.surface};
                border-radius: 16px;
                border: 1px solid rgba(15, 255, 255, 0.2);
                box-shadow: 0 8px 32px rgba(15, 255, 255, 0.1);
                backdrop-filter: blur(10px);
                color: ${colors.text};
                padding: 20px;
                box-sizing: border-box;
                margin: 0 auto;
            }

            .audio-player * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
            }

            .player-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 16px;
            }

            .track-title {
                font-size: 16px;
                font-weight: 600;
                color: ${colors.primary};
                text-shadow: 0 0 8px rgba(15, 255, 255, 0.5);
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                max-width: 60%;
            }

            .player-controls {
                display: flex;
                gap: 12px;
            }

            .btn {
                background: transparent;
                border: 1px solid rgba(15, 255, 255, 0.3);
                border-radius: 50%;
                width: 40px;
                height: 40px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s ease;
                color: ${colors.primary};
            }

            .btn:hover {
                background: rgba(15, 255, 255, 0.1);
                border-color: ${colors.primary};
                transform: scale(1.1);
                box-shadow: 0 0 12px rgba(15, 255, 255, 0.3);
            }

            .btn:active {
                transform: scale(0.95);
            }

            .btn-play-pause {
                width: 48px;
                height: 48px;
                border-width: 2px;
            }

            .btn-play-pause svg {
                transition: all 0.3s ease;
            }

            .player-body {
                margin-bottom: 16px;
            }

            .waveform {
                width: 100%;
                height: 80px;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 8px;
                margin-bottom: 12px;
            }

            .progress-container {
                display: flex;
                align-items: center;
                gap: 12px;
                font-size: 12px;
                color: ${colors.textSecondary};
            }

            .time {
                min-width: 40px;
                text-align: center;
                font-family: 'Courier New', monospace;
            }

            .progress-bar-container {
                flex: 1;
                height: 4px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 2px;
                cursor: pointer;
            }

            .progress-bar {
                width: 100%;
                height: 100%;
                position: relative;
                border-radius: 2px;
                overflow: hidden;
            }

            .progress-fill {
                width: 0%;
                height: 100%;
                background: linear-gradient(90deg, ${colors.primary}, ${colors.secondary});
                border-radius: 2px;
                transition: width 0.1s linear;
            }

            .player-footer {
                display: flex;
                justify-content: flex-end;
            }

            .volume-control {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .volume-slider {
                width: 100px;
                height: 4px;
                -webkit-appearance: none;
                appearance: none;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 2px;
                outline: none;
            }

            .volume-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: ${colors.primary};
                cursor: pointer;
                box-shadow: 0 0 8px rgba(15, 255, 255, 0.5);
            }

            .volume-slider::-moz-range-thumb {
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: ${colors.primary};
                cursor: pointer;
                border: none;
                box-shadow: 0 0 8px rgba(15, 255, 255, 0.5);
            }

            @media (max-width: 480px) {
                .audio-player {
                    padding: 16px;
                }
                .player-controls {
                    gap: 8px;
                }
                .btn {
                    width: 36px;
                    height: 36px;
                }
                .btn-play-pause {
                    width: 42px;
                    height: 42px;
                }
                .volume-slider {
                    width: 80px;
                }
            }
        `;
        container.appendChild(style);
    }

    // Set up event listeners
    function setupEventListeners() {
        playPauseBtn.addEventListener('click', togglePlayPause);
        progressBar.addEventListener('click', handleProgressBarClick);
        volumeSlider.addEventListener('input', handleVolumeChange);
        window.addEventListener('resize', debounce(redrawWaveform, 100));
    }

    // Load a new track
    function loadTrack(track) {
        if (audio) {
            audio.pause();
            audio = null;
        }

        currentTrack = track;
        audio = new Audio(track.src);
        audio.volume = volumeSlider.value;

        // Update track title
        const titleEl = playPauseBtn.closest('.audio-player').querySelector('.track-title');
        if (titleEl) {
            titleEl.textContent = track.title || 'Unknown Track';
        }

        // Reset UI
        isPlaying = false;
        updatePlayPauseIcon();
        updateProgress(0);
        updateTimeDisplay(0, 0);

        // Set up audio event listeners
        audio.addEventListener('loadedmetadata', () => {
            updateTimeDisplay(0, audio.duration);
            startWaveform();
        });

        audio.addEventListener('timeupdate', () => {
            const progress = (audio.currentTime / audio.duration) * 100;
            updateProgress(progress);
            updateTimeDisplay(audio.currentTime, audio.duration);
            redrawWaveform();
        });

        audio.addEventListener('ended', () => {
            isPlaying = false;
            updatePlayPauseIcon();
            updateProgress(0);
            updateTimeDisplay(0, audio.duration);
        });

        audio.addEventListener('error', () => {
            console.error('AudioPlayer: Error loading track', track.src);
        });
    }

    // Toggle play/pause
    function togglePlayPause() {
        if (!audio) {
            console.warn('AudioPlayer: No track loaded');
            return;
        }

        if (isPlaying) {
            audio.pause();
            cancelAnimationFrame(animationId);
        } else {
            audio.play().catch(e => {
                console.error('AudioPlayer: Playback failed', e);
            });
            startWaveform();
        }
        isPlaying = !isPlaying;
        updatePlayPauseIcon();
    }

    // Update play/pause icon
    function updatePlayPauseIcon() {
        const svg = playPauseBtn.querySelector('svg');
        if (isPlaying) {
            svg.innerHTML = `
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
            `;
        } else {
            svg.innerHTML = `
                <path d="M8 5v14l11-7z"/>
            `;
        }
    }

    // Handle progress bar click
    function handleProgressBarClick(e) {
        if (!audio || !audio.duration) return;

        const rect = progressBar.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        audio.currentTime = pos * audio.duration;
        updateProgress(pos * 100);
    }

    // Update progress bar
    function updateProgress(percent) {
        const fill = progressBar.querySelector('.progress-fill');
        if (fill) {
            fill.style.width = `${percent}%`;
        }
    }

    // Update time display
    function updateTimeDisplay(current, duration) {
        const currentEl = playPauseBtn.closest('.audio-player').querySelector('.current-time');
        const durationEl = playPauseBtn.closest('.audio-player').querySelector('.duration');

        if (currentEl) {
            currentEl.textContent = formatTime(current);
        }
        if (durationEl) {
            durationEl.textContent = formatTime(duration);
        }
    }

    // Format time (seconds to MM:SS)
    function formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // Handle volume change
    function handleVolumeChange() {
        if (audio) {
            audio.volume = volumeSlider.value;
        }
    }

    // Start waveform visualization
    function startWaveform() {
        if (!audioContext || !analyser || !audio) return;

        // Disconnect previous source if any
        if (audio.source) {
            audio.source.disconnect();
        }

        audio.source = audioContext.createMediaElementSource(audio);
        audio.source.connect(analyser);
        analyser.connect(audioContext.destination);

        drawWaveform();
    }

    // Draw waveform
    function drawWaveform() {
        if (!waveformCtx || !analyser) return;

        animationId = requestAnimationFrame(drawWaveform);

        analyser.getByteFrequencyData(dataArray);

        const width = waveformCanvas.width;
        const height = waveformCanvas.height;
        const barWidth = (width / analyser.frequencyBinCount) * 2.5;

        waveformCtx.clearRect(0, 0, width, height);

        for (let i = 0; i < analyser.frequencyBinCount; i++) {
            const barHeight = (dataArray[i] / 255) * height;

            const hue = i / analyser.frequencyBinCount * 360;
            waveformCtx.fillStyle = `hsl(${hue}, 100%, 50%)`;
            waveformCtx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
        }
    }

    // Redraw waveform (for resize)
    function redrawWaveform() {
        if (!waveformCanvas) return;
        const width = waveformCanvas.clientWidth;
        const height = waveformCanvas.clientHeight;
        if (width !== waveformCanvas.width || height !== waveformCanvas.height) {
            waveformCanvas.width = width;
            waveformCanvas.height = height;
        }
    }

    // Debounce function
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // Public API
    return {
        init,
        loadTrack,
        play: () => { if (audio) audio.play().catch(console.error); isPlaying = true; updatePlayPauseIcon(); startWaveform(); },
        pause: () => { if (audio) audio.pause(); isPlaying = false; updatePlayPauseIcon(); cancelAnimationFrame(animationId); },
        setVolume: (volume) => { if (volumeSlider) volumeSlider.value = volume; if (audio) audio.volume = volume; },
        getVolume: () => volumeSlider ? parseFloat(volumeSlider.value) : 0.7,
        getCurrentTrack: () => currentTrack,
        isPlaying: () => isPlaying,
        destroy: () => {
            if (audio) {
                audio.pause();
                audio = null;
            }
            if (animationId) {
                cancelAnimationFrame(animationId);
            }
            if (audioContext) {
                audioContext.close();
            }
        }
    };
})();

module.exports = AudioPlayer;