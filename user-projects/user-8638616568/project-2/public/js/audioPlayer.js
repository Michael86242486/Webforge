const audioPlayer = (() => {
  let audioContext;
  let oscillator;
  let gainNode;
  let analyser;
  let isPlaying = false;
  let currentTrack = 0;
  let animationFrame;

  const tracks = [
    { id: 1, title: "Neon Drift", bpm: 128, duration: 184, color: "#00f3ff" },
    { id: 2, title: "Midnight Pulse", bpm: 140, duration: 203, color: "#ff00aa" },
    { id: 3, title: "Vaporwave Nights", bpm: 92, duration: 167, color: "#aa00ff" }
  ];

  function initAudio() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      gainNode = audioContext.createGain();
      gainNode.gain.value = 0.7;
      gainNode.connect(analyser);
      analyser.connect(audioContext.destination);
    }
  }

  function createWaveform(canvas) {
    const ctx = canvas.getContext("2d");
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.strokeStyle = "#00f3ff";
    ctx.lineWidth = 3;

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.beginPath();

      if (isPlaying && analyser) {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        const sliceWidth = canvas.width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 255;
          const y = (v * canvas.height) / 1.8 + canvas.height * 0.1;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          x += sliceWidth;
        }
      } else {
        const time = Date.now() / 400;
        for (let x = 0; x < canvas.width; x += 8) {
          const y = canvas.height / 2 + Math.sin(x * 0.03 + time) * 28;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      animationFrame = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(animationFrame);
  }

  function playTrack(trackIndex) {
    initAudio();
    stopTrack();

    currentTrack = trackIndex;
    const track = tracks[trackIndex];

    oscillator = audioContext.createOscillator();
    const filter = audioContext.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1800;

    oscillator.type = track.bpm > 120 ? "sawtooth" : "sine";
    oscillator.frequency.value = 110 + (track.bpm % 30);

    const lfo = audioContext.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.6;
    const lfoGain = audioContext.createGain();
    lfoGain.gain.value = 12;

    lfo.connect(lfoGain);
    lfoGain.connect(oscillator.frequency);
    lfo.start();

    oscillator.connect(filter);
    filter.connect(gainNode);

    oscillator.start();
    isPlaying = true;

    const playBtn = document.getElementById("play-btn");
    if (playBtn) playBtn.innerHTML = "⏸ PAUSE";

    document.getElementById("track-title").textContent = track.title;
    document.getElementById("track-bpm").textContent = track.bpm + " BPM";
  }

  function stopTrack() {
    if (oscillator) {
      oscillator.stop();
      oscillator = null;
    }
    isPlaying = false;
    const playBtn = document.getElementById("play-btn");
    if (playBtn) playBtn.innerHTML = "▶ PLAY";
  }

  function togglePlay() {
    if (!isPlaying) {
      playTrack(currentTrack);
    } else {
      stopTrack();
    }
  }

  function setVolume(val) {
    if (gainNode) gainNode.gain.value = val;
  }

  function initPlayer() {
    const container = document.getElementById("audio-player");
    if (!container) return;

    container.innerHTML = `
      <div class="player-header">
        <div class="track-info">
          <div id="track-title" class="track-title">Neon Drift</div>
          <div id="track-bpm" class="track-meta">128 BPM • VIBEFORGE</div>
        </div>
        <div class="track-controls">
          <button id="prev-btn" class="neon-btn">◀</button>
          <button id="play-btn" class="neon-btn play">▶ PLAY</button>
          <button id="next-btn" class="neon-btn">▶</button>
        </div>
      </div>
      <canvas id="waveform" class="waveform-canvas"></canvas>
      <div class="player-footer">
        <input type="range" id="volume" min="0" max="1" step="0.01" value="0.7">
        <div class="track-list">
          ${tracks.map((t, i) => `<div class="track-item" data-index="${i}">${t.title}</div>`).join("")}
        </div>
      </div>
    `;

    const canvas = document.getElementById("waveform");
    createWaveform(canvas);

    document.getElementById("play-btn").onclick = togglePlay;
    document.getElementById("prev-btn").onclick = () => {
      const idx = (currentTrack - 1 + tracks.length) % tracks.length;
      playTrack(idx);
    };
    document.getElementById("next-btn").onclick = () => {
      const idx = (currentTrack + 1) % tracks.length;
      playTrack(idx);
    };

    document.getElementById("volume").oninput = (e) => setVolume(parseFloat(e.target.value));

    document.querySelectorAll(".track-item").forEach((el) => {
      el.onclick = () => playTrack(parseInt(el.dataset.index));
    });

    window.addEventListener("beforeunload", stopTrack);
  }

  return { initPlayer, playTrack, togglePlay, setVolume };
})();

if (typeof window !== "undefined") {
  window.VibeForgeAudioPlayer = audioPlayer;
  document.addEventListener("DOMContentLoaded", audioPlayer.initPlayer);
}

module.exports = audioPlayer;