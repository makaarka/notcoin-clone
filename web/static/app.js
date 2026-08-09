const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const initData = tg?.initData || "";

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Init-Data": initData,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.detail || `API ${path} failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

const state = {
  balance: 0,
  energy: 1000,
  energyMax: 1000,
  tapPower: 1,
  autoClickLevel: 0,
  autoClickRatePerSec: 0,
  energyRegenLevel: 0,
  energyRegenPerSec: 1 / 3,
  tapUpgradeCost: 500,
  autoClickUpgradeCost: 2000,
  energyRegenUpgradeCost: 800,
  pendingTaps: 0,
  refLink: "",
  leagueName: null,
};

const el = {
  balance: document.getElementById("balance"),
  coin: document.getElementById("coin"),
  energyFill: document.getElementById("energy-fill"),
  energyCur: document.getElementById("energy-cur"),
  energyMax: document.getElementById("energy-max"),
  tasksList: document.getElementById("tasks-list"),
  leadersList: document.getElementById("leaders-list"),
  friendsList: document.getElementById("friends-list"),
  refCount: document.getElementById("ref-count"),
  copyRefBtn: document.getElementById("copy-ref"),
  tapPowerVal: document.getElementById("tap-power-val"),
  tapPowerCost: document.getElementById("tap-power-cost"),
  autoClickVal: document.getElementById("auto-click-val"),
  autoClickCost: document.getElementById("auto-click-cost"),
  autoClickPph: document.getElementById("auto-click-pph"),
  autoClickNextPph: document.getElementById("auto-click-next-pph"),
  upgradeTapBtn: document.getElementById("upgrade-tap-btn"),
  upgradeAutoBtn: document.getElementById("upgrade-auto-btn"),
  energyRegenVal: document.getElementById("energy-regen-val"),
  energyRegenCost: document.getElementById("energy-regen-cost"),
  upgradeEnergyBtn: document.getElementById("upgrade-energy-btn"),
  particles: document.getElementById("particles"),
  combo: document.getElementById("combo"),
  comboVal: document.getElementById("combo-val"),
  bgDecor: document.querySelector(".bg-decor"),
  leagueBadge: document.getElementById("league-badge"),
  pph: document.getElementById("pph"),
};

// Matches backend AUTO_CLICK_RATE_PER_LEVEL (0.2 coins/sec) * 3600 — each
// auto-click level adds this many coins/hour, flat.
const AUTO_CLICK_HOURLY_PER_LEVEL = 720;

const LEAGUES = [
  { min: 5000000, name: "Алмаз", icon: "👑", color: "#b98cff", bg: "rgba(185,140,255,0.18)", border: "rgba(185,140,255,0.5)" },
  { min: 500000, name: "Платина", icon: "💎", color: "#7ee8ff", bg: "rgba(126,232,255,0.16)", border: "rgba(126,232,255,0.45)" },
  { min: 100000, name: "Золото", icon: "🥇", color: "#ffe27a", bg: "rgba(245,166,35,0.2)", border: "rgba(245,166,35,0.55)" },
  { min: 25000, name: "Серебро", icon: "🥈", color: "#d7dee5", bg: "rgba(201,210,218,0.16)", border: "rgba(201,210,218,0.4)" },
  { min: 5000, name: "Бронза", icon: "🥉", color: "#e3a15f", bg: "rgba(205,127,50,0.18)", border: "rgba(205,127,50,0.45)" },
  { min: 0, name: "Новичок", icon: "🔰", color: "#9b94b3", bg: "rgba(155,148,179,0.14)", border: "rgba(155,148,179,0.35)" },
];

function getLeague(balance) {
  return LEAGUES.find((l) => balance >= l.min);
}

function spawnMilestoneFlash() {
  const f = document.createElement("div");
  f.className = "milestone-flash";
  el.bgDecor.appendChild(f);
  setTimeout(() => f.remove(), 550);
}

function spawnParticle(text) {
  const p = document.createElement("div");
  p.className = "particle";
  p.textContent = text;
  p.style.left = `${45 + Math.random() * 10}%`;
  el.particles.appendChild(p);
  setTimeout(() => p.remove(), 800);
}

const SPARK_EMOJIS = ["✨", "⭐", "💫"];
function spawnSparks(count) {
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.className = "spark";
    s.textContent = SPARK_EMOJIS[Math.floor(Math.random() * SPARK_EMOJIS.length)];
    const angle = Math.random() * Math.PI * 2;
    const dist = 50 + Math.random() * 50;
    s.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    s.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
    el.particles.appendChild(s);
    setTimeout(() => s.remove(), 650);
  }
}

