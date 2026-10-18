"use strict";

const $ = id => document.getElementById(id);

const DEFAULT_DURATIONS = {
  focus: 25 * 60,
  short: 5 * 60,
  long: 15 * 60
};

const PHASE_NAMES = {
  focus: "Odaklanma Zamanı",
  short: "Kısa Mola",
  long: "Uzun Mola"
};

const COLORS = [
  "#ff626d",
  "#4c9aff",
  "#f5c84c",
  "#48c78e",
  "#ff79b9",
  "#9b7bff"
];

let durations = { ...DEFAULT_DURATIONS };
let mode = "pomodoro";
let phase = "focus";

let running = false;
let startedAt = 0;
let elapsedMs = 0;
let countdownDuration = durations.focus;
let timer = null;

let cycles = 0;
let sessions = 0;
let totalFocusSeconds = 0;

let audioContext = null;

// Güvenli yerel kayıt işlemleri

function loadValue(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function saveValue(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Tarayıcı depolaması kapalıysa uygulama çalışmaya devam eder.
  }
}

// Tema renkleri

function applyColor(color, save = true) {
  if (!COLORS.includes(color)) return;

  document.documentElement.style.setProperty("--accent", color);
  document.documentElement.style.setProperty("--glow", color + "44");

  document.querySelectorAll("[data-color]").forEach(button => {
    const selected = button.dataset.color === color;

    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });

  if (save) {
    saveValue("withStudyColor", color);
  }
}

// Saat biçimlendirme

function formatTime(seconds, hundredths = false) {
  seconds = Math.max(0, seconds);

  const wholeSeconds = Math.floor(seconds);
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const secs = wholeSeconds % 60;

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(secs).padStart(2, "0");

  if (hundredths) {
    const cs = String(
      Math.floor((seconds % 1) * 100)
    ).padStart(2, "0");

    if (hours > 0) {
      return `${hh}:${mm}:${ss}.${cs}`;
    }

    return `${mm}:${ss}.${cs}`;
  }

  if (hours > 0) {
    return `${hh}:${mm}:${ss}`;
  }

  return `${mm}:${ss}`;
}

// Zamanlayıcı hesaplamaları

function currentSeconds() {
  const activeMs = running
    ? performance.now() - startedAt
    : 0;

  return (elapsedMs + activeMs) / 1000;
}

function remainingSeconds() {
  return Math.max(
    0,
    countdownDuration - currentSeconds()
  );
}

function displayedFocusSeconds() {
  let total = totalFocusSeconds;

  if (running && mode === "pomodoro" && phase === "focus") {
    total += currentSeconds();
  }

  return total;
}

// Ekranı güncelle

function updateDisplay() {
  const isStopwatch = mode === "stopwatch";

  const value = isStopwatch
    ? currentSeconds()
    : remainingSeconds();

  $("display").textContent = formatTime(
    value,
    isStopwatch
  );

  $("clockLabel").textContent = isStopwatch
    ? "DAKİKA : SANİYE : SALİSE"
    : "DAKİKA : SANİYE";

  $("clockModeLabel").textContent =
    mode === "stopwatch"
      ? "STOPWATCH"
      : mode === "countdown"
        ? "COUNTDOWN"
        : phase === "focus"
          ? "FOCUS SESSION"
          : phase === "short"
            ? "SHORT BREAK"
            : "LONG BREAK";

  let percentage = 0;

  if (!isStopwatch && countdownDuration > 0) {
    percentage =
      100 * (1 - value / countdownDuration);
  }

  percentage = Math.min(100, Math.max(0, percentage));

  $("progress").style.width = `${percentage}%`;
  $("progressPercent").textContent =
    `${Math.floor(percentage)}%`;

  $("progressLabel").textContent = isStopwatch
    ? "Geçen süre"
    : value <= 0
      ? "Süre tamamlandı!"
      : running
        ? "Devam ediyorsun. Harika!"
        : "Hazır olduğunda başlayabilirsin.";

  $("toggleIcon").textContent = running ? "Ⅱ" : "▶";
  $("toggle").title = running ? "Duraklat" : "Başlat";
  $("toggle").setAttribute(
    "aria-label",
    running ? "Duraklat" : "Başlat"
  );

  $("statusText").textContent = running
    ? "Çalışıyor"
    : "Hazır";

  $("status").classList.toggle("running", running);

  $("cycles").textContent = cycles;
  $("sessions").textContent = sessions;
  $("elapsed").textContent = formatTime(
    displayedFocusSeconds()
  );

  document.title =
    `${formatTime(value)} | WITH STUDY`;
}

