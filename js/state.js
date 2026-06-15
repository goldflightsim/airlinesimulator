// ============================================================
// STATE — global game state, persistence, new-game setup.
// ============================================================

let AIRPORTS = [];
let AIRPLANES = [];
let gameState = null;

// Map-related globals (populated by map.js)
let map = null;
let airportLayer = null;
let fleetLayer = null;
let routeLayer = null;

let clockInterval = null;
let selectedLivery = LIVERY_COLORS[0];
let uploadedLogo = null;

// Store navigation state
let storeView = { manufacturer: null, family: null };
// Active purchase/route-creation/edit modal state
let purchaseDraft = null;
let routeDraft = null;
let cabinEditDraft = null;

// ---------------------------------------------------------
// Setup form
// ---------------------------------------------------------
function initSetupForm() {
  // Populate country select with unique countries
  const countryMap = new Map();
  AIRPORTS.forEach(a => { if (!countryMap.has(a.country_code)) countryMap.set(a.country_code, a.country); });
  const countrySelect = document.getElementById('setup-country');
  [...countryMap.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .forEach(([code, name]) => {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = name;
      countrySelect.appendChild(opt);
    });

  countrySelect.addEventListener('change', () => populateHubSelect(countrySelect.value));
  populateHubSelect(countrySelect.value);

  // Livery color swatches
  const swatchContainer = document.getElementById('livery-swatches');
  LIVERY_COLORS.forEach((color, i) => {
    const sw = document.createElement('div');
    sw.className = 'color-swatch' + (i === 0 ? ' selected' : '');
    sw.style.background = color;
    sw.addEventListener('click', () => {
      selectedLivery = color;
      swatchContainer.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
    });
    swatchContainer.appendChild(sw);
  });

  // Logo upload
  document.getElementById('logo-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      uploadedLogo = ev.target.result;
      document.getElementById('logo-preview').src = uploadedLogo;
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('start-game-btn').addEventListener('click', startNewGame);
}

function populateHubSelect(countryCode) {
  const hubSelect = document.getElementById('setup-hub');
  hubSelect.innerHTML = '';
  const airports = AIRPORTS.filter(a => a.country_code === countryCode)
    .sort((a, b) => {
      if (a.size !== b.size) return a.size === 'major' ? -1 : 1;
      return a.iata.localeCompare(b.iata);
    });
  airports.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.iata;
    opt.textContent = `${a.iata} — ${a.name} (${a.city})`;
    hubSelect.appendChild(opt);
  });
}

// ---------------------------------------------------------
// Aircraft instance factory
// ---------------------------------------------------------
// Build a fleet aircraft instance from an AIRPLANES spec row.
function createAircraftInstance(spec, opts = {}) {
  const condition = opts.condition || 'new';
  const countryCode = gameState.airline.countryCode;
  const prefixes = getRegistrationPrefixes(countryCode);
  const prefix = condition === 'used' ? prefixes.used : prefixes.new;
  return {
    id: opts.id || ('AC' + Math.random().toString(36).slice(2, 8).toUpperCase()),
    manufacturer: spec.manufacturer,
    family: spec.family,
    model: spec.model,
    category: spec.category,
    max_capacity: spec.max_capacity,
    range_km: spec.range_km,
    cruise_kmh: spec.cruise_kmh,
    fuel_burn_kgph: spec.fuel_burn_kgph,
    min_runway_m: spec.min_runway_m,
    purchasePrice: spec.price_new_usd,
    purchasedAtMinute: gameState.time.totalMinutes,
    condition,
    cabin: opts.cabin || { economy: spec.max_capacity, premium: 0, business: 0, first: 0 },
    cabinQuality: opts.cabinQuality || 'standard',
    homeBase: opts.homeBase || gameState.airline.hubIata,
    registrationPrefix: opts.registrationPrefix || prefix,
    registration: opts.registration || generateRegistration(countryCode, condition),
    routeIds: []
  };
}

// ---------------------------------------------------------
// New game
// ---------------------------------------------------------
function startNewGame() {
  const name = document.getElementById('setup-name').value.trim() || 'Untitled Airways';
  const countrySelect = document.getElementById('setup-country');
  const countryCode = countrySelect.value;
  const countryName = countrySelect.options[countrySelect.selectedIndex].textContent;
  const hubIata = document.getElementById('setup-hub').value;

  gameState = {
    meta: { version: 2 },
    airline: {
      name, countryCode, countryName, hubIata,
      hubs: [hubIata],
      livery: selectedLivery,
      logo: uploadedLogo
    },
    finance: { cash: STARTING_CASH, lastCashUpdateDay: 0 },
    time: { totalMinutes: 0 },
    sim: { speed: 1, running: false },
    fleet: [],
    routes: []
  };

  // Starter aircraft: a single Airbus A320neo, parked at the hub.
  const starterSpec = AIRPLANES.find(p => p.manufacturer === 'Airbus' && p.model === 'A320neo');
  if (starterSpec) {
    const starter = createAircraftInstance(starterSpec, { id: 'AC1' });
    gameState.fleet.push(starter);
    gameState.finance.cash -= starter.purchasePrice;
  }

  saveGame();
  document.getElementById('setup-overlay').classList.add('hidden');
  initApp();
}

// ============================================================
// SAVE / LOAD
// ============================================================
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(gameState));
    return true;
  } catch (e) {
    console.error('Save failed', e);
    return false;
  }
}

function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return false;
  try {
    gameState = JSON.parse(raw);
    migrateGameState();
    return true;
  } catch (e) {
    console.error('Load failed', e);
    return false;
  }
}

// Backfill any fields introduced after a save was created, so older saves
// keep working with new systems (hubs, registrations, cash-tick tracking).
function migrateGameState() {
  if (!gameState) return;

  // Hubs (existing saves only had a single hubIata)
  if (!Array.isArray(gameState.airline.hubs)) {
    gameState.airline.hubs = gameState.airline.hubIata ? [gameState.airline.hubIata] : [];
  }

  // Cash-tick tracking
  if (gameState.finance.lastCashUpdateDay === undefined) {
    gameState.finance.lastCashUpdateDay = deriveDate(gameState.time.totalMinutes).dayIndex;
  }

  // Aircraft registrations + cabin defaults
  gameState.fleet.forEach(ac => {
    if (!ac.registration) {
      const prefixes = getRegistrationPrefixes(gameState.airline.countryCode);
      const prefix = ac.condition === 'used' ? prefixes.used : prefixes.new;
      ac.registrationPrefix = prefix;
      ac.registration = generateRegistration(gameState.airline.countryCode, ac.condition);
    }
  });

  // Used market registrations
  if (Array.isArray(gameState.usedMarket)) {
    gameState.usedMarket.forEach(u => {
      if (!u.registration) {
        const prefixes = getRegistrationPrefixes(gameState.airline.countryCode);
        u.registrationPrefix = prefixes.used;
        u.registration = generateRegistration(gameState.airline.countryCode, 'used');
      }
    });
  }

  gameState.meta = gameState.meta || {};
  gameState.meta.version = 2;
}

function resetGame() {
  if (confirm("Are you sure you want to reset your game? All progress will be permanently lost.")) {
    // 1. Stop background loops so nothing writes state mid-reset
    if (clockInterval) clearInterval(clockInterval);
    window.removeEventListener('beforeunload', saveGame);

    // 2. Clear saved data
    localStorage.removeItem(SAVE_KEY);
    gameState = null;

    // 3. Hard reload, bypassing memory cache
    window.location.href = window.location.pathname + '?reset=' + Date.now();
  }
}