function spawnRipple() {
  const r = document.createElement("div");
  r.className = "ripple";
  el.particles.appendChild(r);
  setTimeout(() => r.remove(), 650);
}

function spawnShards(count) {
  for (let i = 0; i < count; i++) {
    const s = document.createElement("div");
    s.className = "shard";
    const angle = Math.random() * Math.PI * 2;
    const dist = 70 + Math.random() * 70;
    s.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    s.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
    s.style.setProperty("--rot", `${Math.floor(Math.random() * 360 - 180)}deg`);
    el.particles.appendChild(s);
    setTimeout(() => s.remove(), 700);
  }
}

const coinStageEl = document.querySelector(".coin-stage");
function shakeCoin() {
  // Web Animations API instead of a CSS class so this never fights the
  // looping "float-idle" CSS animation already running on .coin-stage
  // (learned the hard way with the glow flash bug — see that fix).
  coinStageEl.animate(
    [
      { transform: "translate(0, 0)" },
      { transform: "translate(-5px, -3px)" },
      { transform: "translate(5px, -6px)" },
      { transform: "translate(-4px, -1px)" },
      { transform: "translate(3px, -4px)" },
      { transform: "translate(0, 0)" },
    ],
    { duration: 380, easing: "ease-out" }
  );
}

const EXPLODE_AT = 100;

let comboCount = 0;
let comboTimer = null;
let comboTier = 0;
let coinExploded = false;

function healCoin() {
  comboCount = 0;
  comboTier = 0;
  el.combo.classList.remove("show");
}

function explodeCoin() {
  coinExploded = true;
  spawnSparks(18);
  spawnShards(28);
  shakeCoin();
  spawnMilestoneFlash();
  tg?.HapticFeedback?.notificationOccurred("error");
  el.coin.classList.add("exploded");
  el.combo.classList.remove("show");

  setTimeout(() => {
    healCoin();
    coinExploded = false;
    el.coin.classList.remove("exploded");
    el.coin.animate(
      [
        { transform: "scale(0.3)", opacity: 0 },
        { transform: "scale(1.1)", opacity: 1, offset: 0.7 },
        { transform: "scale(1)", opacity: 1 },
      ],
      { duration: 420, easing: "ease-out" }
    );
  }, 2000);
}

function registerCombo() {
  comboCount += 1;
  el.comboVal.textContent = comboCount;
  el.combo.classList.add("show");
  el.combo.classList.remove("pop");
  void el.combo.offsetWidth;
  el.combo.classList.add("pop");

  clearTimeout(comboTimer);
  comboTimer = setTimeout(healCoin, 1200);

  if (comboCount >= EXPLODE_AT) {
    explodeCoin();
    return;
  }

  let targetTier = 0;
  if (comboCount >= 50) targetTier = 3;
  else if (comboCount >= 20) targetTier = 2;
  else if (comboCount >= 10) targetTier = 1;

  if (targetTier > comboTier) {
    comboTier = targetTier;
    spawnSparks(4 + comboTier * 4);
    shakeCoin();
    el.coin.classList.add("hot");
    spawnMilestoneFlash();
    tg?.HapticFeedback?.impactOccurred(comboTier === 3 ? "heavy" : "medium");
    setTimeout(() => el.coin.classList.remove("hot"), 500);
  }
}

function render() {
  el.balance.textContent = Math.floor(state.balance).toLocaleString("ru-RU");
  el.energyCur.textContent = Math.floor(state.energy);
  el.energyMax.textContent = state.energyMax;
  const pct = Math.max(0, Math.min(100, (state.energy / state.energyMax) * 100));
  el.energyFill.style.width = `${pct}%`;

  el.tapPowerVal.textContent = state.tapPower;
  el.tapPowerCost.textContent = state.tapUpgradeCost.toLocaleString("ru-RU");
  el.autoClickVal.textContent = state.autoClickLevel;
  el.autoClickCost.textContent = state.autoClickUpgradeCost.toLocaleString("ru-RU");
  el.upgradeTapBtn.disabled = state.balance < state.tapUpgradeCost;
  el.upgradeAutoBtn.disabled = state.balance < state.autoClickUpgradeCost;

  el.energyRegenVal.textContent = state.energyRegenPerSec.toFixed(2);
  el.energyRegenCost.textContent = state.energyRegenUpgradeCost.toLocaleString("ru-RU");
  el.upgradeEnergyBtn.disabled = state.balance < state.energyRegenUpgradeCost;

  const hourly = Math.floor(state.autoClickRatePerSec * 3600);
  el.pph.textContent = `⚡ ${hourly.toLocaleString("ru-RU")}/час`;
  el.autoClickPph.textContent = hourly.toLocaleString("ru-RU");
  el.autoClickNextPph.textContent = AUTO_CLICK_HOURLY_PER_LEVEL.toLocaleString("ru-RU");

  const league = getLeague(state.balance);
  if (league.name !== state.leagueName) {
    state.leagueName = league.name;
    el.leagueBadge.textContent = `${league.icon} ${league.name}`;
    el.leagueBadge.style.color = league.color;
    el.leagueBadge.style.background = league.bg;
    el.leagueBadge.style.borderColor = league.border;
  }
}