// Çalışan zamanlayıcıyı durdur

function stopInterval() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

// Duraklatma

function pauseTimer() {
  if (!running) return;

  const delta = performance.now() - startedAt;

  if (mode === "pomodoro" && phase === "focus") {
    totalFocusSeconds += delta / 1000;
  }

  elapsedMs += delta;
  running = false;

  stopInterval();
  updateDisplay();
}

// Başlatma

function startTimer() {
  if (running) return;

  if (
    mode !== "stopwatch" &&
    remainingSeconds() <= 0
  ) {
    elapsedMs = 0;
  }

  startedAt = performance.now();
  running = true;
  sessions++;

  stopInterval();
  timer = setInterval(tick, 50);

  updateDisplay();
}

// Sıfırlama

function resetTimer() {
  pauseTimer();
  elapsedMs = 0;

  if (mode === "pomodoro") {
    countdownDuration = durations[phase];
  } else if (mode === "countdown") {
    countdownDuration = getCountdownDuration();
  } else {
    countdownDuration = 0;
  }

  updateDisplay();
}

// Mod değiştirme

function switchMode(nextMode) {
  pauseTimer();

  mode = nextMode;
  elapsedMs = 0;

  document.querySelectorAll("[data-mode]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.mode === mode
    );
  });

  $("pomodoroModes").classList.toggle(
    "hidden",
    mode !== "pomodoro"
  );

  $("settings").classList.toggle(
    "hidden",
    mode !== "pomodoro"
  );

  $("countdownSettings").classList.toggle(
    "hidden",
    mode !== "countdown"
  );

  if (mode === "stopwatch") {
    $("heading").textContent = "Kronometre";
    $("subtitle").textContent =
      "Geçen zamanı hassas şekilde ölç.";

    countdownDuration = 0;
  } else if (mode === "countdown") {
    $("heading").textContent = "Geri Sayım";
    $("subtitle").textContent =
      "Süreni belirle ve başlat.";

    countdownDuration = getCountdownDuration();
  } else {
    $("heading").textContent = PHASE_NAMES[phase];
    $("subtitle").textContent =
      "Küçük adımlar, büyük sonuçlar.";

    countdownDuration = durations[phase];
  }

  updateDisplay();
}

// Pomodoro aşamasını değiştir

function switchPhase(nextPhase) {
  pauseTimer();

  phase = nextPhase;
  elapsedMs = 0;
  countdownDuration = durations[phase];

  document.querySelectorAll("[data-phase]").forEach(button => {
    const selected = button.dataset.phase === phase;

    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });

  $("heading").textContent = PHASE_NAMES[phase];

  $("subtitle").textContent = phase === "focus"
    ? "Küçük adımlar, büyük sonuçlar."
    : "Biraz dinlen, sonra devam et.";

  updateDisplay();
}

// Bildirim sesi

function beep() {
  try {
    audioContext ??= new (
      window.AudioContext ||
      window.webkitAudioContext
    )();

    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = 740;

    gain.gain.setValueAtTime(
      0.08,
      audioContext.currentTime
    );

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      audioContext.currentTime + 0.4
    );

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.4);
  } catch {
    // Ses desteklenmiyorsa uygulama çalışır.
  }
}

// Süre tamamlandığında

function completeTimer() {
  stopInterval();
  running = false;

  if (mode === "pomodoro") {
    beep();

    if (phase === "focus") {
      // Tamamlanan odak oturumunu kaydet.
      cycles++;

      const nextPhase =
        cycles % 4 === 0 ? "long" : "short";

      switchPhase(nextPhase);
    } else {
      switchPhase("focus");
    }

    // Yeni Pomodoro aşamasını otomatik başlat.
    startTimer();
    return;
  }

  // Geri sayım tamamlandı.
  elapsedMs = countdownDuration * 1000;
  beep();
  updateDisplay();
}

// Zamanlayıcı döngüsü

function tick() {
  if (
    mode !== "stopwatch" &&
    remainingSeconds() <= 0
  ) {
    completeTimer();
    return;
  }

  updateDisplay();
}

// Geri sayım ayarları

function getCountdownDuration() {
  const input = $("countdownMinutes");
  const value = Number(input.value);

  if (
    !Number.isFinite(value) ||
    value < 1 ||
    value > 1440
  ) {
    return 5 * 60;
  }

  return Math.floor(value) * 60;
}

