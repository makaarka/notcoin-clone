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
};

const el = {
  balance: document.getElementById("balance"),
  coin: document.getElementById("coin"),
  energyFill: document.getElementById("energy-fill"),
  energyCur: document.getElementById("energy-cur"),
  energyMax: document.getElementById("energy-max"),
  tasksList: document.getElementById("tasks-list"),
  leadersList: document.getElementById("leaders-list"),
  refCount: document.getElementById("ref-count"),
  copyRefBtn: document.getElementById("copy-ref"),
  tapPowerVal: document.getElementById("tap-power-val"),
  tapPowerCost: document.getElementById("tap-power-cost"),
  autoClickVal: document.getElementById("auto-click-val"),
  autoClickCost: document.getElementById("auto-click-cost"),
  upgradeTapBtn: document.getElementById("upgrade-tap-btn"),
  upgradeAutoBtn: document.getElementById("upgrade-auto-btn"),
  energyRegenVal: document.getElementById("energy-regen-val"),
  energyRegenCost: document.getElementById("energy-regen-cost"),
  upgradeEnergyBtn: document.getElementById("upgrade-energy-btn"),
  particles: document.getElementById("particles"),
};

function spawnParticle(text) {
  const p = document.createElement("div");
  p.className = "particle";
  p.textContent = text;
  p.style.left = `${45 + Math.random() * 10}%`;
  el.particles.appendChild(p);
  setTimeout(() => p.remove(), 800);
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
}

function tap() {
  if (state.energy < 1) return;
  state.energy -= 1;
  state.balance += state.tapPower;
  state.pendingTaps += 1;
  render();
  spawnParticle(`+${state.tapPower}`);

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
    if (btn.dataset.screen === "screen-friends") loadMe();
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
