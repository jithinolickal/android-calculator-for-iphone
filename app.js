/* Android Calculator for iPhone — UI layer.
 *
 * All calculator logic (parsing, input rules, formatting) lives in calc.js and is unit-tested
 * in tests/. This file owns the browser side only: it holds the current `state`, wires up the
 * keypad/menu/history events, and renders. The model is simple — every handler computes the
 * next state via a calc.js transform, then commit() stores it and render() paints it.
 * render() reads state and writes the DOM; it never mutates state.
 */

// ---------- State ----------
let state = makeState();        // { expr, evaluated, lastResult, error } — see calc.js
let history = loadHistory();

// ---------- DOM ----------
const appEl = document.querySelector(".app");
const exprEl = document.getElementById("expression");
const resultEl = document.getElementById("result");
const keypad = document.querySelector(".keypad");
const historyList = document.getElementById("historyList");
const dragHandle = document.getElementById("dragHandle");
const historyBtn = document.getElementById("historyToggle");

// Apply a state transition (from calc.js) and repaint. If the transition committed a
// calculation (on '='), record it in history.
function commit(next) {
  if (next.committed) addHistory(next.committed.expression, next.committed.result);
  state = next;
  render();
}

// ---------- Rendering ----------
function render() {
  exprEl.textContent = state.expr;
  exprEl.scrollLeft = exprEl.scrollWidth; // keep the newest (rightmost) part of long input in view

  if (state.error) {
    appEl.classList.remove("evaluated");
    resultEl.textContent = state.error;
    return;
  }
  if (state.evaluated) {
    appEl.classList.add("evaluated"); // expr greys/shrinks on top, result shows big
    resultEl.textContent = state.lastResult;
    return;
  }
  appEl.classList.remove("evaluated");
  resultEl.textContent = state.expr === "" ? "" : getPreview(state.expr);
}

// ---------- History ----------
// Persisted in localStorage (per-origin, so it survives reloads and is shared with the
// installed PWA — but is per-device, no cross-device sync). Array of { expression, result },
// capped at the last 100. All access is wrapped in try/catch because Safari can throw on
// storage access in private mode / when full.
function loadHistory() {
  try { return JSON.parse(localStorage.getItem("calc_history") || "[]"); }
  catch { return []; }
}
function saveHistory() {
  try { localStorage.setItem("calc_history", JSON.stringify(history.slice(-100))); } catch {}
}
function addHistory(expression, result) {
  history.push({ expression, result });
  saveHistory();
  renderHistory();
}
function renderHistory() {
  historyList.innerHTML = "";
  if (history.length === 0) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "No history yet";
    historyList.appendChild(empty);
    return;
  }
  history.forEach((h) => {
    const item = document.createElement("div");
    item.className = "history-item";
    // Build via textContent (not innerHTML): history comes from localStorage, which any
    // same-origin code can write, so treat it as untrusted and never parse it as HTML.
    const ex = document.createElement("div");
    ex.className = "h-expr";
    ex.textContent = h.expression;
    const rs = document.createElement("div");
    rs.className = "h-result";
    rs.textContent = h.result;
    item.append(ex, rs);
    item.addEventListener("click", () => {
      commit(appendResult(state, h.result));
      closeHistory();
    });
    historyList.appendChild(item);
  });
}
// Open/close are driven by the .history-open class on .app — CSS animates the panel sliding
// in/out (see styles.css). The region/handle/label stay in the DOM, just collapsed when closed.
function openHistory() {
  renderHistory();
  historyBtn.classList.add("history-active");
  appEl.classList.add("history-open");
}
function closeHistory() {
  historyBtn.classList.remove("history-active");
  appEl.classList.remove("history-open");
}
function toggleHistory() {
  appEl.classList.contains("history-open") ? closeHistory() : openHistory();
}

// ---------- Toast ----------
let toastTimer;
function showToast(message) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    appEl.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

// ---------- Key click sound ----------
// Generated with the Web Audio API (no audio files): a short sine "tick" with a fast decay.
// Pitch varies a little by key type for a pleasant, iOS-like feel. Toggle in the menu.
let soundEnabled = localStorage.getItem("calc_sound") !== "off"; // default on
let audioCtx;
// Create/resume the context. Warmed up on first interaction so the first click isn't clipped.
function ensureAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume(); // iOS unlocks audio on a user gesture
  } catch (e) { audioCtx = null; }
  return audioCtx;
}
window.addEventListener("pointerdown", ensureAudio, { once: true });