function tap() {
  if (coinExploded) return;
  if (state.energy < 1) return;
  state.energy -= 1;
  state.balance += state.tapPower;
  state.pendingTaps += 1;
  render();
  spawnParticle(`+${state.tapPower}`);
  spawnSparks(2);
  spawnRipple();
  registerCombo();

  const face = el.coin.querySelector(".coin-face");
  face.style.setProperty("--pop-rot", `${(Math.random() * 10 - 5).toFixed(1)}deg`);
  el.coin.classList.remove("tapped");
  void el.coin.offsetWidth;
  el.coin.classList.add("tapped");

  tg?.HapticFeedback?.impactOccurred("light");
}

let flushTimer = null;
function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(flushTaps, 600);
}

async function flushTaps() {
  flushTimer = null;
  const taps = state.pendingTaps;
  if (taps === 0) {
    // no pending taps: still refresh from server so passive auto-click income shows up
    try {
      syncFromServer(await api("/api/me"));
    } catch (e) {
      console.error(e);
    }
    return;
  }
  state.pendingTaps = 0;
  try {
    const data = await api("/api/tap", {
      method: "POST",
      body: JSON.stringify({ taps }),
    });
    syncFromServer(data);
  } catch (e) {
    console.error(e);
  }
}

function syncFromServer(data) {
  state.balance = data.balance;
  state.energy = data.energy;
  state.energyMax = data.energy_max;
  state.tapPower = data.tap_power;
  state.autoClickLevel = data.auto_click_level;
  state.autoClickRatePerSec = data.auto_click_rate_per_sec;
  state.energyRegenLevel = data.energy_regen_level;
  state.energyRegenPerSec = data.energy_regen_per_sec;
  state.tapUpgradeCost = data.tap_upgrade_cost;
  state.autoClickUpgradeCost = data.auto_click_upgrade_cost;
  state.energyRegenUpgradeCost = data.energy_regen_upgrade_cost;
  render();
}

el.coin.addEventListener("click", () => {
  tap();
  scheduleFlush();
});

// Tick energy regen and auto-click income locally every second, between server syncs
// (visual only — the server independently recomputes both from elapsed time on each sync)
setInterval(() => {
  let changed = false;
  if (state.energy < state.energyMax) {
    state.energy = Math.min(state.energyMax, state.energy + state.energyRegenPerSec);
    changed = true;
  }
  if (state.autoClickRatePerSec > 0) {
    state.balance += state.autoClickRatePerSec;
    changed = true;
  }
  if (changed) render();
}, 1000);

// Periodic sync: flushes pending taps, or pulls fresh balance (covers auto-click income)
setInterval(scheduleFlush, 5000);

// --- Tabs ---
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.screen).classList.add("active");

    if (btn.dataset.screen === "screen-tasks") loadTasks();
    if (btn.dataset.screen === "screen-leaders") loadLeaders();
    if (btn.dataset.screen === "screen-friends") { loadMe(); loadFriends(); }
    if (btn.dataset.screen === "screen-upgrade") loadMe();
  });
});

