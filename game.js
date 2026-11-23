"use strict";

// Melody Garden: the flowers sing a tune, and you tap them back in the same
// order. Every round the tune gets one note longer.
(() => {
  const garden = document.getElementById("garden");
  const statusEl = document.getElementById("status");
  const roundEl = document.getElementById("round");
  const bestEl = document.getElementById("best");
  const menu = document.getElementById("menu");
  const muteBtn = document.getElementById("mute-btn");

  const store = {
    get(key, fallback) {
      try {
        return localStorage.getItem(key) ?? fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, String(value));
      } catch {
        // storage blocked
      }
    },
  };

  const MODES = {
    easy: {
      flowers: 4,
      notes: [261.63, 329.63, 392, 523.25],
      speed: (n) => Math.max(330, 650 - n * 25),
    },
    hard: {
      flowers: 6,
      notes: [261.63, 293.66, 329.63, 392, 440, 523.25],
      speed: (n) => Math.max(230, 480 - n * 20),
    },
  };
  const EMOJI = ["🌸", "🌻", "💐", "🌼", "🌷", "🌹"];
  const NAMES = ["pink", "yellow", "blue", "orange", "purple", "red"];
  const CHEERS = [
    "Nice!",
    "Great ear!",
    "You got it!",
    "Super!",
    "Wow!",
    "Perfect!",
  ];
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // ---------- sound ----------
  let audio = null;
  let muted = store.get("melody-garden-muted", "0") === "1";

  function tone(freq, ms, type = "triangle", volume = 0.2) {
    if (muted) return;
    try {
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
      const t = audio.currentTime;
      const d = ms / 1000;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(volume, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + d);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + d);
    } catch {
      // no audio
    }
  }

  function updateMute() {
    muteBtn.textContent = muted ? "🔇" : "🔊";
    muteBtn.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
  }
  muteBtn.addEventListener("click", () => {
    muted = !muted;
    store.set("melody-garden-muted", muted ? "1" : "0");
    updateMute();
  });

  // ---------- state ----------
  let mode = "easy";
  let sequence = [];
  let step = 0;
  let phase = "free"; // free | listen | play | over
  let buttons = [];
  let game = 0; // bumped on every new game so old timers stop

  const bestKey = () => `melody-garden-best-${mode}`;
  const best = () => Number(store.get(bestKey(), "0")) || 0;

  function setStatus(text, kind = "") {
    statusEl.textContent = text;
    statusEl.className = `status ${kind}`;
  }

  function buildGarden() {
    const { flowers } = MODES[mode];
    garden.replaceChildren();
    garden.classList.toggle("six", flowers === 6);
    buttons = Array.from({ length: flowers }, (_, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `flower f${i}`;
      b.textContent = EMOJI[i];
      b.setAttribute("aria-label", `${NAMES[i]} flower (key ${i + 1})`);
      b.addEventListener("pointerdown", (ev) => {
        ev.preventDefault(); // stop double-tap zoom and keep it snappy
        press(i);
      });
      b.addEventListener("click", (ev) => {
        // Keyboard Enter/Space. Pointer taps were handled on pointerdown.
        if (ev.detail === 0) press(i);
      });
      garden.append(b);
      return b;
    });
    roundEl.textContent = "0";
    bestEl.textContent = best();
  }

  async function light(i, ms) {
    const b = buttons[i];
    b.classList.add("lit");
    tone(MODES[mode].notes[i], ms);
    await wait(ms);
    b.classList.remove("lit");
  }

  function setLocked(locked) {
    for (const b of buttons) b.disabled = locked;
  }

  async function playSequence() {
    const id = game;
    phase = "listen";
    setLocked(true);
    setStatus("👀 Watch and listen…");
    await wait(700);
    const ms = MODES[mode].speed(sequence.length);
    for (const i of sequence) {
      if (id !== game) return;
      await light(i, ms);
      await wait(ms * 0.35);
    }
    if (id !== game) return;
    phase = "play";
    step = 0;
    setLocked(false);
    setStatus("👉 Your turn!");
  }

  function nextRound() {
    sequence.push(Math.floor(Math.random() * MODES[mode].flowers));
    roundEl.textContent = sequence.length;
    playSequence();
  }

  function startGame(newMode) {
    mode = newMode;
    game++;
    buildGarden();
    menu.hidden = true;
    sequence = [];
    nextRound();
  }

  async function press(i) {
    if (phase === "free" || phase === "over") {
      light(i, 300);
      return;
    }
    if (phase !== "play") return;
    if (i !== sequence[step]) {
      gameOver(i);
      return;
    }
    light(i, 280);
    step++;
    if (step === sequence.length) {
      phase = "listen";
      setLocked(true);
      const n = sequence.length;
      const milestone = n % 5 === 0;
      setStatus(
        milestone
          ? `🎉 ${n} notes! Amazing!`
          : CHEERS[Math.floor(Math.random() * CHEERS.length)],
        "good",
      );
      if (n > best()) {
        store.set(bestKey(), n);
        bestEl.textContent = n;
      }
      const id = game;
      await wait(milestone ? 900 : 500);
      if (milestone) {
        for (const [k, f] of [523.25, 659.25, 783.99, 1046.5].entries()) {
          setTimeout(() => tone(f, 200, "sine", 0.15), k * 110);
        }
        await wait(700);
      }
      if (id === game) nextRound();
    }
  }

  async function gameOver(pressed) {
    phase = "over";
    const id = game;
    const correct = sequence[step];
    const score = sequence.length - 1;
    tone(150, 450, "sawtooth", 0.12);
    buttons[pressed].classList.add("wrong");
    setLocked(true);
    setStatus(`Oops! It was the ${NAMES[correct]} flower.`, "bad");
    await wait(500);
    buttons[pressed].classList.remove("wrong");
    for (let k = 0; k < 3; k++) {
      if (id !== game) return;
      buttons[correct].classList.add("lit");
      await wait(250);
      buttons[correct].classList.remove("lit");
      await wait(150);
    }
    if (id !== game) return;
    setLocked(false);
    const isBest = score > 0 && score >= best();
    setStatus(
      score === 0
        ? "Let's try again! Watch closely."
        : `You remembered ${score} note${score === 1 ? "" : "s"}!${isBest ? " 🏆 Best yet!" : ""}`,
      score > 0 ? "good" : "",
    );
    menu.hidden = false;
  }

  for (const b of document.querySelectorAll(".mode")) {
    b.addEventListener("click", () => startGame(b.dataset.mode));
  }

  window.addEventListener("keydown", (ev) => {
    const n = Number(ev.key);
    if (n >= 1 && n <= buttons.length && !ev.repeat) {
      if (!buttons[n - 1].disabled) press(n - 1);
    }
  });

  updateMute();
  buildGarden();
})();
