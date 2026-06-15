// ============================================================
// MAIN — bootstrap, navigation, clock/cash tick, modal helpers.
// ============================================================

// ============================================================
// APP INIT
// ============================================================
function initApp() {
  document.getElementById('app').style.display = 'grid';
  renderTopbar();
  initNav();
  initSpeedControls();
  initMap();
  renderOverviewPanel();
  renderFleetPage();

  initStorePage();
  initRoutesPage();

  const resetBtn = document.getElementById('reset-game-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetGame);
  }

  startClock();
  window.addEventListener('beforeunload', saveGame);
}

// ---------------------------------------------------------
// Navigation
// ---------------------------------------------------------
function initNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      const view = document.getElementById('view-' + btn.dataset.view);
      view.classList.add('active');
      if (btn.dataset.view === 'main' && map) {
        setTimeout(() => map.invalidateSize(), 50);
      }
    });
  });
}

// ---------------------------------------------------------
// Speed / clock
// ---------------------------------------------------------
function initSpeedControls() {
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      gameState.sim.speed = parseInt(btn.dataset.speed, 10);
    });
  });
  document.querySelector(`.speed-btn[data-speed="${gameState.sim.speed}"]`)?.classList.add('active');

  const playBtn = document.getElementById('play-pause');
  playBtn.textContent = gameState.sim.running ? '⏸' : '▶';
  playBtn.addEventListener('click', () => {
    gameState.sim.running = !gameState.sim.running;
    playBtn.textContent = gameState.sim.running ? '⏸' : '▶';
  });
}

function startClock() {
  updateClockDisplay();
  let saveCounter = 0;
  clockInterval = setInterval(() => {
    if (gameState.sim.running) {
      const prevDay = deriveDate(gameState.time.totalMinutes).dayIndex;
      gameState.time.totalMinutes += gameState.sim.speed;
      const newDay = deriveDate(gameState.time.totalMinutes).dayIndex;

      if (newDay > prevDay) {
        applyCashTick(prevDay, newDay);
        updateTopbarStats();
        renderOverviewPanel();
      }
      updateClockDisplay();
    }
    saveCounter++;
    if (saveCounter >= 10) { saveGame(); saveCounter = 0; }
  }, 1000);
}

function updateClockDisplay() {
  const d = deriveDate(gameState.time.totalMinutes);
  document.getElementById('clock-year').textContent = d.year;
  document.getElementById('clock-month').textContent = d.month;
  document.getElementById('clock-week').textContent = d.week;
  document.getElementById('clock-day').textContent = d.dayOfWeek;
  document.getElementById('clock-time').textContent = `${d.hh}:${d.mm}`;
}

// ============================================================
// GENERIC MODAL
// ============================================================
function openModal(html) {
  document.getElementById('modal-card').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-card').innerHTML = '';
  purchaseDraft = null;
  routeDraft = null;
  cabinEditDraft = null;
  addAircraftDraft = null;
  editAssignmentDraft = null;
  fareEditDraft = null;
}

document.addEventListener('click', (e) => {
  if (e.target.id === 'modal-overlay') closeModal();
});

// ============================================================
// OPTIONS PAGE
// ============================================================
function initOptionsPage() {
  document.getElementById('opt-save').addEventListener('click', () => {
    saveGame();
    flashStatus('opt-save-status', 'Game saved.');
  });
  document.getElementById('opt-reset').addEventListener('click', resetGame);

  document.getElementById('opt-airports-count').textContent = AIRPORTS.length;
  document.getElementById('opt-airplanes-count').textContent = AIRPLANES.length;
}

function flashStatus(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 1800);
}

// ============================================================
// BOOTSTRAP
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
  loadData();

  if (loadGame()) {
    document.getElementById('setup-overlay').classList.add('hidden');
    initApp();
  } else {
    initSetupForm();
  }
  initOptionsPage();
});