// --- Tasks ---
async function loadTasks() {
  el.tasksList.innerHTML = "<p class='muted'>Загрузка...</p>";
  try {
    const tasks = await api("/api/tasks");
    el.tasksList.innerHTML = "";
    tasks.forEach((t) => {
      const item = document.createElement("div");
      item.className = "task-item";
      item.innerHTML = `
        <div class="info">
          <span class="title">${t.title}</span>
          <span class="reward">+${t.reward.toLocaleString("ru-RU")} 🪙</span>
        </div>
        <button class="task-btn ${t.completed ? "done" : ""}" ${t.completed ? "disabled" : ""}>
          ${t.completed ? "Выполнено" : "Забрать"}
        </button>
      `;
      const btn = item.querySelector("button");
      btn.addEventListener("click", async () => {
        if (t.url) tg?.openTelegramLink ? tg.openTelegramLink(t.url) : window.open(t.url, "_blank");
        try {
          const data = await api(`/api/tasks/${t.id}/claim`, { method: "POST" });
          syncFromServer(data);
          loadTasks();
        } catch (e) {
          console.error(e);
        }
      });
      el.tasksList.appendChild(item);
    });
  } catch (e) {
    el.tasksList.innerHTML = "<p class='muted'>Не удалось загрузить задания</p>";
  }
}

// --- Leaders ---
async function loadLeaders() {
  el.leadersList.innerHTML = "<p class='muted'>Загрузка...</p>";
  try {
    const top = await api("/api/leaderboard");
    el.leadersList.innerHTML = "";
    top.forEach((p) => {
      const item = document.createElement("div");
      item.className = "leader-item";
      item.innerHTML = `
        <span class="rank-num">#${p.rank}</span>
        <span class="name">${p.username}</span>
        <span class="score">${p.balance.toLocaleString("ru-RU")}</span>
      `;
      el.leadersList.appendChild(item);
    });
  } catch (e) {
    el.leadersList.innerHTML = "<p class='muted'>Не удалось загрузить таблицу</p>";
  }
}

// --- Friends ---
async function loadMe() {
  try {
    const data = await api("/api/me");
    syncFromServer(data);
    el.refCount.textContent = data.referrals;
    state.refLink = data.ref_link;
  } catch (e) {
    console.error(e);
  }
}

async function loadFriends() {
  el.friendsList.innerHTML = "<p class='muted'>Загрузка...</p>";
  try {
    const friends = await api("/api/friends");
    if (friends.length === 0) {
      el.friendsList.innerHTML = "<p class='empty-state'>Пока никого не пригласил — поделись ссылкой выше</p>";
      return;
    }
    el.friendsList.innerHTML = "";
    friends.forEach((f) => {
      const item = document.createElement("div");
      item.className = "friend-item";
      const initial = (f.username || "?").charAt(0).toUpperCase();
      item.innerHTML = `
        <span class="avatar">${initial}</span>
        <span class="name">${f.username}</span>
        <span class="earned">
          <span class="amount">+${f.earned.toLocaleString("ru-RU")} 🪙</span>
          <span class="amount-label">заработано с друга</span>
        </span>
      `;
      el.friendsList.appendChild(item);
    });
  } catch (e) {
    el.friendsList.innerHTML = "<p class='muted'>Не удалось загрузить список</p>";
  }
}

el.copyRefBtn.addEventListener("click", () => {
  if (!state.refLink) return;
  navigator.clipboard?.writeText(state.refLink);
  tg?.showPopup ? tg.showPopup({ message: "Ссылка скопирована!" }) : alert("Ссылка скопирована!");
});

// --- Upgrades ---
function notify(message) {
  tg?.showPopup ? tg.showPopup({ message }) : alert(message);
}

el.upgradeTapBtn.addEventListener("click", async () => {
  try {
    const data = await api("/api/upgrade/tap", { method: "POST" });
    syncFromServer(data);
  } catch (e) {
    notify(e.status === 400 ? "Недостаточно монет" : "Ошибка, попробуй ещё раз");
  }
});

el.upgradeAutoBtn.addEventListener("click", async () => {
  try {
    const data = await api("/api/upgrade/auto", { method: "POST" });
    syncFromServer(data);
  } catch (e) {
    notify(e.status === 400 ? "Недостаточно монет" : "Ошибка, попробуй ещё раз");
  }
});

el.upgradeEnergyBtn.addEventListener("click", async () => {
  try {
    const data = await api("/api/upgrade/energy", { method: "POST" });
    syncFromServer(data);
  } catch (e) {
    notify(e.status === 400 ? "Недостаточно монет" : "Ошибка, попробуй ещё раз");
  }
});

// --- Init ---
(async function init() {
  try {
    const data = await api("/api/me");
    syncFromServer(data);
    el.refCount.textContent = data.referrals;
    state.refLink = data.ref_link;
  } catch (e) {
    console.error("init failed", e);
  }
})();