function playClick(freq) {
  if (!soundEnabled) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  try {
    const t = ctx.currentTime + 0.001;       // small lookahead avoids glitches/dropped clicks
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq || 600;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.11, t + 0.004); // fast attack
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045); // short decay → crisp tick
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  } catch (e) {}
}
function keyFreq(btn) {
  if (btn.dataset.action === "equals") return 760;
  if (btn.classList.contains("key-clear")) return 700;
  if (btn.classList.contains("key-op")) return 520;
  return 600; // numbers, dot, backspace
}

// ---------- Events ----------
keypad.addEventListener("click", (e) => {
  const btn = e.target.closest(".key");
  if (!btn) return;
  playClick(keyFreq(btn));
  const action = btn.dataset.action;
  const value = btn.dataset.value;

  if (action === "clear") commit(clearAll(state));
  else if (action === "backspace") commit(backspace(state));
  else if (action === "equals") commit(equals(state));
  else if (action === "paren") commit(inputParen(state));
  else if (value) commit(inputValue(state, value));
});

historyBtn.addEventListener("click", toggleHistory);
dragHandle.addEventListener("click", closeHistory);
document.getElementById("expandHandle").addEventListener("click", () =>
  showToast("Scientific calculator coming soon")
);

// ---------- Theme & overflow menu ----------
// Themes are pure CSS: each palette is a set of custom properties. Violet lives in :root
// (default) and Orange in :root[data-theme="orange"]. Switching = toggling one attribute on
// <html>, so there's no per-element restyling here. Choice is persisted; the chosen default
// (orange) is also hard-coded in index.html's <html data-theme> to avoid a color flash before
// this script runs.
const menu = document.getElementById("menu");
const menuBtn = document.getElementById("menuBtn");
const themeMeta = document.querySelector('meta[name="theme-color"]');

function applyTheme(theme) {
  if (theme === "orange") document.documentElement.setAttribute("data-theme", "orange");
  else { theme = "violet"; document.documentElement.removeAttribute("data-theme"); }
  try { localStorage.setItem("calc_theme", theme); } catch {}
  menu.querySelectorAll(".menu-item").forEach((el) =>
    el.classList.toggle("active", el.dataset.theme === theme)
  );
  // Keep the status-bar color in sync with the current background.
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  if (themeMeta && bg) themeMeta.setAttribute("content", bg);
}

// Sound toggle (in the menu)
const soundToggle = document.getElementById("soundToggle");
function updateSoundUI() { soundToggle.classList.toggle("active", soundEnabled); }
function toggleSound() {
  soundEnabled = !soundEnabled;
  try { localStorage.setItem("calc_sound", soundEnabled ? "on" : "off"); } catch {}
  updateSoundUI();
  if (soundEnabled) playClick(600); // play a confirmation tick when turning on
}
updateSoundUI();

menuBtn.addEventListener("click", (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
menu.addEventListener("click", (e) => {
  const item = e.target.closest(".menu-item");
  if (!item) return;
  if (item.dataset.theme) { applyTheme(item.dataset.theme); menu.hidden = true; }
  else if (item.id === "soundToggle") toggleSound(); // keep menu open
});
document.addEventListener("click", (e) => {
  if (!menu.hidden && !menu.contains(e.target) && !menuBtn.contains(e.target)) menu.hidden = true;
});

applyTheme(localStorage.getItem("calc_theme") || "orange");

// Physical keyboard support (desktop testing)
window.addEventListener("keydown", (e) => {
  const k = e.key;
  if (/[0-9.]/.test(k) || ["+", "-", "*", "/", "%", "(", ")", "Enter", "=", "Backspace", "Escape"].includes(k)) {
    playClick();
  }
  if (/[0-9]/.test(k)) commit(inputValue(state, k));
  else if (k === ".") commit(inputValue(state, "."));
  else if (k === "+") commit(inputValue(state, "+"));
  else if (k === "-") commit(inputValue(state, "−"));
  else if (k === "*") commit(inputValue(state, "×"));
  else if (k === "/") { e.preventDefault(); commit(inputValue(state, "÷")); }
  else if (k === "%") commit(inputValue(state, "%"));
  else if (k === "(" || k === ")") commit(inputParen(state));
  else if (k === "Enter" || k === "=") { e.preventDefault(); commit(equals(state)); }
  else if (k === "Backspace") commit(backspace(state));
  else if (k === "Escape") commit(clearAll(state));
});

// ---------- PWA service worker ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("sw.js").then((reg) => reg.update()).catch(() => {});
    // When a new worker takes over an already-controlled page, reload once to apply the
    // update (skips the very first install, which has no prior controller).
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded || !hadController) return;
      reloaded = true;
      location.reload();
    });
  });
}

render();