function applyCountdown() {
  const input = $("countdownMinutes");
  const value = Number(input.value);

  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > 1440
  ) {
    alert("Lütfen 1 ile 1440 arasında dakika gir.");
    return;
  }

  pauseTimer();
  elapsedMs = 0;
  countdownDuration = value * 60;

  saveValue("withStudyCountdown", String(value));

  updateDisplay();
}

// Pomodoro süre ayarları

function applySettings() {
  const focus = Number($("focusMinutes").value);
  const short = Number($("shortMinutes").value);
  const long = Number($("longMinutes").value);

  if (
    !Number.isInteger(focus) ||
    focus < 1 || focus > 180 ||
    !Number.isInteger(short) ||
    short < 1 || short > 60 ||
    !Number.isInteger(long) ||
    long < 1 || long > 180
  ) {
    alert(
      "Lütfen geçerli dakika değerleri gir.\n" +
      "Odak: 1–180, kısa mola: 1–60, uzun mola: 1–180."
    );
    return;
  }

  pauseTimer();

  durations = {
    focus: focus * 60,
    short: short * 60,
    long: long * 60
  };

  saveValue(
    "withStudyDurations",
    JSON.stringify(durations)
  );

  elapsedMs = 0;

  if (mode === "pomodoro") {
    countdownDuration = durations[phase];
  }

  updateDisplay();
}

// Gerçek saat

function updateRealClock() {
  $("realClock").textContent =
    new Date().toLocaleTimeString("tr-TR", {
      hour12: false
    });
}

// Klavye kısayolları

document.addEventListener("keydown", event => {
  const tag = document.activeElement?.tagName;

  if (
    tag === "INPUT" ||
    event.repeat ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey
  ) {
    return;
  }

  if (event.code === "Space") {
    event.preventDefault();

    if (running) {
      pauseTimer();
    } else {
      startTimer();
    }
  }

  if (event.key.toLowerCase() === "r") {
    resetTimer();
  }
});

// Buton olayları

$("toggle").addEventListener("click", () => {
  if (running) {
    pauseTimer();
  } else {
    startTimer();
  }
});

$("reset").addEventListener("click", resetTimer);

$("skip").addEventListener("click", () => {
  if (mode === "pomodoro") {
    if (phase === "focus") {
      const nextPhase =
        (cycles + 1) % 4 === 0 ? "long" : "short";

      switchPhase(nextPhase);
    } else {
      switchPhase("focus");
    }
  } else {
    resetTimer();
  }
});

document.querySelectorAll("[data-mode]").forEach(button => {
  button.addEventListener("click", () => {
    switchMode(button.dataset.mode);
  });
});

document.querySelectorAll("[data-phase]").forEach(button => {
  button.addEventListener("click", () => {
    switchPhase(button.dataset.phase);
  });
});

document.querySelectorAll("[data-color]").forEach(button => {
  button.addEventListener("click", () => {
    applyColor(button.dataset.color);
  });
});

$("apply").addEventListener("click", applySettings);

$("applyCountdown").addEventListener(
  "click",
  applyCountdown
);

// Önceki kullanıcı tercihlerini yükle

function loadSettings() {
  const savedColor = loadValue(
    "withStudyColor",
    "#9b7bff"
  );

  applyColor(
    COLORS.includes(savedColor)
      ? savedColor
      : "#9b7bff",
    false
  );

  try {
    const saved = JSON.parse(
      loadValue("withStudyDurations", "null")
    );

    if (saved) {
      for (const key of ["focus", "short", "long"]) {
        if (
          Number.isFinite(saved[key]) &&
          saved[key] > 0
        ) {
          durations[key] = saved[key];
        }
      }
    }
  } catch {
    durations = { ...DEFAULT_DURATIONS };
  }

  $("focusMinutes").value = durations.focus / 60;
  $("shortMinutes").value = durations.short / 60;
  $("longMinutes").value = durations.long / 60;

  const savedCountdown = Number(
    loadValue("withStudyCountdown", "5")
  );

  $("countdownMinutes").value =
    Number.isInteger(savedCountdown) &&
    savedCountdown >= 1 &&
    savedCountdown <= 1440
      ? savedCountdown
      : 5;

  countdownDuration = durations.focus;
}

// Uygulamayı başlat

loadSettings();
updateRealClock();
setInterval(updateRealClock, 1000);
updateDisplay();