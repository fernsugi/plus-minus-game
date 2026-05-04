(function () {
  "use strict";

  const WORLD_W = 720;
  const WORLD_H = 1280;
  const ROWS = 4;
  const COLS = 4;
  const STAGE_TIME = 10;
  const TARGET_INTRO_DURATION = 0.48;
  const TAU = Math.PI * 2;
  const SAVE_KEY = "plus-minus-save-v1";
  const SFX_KEY = "plus-minus-sfx-v1";

  const FONT_HEAVY = '"Arial Black", Impact, "Trebuchet MS", sans-serif';
  const FONT_BODY = '"Trebuchet MS", Verdana, sans-serif';

  const PALETTE = {
    ink: "#0c0f10",
    ink2: "#141817",
    panel: "#202823",
    panel2: "#2d332b",
    cream: "#fff4d7",
    muted: "#aeb9a7",
    mint: "#6dffcf",
    teal: "#1bd5c0",
    coral: "#ff5470",
    red: "#ff3355",
    gold: "#ffd166",
    orange: "#ff9f1c",
    lime: "#9eff6e",
    blue: "#68a8ff",
    violet: "#8a70ff",
    locked: "#30353a"
  };

  let nextTileId = 1;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
  }

  function choice(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  }

  function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    t = clamp(t, 0, 1);
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function formatScore(value) {
    return Math.round(value).toLocaleString("en-US");
  }

  function saveRead(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function saveWrite(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      // Storage can be unavailable in some iframes. The game remains playable.
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function fitFillText(ctx, text, x, y, maxWidth, maxSize, minSize, family, weight, align, baseline) {
    let size = maxSize;
    ctx.textAlign = align || "center";
    ctx.textBaseline = baseline || "middle";
    do {
      ctx.font = `${weight || 900} ${size}px ${family || FONT_HEAVY}`;
      if (ctx.measureText(text).width <= maxWidth || size <= minSize) break;
      size -= 2;
    } while (size > minSize);
    ctx.fillText(text, x, y);
    return size;
  }

  function strokeRoundRect(ctx, x, y, w, h, r, lineWidth, color) {
    roundRect(ctx, x, y, w, h, r);
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  class AudioBus {
    constructor() {
      const saved = saveRead(SFX_KEY, null);
      this.enabled = saved === null ? true : !!saved;
      this.ctx = null;
      this.master = null;
      this.unlocked = false;
    }

    setEnabled(enabled) {
      this.enabled = !!enabled;
      saveWrite(SFX_KEY, this.enabled);
      if (this.enabled) this.unlock();
    }

    unlock() {
      if (!this.enabled) return;
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 16;
        compressor.ratio.value = 5;
        compressor.attack.value = 0.004;
        compressor.release.value = 0.12;
        this.master.gain.value = 0.34;
        this.master.connect(compressor);
        compressor.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") {
        this.ctx.resume();
      }
      this.unlocked = true;
    }

    tone(freq, duration, type, volume, delay) {
      if (!this.enabled) return;
      this.unlock();
      if (!this.ctx || !this.master) return;
      const now = this.ctx.currentTime + (delay || 0);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume || 0.05), now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + duration + 0.025);
    }

    pluck(freq, duration, type, volume, delay, detune) {
      if (!this.enabled) return;
      this.unlock();
      if (!this.ctx || !this.master) return;
      const now = this.ctx.currentTime + (delay || 0);
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      osc.type = type || "triangle";
      osc.frequency.setValueAtTime(freq, now);
      osc.detune.setValueAtTime(detune || 0, now);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(Math.min(9000, freq * 5.5), now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(420, freq * 1.1), now + duration);
      filter.Q.value = 5.5;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume || 0.04), now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + duration + 0.035);
    }

    slide(startFreq, endFreq, duration, type, volume, delay) {
      if (!this.enabled) return;
      this.unlock();
      if (!this.ctx || !this.master) return;
      const now = this.ctx.currentTime + (delay || 0);
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type || "triangle";
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), now + duration);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume || 0.05), now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + duration + 0.03);
    }

    noise(duration, volume, delay) {
      if (!this.enabled) return;
      this.unlock();
      if (!this.ctx || !this.master) return;
      const now = this.ctx.currentTime + (delay || 0);
      const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
      }
      const source = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      filter.type = "bandpass";
      filter.frequency.value = 900;
      filter.Q.value = 1.4;
      gain.gain.setValueAtTime(volume || 0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      source.buffer = buffer;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      source.start(now);
      source.stop(now + duration);
    }

    crunch(duration, volume, delay, frequency) {
      if (!this.enabled) return;
      this.unlock();
      if (!this.ctx || !this.master) return;
      const now = this.ctx.currentTime + (delay || 0);
      const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i += 1) {
        const t = i / bufferSize;
        const stepped = Math.random() > 0.48 ? 1 : -1;
        data[i] = stepped * Math.pow(1 - t, 5) * (0.75 + Math.random() * 0.25);
      }
      const source = this.ctx.createBufferSource();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();
      filter.type = "highpass";
      filter.frequency.value = frequency || 2400;
      filter.Q.value = 0.65;
      gain.gain.setValueAtTime(volume || 0.025, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      source.buffer = buffer;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      source.start(now);
      source.stop(now + duration);
    }

    tap(value, combo, op) {
      const ladder = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27, 29, 31, 34, 36];
      const step = ladder[Math.min(combo - 1, ladder.length - 1)];
      const base = op === "+" ? 250 : 210;
      const valueLift = value * (op === "+" ? 12 : 9);
      const root = (base + valueLift) * Math.pow(2, step / 12);
      const snap = Math.min(combo, 16) / 16;
      if (op === "+") {
        this.pluck(root, 0.105, "square", 0.032 + snap * 0.012, 0, -5);
        this.pluck(root * 2.01, 0.075, "triangle", 0.022 + snap * 0.01, 0.014, 7);
        this.crunch(0.035, 0.018 + snap * 0.016, 0, 2500 + combo * 170);
        if (combo >= 4) this.pluck(root * 1.5, 0.065, "sine", 0.016 + snap * 0.01, 0.046, 0);
        if (combo >= 8) this.pluck(root * 2.52, 0.09, "triangle", 0.018 + snap * 0.012, 0.075, 0);
      } else {
        this.slide(root * 1.45, Math.max(80, root * 0.72), 0.09, "sawtooth", 0.025 + snap * 0.01);
        this.pluck(root * 0.75, 0.075, "triangle", 0.024 + snap * 0.01, 0.018, -9);
        this.crunch(0.04, 0.02 + snap * 0.014, 0.004, 1800 + combo * 135);
        if (combo >= 6) this.pluck(root * 1.88, 0.06, "sine", 0.014 + snap * 0.008, 0.055, 0);
      }
    }

    start() {
      this.tone(220, 0.08, "triangle", 0.04);
      this.tone(330, 0.08, "triangle", 0.04, 0.07);
      this.tone(495, 0.12, "triangle", 0.045, 0.14);
    }

    match() {
      this.tone(540, 0.08, "sine", 0.045);
      this.tone(810, 0.1, "triangle", 0.05, 0.055);
    }

    success(perfect) {
      const base = perfect ? 500 : 420;
      this.tone(base, 0.09, "triangle", 0.055);
      this.tone(base * 1.25, 0.09, "triangle", 0.055, 0.07);
      this.tone(base * 1.5, 0.13, "triangle", 0.06, 0.14);
      if (perfect) {
        this.tone(base * 2, 0.2, "sine", 0.07, 0.22);
        this.noise(0.2, 0.045, 0.05);
      }
    }

    fail() {
      this.slide(240, 90, 0.24, "sawtooth", 0.07);
      this.noise(0.18, 0.08, 0.02);
    }

    refresh() {
      this.slide(240, 720, 0.22, "triangle", 0.055);
      this.tone(920, 0.08, "sine", 0.04, 0.1);
      this.noise(0.16, 0.035);
    }

    reward() {
      this.tone(760, 0.08, "sine", 0.05);
      this.tone(1140, 0.12, "sine", 0.045, 0.08);
    }

    gameOver() {
      this.slide(300, 120, 0.26, "triangle", 0.06);
      this.tone(100, 0.2, "sine", 0.05, 0.16);
    }
  }

  class PlusMinusGame {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha: false });
      this.audio = new AudioBus();
      this.viewport = { w: 1, h: 1, dpr: 1, scale: 1, x: 0, y: 0 };
      this.worldBackgroundCanvas = null;
      this.hotspots = [];
      this.particles = [];
      this.floatTexts = [];
      this.rings = [];
      this.buttonPulse = new Map();
      this.pointer = { x: -999, y: -999, down: false };
      this.time = 0;
      this.lastFrame = 0;
      this.shake = 0;
      this.flash = null;
      this.screen = "menu";
      this.returnScreen = "menu";
      this.screenStack = [];
      this.records = saveRead(SAVE_KEY, { highScore: 0, highStage: 1 });
      this.board = [];
      this.result = null;
      this.resetRunState();
      this.resize();
      this.bind();
      window.PLUS_MINUS_GAME = this;
      requestAnimationFrame((t) => this.loop(t));
    }

    resetRunState() {
      this.score = 0;
      this.stage = 1;
      this.maxRunStage = 1;
      this.lives = 2;
      this.target = 1;
      this.targetPrevious = 1;
      this.targetIntro = 0;
      this.total = 0;
      this.combo = 0;
      this.timeLeft = STAGE_TIME;
      this.timerStarted = false;
      this.refreshAvailable = true;
      this.requiredRemaining = 0;
      this.tappedLifeReward = false;
      this.tappedRefreshReward = false;
      this.resolving = false;
      this.resolveTimer = 0;
      this.pendingGameOver = false;
      this.stageMessage = "PLAN YOUR ROUTE";
      this.lastMatchState = false;
      this.runStartHighScore = this.records.highScore || 0;
      this.runStartHighStage = this.records.highStage || 1;
      this.newHighScore = false;
      this.newHighStage = false;
      this.solutionPath = [];
    }

    bind() {
      window.addEventListener("resize", () => this.resize());
      window.addEventListener("orientationchange", () => setTimeout(() => this.resize(), 120));
      window.addEventListener("contextmenu", (event) => event.preventDefault());

      const down = (event) => {
        event.preventDefault();
        this.audio.unlock();
        const point = this.toWorld(event.clientX, event.clientY);
        this.pointer.x = point.x;
        this.pointer.y = point.y;
        this.pointer.down = true;
        this.handlePress(point.x, point.y);
      };
      const move = (event) => {
        const point = this.toWorld(event.clientX, event.clientY);
        this.pointer.x = point.x;
        this.pointer.y = point.y;
      };
      const up = () => {
        this.pointer.down = false;
      };
      this.canvas.addEventListener("pointerdown", down, { passive: false });
      this.canvas.addEventListener("pointermove", move, { passive: false });
      this.canvas.addEventListener("pointerup", up, { passive: false });
      this.canvas.addEventListener("pointercancel", up, { passive: false });

      window.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          if (this.screen === "playing") this.openSettings("playing");
          else if (this.screen === "settings" || this.screen === "how") this.goBack();
        }
      });
    }

    resize() {
      const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      const w = Math.max(1, window.innerWidth || document.documentElement.clientWidth || WORLD_W);
      const h = Math.max(1, window.innerHeight || document.documentElement.clientHeight || WORLD_H);
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
      const scale = Math.min(w / WORLD_W, h / WORLD_H);
      this.viewport = {
        w,
        h,
        dpr,
        scale,
        x: (w - WORLD_W * scale) / 2,
        y: (h - WORLD_H * scale) / 2
      };
    }

    toWorld(clientX, clientY) {
      return {
        x: (clientX - this.viewport.x) / this.viewport.scale,
        y: (clientY - this.viewport.y) / this.viewport.scale
      };
    }

    loop(timestamp) {
      const now = timestamp / 1000;
      const dt = this.lastFrame ? Math.min(0.05, now - this.lastFrame) : 0;
      this.lastFrame = now;
      this.time += dt;
      this.update(dt);
      this.draw();
      requestAnimationFrame((t) => this.loop(t));
    }

    update(dt) {
      const tileLerp = 1 - Math.exp(-dt * 13);
      for (const tile of this.board) {
        tile.visualRow = lerp(tile.visualRow, tile.row, tileLerp);
        tile.visualCol = lerp(tile.visualCol, tile.col, tileLerp);
        tile.scale = lerp(tile.scale, tile.selected ? 0.9 : 1, 1 - Math.exp(-dt * 12));
        tile.pulse = Math.max(0, tile.pulse - dt);
        tile.glow = Math.max(0, tile.glow - dt * 1.8);
      }
      this.targetIntro = Math.max(0, this.targetIntro - dt);

      for (const [key, value] of this.buttonPulse) {
        const next = value - dt * 5;
        if (next <= 0) this.buttonPulse.delete(key);
        else this.buttonPulse.set(key, next);
      }

      this.updateEffects(dt);

      if (this.screen === "playing" && !this.resolving) {
        if (this.timerStarted) {
          this.timeLeft -= dt;
          if (this.timeLeft <= 0) {
            this.timeLeft = 0;
            this.resolveStage("time");
          }
        }
      }

      if (this.screen === "playing" && this.resolving) {
        this.resolveTimer -= dt;
        if (this.resolveTimer <= 0) {
          if (this.pendingGameOver) {
            this.showGameOver();
          } else {
            this.settleBoardVisuals();
            this.prepareStage({ keepTarget: false });
          }
        }
      }
    }

    updateEffects(dt) {
      this.shake = Math.max(0, this.shake - dt * 18);
      if (this.flash) {
        this.flash.life -= dt;
        if (this.flash.life <= 0) this.flash = null;
      }

      const updateList = (list) => {
        for (let i = list.length - 1; i >= 0; i -= 1) {
          const item = list[i];
          item.life -= dt;
          item.x += item.vx * dt;
          item.y += item.vy * dt;
          item.vx *= Math.pow(item.drag || 0.98, dt * 60);
          item.vy *= Math.pow(item.drag || 0.98, dt * 60);
          item.vy += (item.gravity || 0) * dt;
          item.spin = (item.spin || 0) + (item.spinSpeed || 0) * dt;
          if (item.life <= 0) list.splice(i, 1);
        }
      };
      updateList(this.particles);
      updateList(this.floatTexts);
      updateList(this.rings);
    }

    handlePress(x, y) {
      for (let i = this.hotspots.length - 1; i >= 0; i -= 1) {
        const spot = this.hotspots[i];
        if (spot.disabled) continue;
        if (x >= spot.x && x <= spot.x + spot.w && y >= spot.y && y <= spot.y + spot.h) {
          if (spot.id) this.buttonPulse.set(spot.id, 1);
          spot.onPress();
          return;
        }
      }
    }

    addHotspot(id, x, y, w, h, onPress, disabled) {
      this.hotspots.push({ id, x, y, w, h, onPress, disabled: !!disabled });
    }

    startRun() {
      this.audio.start();
      this.resetRunState();
      this.createFreshBoard(true);
      this.screen = "playing";
      this.prepareStage({ keepTarget: false, first: true });
      this.flashScreen(PALETTE.mint, 0.2, 0.18);
      this.stageMessage = "PLAN FIRST, TAP FAST";
    }

    createFreshBoard(dropIn) {
      this.board = [];
      for (let row = 0; row < ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
          this.board.push(this.makeTile(row, col, {
            visualRow: dropIn ? row - ROWS - rand(0, 1.5) : row,
            visualCol: col,
            value: randInt(1, 9)
          }));
        }
      }
    }

    settleBoardVisuals() {
      for (const tile of this.board) {
        tile.visualRow = tile.row;
        tile.visualCol = tile.col;
        tile.scale = 1;
        tile.pulse = 0;
        tile.glow = 0;
      }
    }

    makeTile(row, col, options) {
      const opts = options || {};
      return {
        id: nextTileId++,
        row,
        col,
        visualRow: opts.visualRow === undefined ? row : opts.visualRow,
        visualCol: opts.visualCol === undefined ? col : opts.visualCol,
        value: opts.value || randInt(1, 9),
        locked: !!opts.locked,
        required: false,
        reward: null,
        selected: false,
        pulse: rand(0, 0.25),
        glow: 0,
        scale: 1
      };
    }

    prepareStage(options) {
      const opts = options || {};
      const previousTarget = this.target;
      this.total = 0;
      this.combo = 0;
      this.timeLeft = STAGE_TIME;
      this.timerStarted = false;
      this.tappedLifeReward = false;
      this.tappedRefreshReward = false;
      this.resolving = false;
      this.resolveTimer = 0;
      this.pendingGameOver = false;
      this.result = null;
      this.lastMatchState = false;
      this.stageMessage = "PLAN YOUR ROUTE";

      for (const tile of this.board) {
        tile.selected = false;
        tile.required = false;
        tile.glow = 0;
      }

      if (!opts.keepTarget) this.target = randInt(1, 9);

      if (!opts.skipLocks) this.injectLocksForStage();
      this.maybePlaceRewards();

      if (opts.first || this.stage === 1) {
        for (const tile of this.board) {
          tile.locked = false;
          tile.required = false;
          tile.reward = null;
        }
        this.target = randInt(1, 9);
        const openingTile = choice(this.board);
        openingTile.value = this.target;
        openingTile.glow = 1;
        this.requiredRemaining = 0;
        this.solutionPath = [openingTile.id];
        this.animateTargetChange(previousTarget);
        return;
      }

      let solution = null;
      for (let attempt = 0; attempt < 80; attempt += 1) {
        for (const tile of this.board) tile.required = false;
        if (!opts.keepTarget && attempt > 0 && attempt % 5 === 0) {
          this.target = randInt(1, 9);
        }
        if (!opts.skipRequired) this.assignRequiredTiles();
        solution = this.findSolution();
        if (solution) break;
        if (attempt % 2 === 1) this.randomizeUnlockedValues(5);
      }

      if (!solution) {
        this.forceBasicSolution();
        solution = this.findSolution();
      }

      this.requiredRemaining = this.board.filter((tile) => tile.required && !tile.selected).length;
      this.solutionPath = solution || [];
      this.animateTargetChange(previousTarget);
    }

    animateTargetChange(previousTarget) {
      if (previousTarget !== this.target) {
        this.targetPrevious = previousTarget;
        this.targetIntro = TARGET_INTRO_DURATION;
        this.spawnRing(194, 220, PALETTE.gold, 72, 0.42, 7);
      } else {
        this.targetPrevious = this.target;
        this.targetIntro = 0;
      }
    }

    currentLockedPressure() {
      const stage = this.stage;
      if (stage < 3) return 0;
      let count = 1;
      if (stage >= 6) count = 2;
      if (stage >= 9) count = 3;
      if (stage >= 12) count = 4;

      let active = stage % 3 === 0;
      if (stage >= 17) active = stage !== 18 && stage !== 20;
      if (stage >= 21) active = true;
      return active ? count : 0;
    }

    injectLocksForStage() {
      const targetLocks = this.currentLockedPressure();
      if (targetLocks <= 0) return;
      const currentLocks = this.board.filter((tile) => tile.locked).length;
      const amount = clamp(targetLocks - currentLocks, 0, 4);
      if (amount <= 0) return;
      const eligible = shuffle(this.board.filter((tile) => (
        !tile.locked &&
        !tile.selected &&
        tile.row <= 1 &&
        !tile.reward
      )));
      for (let i = 0; i < amount && i < eligible.length; i += 1) {
        eligible[i].locked = true;
        eligible[i].required = false;
        eligible[i].reward = null;
        eligible[i].glow = 0.9;
      }
    }

    requiredTargetCount() {
      if (this.stage < 2) return 0;
      const active = this.stage >= 18 || this.stage % 2 === 0;
      if (!active) return 0;
      return Math.min(8, Math.floor(this.stage / 2));
    }

    assignRequiredTiles() {
      const desired = this.requiredTargetCount();
      if (desired <= 0) return;
      const eligible = shuffle(this.board.filter((tile) => (
        !tile.locked &&
        !tile.selected &&
        !tile.reward
      )));
      const count = Math.min(desired, Math.max(0, eligible.length - 1));
      for (let i = 0; i < count; i += 1) {
        eligible[i].required = true;
        eligible[i].glow = Math.max(eligible[i].glow, 0.75);
      }
    }

    maybePlaceRewards() {
      if (this.stage <= 1) return;
      const hasLife = this.board.some((tile) => tile.reward === "life");
      const hasRefresh = this.board.some((tile) => tile.reward === "refresh");
      const eligible = () => this.board.filter((tile) => (
        !tile.locked &&
        !tile.selected &&
        !tile.required &&
        !tile.reward
      ));
      if (!hasLife && Math.random() < 0.04) {
        const list = eligible();
        if (list.length) {
          const tile = choice(list);
          tile.reward = "life";
          tile.glow = 1;
        }
      }
      if (!this.refreshAvailable && !hasRefresh && Math.random() < 0.04) {
        const list = eligible();
        if (list.length) {
          const tile = choice(list);
          tile.reward = "refresh";
          tile.glow = 1;
        }
      }
    }

    randomizeUnlockedValues(count) {
      const list = shuffle(this.board.filter((tile) => !tile.locked));
      for (let i = 0; i < Math.min(count, list.length); i += 1) {
        list[i].value = randInt(1, 9);
        list[i].glow = 0.4;
      }
    }

    forceBasicSolution() {
      for (const tile of this.board) {
        tile.required = false;
        if (!tile.locked) tile.value = randInt(1, 9);
      }
      const selectable = this.board.filter((tile) => !tile.locked);
      if (selectable.length === 0) {
        const tile = this.board[0];
        tile.locked = false;
        tile.value = this.target;
        return;
      }
      const tile = choice(selectable);
      tile.value = this.target;
      tile.glow = 1;
    }

    selectableTiles() {
      return this.board.filter((tile) => !tile.locked);
    }

    findSolution() {
      const tiles = this.selectableTiles();
      const n = tiles.length;
      if (n === 0) return null;
      const requiredIds = new Set(this.board.filter((tile) => tile.required).map((tile) => tile.id));
      let requiredMask = 0;
      for (let i = 0; i < n; i += 1) {
        if (requiredIds.has(tiles[i].id)) requiredMask |= (1 << i);
      }

      const queue = [{ mask: 0, total: 0, path: [] }];
      const visited = new Set(["0|0"]);
      let index = 0;
      while (index < queue.length && queue.length < 220000) {
        const state = queue[index];
        index += 1;
        for (let i = 0; i < n; i += 1) {
          if (state.mask & (1 << i)) continue;
          const tile = tiles[i];
          const nextTotal = state.total <= this.target ? state.total + tile.value : state.total - tile.value;
          if (nextTotal < -150 || nextTotal > 170) continue;
          const nextMask = state.mask | (1 << i);
          const nextPath = state.path.concat(tile.id);
          if (nextTotal === this.target && (nextMask & requiredMask) === requiredMask) {
            return nextPath;
          }
          const key = `${nextMask}|${nextTotal}`;
          if (!visited.has(key)) {
            visited.add(key);
            queue.push({ mask: nextMask, total: nextTotal, path: nextPath });
          }
        }
      }
      return null;
    }

    useRefresh() {
      if (this.screen !== "playing" || this.resolving || this.timerStarted || !this.refreshAvailable) return;
      this.refreshAvailable = false;
      this.createFreshBoard(true);
      this.prepareStage({ keepTarget: true, skipLocks: true, skipRequired: true });
      this.stageMessage = "BOARD REFRESHED";
      this.audio.refresh();
      this.vibrate(18);
      this.shake = Math.max(this.shake, 5);
      this.flashScreen(PALETTE.blue, 0.2, 0.25);
      for (let i = 0; i < 52; i += 1) {
        this.spawnParticle(rand(80, 640), rand(390, 990), rand(-180, 180), rand(-260, 220), choice([PALETTE.blue, PALETTE.mint, PALETTE.cream]), rand(3, 9), 0.55, 0);
      }
    }

    tapTile(tile) {
      if (this.screen !== "playing" || this.resolving) return;
      if (!tile || tile.locked || tile.selected) return;

      if (!this.timerStarted) {
        this.timerStarted = true;
        this.timeLeft = STAGE_TIME;
        this.stageMessage = "BOUNCE THE TOTAL";
      }

      const wasMatch = this.total === this.target && this.requiredRemaining === 0;
      const op = this.total <= this.target ? "+" : "-";
      const before = this.total;
      this.total = op === "+" ? this.total + tile.value : this.total - tile.value;
      tile.selected = true;
      tile.pulse = 0.22;
      tile.glow = 1.1;
      this.combo += 1;
      if (tile.required) this.requiredRemaining = Math.max(0, this.requiredRemaining - 1);
      if (tile.reward === "life") this.tappedLifeReward = true;
      if (tile.reward === "refresh") this.tappedRefreshReward = true;

      const center = this.tileCenter(tile);
      this.audio.tap(tile.value, this.combo, op);
      this.vibrate(this.combo >= 8 ? 18 : 8);
      this.shake = Math.max(this.shake, this.combo >= 8 ? 4.8 : 2.4);
      this.spawnTapEffects(center.x, center.y, tile, op, before, this.total);

      const isMatch = this.total === this.target && this.requiredRemaining === 0;
      if (isMatch && !wasMatch) {
        this.audio.match();
        this.stageMessage = "TARGET MATCHED";
        this.spawnMatchEffects();
      } else if (this.total === this.target && this.requiredRemaining > 0) {
        this.stageMessage = `${this.requiredRemaining} REQUIRED LEFT`;
      } else {
        this.stageMessage = this.total > this.target ? "NEXT TAP SUBTRACTS" : "NEXT TAP ADDS";
      }

      if (this.selectableTiles().every((candidate) => candidate.selected)) {
        this.resolveStage("clear");
      }
    }

    resolveStage(reason) {
      if (this.resolving) return;
      const combo = this.combo;
      const selectableCount = this.selectableTiles().length;
      const missingRequired = this.requiredRemaining > 0;
      const success = combo > 0 && this.total === this.target && !missingRequired;
      const perfect = success && combo === selectableCount;
      const points = success ? Math.pow(2, combo) : 0;
      const lifeReward = success && this.tappedLifeReward;
      const refreshReward = success && this.tappedRefreshReward;
      const finalStage = this.stage;

      this.result = {
        reason,
        success,
        perfect,
        points,
        combo,
        lifeReward,
        refreshReward,
        missingRequired,
        finalStage
      };

      if (success) {
        this.score += points;
        if (lifeReward) this.lives += 1;
        if (refreshReward) this.refreshAvailable = true;
        this.stage += 1;
        this.maxRunStage = Math.max(this.maxRunStage, this.stage);
        this.audio.success(perfect);
        this.flashScreen(perfect ? PALETTE.gold : PALETTE.mint, perfect ? 0.32 : 0.2, 0.35);
        this.shake = Math.max(this.shake, perfect ? 14 : 7);
        this.spawnSuccessEffects(perfect, points);
        this.stageMessage = perfect ? "PERFECT CLEAR" : "NICE";
      } else {
        this.lives -= 1;
        this.audio.fail();
        this.vibrate([20, 30, 40]);
        this.flashScreen(PALETTE.red, 0.48, 0.38);
        this.shake = Math.max(this.shake, 16);
        this.spawnFailureEffects(missingRequired);
        this.stageMessage = missingRequired ? "REQUIRED MISSED" : "TARGET MISSED";
        if (this.lives <= 0) this.pendingGameOver = true;
      }

      this.collapseBoard();
      this.resolving = true;
      this.resolveTimer = success ? (perfect ? 1.45 : 1.1) : 1.05;
    }

    collapseBoard() {
      const next = [];
      const brokenLocks = [];
      for (let col = 0; col < COLS; col += 1) {
        const original = this.board
          .filter((tile) => tile.col === col)
          .sort((a, b) => a.row - b.row);
        const survivors = original.filter((tile) => !tile.selected);
        while (survivors.length && survivors[survivors.length - 1].locked) {
          brokenLocks.push({ tile: survivors.pop(), col });
        }
        const missing = ROWS - survivors.length;
        for (let row = 0; row < missing; row += 1) {
          next.push(this.makeTile(row, col, {
            visualRow: row - missing - rand(0.5, 1.4),
            visualCol: col,
            value: randInt(1, 9)
          }));
        }
        for (let i = 0; i < survivors.length; i += 1) {
          const tile = survivors[i];
          tile.row = missing + i;
          tile.col = col;
          tile.selected = false;
          tile.required = false;
          next.push(tile);
        }
      }
      this.board = next;
      for (const broken of brokenLocks) {
        const layout = this.tileLayout();
        const x = layout.x + broken.col * (layout.size + layout.gap) + layout.size / 2;
        const y = layout.y + (ROWS - 1) * (layout.size + layout.gap) + layout.size / 2;
        this.spawnLockBreakEffects(x, y);
      }
      if (brokenLocks.length) {
        this.audio.crunch(0.09, 0.052, 0, 1200);
        this.shake = Math.max(this.shake, 8);
      }
    }

    spawnLockBreakEffects(x, y) {
      this.spawnRing(x, y, PALETTE.cream, 54, 0.42, 9);
      for (let i = 0; i < 34; i += 1) {
        const angle = rand(Math.PI, TAU);
        const speed = rand(120, 430);
        this.spawnParticle(
          x,
          y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed - rand(60, 180),
          choice([PALETTE.cream, PALETTE.blue, "#8b969b", "#c3ccd0"]),
          rand(4, 11),
          rand(0.42, 0.9),
          420
        );
      }
    }

    showGameOver() {
      this.pendingGameOver = false;
      this.resolving = false;
      this.newHighScore = this.score > this.runStartHighScore;
      this.newHighStage = this.maxRunStage > this.runStartHighStage;
      if (this.newHighScore || this.newHighStage) {
        this.records.highScore = Math.max(this.records.highScore || 0, this.score);
        this.records.highStage = Math.max(this.records.highStage || 1, this.maxRunStage);
        saveWrite(SAVE_KEY, this.records);
      }
      this.screen = "gameover";
      this.audio.gameOver();
      this.flashScreen(PALETTE.coral, 0.26, 0.45);
    }

    openHow(returnScreen) {
      this.screenStack.push(returnScreen || this.screen || "menu");
      this.screen = "how";
    }

    openSettings(returnScreen) {
      this.screenStack.push(returnScreen || this.screen || "menu");
      this.screen = "settings";
    }

    goBack() {
      this.screen = this.screenStack.pop() || "menu";
    }

    goMenu() {
      this.screen = "menu";
      this.screenStack = [];
      this.resolving = false;
      this.pendingGameOver = false;
      this.result = null;
    }

    vibrate(pattern) {
      if (navigator.vibrate) {
        try {
          navigator.vibrate(pattern);
        } catch (err) {
          // Ignore unsupported vibration patterns.
        }
      }
    }

    tileLayout() {
      const size = 142;
      const gap = 12;
      return {
        x: 58,
        y: 408,
        size,
        gap,
        full: size * COLS + gap * (COLS - 1)
      };
    }

    tileCenter(tile) {
      const layout = this.tileLayout();
      return {
        x: layout.x + tile.visualCol * (layout.size + layout.gap) + layout.size / 2,
        y: layout.y + tile.visualRow * (layout.size + layout.gap) + layout.size / 2
      };
    }

    spawnParticle(x, y, vx, vy, color, size, life, gravity) {
      this.particles.push({
        x,
        y,
        vx,
        vy,
        color,
        size,
        life,
        maxLife: life,
        gravity: gravity || 180,
        drag: 0.985,
        spin: rand(0, TAU),
        spinSpeed: rand(-8, 8)
      });
    }

    spawnText(text, x, y, color, size, life, vx, vy) {
      this.floatTexts.push({
        text,
        x,
        y,
        vx: vx || rand(-20, 20),
        vy: vy || -90,
        color,
        size,
        life,
        maxLife: life,
        gravity: -20,
        drag: 0.98
      });
    }

    spawnRing(x, y, color, radius, life, lineWidth) {
      this.rings.push({
        x,
        y,
        vx: 0,
        vy: 0,
        color,
        size: radius,
        life,
        maxLife: life,
        lineWidth: lineWidth || 8,
        drag: 1,
        gravity: 0
      });
    }

    flashScreen(color, alpha, duration) {
      this.flash = { color, alpha, life: duration, maxLife: duration };
    }

    spawnTapEffects(x, y, tile, op, before, after) {
      const color = op === "+" ? PALETTE.mint : PALETTE.coral;
      const alt = tile.required ? PALETTE.gold : tile.reward ? PALETTE.lime : PALETTE.cream;
      const count = clamp(12 + this.combo * 2, 14, 44);
      for (let i = 0; i < count; i += 1) {
        const angle = rand(0, TAU);
        const speed = rand(80, 330 + this.combo * 15);
        this.spawnParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, choice([color, alt, PALETTE.blue]), rand(3, 8), rand(0.28, 0.62), 360);
      }
      this.spawnRing(x, y, color, 18 + this.combo * 2, 0.34, 6);
      this.spawnText(`${op}${tile.value}`, x, y - 26, color, 32 + Math.min(this.combo * 2, 22), 0.55, rand(-35, 35), -120);
      if (this.combo >= 4) {
        this.spawnText(`${this.combo}x`, x, y + 34, PALETTE.gold, 26 + Math.min(this.combo, 12), 0.55, rand(-25, 25), -70);
      }
      if (tile.reward) {
        this.spawnText(tile.reward === "life" ? "LIFE" : "REFRESH", x, y - 58, PALETTE.lime, 26, 0.8, 0, -130);
        this.audio.reward();
      }
      if (Math.abs(after - before) >= 7) {
        this.spawnRing(x, y, PALETTE.orange, 38, 0.42, 10);
      }
    }

    spawnMatchEffects() {
      this.spawnRing(360, 208, PALETTE.gold, 84, 0.55, 12);
      this.spawnRing(360, 208, PALETTE.mint, 132, 0.68, 7);
      this.spawnText("MATCH", 360, 324, PALETTE.gold, 38, 0.8, 0, -90);
      for (let i = 0; i < 48; i += 1) {
        const angle = rand(0, TAU);
        const speed = rand(120, 420);
        this.spawnParticle(360, 220, Math.cos(angle) * speed, Math.sin(angle) * speed, choice([PALETTE.gold, PALETTE.mint, PALETTE.cream]), rand(3, 8), rand(0.35, 0.85), 160);
      }
    }

    spawnSuccessEffects(perfect, points) {
      const count = perfect ? 140 : 72;
      for (let i = 0; i < count; i += 1) {
        const x = rand(60, 660);
        const y = perfect ? rand(100, 1020) : rand(360, 1020);
        const angle = rand(-Math.PI, 0);
        const speed = rand(140, perfect ? 560 : 360);
        this.spawnParticle(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, choice([PALETTE.gold, PALETTE.mint, PALETTE.coral, PALETTE.blue, PALETTE.lime]), rand(4, perfect ? 12 : 9), rand(0.55, 1.25), 330);
      }
      this.spawnText(`+${formatScore(points)}`, 360, 260, perfect ? PALETTE.gold : PALETTE.mint, perfect ? 62 : 52, 1.1, 0, -120);
      this.spawnRing(360, 710, perfect ? PALETTE.gold : PALETTE.mint, perfect ? 240 : 150, 0.7, perfect ? 18 : 12);
    }

    spawnFailureEffects(missingRequired) {
      for (let i = 0; i < 54; i += 1) {
        this.spawnParticle(rand(80, 640), rand(360, 1000), rand(-220, 220), rand(-80, 320), choice([PALETTE.red, PALETTE.coral, PALETTE.orange]), rand(3, 10), rand(0.35, 0.8), 200);
      }
      this.spawnText(missingRequired ? "REQUIRED" : "MISS", 360, 300, PALETTE.red, 58, 0.9, 0, -80);
    }

    draw() {
      const ctx = this.ctx;
      const vp = this.viewport;
      ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
      ctx.clearRect(0, 0, vp.w, vp.h);
      this.drawOuterBackground(ctx);

      ctx.save();
      ctx.translate(vp.x, vp.y);
      ctx.scale(vp.scale, vp.scale);
      const shakeX = this.shake > 0 ? rand(-this.shake, this.shake) : 0;
      const shakeY = this.shake > 0 ? rand(-this.shake, this.shake) : 0;
      ctx.translate(shakeX, shakeY);

      this.hotspots = [];
      this.drawWorldBackground(ctx);
      if (this.screen === "menu") this.drawMenu(ctx);
      if (this.screen === "playing") this.drawGame(ctx);
      if (this.screen === "gameover") this.drawGameOver(ctx);
      if (this.screen === "how") this.drawHow(ctx);
      if (this.screen === "settings") this.drawSettings(ctx);
      this.drawEffects(ctx);
      this.drawFlash(ctx);
      ctx.restore();
    }

    drawOuterBackground(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, this.viewport.h);
      g.addColorStop(0, "#0a0d0e");
      g.addColorStop(0.6, "#111615");
      g.addColorStop(1, "#0d0b0a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.viewport.w, this.viewport.h);
    }

    drawWorldBackground(ctx) {
      const background = this.worldBackgroundCanvas || this.renderWorldBackground();
      if (background) {
        ctx.drawImage(background, 0, 0);
        return;
      }
      this.paintWorldBackground(ctx);
    }

    renderWorldBackground() {
      const background = document.createElement("canvas");
      background.width = WORLD_W;
      background.height = WORLD_H;
      const ctx = background.getContext("2d", { alpha: false });
      if (!ctx) return null;
      this.paintWorldBackground(ctx);
      this.worldBackgroundCanvas = background;
      return background;
    }

    paintWorldBackground(ctx) {
      const g = ctx.createLinearGradient(0, 0, 0, WORLD_H);
      g.addColorStop(0, "#0c1010");
      g.addColorStop(0.48, "#151918");
      g.addColorStop(1, "#130f0d");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);

      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.lineWidth = 2;
      for (let i = -8; i < 20; i += 1) {
        const x = i * 58 + 29;
        ctx.strokeStyle = i % 2 === 0 ? PALETTE.mint : PALETTE.coral;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x - 420, WORLD_H);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.08;
      for (let i = 0; i < 18; i += 1) {
        const x = (i * 73 + Math.sin(i * 0.7) * 22) % WORLD_W;
        const y = (i * 131) % WORLD_H;
        ctx.fillStyle = i % 2 ? PALETTE.gold : PALETTE.teal;
        ctx.font = `900 ${36 + (i % 3) * 12}px ${FONT_HEAVY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(i % 2 ? "+" : "-", x, y);
      }
      ctx.restore();

      const vignette = ctx.createRadialGradient(360, 620, 120, 360, 620, 760);
      vignette.addColorStop(0, "rgba(255,255,255,0)");
      vignette.addColorStop(1, "rgba(0,0,0,0.46)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    }

    drawMenu(ctx) {
      this.drawGameLogo(ctx, 178, 1);
      this.drawSmallPill(ctx, 126, 312, 468, 48, "TAP TILES. HIT THE EXACT TARGET.", PALETTE.cream, PALETTE.panel);

      this.drawRecordBox(ctx, 72, 402, 270, 140, "HIGH SCORE", formatScore(this.records.highScore || 0), PALETTE.gold);
      this.drawRecordBox(ctx, 378, 402, 270, 140, "HIGH STAGE", String(this.records.highStage || 1), PALETTE.mint);

      this.drawActionButton(ctx, "start", 112, 635, 496, 108, "START RUN", PALETTE.gold, () => this.startRun(), false, "play");
      this.drawActionButton(ctx, "how", 112, 772, 238, 82, "HOW", PALETTE.mint, () => this.openHow("menu"), false, "info");
      this.drawActionButton(ctx, "settings", 370, 772, 238, 82, "SFX", PALETTE.blue, () => this.openSettings("menu"), false, "sound");

      this.drawArcadeStrip(ctx, 78, 920, 564, 178);
      ctx.fillStyle = PALETTE.cream;
      ctx.globalAlpha = 0.92;
      fitFillText(ctx, "RISK ONE MORE TAP FOR EXPONENTIAL SCORE", 360, 1158, 610, 25, 16, FONT_BODY, 900);
      ctx.globalAlpha = 1;
    }

    drawGameLogo(ctx, y, scale) {
      ctx.save();
      ctx.translate(360, y);
      ctx.scale(scale, scale);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.shadowBlur = 18;
      ctx.shadowColor = "rgba(109,255,207,0.32)";
      ctx.fillStyle = PALETTE.mint;
      ctx.font = `900 86px ${FONT_HEAVY}`;
      ctx.fillText("PLUS", -104, 0);
      ctx.shadowColor = "rgba(255,84,112,0.32)";
      ctx.fillStyle = PALETTE.coral;
      ctx.fillText("MINUS", 120, 86);
      ctx.shadowBlur = 0;
      ctx.lineWidth = 8;
      ctx.strokeStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.moveTo(-46, 43);
      ctx.lineTo(40, 43);
      ctx.stroke();
      ctx.fillStyle = PALETTE.cream;
      ctx.font = `900 56px ${FONT_HEAVY}`;
      ctx.fillText("+", -255, 0);
      ctx.fillText("-", 292, 86);
      ctx.restore();
    }

    drawRecordBox(ctx, x, y, w, h, label, value, color) {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.30)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 5;
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, "#27302b");
      g.addColorStop(1, "#171c19");
      ctx.fillStyle = g;
      roundRect(ctx, x, y, w, h, 18);
      ctx.fill();
      ctx.shadowBlur = 0;
      strokeRoundRect(ctx, x + 2, y + 2, w - 4, h - 4, 16, 3, color);
      ctx.fillStyle = PALETTE.muted;
      fitFillText(ctx, label, x + w / 2, y + 36, w - 34, 22, 14, FONT_BODY, 900);
      ctx.fillStyle = color;
      fitFillText(ctx, value, x + w / 2, y + 92, w - 30, 46, 22, FONT_HEAVY, 900);
      ctx.restore();
    }

    drawArcadeStrip(ctx, x, y, w, h) {
      ctx.save();
      ctx.globalAlpha = 0.96;
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, "rgba(109,255,207,0.2)");
      g.addColorStop(0.5, "rgba(255,209,102,0.12)");
      g.addColorStop(1, "rgba(255,84,112,0.2)");
      ctx.fillStyle = g;
      roundRect(ctx, x, y, w, h, 22);
      ctx.fill();
      strokeRoundRect(ctx, x, y, w, h, 22, 3, "rgba(255,244,215,0.22)");
      for (let i = 0; i < 9; i += 1) {
        const cx = x + 44 + i * 60;
        const cy = y + h / 2 + Math.sin(this.time * 3 + i) * 14;
        ctx.fillStyle = i % 2 ? PALETTE.coral : PALETTE.mint;
        ctx.globalAlpha = 0.78;
        ctx.beginPath();
        ctx.arc(cx, cy, 14 + (i % 3) * 4, 0, TAU);
        ctx.fill();
        ctx.fillStyle = PALETTE.ink;
        ctx.font = `900 24px ${FONT_HEAVY}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(i % 2 ? "-" : "+", cx, cy - 1);
      }
      ctx.restore();
    }

    drawGame(ctx) {
      this.drawHud(ctx);
      this.drawTargetPanels(ctx);
      this.drawTimer(ctx);
      this.drawBoard(ctx);
      this.drawBottomControls(ctx);
      if (this.resolving && this.result) this.drawResultOverlay(ctx);
    }

    drawHud(ctx) {
      this.drawSmallPill(ctx, 34, 30, 252, 64, `SCORE ${formatScore(this.score)}`, PALETTE.cream, "#1b211f");
      this.drawSmallPill(ctx, 304, 30, 126, 64, `ST ${this.stage}`, PALETTE.gold, "#1b211f");
      this.drawSmallPill(ctx, 448, 30, 164, 64, "", PALETTE.cream, "#1b211f");
      for (let i = 0; i < Math.min(this.lives, 5); i += 1) {
        this.drawHeart(ctx, 482 + i * 25, 62, 10, i >= 2 ? PALETTE.lime : PALETTE.coral);
      }
      if (this.lives > 5) {
        ctx.fillStyle = PALETTE.lime;
        fitFillText(ctx, `+${this.lives - 5}`, 588, 62, 38, 20, 12, FONT_HEAVY, 900);
      }
      this.drawIconButton(ctx, "gear", 632, 32, 56, PALETTE.blue, () => this.openSettings("playing"), false, "gear");
    }

    drawTargetPanels(ctx) {
      const match = this.total === this.target && this.requiredRemaining === 0;
      this.drawNumberPanel(ctx, 44, 118, 300, 174, "TARGET", this.target, PALETTE.gold, false);
      this.drawNumberPanel(ctx, 376, 118, 300, 174, "TOTAL", this.total, match ? PALETTE.lime : PALETTE.mint, match);

      const op = this.total <= this.target ? "+" : "-";
      const badgeColor = op === "+" ? PALETTE.mint : PALETTE.coral;
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.28)";
      ctx.shadowBlur = 5;
      ctx.fillStyle = "#181d1a";
      roundRect(ctx, 226, 305, 268, 48, 18);
      ctx.fill();
      ctx.shadowBlur = 0;
      strokeRoundRect(ctx, 226, 305, 268, 48, 18, 3, badgeColor);
      ctx.fillStyle = badgeColor;
      fitFillText(ctx, `NEXT TAP ${op}`, 360, 329, 230, 24, 16, FONT_HEAVY, 900);
      ctx.restore();
    }

    drawNumberPanel(ctx, x, y, w, h, label, value, color, matched) {
      ctx.save();
      ctx.shadowColor = matched ? "rgba(158,255,110,0.42)" : "rgba(0,0,0,0.30)";
      ctx.shadowBlur = matched ? 16 : 7;
      ctx.shadowOffsetY = 5;
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, matched ? "#25362c" : "#242d27");
      g.addColorStop(1, "#121614");
      ctx.fillStyle = g;
      roundRect(ctx, x, y, w, h, 22);
      ctx.fill();
      ctx.shadowBlur = 0;
      strokeRoundRect(ctx, x + 2, y + 2, w - 4, h - 4, 20, matched ? 6 : 3, color);
      ctx.fillStyle = PALETTE.muted;
      fitFillText(ctx, label, x + w / 2, y + 32, w - 36, 24, 14, FONT_BODY, 900);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = matched ? 12 : 3;
      if (label === "TARGET" && this.targetIntro > 0 && this.targetPrevious !== value) {
        const progress = easeOutCubic(1 - this.targetIntro / TARGET_INTRO_DURATION);
        const cx = x + w / 2;
        const cy = y + 102;
        ctx.save();
        roundRect(ctx, x + 10, y + 54, w - 20, h - 66, 18);
        ctx.clip();
        ctx.save();
        ctx.globalAlpha = 1 - progress;
        ctx.translate(cx, cy - progress * 42);
        ctx.scale(1 - progress * 0.12, 1 - progress * 0.12);
        fitFillText(ctx, String(this.targetPrevious), 0, 0, w - 28, 92, 42, FONT_HEAVY, 900);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = progress;
        ctx.translate(cx, cy + (1 - progress) * 42);
        ctx.scale(0.86 + progress * 0.14, 0.86 + progress * 0.14);
        fitFillText(ctx, String(value), 0, 0, w - 28, 92, 42, FONT_HEAVY, 900);
        ctx.restore();
        ctx.restore();
      } else {
        fitFillText(ctx, String(value), x + w / 2, y + 102, w - 28, 92, 42, FONT_HEAVY, 900);
      }
      ctx.restore();
    }

    drawTimer(ctx) {
      const x = 58;
      const y = 366;
      const w = 604;
      const h = 26;
      const ratio = this.timerStarted ? clamp(this.timeLeft / STAGE_TIME, 0, 1) : 1;
      const low = this.timerStarted && ratio < 0.28;
      ctx.save();
      ctx.fillStyle = "#111513";
      roundRect(ctx, x, y, w, h, 13);
      ctx.fill();
      const fillW = Math.max(8, w * ratio);
      const g = ctx.createLinearGradient(x, y, x + w, y);
      g.addColorStop(0, low ? PALETTE.red : PALETTE.mint);
      g.addColorStop(0.62, low ? PALETTE.orange : PALETTE.gold);
      g.addColorStop(1, low ? PALETTE.red : PALETTE.coral);
      ctx.fillStyle = g;
      roundRect(ctx, x, y, fillW, h, 13);
      ctx.fill();
      if (!this.timerStarted) {
        ctx.fillStyle = "rgba(12,15,16,0.72)";
        roundRect(ctx, x, y, w, h, 13);
        ctx.fill();
        ctx.fillStyle = PALETTE.cream;
        fitFillText(ctx, "TIMER STARTS ON FIRST TAP", x + w / 2, y + h / 2 + 1, w - 42, 18, 12, FONT_BODY, 900);
      }
      strokeRoundRect(ctx, x, y, w, h, 13, 3, low ? PALETTE.red : "rgba(255,244,215,0.22)");
      ctx.restore();
    }

    drawBoard(ctx) {
      const layout = this.tileLayout();
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.26)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 5;
      ctx.fillStyle = "rgba(9,11,10,0.72)";
      roundRect(ctx, layout.x - 14, layout.y - 14, layout.full + 28, layout.full + 28, 26);
      ctx.fill();
      ctx.shadowBlur = 0;
      strokeRoundRect(ctx, layout.x - 14, layout.y - 14, layout.full + 28, layout.full + 28, 26, 3, "rgba(255,244,215,0.14)");
      ctx.restore();

      const sorted = this.board.slice().sort((a, b) => (a.locked === b.locked ? a.row - b.row : a.locked ? -1 : 1));
      for (const tile of sorted) {
        this.drawTile(ctx, tile, layout);
      }
    }

    drawTile(ctx, tile, layout) {
      const size = layout.size;
      const gap = layout.gap;
      const x = layout.x + tile.visualCol * (size + gap);
      const y = layout.y + tile.visualRow * (size + gap);
      const cx = x + size / 2;
      const cy = y + size / 2;
      const selectedAlpha = tile.selected ? 0.34 : 1;
      const pop = tile.pulse > 0 ? 1 + Math.sin(tile.pulse * 34) * tile.pulse * 0.18 : 1;
      const glow = tile.glow + (tile.required ? 0.18 + Math.sin(this.time * 8 + tile.id) * 0.06 : 0);
      const scale = tile.scale * pop;
      const renderSize = size * scale;
      const rx = cx - renderSize / 2;
      const ry = cy - renderSize / 2;
      const disabled = tile.locked || tile.selected || this.resolving;

      if (!disabled && this.screen === "playing") {
        this.addHotspot(`tile-${tile.id}`, x, y, size, size, () => this.tapTile(tile), false);
      }

      ctx.save();
      ctx.globalAlpha = selectedAlpha;
      ctx.shadowColor = tile.locked ? "rgba(0,0,0,0.36)" : (tile.required ? "rgba(255,209,102,0.44)" : "rgba(0,0,0,0.30)");
      ctx.shadowBlur = tile.locked ? 5 : 8 + glow * 8;
      ctx.shadowOffsetY = 5;

      let g = ctx.createLinearGradient(rx, ry, rx, ry + renderSize);
      if (tile.locked) {
        g.addColorStop(0, "#454b4d");
        g.addColorStop(1, "#24282b");
      } else if (tile.required) {
        g.addColorStop(0, "#ffe289");
        g.addColorStop(0.48, "#ffbf47");
        g.addColorStop(1, "#d56923");
      } else {
        const huePick = tile.value % 5;
        const top = [PALETTE.mint, PALETTE.blue, PALETTE.lime, PALETTE.coral, PALETTE.gold][huePick];
        const bottom = ["#178e83", "#315caa", "#4f8f39", "#a93047", "#b57521"][huePick];
        g.addColorStop(0, top);
        g.addColorStop(1, bottom);
      }
      ctx.fillStyle = g;
      roundRect(ctx, rx, ry, renderSize, renderSize, 24);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.globalAlpha = selectedAlpha;
      ctx.strokeStyle = tile.required ? PALETTE.cream : "rgba(255,255,255,0.36)";
      ctx.lineWidth = tile.required ? 6 : 3;
      roundRect(ctx, rx + 4, ry + 4, renderSize - 8, renderSize - 8, 20);
      ctx.stroke();

      if (tile.locked) {
        this.drawLock(ctx, cx, cy + 2, renderSize * 0.58, PALETTE.cream);
      } else {
        ctx.fillStyle = tile.required ? "#5a260d" : "#111513";
        ctx.shadowColor = "rgba(255,255,255,0.38)";
        ctx.shadowBlur = 1;
        fitFillText(ctx, String(tile.value), cx, cy + 5, renderSize - 34, 82 * scale, 30, FONT_HEAVY, 900);
        ctx.shadowBlur = 0;
        if (tile.required) {
          ctx.fillStyle = "#5a260d";
          ctx.beginPath();
          ctx.arc(rx + 28 * scale, ry + 28 * scale, 19 * scale, 0, TAU);
          ctx.fill();
          ctx.fillStyle = PALETTE.cream;
          fitFillText(ctx, "!", rx + 28 * scale, ry + 29 * scale, 24 * scale, 26 * scale, 14, FONT_HEAVY, 900);
        }
        if (tile.reward) {
          this.drawRewardBadge(ctx, rx + renderSize - 34 * scale, ry + 32 * scale, 22 * scale, tile.reward);
        }
      }

      if (tile.selected) {
        ctx.strokeStyle = "rgba(12,15,16,0.68)";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(rx + 24, ry + 24);
        ctx.lineTo(rx + renderSize - 24, ry + renderSize - 24);
        ctx.moveTo(rx + renderSize - 24, ry + 24);
        ctx.lineTo(rx + 24, ry + renderSize - 24);
        ctx.stroke();
      }

      ctx.restore();
    }

    drawBottomControls(ctx) {
      const requiredText = this.requiredRemaining > 0 ? `REQ ${this.requiredRemaining}` : "REQ OK";
      const potential = this.combo > 0 ? Math.pow(2, this.combo) : 0;
      this.drawActionButton(ctx, "refresh", 44, 1044, 204, 82, "REFRESH", this.refreshAvailable && !this.timerStarted ? PALETTE.blue : "#596166", () => this.useRefresh(), !this.refreshAvailable || this.timerStarted || this.resolving, "refresh");
      this.drawSmallPill(ctx, 268, 1044, 184, 82, this.combo > 0 ? `${this.combo}x ${formatScore(potential)}` : "COMBO 0", this.combo >= 8 ? PALETTE.gold : PALETTE.cream, "#1b211f");
      this.drawSmallPill(ctx, 472, 1044, 204, 82, requiredText, this.requiredRemaining > 0 ? PALETTE.gold : PALETTE.lime, "#1b211f");

      ctx.save();
      ctx.fillStyle = this.total === this.target && this.requiredRemaining === 0 ? PALETTE.lime : PALETTE.cream;
      ctx.globalAlpha = 0.94;
      fitFillText(ctx, this.stageMessage, 360, 1160, 640, 30, 15, FONT_HEAVY, 900);
      ctx.globalAlpha = 0.7;
      const reminder = this.total === this.target && this.requiredRemaining === 0 && this.timerStarted
        ? "SAFE NOW, OR RISK MORE TILES"
        : "SELECTED TILES CLEAR WHEN THE STAGE ENDS";
      fitFillText(ctx, reminder, 360, 1202, 620, 18, 11, FONT_BODY, 900);
      ctx.restore();
    }

    drawResultOverlay(ctx) {
      const result = this.result;
      const t = clamp(1 - this.resolveTimer / (result.perfect ? 1.45 : result.success ? 1.1 : 1.05), 0, 1);
      const scale = 0.82 + easeOutBack(t) * 0.18;
      ctx.save();
      ctx.globalAlpha = 0.74;
      ctx.fillStyle = result.success ? "rgba(10,24,20,0.72)" : "rgba(34,7,12,0.76)";
      roundRect(ctx, 48, 472, 624, 292, 28);
      ctx.fill();
      ctx.globalAlpha = 1;
      strokeRoundRect(ctx, 48, 472, 624, 292, 28, 4, result.success ? PALETTE.mint : PALETTE.red);
      ctx.translate(360, 574);
      ctx.scale(scale, scale);
      ctx.fillStyle = result.perfect ? PALETTE.gold : result.success ? PALETTE.mint : PALETTE.red;
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 16;
      fitFillText(ctx, result.perfect ? "PERFECT" : result.success ? "NICE" : "MISS", 0, 0, 560, result.perfect ? 78 : 70, 34, FONT_HEAVY, 900);
      ctx.shadowBlur = 0;
      ctx.restore();

      ctx.save();
      ctx.fillStyle = PALETTE.cream;
      const line = result.success
        ? `${result.combo} TAPS  +${formatScore(result.points)}`
        : result.missingRequired ? "CLEAR EVERY REQUIRED TILE" : "END EXACTLY ON TARGET";
      fitFillText(ctx, line, 360, 656, 560, 34, 18, FONT_HEAVY, 900);
      if (result.lifeReward || result.refreshReward) {
        ctx.fillStyle = PALETTE.lime;
        const rewardLine = `${result.lifeReward ? "LIFE +" : ""}${result.lifeReward && result.refreshReward ? "  " : ""}${result.refreshReward ? "REFRESH READY" : ""}`;
        fitFillText(ctx, rewardLine, 360, 706, 560, 25, 14, FONT_BODY, 900);
      }
      ctx.restore();
    }

    drawGameOver(ctx) {
      this.drawGameLogo(ctx, 154, 0.82);
      ctx.save();
      ctx.fillStyle = "rgba(9,11,10,0.78)";
      roundRect(ctx, 58, 338, 604, 510, 30);
      ctx.fill();
      strokeRoundRect(ctx, 58, 338, 604, 510, 30, 4, this.newHighScore || this.newHighStage ? PALETTE.gold : PALETTE.coral);
      ctx.fillStyle = PALETTE.coral;
      fitFillText(ctx, "GAME OVER", 360, 420, 560, 66, 32, FONT_HEAVY, 900);
      ctx.fillStyle = PALETTE.cream;
      fitFillText(ctx, `FINAL SCORE ${formatScore(this.score)}`, 360, 514, 530, 42, 20, FONT_HEAVY, 900);
      fitFillText(ctx, `FINAL STAGE ${this.maxRunStage}`, 360, 574, 530, 36, 18, FONT_HEAVY, 900);
      if (this.newHighScore || this.newHighStage) {
        ctx.fillStyle = PALETTE.gold;
        fitFillText(ctx, `${this.newHighScore ? "NEW HIGH SCORE" : ""}${this.newHighScore && this.newHighStage ? " + " : ""}${this.newHighStage ? "NEW HIGH STAGE" : ""}`, 360, 650, 540, 28, 14, FONT_BODY, 900);
      } else {
        ctx.fillStyle = PALETTE.muted;
        fitFillText(ctx, `BEST ${formatScore(this.records.highScore || 0)}  STAGE ${this.records.highStage || 1}`, 360, 650, 540, 24, 14, FONT_BODY, 900);
      }
      ctx.restore();
      this.drawActionButton(ctx, "retry", 112, 910, 496, 100, "PLAY AGAIN", PALETTE.gold, () => this.startRun(), false, "play");
      this.drawActionButton(ctx, "menu-after", 112, 1034, 496, 82, "MAIN MENU", PALETTE.mint, () => this.goMenu(), false, "back");
    }

    drawHow(ctx) {
      this.drawHeaderScreen(ctx, "HOW TO PLAY");
      this.drawHowCard(ctx, 58, 170, 604, 168, "MATCH THE TARGET", "End the stage with TOTAL exactly equal to TARGET.", PALETTE.gold);
      this.drawExampleRoute(ctx, 92, 382);
      this.drawHowCard(ctx, 58, 600, 604, 148, "PLUS-MINUS RULE", "If total is low or equal, the next tile adds. If total is high, the next tile subtracts.", PALETTE.mint);
      this.drawHowCard(ctx, 58, 776, 604, 148, "SPECIAL TILES", "Gold ! tiles are required. Locks cannot be tapped. Reward badges pay out only on success.", PALETTE.coral);
      this.drawHowCard(ctx, 58, 952, 604, 136, "SCORE", "A solved stage pays 2 raised to your tap combo. More taps become huge.", PALETTE.lime);
      this.drawActionButton(ctx, "how-back", 112, 1138, 496, 82, "BACK", PALETTE.gold, () => this.goBack(), false, "back");
    }

    drawExampleRoute(ctx, x, y) {
      ctx.save();
      ctx.fillStyle = "rgba(9,11,10,0.72)";
      roundRect(ctx, x - 34, y - 26, 560, 190, 24);
      ctx.fill();
      strokeRoundRect(ctx, x - 34, y - 26, 560, 190, 24, 3, "rgba(255,244,215,0.16)");
      ctx.fillStyle = PALETTE.gold;
      fitFillText(ctx, "TARGET 6", x + 246, y + 8, 240, 28, 18, FONT_HEAVY, 900);
      const samples = [
        { n: 4, total: "0 -> 4", op: "+", color: PALETTE.mint },
        { n: 4, total: "4 -> 8", op: "+", color: PALETTE.mint },
        { n: 2, total: "8 -> 6", op: "-", color: PALETTE.coral }
      ];
      for (let i = 0; i < samples.length; i += 1) {
        const sx = x + i * 170;
        const sample = samples[i];
        this.drawMiniTile(ctx, sx, y + 48, sample.n, sample.color);
        ctx.fillStyle = sample.color;
        fitFillText(ctx, sample.op, sx + 82, y + 88, 38, 32, 18, FONT_HEAVY, 900);
        ctx.fillStyle = PALETTE.cream;
        fitFillText(ctx, sample.total, sx + 52, y + 146, 128, 20, 12, FONT_BODY, 900);
      }
      ctx.restore();
    }

    drawMiniTile(ctx, x, y, value, color) {
      ctx.save();
      const g = ctx.createLinearGradient(x, y, x, y + 78);
      g.addColorStop(0, color);
      g.addColorStop(1, "#17332c");
      ctx.fillStyle = g;
      roundRect(ctx, x, y, 78, 78, 16);
      ctx.fill();
      strokeRoundRect(ctx, x + 3, y + 3, 72, 72, 14, 3, "rgba(255,255,255,0.35)");
      ctx.fillStyle = "#111513";
      fitFillText(ctx, String(value), x + 39, y + 42, 58, 46, 22, FONT_HEAVY, 900);
      ctx.restore();
    }

    drawSettings(ctx) {
      this.drawHeaderScreen(ctx, "SETTINGS");
      const on = this.audio.enabled;
      this.drawSmallPill(ctx, 96, 250, 528, 96, `SFX ${on ? "ON" : "OFF"}`, on ? PALETTE.lime : PALETTE.coral, "#1b211f");
      this.drawActionButton(ctx, "toggle-sfx", 112, 388, 496, 92, on ? "TURN SFX OFF" : "TURN SFX ON", on ? PALETTE.coral : PALETTE.lime, () => this.audio.setEnabled(!this.audio.enabled), false, "sound");
      this.drawActionButton(ctx, "settings-how", 112, 520, 496, 92, "HOW TO PLAY", PALETTE.mint, () => this.openHow("settings"), false, "info");
      if (this.screenStack[this.screenStack.length - 1] === "playing") {
        this.drawActionButton(ctx, "resume", 112, 652, 496, 92, "RESUME", PALETTE.gold, () => { this.screen = "playing"; }, false, "play");
      }
      this.drawActionButton(ctx, "settings-menu", 112, 784, 496, 92, "MAIN MENU", PALETTE.blue, () => this.goMenu(), false, "back");
      this.drawActionButton(ctx, "settings-back", 112, 1068, 496, 82, "BACK", PALETTE.gold, () => this.goBack(), false, "back");
    }

    drawHeaderScreen(ctx, title) {
      ctx.save();
      ctx.fillStyle = PALETTE.cream;
      fitFillText(ctx, title, 360, 94, 620, 56, 28, FONT_HEAVY, 900);
      ctx.fillStyle = "rgba(255,244,215,0.16)";
      ctx.fillRect(86, 132, 548, 4);
      ctx.restore();
    }

    drawHowCard(ctx, x, y, w, h, title, body, color) {
      ctx.save();
      ctx.fillStyle = "rgba(13,16,15,0.78)";
      roundRect(ctx, x, y, w, h, 22);
      ctx.fill();
      strokeRoundRect(ctx, x, y, w, h, 22, 3, color);
      ctx.fillStyle = color;
      fitFillText(ctx, title, x + w / 2, y + 31, w - 46, 22, 14, FONT_HEAVY, 900);
      ctx.fillStyle = PALETTE.cream;
      this.wrapText(ctx, body, x + 34, y + 58, w - 68, 23, 18, FONT_BODY, y + h - 24);
      ctx.restore();
    }

    wrapText(ctx, text, x, y, maxWidth, lineHeight, size, family, maxY) {
      let fontSize = size;
      let lines = [];
      do {
        lines = [];
        ctx.font = `900 ${fontSize}px ${family || FONT_BODY}`;
        const words = text.split(" ");
        let line = "";
        for (const word of words) {
          const test = line ? `${line} ${word}` : word;
          if (ctx.measureText(test).width > maxWidth && line) {
            lines.push(line);
            line = word;
          } else {
            line = test;
          }
        }
        if (line) lines.push(line);
        if (!maxY || y + lines.length * lineHeight <= maxY || fontSize <= 14) break;
        fontSize -= 1;
        lineHeight = Math.max(18, lineHeight - 1);
      } while (fontSize > 14);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = `900 ${fontSize}px ${family || FONT_BODY}`;
      for (const line of lines) {
        ctx.fillText(line, x, y);
        y += lineHeight;
      }
    }

    drawSmallPill(ctx, x, y, w, h, text, color, background) {
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.24)";
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = background || "#1c221f";
      roundRect(ctx, x, y, w, h, Math.min(20, h / 2));
      ctx.fill();
      ctx.shadowBlur = 0;
      strokeRoundRect(ctx, x + 1, y + 1, w - 2, h - 2, Math.min(19, h / 2), 2, "rgba(255,244,215,0.12)");
      if (text) {
        ctx.fillStyle = color || PALETTE.cream;
        fitFillText(ctx, text, x + w / 2, y + h / 2 + 1, w - 24, Math.min(28, h * 0.42), 12, FONT_HEAVY, 900);
      }
      ctx.restore();
    }

    drawActionButton(ctx, id, x, y, w, h, label, color, onPress, disabled, icon) {
      const pulse = this.buttonPulse.get(id) || 0;
      const scale = 1 - pulse * 0.035;
      const cx = x + w / 2;
      const cy = y + h / 2;
      this.addHotspot(id, x, y, w, h, onPress, disabled);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);
      ctx.globalAlpha = disabled ? 0.52 : 1;
      ctx.shadowColor = disabled ? "rgba(0,0,0,0.20)" : color;
      ctx.shadowBlur = disabled ? 4 : 10;
      ctx.shadowOffsetY = 5;
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, color);
      g.addColorStop(1, disabled ? "#3b4243" : "#111513");
      ctx.fillStyle = g;
      roundRect(ctx, x, y, w, h, 24);
      ctx.fill();
      ctx.shadowBlur = 0;
      strokeRoundRect(ctx, x + 3, y + 3, w - 6, h - 6, 20, 4, "rgba(255,244,215,0.42)");
      ctx.fillStyle = disabled ? "#c8c8c8" : PALETTE.cream;
      const compactIcon = !!icon && w <= 240;
      const labelX = cx + (icon ? (compactIcon ? 24 : 18) : 0);
      const labelWidth = w - (icon ? (compactIcon ? 94 : 106) : 42);
      fitFillText(ctx, label, labelX, cy + 1, labelWidth, Math.min(42, h * 0.44), 16, FONT_HEAVY, 900);
      if (icon) {
        const iconX = compactIcon ? x + 30 : x + 48;
        const iconSize = compactIcon ? Math.min(22, h * 0.27) : Math.min(32, h * 0.32);
        this.drawButtonIcon(ctx, icon, iconX, cy, iconSize, disabled ? "#c8c8c8" : PALETTE.cream);
      }
      ctx.restore();
    }

    drawIconButton(ctx, id, x, y, size, color, onPress, disabled, icon) {
      this.addHotspot(id, x, y, size, size, onPress, disabled);
      const pulse = this.buttonPulse.get(id) || 0;
      ctx.save();
      ctx.translate(x + size / 2, y + size / 2);
      ctx.scale(1 - pulse * 0.05, 1 - pulse * 0.05);
      ctx.translate(-x - size / 2, -y - size / 2);
      ctx.globalAlpha = disabled ? 0.5 : 1;
      ctx.fillStyle = "#1b211f";
      ctx.shadowColor = color;
      ctx.shadowBlur = disabled ? 0 : 8;
      roundRect(ctx, x, y, size, size, 18);
      ctx.fill();
      ctx.shadowBlur = 0;
      strokeRoundRect(ctx, x + 2, y + 2, size - 4, size - 4, 16, 3, color);
      this.drawButtonIcon(ctx, icon, x + size / 2, y + size / 2, size * 0.31, color);
      ctx.restore();
    }

    drawButtonIcon(ctx, icon, x, y, size, color) {
      if (icon === "refresh") this.drawRefreshIcon(ctx, x, y, size, color);
      if (icon === "gear") this.drawGearIcon(ctx, x, y, size, color);
      if (icon === "sound") this.drawSpeakerIcon(ctx, x, y, size, color);
      if (icon === "play") this.drawPlayIcon(ctx, x, y, size, color);
      if (icon === "back") this.drawBackIcon(ctx, x, y, size, color);
      if (icon === "info") this.drawInfoIcon(ctx, x, y, size, color);
    }

    drawRefreshIcon(ctx, x, y, r, color) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(4, r * 0.18);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(x, y, r, -0.18 * Math.PI, 1.24 * Math.PI);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x + r * 0.92, y - r * 0.2);
      ctx.lineTo(x + r * 1.38, y - r * 0.18);
      ctx.lineTo(x + r * 1.08, y + r * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    drawGearIcon(ctx, x, y, r, color) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = Math.max(3, r * 0.16);
      for (let i = 0; i < 8; i += 1) {
        const a = i * TAU / 8;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92);
        ctx.lineTo(x + Math.cos(a) * r * 1.28, y + Math.sin(a) * r * 1.28);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x, y, r * 0.78, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, r * 0.28, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    drawSpeakerIcon(ctx, x, y, r, color) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(3, r * 0.14);
      ctx.beginPath();
      ctx.moveTo(x - r, y - r * 0.42);
      ctx.lineTo(x - r * 0.42, y - r * 0.42);
      ctx.lineTo(x + r * 0.18, y - r * 0.92);
      ctx.lineTo(x + r * 0.18, y + r * 0.92);
      ctx.lineTo(x - r * 0.42, y + r * 0.42);
      ctx.lineTo(x - r, y + r * 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + r * 0.32, y, r * 0.58, -0.55, 0.55);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + r * 0.32, y, r * 0.98, -0.55, 0.55);
      ctx.stroke();
      ctx.restore();
    }

    drawPlayIcon(ctx, x, y, r, color) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.55, y - r);
      ctx.lineTo(x + r * 0.9, y);
      ctx.lineTo(x - r * 0.55, y + r);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    drawBackIcon(ctx, x, y, r, color) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(4, r * 0.18);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(x + r * 0.8, y);
      ctx.lineTo(x - r * 0.72, y);
      ctx.moveTo(x - r * 0.72, y);
      ctx.lineTo(x - r * 0.1, y - r * 0.62);
      ctx.moveTo(x - r * 0.72, y);
      ctx.lineTo(x - r * 0.1, y + r * 0.62);
      ctx.stroke();
      ctx.restore();
    }

    drawInfoIcon(ctx, x, y, r, color) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = Math.max(3, r * 0.14);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
      ctx.font = `900 ${r * 1.45}px ${FONT_HEAVY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("i", x, y + r * 0.08);
      ctx.restore();
    }

    drawLock(ctx, x, y, size, color) {
      const w = size * 0.62;
      const h = size * 0.42;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = Math.max(5, size * 0.08);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(x, y - h * 0.3, w * 0.32, Math.PI, 0);
      ctx.stroke();
      roundRect(ctx, x - w / 2, y - h * 0.18, w, h, size * 0.09);
      ctx.fill();
      ctx.fillStyle = PALETTE.locked;
      ctx.beginPath();
      ctx.arc(x, y + h * 0.03, size * 0.055, 0, TAU);
      ctx.fill();
      ctx.fillRect(x - size * 0.025, y + h * 0.04, size * 0.05, size * 0.16);
      ctx.restore();
    }

    drawRewardBadge(ctx, x, y, r, reward) {
      ctx.save();
      ctx.shadowColor = reward === "life" ? PALETTE.lime : PALETTE.blue;
      ctx.shadowBlur = 6;
      ctx.fillStyle = "#101412";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = reward === "life" ? PALETTE.lime : PALETTE.blue;
      ctx.lineWidth = Math.max(2, r * 0.15);
      ctx.stroke();
      if (reward === "life") this.drawHeart(ctx, x, y + r * 0.08, r * 0.5, PALETTE.lime);
      else this.drawRefreshIcon(ctx, x, y, r * 0.48, PALETTE.blue);
      ctx.restore();
    }

    drawHeart(ctx, x, y, r, color) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, y + r * 0.95);
      ctx.bezierCurveTo(x - r * 1.45, y - r * 0.05, x - r * 0.88, y - r * 1.12, x, y - r * 0.55);
      ctx.bezierCurveTo(x + r * 0.88, y - r * 1.12, x + r * 1.45, y - r * 0.05, x, y + r * 0.95);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    drawEffects(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const ring of this.rings) {
        const age = 1 - ring.life / ring.maxLife;
        ctx.globalAlpha = (1 - age) * 0.9;
        ctx.strokeStyle = ring.color;
        ctx.lineWidth = ring.lineWidth * (1 - age * 0.35);
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.size + age * ring.size * 1.5, 0, TAU);
        ctx.stroke();
      }
      for (const p of this.particles) {
        const age = 1 - p.life / p.maxLife;
        ctx.globalAlpha = (1 - age) * 0.88;
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin || 0);
        roundRect(ctx, -p.size / 2, -p.size / 2, p.size, p.size, p.size * 0.28);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalCompositeOperation = "source-over";
      for (const text of this.floatTexts) {
        const age = 1 - text.life / text.maxLife;
        ctx.globalAlpha = (1 - age) * 0.95;
        ctx.fillStyle = text.color;
        ctx.shadowColor = text.color;
        ctx.shadowBlur = 10;
        fitFillText(ctx, text.text, text.x, text.y, 360, text.size, 12, FONT_HEAVY, 900);
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    }

    drawFlash(ctx) {
      if (!this.flash) return;
      const ratio = clamp(this.flash.life / this.flash.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = this.flash.alpha * ratio;
      ctx.fillStyle = this.flash.color;
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      ctx.restore();
    }
  }

  window.addEventListener("load", () => {
    const canvas = document.getElementById("game-canvas");
    if (canvas) new PlusMinusGame(canvas);
  });
})();
