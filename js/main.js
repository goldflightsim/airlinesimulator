// ============================================================
// AIRLINE COMMAND — core engine (Phase 1: Foundation)
// ============================================================

const SAVE_KEY = 'airlineCommand_save_v1';
const STARTING_CASH = 500000000;

const LIVERY_COLORS = ['#4dd8c8', '#f2a93b', '#f76c6c', '#4ade80', '#a78bfa', '#60a5fa', '#fb923c', '#f472b6'];

// ---------------------------------------------------------
// Economics constants (Phase 2/3)
// ---------------------------------------------------------

// Cabin space: each seat "costs" this many capacity units.
// max_capacity in the aircraft data = total units available (all-economy).
const CABIN_UNIT_WEIGHTS = { economy: 1, premium: 1.5, business: 2.5, first: 4 };

// Cabin quality affects fares (passengers pay more for nicer cabins)
// and weekly maintenance cost (nicer cabins cost more to keep up).
const CABIN_QUALITIES = {
  low:      { label: 'Economy fit-out',  fareMult: 0.82, maintMult: 0.75 },
  standard: { label: 'Standard fit-out', fareMult: 1.00, maintMult: 1.00 },
  high:     { label: 'Premium fit-out',  fareMult: 1.25, maintMult: 1.40 }
};

// Ticket fare = (flatFare + perKm * distance) * cabinQuality.fareMult
const FARE_PARAMS = {
  economy:  { flat: 25,  perKm: 0.085 },
  premium:  { flat: 55,  perKm: 0.145 },
  business: { flat: 120, perKm: 0.29 },
  first:    { flat: 250, perKm: 0.55 }
};

const FUEL_PRICE_PER_KG = 0.85; // USD per kg of jet fuel

// USD per flight-hour, covers pilots + cabin crew
const CREW_COST_PER_HOUR = { regional: 900, narrowbody: 1500, widebody: 3500 };

// Base weekly maintenance/ownership cost per aircraft category (before quality multiplier)
const MAINTENANCE_WEEKLY_BASE = { regional: 15000, narrowbody: 35000, widebody: 90000 };

// Gravity-model demand calibration
const DEMAND_CONST = 3.5;
const DEMAND_DIST_OFFSET = 500; // km, softens very short routes

// Minimum ground turnaround between legs (hours)
const TURNAROUND_HOURS = 0.5;
// Max aircraft utilization per week (hours)
const MAX_WEEKLY_HOURS = 150;

// Manufacturer tile styling
const MANUFACTURER_META = {
  Airbus:     { code: 'AB', color: '#4dd8c8' },
  Boeing:     { code: 'BA', color: '#60a5fa' },
  Embraer:    { code: 'EMB', color: '#4ade80' },
  Comac:      { code: 'CMC', color: '#f2a93b' },
  Bombardier: { code: 'BMQ', color: '#f472b6' }
};

let AIRPORTS = [];
let AIRPLANES = [];
let gameState = null;
let map = null;
let airportLayer = null;
let routeLayer = null;
let clockInterval = null;
let selectedLivery = LIVERY_COLORS[0];
let uploadedLogo = null;

// Store navigation state
let storeView = { manufacturer: null, family: null };
// Active purchase/route-creation modal state
let purchaseDraft = null;
let routeDraft = null;

// ---------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------
function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const cells = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h.trim()] = cells[i] !== undefined ? cells[i].trim() : ''; });
    return row;
  });
}

function loadData() {
  AIRPORTS = parseCSV(AIRPORTS_CSV).map(a => ({
    ...a,
    lat: parseFloat(a.lat),
    lon: parseFloat(a.lon),
    population: parseInt(a.population, 10),
    gdp_index: parseFloat(a.gdp_index),
    runway_m: parseInt(a.runway_m, 10)
  }));

  AIRPLANES = parseCSV(AIRPLANES_CSV).map(p => ({
    ...p,
    max_capacity: parseInt(p.max_capacity, 10),
    range_km: parseInt(p.range_km, 10),
    cruise_kmh: parseInt(p.cruise_kmh, 10),
    fuel_burn_kgph: parseInt(p.fuel_burn_kgph, 10),
    min_runway_m: parseInt(p.min_runway_m, 10),
    price_new_usd: parseInt(p.price_new_usd, 10)
  }));
}

// ---------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------
function formatMoney(n) {
  const sign = n < 0 ? '-' : '';
  n = Math.abs(n);
  if (n >= 1e9) return sign + '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return sign + '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return sign + '$' + (n / 1e3).toFixed(1) + 'K';
  return sign + '$' + n.toFixed(0);
}

function formatNumber(n) {
  return n.toLocaleString('en-US');
}

// Derive Year / Month / Week / Day / clock from total elapsed minutes.
// 1 day = 1440 min, 1 week = 7 days, 1 month = 4 weeks (28 days), 1 year = 12 months.
function deriveDate(totalMinutes) {
  const dayIndex = Math.floor(totalMinutes / 1440);
  const minutesInDay = totalMinutes % 1440;
  const hh = Math.floor(minutesInDay / 60);
  const mm = minutesInDay % 60;

  const dayOfWeek = (dayIndex % 7) + 1;
  const week = Math.floor(dayIndex / 7) + 1;
  const monthIndex = Math.floor(dayIndex / 28);
  const month = (monthIndex % 12) + 1;
  const year = Math.floor(monthIndex / 12) + 1;

  return {
    dayIndex, year, month, week, dayOfWeek,
    hh: String(hh).padStart(2, '0'),
    mm: String(mm).padStart(2, '0')
  };
}

// ============================================================
// ECONOMICS HELPERS (Phase 2/3)
// ============================================================

// Great-circle distance in km
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// One-way flight time in hours, including a fixed taxi/climb/descent buffer
function flightTimeHours(distanceKm, cruiseKmh) {
  return distanceKm / cruiseKmh + 0.5;
}

// Weekly hours an aircraft burns flying a route `weeklyFrequency` (round trips/week) times
function routeHoursUsed(weeklyFrequency, oneWayHours) {
  return weeklyFrequency * (2 * oneWayHours + 2 * TURNAROUND_HOURS);
}

// Simplified gravity-model demand: weekly one-way passengers between two airports,
// driven by population, relative GDP/wealth index, and distance.
function computeDemandWeekly(originAirport, destAirport, distanceKm) {
  const mass = Math.sqrt(originAirport.population * destAirport.population) *
                Math.sqrt(originAirport.gdp_index * destAirport.gdp_index);
  return Math.round(DEMAND_CONST * mass / (distanceKm + DEMAND_DIST_OFFSET));
}

// Total seats in a cabin configuration
function cabinTotalSeats(cabin) {
  return cabin.economy + cabin.premium + cabin.business + cabin.first;
}

// Capacity units consumed by a cabin configuration (must be <= aircraft max_capacity)
function cabinUnitsUsed(cabin) {
  return cabin.economy * CABIN_UNIT_WEIGHTS.economy +
         cabin.premium * CABIN_UNIT_WEIGHTS.premium +
         cabin.business * CABIN_UNIT_WEIGHTS.business +
         cabin.first * CABIN_UNIT_WEIGHTS.first;
}

// One-way ticket fare for a class, given distance and cabin quality
function fareForClass(cls, distanceKm, quality) {
  const p = FARE_PARAMS[cls];
  const q = CABIN_QUALITIES[quality] || CABIN_QUALITIES.standard;
  return (p.flat + p.perKm * distanceKm) * q.fareMult;
}

// Sum of weekly hours used across all of an aircraft's current routes
function aircraftWeeklyHoursUsed(aircraft, excludeRouteId) {
  return gameState.routes
    .filter(r => r.aircraftId === aircraft.id && r.id !== excludeRouteId)
    .reduce((sum, r) => sum + r.hoursUsed, 0);
}

// Compute all derived economics for a route, given its aircraft.
// Mutates and returns the route object.
function computeRouteEconomics(route, aircraft) {
  const origin = AIRPORTS.find(a => a.iata === route.originIata);
  const dest = AIRPORTS.find(a => a.iata === route.destIata);

  const distance = haversineKm(origin.lat, origin.lon, dest.lat, dest.lon);
  const oneWayHours = flightTimeHours(distance, aircraft.cruise_kmh);

  route.distanceKm = Math.round(distance);
  route.flightTimeMin = Math.round(oneWayHours * 60);
  route.hoursUsed = routeHoursUsed(route.weeklyFrequency, oneWayHours);

  const demand = computeDemandWeekly(origin, dest, distance);
  const totalSeats = cabinTotalSeats(aircraft.cabin);
  const capacityWeekly = route.weeklyFrequency * 2 * totalSeats; // both directions, per week

  route.demandWeekly = demand;
  route.capacityWeekly = capacityWeekly;
  route.loadFactor = capacityWeekly > 0 ? Math.min(1, demand / capacityWeekly) : 0;

  // Revenue: each class sells at the same load factor
  let revenue = 0;
  for (const cls of ['economy', 'premium', 'business', 'first']) {
    const seatsPerWeek = aircraft.cabin[cls] * route.weeklyFrequency * 2; // both directions
    const fare = fareForClass(cls, distance, aircraft.cabinQuality);
    revenue += seatsPerWeek * route.loadFactor * fare;
  }
  route.revenueWeekly = revenue;

  // Fuel cost
  route.fuelWeekly = aircraft.fuel_burn_kgph * oneWayHours * 2 * route.weeklyFrequency * FUEL_PRICE_PER_KG;

  // Crew cost (based on flight hours only)
  route.crewWeekly = (CREW_COST_PER_HOUR[aircraft.category] || 1500) * oneWayHours * 2 * route.weeklyFrequency;

  return route;
}

// Recompute economics for every route assigned to an aircraft, and reallocate
// that aircraft's weekly maintenance cost proportionally across its routes
// (by share of weekly flight hours used).
function recomputeAircraftRoutes(aircraftId) {
  const aircraft = gameState.fleet.find(a => a.id === aircraftId);
  if (!aircraft) return;
  const routes = gameState.routes.filter(r => r.aircraftId === aircraftId);

  routes.forEach(r => computeRouteEconomics(r, aircraft));

  const quality = CABIN_QUALITIES[aircraft.cabinQuality] || CABIN_QUALITIES.standard;
  const totalMaintenance = (MAINTENANCE_WEEKLY_BASE[aircraft.category] || 35000) * quality.maintMult;
  const totalHours = routes.reduce((s, r) => s + r.hoursUsed, 0);

  routes.forEach(r => {
    r.maintenanceWeekly = totalHours > 0 ? totalMaintenance * (r.hoursUsed / totalHours) : 0;
    r.profitWeekly = r.revenueWeekly - r.fuelWeekly - r.crewWeekly - r.maintenanceWeekly;
  });
}

// Recompute every route in the game (call after any structural change)
function recomputeAllRoutes() {
  const aircraftIds = new Set(gameState.routes.map(r => r.aircraftId));
  aircraftIds.forEach(id => recomputeAircraftRoutes(id));
}


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

// Build a fleet aircraft instance from an AIRPLANES spec row.
function createAircraftInstance(spec, opts = {}) {
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
    condition: opts.condition || 'new',
    cabin: opts.cabin || { economy: spec.max_capacity, premium: 0, business: 0, first: 0 },
    cabinQuality: opts.cabinQuality || 'standard',
    homeBase: opts.homeBase || gameState.airline.hubIata,
    routeIds: []
  };
}

function startNewGame() {
  const name = document.getElementById('setup-name').value.trim() || 'Untitled Airways';
  const countrySelect = document.getElementById('setup-country');
  const countryCode = countrySelect.value;
  const countryName = countrySelect.options[countrySelect.selectedIndex].textContent;
  const hubIata = document.getElementById('setup-hub').value;

  gameState = {
    meta: { version: 1 },
    airline: {
      name, countryCode, countryName, hubIata,
      livery: selectedLivery,
      logo: uploadedLogo
    },
    finance: { cash: STARTING_CASH },
    time: { totalMinutes: 0 },
    sim: { speed: 1, running: false },
    fleet: [],
    routes: []
  };

  // Starter aircraft: a single Airbus A320neo, parked at the hub.
  // (The Store isn't built yet, so every new airline begins with one
  // general-purpose narrowbody to get started with.)
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
    return true;
  } catch (e) {
    console.error('Load failed', e);
    return false;
  }
}

function resetGame() {
  if (confirm("Are you sure you want to reset your game? All progress will be permanently lost.")) {
    // 1. STAGE ONE: Kill all background simulation loops to prevent runtime errors
    // Stop the main game clock interval
    if (typeof clockInterval !== 'undefined') {
      clearInterval(clockInterval);
    }
    // Remove the auto-save event listener so it doesn't try to write a blank state
    window.removeEventListener('beforeunload', saveGame);

    // 2. STAGE TWO: Vaporize the data safely
    localStorage.removeItem(SAVE_KEY); 
    
    if (typeof gameState !== 'undefined') {
      gameState = null; 
    }

    // 3. STAGE THREE: Force a clean, hard reload from the server, bypass memory cache
    window.location.href = window.location.pathname + '?reset=' + Date.now();
  }
}

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

  // ADD THIS: Attach the reset game logic
  const resetBtn = document.getElementById('reset-game-btn'); // Double check this ID matches your index.html
  if (resetBtn) {
    resetBtn.addEventListener('click', resetGame);
  }

  startClock();
  window.addEventListener('beforeunload', saveGame);
}

function renderTopbar() {
  const { airline } = gameState;
  document.getElementById('brand-name').textContent = airline.name;
  document.getElementById('brand-livery-dot').style.background = airline.livery;

  const logoEl = document.getElementById('brand-logo');
  if (airline.logo) {
    logoEl.src = airline.logo;
    logoEl.style.display = 'block';
  } else {
    logoEl.style.display = 'none';
  }
  updateTopbarStats();
}

function updateTopbarStats() {
  document.getElementById('stat-cash').textContent = formatMoney(gameState.finance.cash);
  document.getElementById('stat-fleet').textContent = gameState.fleet.length;
  document.getElementById('stat-routes').textContent = gameState.routes.length;
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
      gameState.time.totalMinutes += gameState.sim.speed;
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
// MAP
// ============================================================
function initMap() {
  map = L.map('map', {
    zoomControl: true,
    attributionControl: true,
    worldCopyJump: true
  }).setView([15, -20], 2);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19,
    subdomains: 'abcd'
  }).addTo(map);

  airportLayer = L.layerGroup().addTo(map);
  fleetLayer = L.layerGroup().addTo(map);
  routeLayer = L.layerGroup().addTo(map);

  AIRPORTS.forEach(a => {
    const isHub = a.iata === gameState.airline.hubIata;
    let cls = 'airport-marker';
    if (isHub) cls += ' hub';
    else if (a.size === 'regional') cls += ' regional';

    const size = isHub ? 18 : 12;
    const icon = L.divIcon({
      className: cls,
      iconSize: [size, size],
      html: ''
    });

    const marker = L.marker([a.lat, a.lon], { icon });
    marker.bindPopup(
      `<b>${a.iata}</b> ${isHub ? '— HUB' : ''}<br>` +
      `${a.name}<br>${a.city}, ${a.country}<br>` +
      `Runway: ${formatNumber(a.runway_m)} m &middot; ${a.size}`
    );
    marker.addTo(airportLayer);
  });

  // legend toggles
  document.getElementById('toggle-airports').addEventListener('change', (e) => {
    if (e.target.checked) map.addLayer(airportLayer);
    else map.removeLayer(airportLayer);
  });
  document.getElementById('toggle-routes').addEventListener('change', (e) => {
    if (e.target.checked) map.addLayer(routeLayer);
    else map.removeLayer(routeLayer);
  });

  refreshMapMarkers();

  setTimeout(() => map.invalidateSize(), 100);
}

// Redraw fleet markers (parked at home base) and route lines.
// Call after any purchase, route creation/removal, or aircraft change.
function refreshMapMarkers() {
  if (!map) return;
  fleetLayer.clearLayers();
  routeLayer.clearLayers();

  gameState.fleet.forEach(ac => {
    const base = AIRPORTS.find(a => a.iata === ac.homeBase);
    if (!base) return;
    const icon = L.divIcon({
      className: 'fleet-marker',
      iconSize: [18, 18],
      iconAnchor: [-6, 26],
      html: '&#9992;'
    });
    const marker = L.marker([base.lat, base.lon], { icon });
    const routeCount = gameState.routes.filter(r => r.aircraftId === ac.id).length;
    marker.bindPopup(
      `<b>${ac.id}</b> — ${ac.manufacturer} ${ac.model}<br>` +
      `Home base: ${base.iata}<br>` +
      `Capacity: ${formatNumber(cabinTotalSeats(ac.cabin))} seats &middot; ${routeCount} route(s)`
    );
    marker.addTo(fleetLayer);
  });

  gameState.routes.forEach(route => {
    const origin = AIRPORTS.find(a => a.iata === route.originIata);
    const dest = AIRPORTS.find(a => a.iata === route.destIata);
    if (!origin || !dest) return;
    const line = L.polyline([[origin.lat, origin.lon], [dest.lat, dest.lon]], {
      color: '#4dd8c8', weight: 1.5, opacity: 0.55, dashArray: '4,4'
    });
    line.bindPopup(`<b>${route.originIata} &rarr; ${route.destIata}</b><br>${formatNumber(route.distanceKm)} km &middot; ${route.weeklyFrequency}x/week`);
    line.addTo(routeLayer);
  });
}

// ============================================================
// OVERVIEW PANEL (Main tab)
// ============================================================
function renderOverviewPanel() {
  const { airline, finance, fleet, routes } = gameState;
  const hub = AIRPORTS.find(a => a.iata === airline.hubIata);

  document.getElementById('ov-airline-name').textContent = airline.name;
  document.getElementById('ov-country').textContent = airline.countryName;
  document.getElementById('ov-hub').textContent = hub ? `${hub.iata} — ${hub.city}` : airline.hubIata;
  document.getElementById('ov-livery-dot').style.background = airline.livery;

  const revenue = routes.reduce((s, r) => s + (r.revenueWeekly || 0), 0);
  const expenses = routes.reduce((s, r) => s + (r.fuelWeekly || 0) + (r.crewWeekly || 0) + (r.maintenanceWeekly || 0), 0);
  const profit = revenue - expenses;

  document.getElementById('ov-cash').textContent = formatMoney(finance.cash);
  document.getElementById('ov-fleet').textContent = fleet.length;
  document.getElementById('ov-routes').textContent = routes.length;
  document.getElementById('ov-revenue').textContent = formatMoney(revenue);
  document.getElementById('ov-expenses').textContent = formatMoney(expenses);
  const profitEl = document.getElementById('ov-profit');
  profitEl.textContent = formatMoney(profit);
  profitEl.className = 'v ' + (profit >= 0 ? 'pos' : 'neg');
}

// ============================================================
// FLEET PAGE (Aircraft tab)
// ============================================================
function renderFleetPage() {
  const placeholder = document.getElementById('fleet-placeholder');
  const list = document.getElementById('fleet-list');

  if (gameState.fleet.length === 0) {
    placeholder.style.display = 'block';
    list.style.display = 'none';
    return;
  }

  placeholder.style.display = 'none';
  list.style.display = 'block';
  list.innerHTML = '';

  gameState.fleet.forEach(ac => {
    const hoursUsed = aircraftWeeklyHoursUsed(ac, null);
    const routes = gameState.routes.filter(r => r.aircraftId === ac.id);
    const seatsTotal = cabinTotalSeats(ac.cabin);
    const weeklyProfit = routes.reduce((s, r) => s + (r.profitWeekly || 0), 0);
    const utilPct = Math.min(100, (hoursUsed / MAX_WEEKLY_HOURS) * 100);

    const card = document.createElement('div');
    card.className = 'strip';
    card.style.marginBottom = '12px';
    card.style.maxWidth = '480px';
    card.innerHTML = `
      <h3>${ac.id} &mdash; ${ac.manufacturer} ${ac.model}</h3>
      <div class="strip-row"><span class="k">Category</span><span class="v">${ac.category}</span></div>
      <div class="strip-row"><span class="k">Range</span><span class="v">${formatNumber(ac.range_km)} km</span></div>
      <div class="strip-row"><span class="k">Cruise speed</span><span class="v">${formatNumber(ac.cruise_kmh)} km/h</span></div>
      <div class="strip-row"><span class="k">Min. runway</span><span class="v">${formatNumber(ac.min_runway_m)} m</span></div>
      <div class="strip-row"><span class="k">Cabin layout</span><span class="v">${ac.cabin.economy}Y / ${ac.cabin.premium}W / ${ac.cabin.business}J / ${ac.cabin.first}F (${seatsTotal} total)</span></div>
      <div class="strip-row"><span class="k">Cabin quality</span><span class="v">${CABIN_QUALITIES[ac.cabinQuality].label}</span></div>
      <div class="strip-row"><span class="k">Purchase price</span><span class="v">${formatMoney(ac.purchasePrice)}</span></div>
      <div class="strip-row"><span class="k">Home base</span><span class="v">${ac.homeBase}</span></div>
      <div class="strip-row"><span class="k">Weekly utilization</span><span class="v">${hoursUsed.toFixed(1)} / ${MAX_WEEKLY_HOURS} hrs</span></div>
      <div class="cabin-units-bar"><div style="width:${utilPct}%; background:var(--cyan);"></div></div>
      <div class="strip-row"><span class="k">Routes</span><span class="v">${routes.length === 0 ? 'None' : routes.map(r => r.originIata + '-' + r.destIata).join(', ')}</span></div>
      ${routes.length > 0 ? `<div class="strip-row"><span class="k">Weekly profit</span><span class="v ${weeklyProfit >= 0 ? 'pos' : 'neg'}">${formatMoney(weeklyProfit)}</span></div>` : ''}
    `;
    list.appendChild(card);
  });
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
}

document.addEventListener('click', (e) => {
  if (e.target.id === 'modal-overlay') closeModal();
});

// ============================================================
// ROUTES
// ============================================================

function initRoutesPage() {
  document.getElementById('new-route-btn').addEventListener('click', openNewRouteModal);
  renderRoutesPage();
}

function renderRoutesPage() {
  const placeholder = document.getElementById('routes-placeholder');
  const list = document.getElementById('routes-list');

  if (gameState.routes.length === 0) {
    placeholder.style.display = 'block';
    list.style.display = 'none';
    return;
  }

  placeholder.style.display = 'none';
  list.style.display = 'block';
  list.innerHTML = '';

  gameState.routes.forEach(route => {
    const aircraft = gameState.fleet.find(a => a.id === route.aircraftId);
    const profit = route.profitWeekly || 0;
    const loadPct = Math.round((route.loadFactor || 0) * 100);
    const flightHrs = Math.floor(route.flightTimeMin / 60);
    const flightMins = route.flightTimeMin % 60;
    const served = Math.round((route.demandWeekly || 0) * (route.loadFactor || 0));

    const card = document.createElement('div');
    card.className = 'route-card' + (profit < 0 ? ' loss' : '');
    card.innerHTML = `
      <div class="route-head">
        <div class="route-title">${route.originIata}<span class="arrow">&rarr;</span>${route.destIata}
          <span style="color:var(--text-muted); font-size:12px; font-family:var(--font-mono);"> &middot; ${aircraft ? aircraft.id + ' ' + aircraft.model : 'Unassigned'}</span>
        </div>
        <div class="route-profit ${profit >= 0 ? 'pos' : 'neg'}">${formatMoney(profit)}/wk</div>
      </div>
      <div class="route-stats">
        <div><b>${formatNumber(route.distanceKm)} km</b>distance</div>
        <div><b>${flightHrs}h ${flightMins}m</b>flight time</div>
        <div><b>${route.weeklyFrequency}x</b>weekly round trips</div>
        <div><b>${formatNumber(served)} / ${formatNumber(Math.round(route.demandWeekly || 0))}</b>served / demand
          <div class="load-bar"><div style="width:${loadPct}%;"></div></div>
        </div>
        <div><b>${loadPct}%</b>load factor</div>
        <div><b>${route.hoursUsed.toFixed(1)} hrs</b>aircraft hrs/wk</div>
      </div>
      <div class="route-meta">
        Revenue ${formatMoney(route.revenueWeekly)}/wk &middot;
        Fuel ${formatMoney(route.fuelWeekly)}/wk &middot;
        Crew ${formatMoney(route.crewWeekly)}/wk &middot;
        Maintenance ${formatMoney(route.maintenanceWeekly)}/wk
      </div>
      <div style="margin-top:10px; text-align:right;">
        <button class="remove-route" onclick="removeRoute('${route.id}')">Remove route</button>
      </div>
    `;
    list.appendChild(card);
  });
}

function openNewRouteModal() {
  if (gameState.fleet.length === 0) {
    openModal(`
      <h2>New Route</h2>
      <div class="modal-sub">You don't own any aircraft yet. Buy one in the Store first.</div>
      <div class="modal-actions"><div></div><button class="btn" onclick="closeModal()">Close</button></div>
    `);
    return;
  }

  const homeAirports = AIRPORTS.filter(a => a.country_code === gameState.airline.countryCode);
  const defaultOrigin = homeAirports.find(a => a.iata === gameState.airline.hubIata) || homeAirports[0];
  const defaultDest = AIRPORTS.find(a => a.iata !== defaultOrigin.iata);

  routeDraft = {
    aircraftId: gameState.fleet[0].id,
    originIata: defaultOrigin.iata,
    destIata: defaultDest.iata,
    weeklyFrequency: 7
  };
  renderNewRouteModal();
}

function renderNewRouteModal() {
  const aircraft = gameState.fleet.find(a => a.id === routeDraft.aircraftId);
  const homeAirports = AIRPORTS.filter(a => a.country_code === gameState.airline.countryCode);
  const origin = AIRPORTS.find(a => a.iata === routeDraft.originIata);
  const dest = AIRPORTS.find(a => a.iata === routeDraft.destIata);

  const existingHours = aircraftWeeklyHoursUsed(aircraft, null);
  const remainingHours = Math.max(0, MAX_WEEKLY_HOURS - existingHours);

  const errors = [];
  let preview = null;
  let maxFreq = 1;

  if (origin.iata === dest.iata) {
    errors.push('Origin and destination must be different airports.');
  } else {
    const distance = haversineKm(origin.lat, origin.lon, dest.lat, dest.lon);
    const oneWayHours = flightTimeHours(distance, aircraft.cruise_kmh);
    const hoursPerRoundTrip = 2 * oneWayHours + 2 * TURNAROUND_HOURS;
    maxFreq = Math.max(0, Math.floor(remainingHours / hoursPerRoundTrip));

    if (distance > aircraft.range_km) {
      errors.push(`Distance (${formatNumber(Math.round(distance))} km) exceeds this aircraft's range (${formatNumber(aircraft.range_km)} km).`);
    }
    if (origin.runway_m < aircraft.min_runway_m) {
      errors.push(`${origin.iata} runway (${origin.runway_m} m) is shorter than this aircraft requires (${aircraft.min_runway_m} m).`);
    }
    if (dest.runway_m < aircraft.min_runway_m) {
      errors.push(`${dest.iata} runway (${dest.runway_m} m) is shorter than this aircraft requires (${aircraft.min_runway_m} m).`);
    }

    const existingRoutes = gameState.routes.filter(r => r.aircraftId === aircraft.id);
    if (existingRoutes.length > 0) {
      const connected = new Set();
      existingRoutes.forEach(r => { connected.add(r.originIata); connected.add(r.destIata); });
      if (!connected.has(origin.iata) && !connected.has(dest.iata)) {
        errors.push(`This aircraft's existing routes don't share an airport with ${origin.iata}-${dest.iata}. It currently serves: ${[...connected].join(', ')}.`);
      }
    }

    if (maxFreq <= 0) {
      errors.push(`No spare weekly hours on this aircraft (${existingHours.toFixed(1)} / ${MAX_WEEKLY_HOURS} hrs already scheduled).`);
    } else {
      if (routeDraft.weeklyFrequency > maxFreq) routeDraft.weeklyFrequency = maxFreq;
      if (routeDraft.weeklyFrequency < 1) routeDraft.weeklyFrequency = 1;
    }

    if (errors.length === 0) {
      const tempRoute = { originIata: origin.iata, destIata: dest.iata, weeklyFrequency: routeDraft.weeklyFrequency };
      computeRouteEconomics(tempRoute, aircraft);

      const quality = CABIN_QUALITIES[aircraft.cabinQuality] || CABIN_QUALITIES.standard;
      const totalMaintenance = (MAINTENANCE_WEEKLY_BASE[aircraft.category] || 35000) * quality.maintMult;
      const totalHoursAfter = existingHours + tempRoute.hoursUsed;
      tempRoute.maintenanceWeekly = totalHoursAfter > 0 ? totalMaintenance * (tempRoute.hoursUsed / totalHoursAfter) : 0;
      tempRoute.profitWeekly = tempRoute.revenueWeekly - tempRoute.fuelWeekly - tempRoute.crewWeekly - tempRoute.maintenanceWeekly;
      preview = tempRoute;
    }
  }

  const aircraftOptions = gameState.fleet.map(ac => {
    const hrs = aircraftWeeklyHoursUsed(ac, null);
    return `<option value="${ac.id}" ${ac.id === aircraft.id ? 'selected' : ''}>${ac.id} — ${ac.manufacturer} ${ac.model} (${hrs.toFixed(0)}/${MAX_WEEKLY_HOURS} hrs used)</option>`;
  }).join('');

  const originOptions = homeAirports.map(a =>
    `<option value="${a.iata}" ${a.iata === origin.iata ? 'selected' : ''}>${a.iata} — ${a.city}</option>`
  ).join('');

  const destOptions = AIRPORTS.map(a =>
    `<option value="${a.iata}" ${a.iata === dest.iata ? 'selected' : ''}>${a.iata} — ${a.city}, ${a.country}</option>`
  ).join('');

  let previewHtml = '';
  if (preview) {
    const loadPct = Math.round(preview.loadFactor * 100);
    previewHtml = `
      <div class="opt-group" style="margin-top:6px;">
        <h2>Preview</h2>
        <div class="opt-row"><span>Distance</span><span class="v" style="font-family:var(--font-mono);">${formatNumber(preview.distanceKm)} km</span></div>
        <div class="opt-row"><span>Flight time (one-way)</span><span class="v" style="font-family:var(--font-mono);">${Math.floor(preview.flightTimeMin/60)}h ${preview.flightTimeMin%60}m</span></div>
        <div class="opt-row"><span>Aircraft hours/week</span><span class="v" style="font-family:var(--font-mono);">${preview.hoursUsed.toFixed(1)} / ${MAX_WEEKLY_HOURS}</span></div>
        <div class="opt-row"><span>Estimated demand</span><span class="v" style="font-family:var(--font-mono);">${formatNumber(Math.round(preview.demandWeekly))}/wk</span></div>
        <div class="opt-row"><span>Load factor</span><span class="v" style="font-family:var(--font-mono);">${loadPct}%</span></div>
        <div class="opt-row"><span>Revenue</span><span class="v pos" style="font-family:var(--font-mono);">${formatMoney(preview.revenueWeekly)}/wk</span></div>
        <div class="opt-row"><span>Fuel + Crew + Maintenance</span><span class="v neg" style="font-family:var(--font-mono);">${formatMoney(preview.fuelWeekly + preview.crewWeekly + preview.maintenanceWeekly)}/wk</span></div>
        <div class="opt-row"><span>Profit</span><span class="v ${preview.profitWeekly>=0?'pos':'neg'}" style="font-family:var(--font-mono); font-weight:600;">${formatMoney(preview.profitWeekly)}/wk</span></div>
      </div>
    `;
  }

  const freqMax = Math.max(1, maxFreq);

  document.getElementById('modal-card').innerHTML = `
    <h2>New Route</h2>
    <div class="modal-sub">Routes must depart from an airport in ${gameState.airline.countryName}. Each aircraft has ${MAX_WEEKLY_HOURS} flight hours/week (incl. turnarounds).</div>

    <div class="field">
      <label>Aircraft</label>
      <select onchange="routeDraft.aircraftId = this.value; renderNewRouteModal()">${aircraftOptions}</select>
    </div>

    <div class="field-row">
      <div class="field">
        <label>Origin</label>
        <select onchange="routeDraft.originIata = this.value; renderNewRouteModal()">${originOptions}</select>
      </div>
      <div class="field">
        <label>Destination</label>
        <select onchange="routeDraft.destIata = this.value; renderNewRouteModal()">${destOptions}</select>
      </div>
    </div>

    <div class="field">
      <label>Weekly frequency (round trips)</label>
      <input type="number" min="1" max="${freqMax}" value="${routeDraft.weeklyFrequency}"
        onchange="routeDraft.weeklyFrequency = parseInt(this.value)||1; renderNewRouteModal()">
      <div style="font-family:var(--font-mono); font-size:11px; color:var(--text-muted); margin-top:4px;">Max with current aircraft hours: ${maxFreq}/week</div>
    </div>

    ${previewHtml}

    <div class="modal-actions">
      <div></div>
      <div>
        <button class="btn" onclick="closeModal()">Cancel</button>
        <button class="btn primary" ${errors.length > 0 ? 'disabled' : ''} onclick="confirmCreateRoute()">Create Route</button>
      </div>
    </div>
    <div class="modal-error">${errors.join('<br>')}</div>
  `;

  document.getElementById('modal-overlay').classList.remove('hidden');
}

function confirmCreateRoute() {
  if (!routeDraft) return;
  const aircraft = gameState.fleet.find(a => a.id === routeDraft.aircraftId);
  if (!aircraft) return;

  const route = {
    id: 'RT' + Math.random().toString(36).slice(2, 8).toUpperCase(),
    aircraftId: aircraft.id,
    originIata: routeDraft.originIata,
    destIata: routeDraft.destIata,
    weeklyFrequency: routeDraft.weeklyFrequency,
    createdAtMinute: gameState.time.totalMinutes
  };

  gameState.routes.push(route);
  aircraft.routeIds.push(route.id);
  recomputeAircraftRoutes(aircraft.id);

  closeModal();
  saveGame();
  renderRoutesPage();
  renderFleetPage();
  renderOverviewPanel();
  updateTopbarStats();
  refreshMapMarkers();
}

function removeRoute(routeId) {
  const route = gameState.routes.find(r => r.id === routeId);
  if (!route) return;
  const aircraft = gameState.fleet.find(a => a.id === route.aircraftId);

  gameState.routes = gameState.routes.filter(r => r.id !== routeId);
  if (aircraft) {
    aircraft.routeIds = aircraft.routeIds.filter(id => id !== routeId);
    recomputeAircraftRoutes(aircraft.id);
  }

  saveGame();
  renderRoutesPage();
  renderFleetPage();
  renderOverviewPanel();
  updateTopbarStats();
  refreshMapMarkers();
}

// ============================================================
// STORE
// ============================================================

function initStorePage() {
  document.querySelectorAll('.store-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.store-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.store-pane').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('store-pane-' + tab.dataset.storeTab).classList.add('active');
      if (tab.dataset.storeTab === 'used') renderUsedMarket();
    });
  });

  // Used market filter listeners
  ['used-filter-manufacturer', 'used-filter-category', 'used-filter-family', 'used-filter-sort'].forEach(id => {
    document.getElementById(id).addEventListener('change', renderUsedMarket);
  });
  const manufSelect = document.getElementById('used-filter-manufacturer');
  Object.keys(MANUFACTURER_META).forEach(m => {
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = m;
    manufSelect.appendChild(opt);
  });
  const familySelect = document.getElementById('used-filter-family');
  [...new Set(AIRPLANES.map(p => p.family))].sort().forEach(f => {
    const opt = document.createElement('option');
    opt.value = f; opt.textContent = f + ' family';
    familySelect.appendChild(opt);
  });

  showManufacturerGrid();
}

function updateStoreBreadcrumb() {
  const bc = document.getElementById('store-breadcrumb');
  const parts = ['<a onclick="showManufacturerGrid()">All manufacturers</a>'];
  if (storeView.manufacturer) parts.push(`<a onclick="showFamilyGrid('${storeView.manufacturer}')">${storeView.manufacturer}</a>`);
  if (storeView.family) parts.push(`<span>${storeView.family} family</span>`);
  bc.innerHTML = parts.join(' &raquo; ');
}

function showManufacturerGrid() {
  storeView = { manufacturer: null, family: null };
  updateStoreBreadcrumb();
  document.getElementById('store-manufacturer-grid').style.display = 'grid';
  document.getElementById('store-family-grid').style.display = 'none';
  document.getElementById('store-model-list').style.display = 'none';

  const grid = document.getElementById('store-manufacturer-grid');
  grid.innerHTML = '';
  Object.entries(MANUFACTURER_META).forEach(([manufacturer, meta]) => {
    const familyCount = new Set(AIRPLANES.filter(p => p.manufacturer === manufacturer).map(p => p.family)).size;
    const modelCount = AIRPLANES.filter(p => p.manufacturer === manufacturer).length;
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.onclick = () => showFamilyGrid(manufacturer);
    tile.innerHTML = `
      <div class="tile-icon" style="background:${meta.color};">${meta.code}</div>
      <div class="tile-label">${manufacturer}</div>
      <div class="tile-sub">${familyCount} families &middot; ${modelCount} models</div>
    `;
    grid.appendChild(tile);
  });
}

function showFamilyGrid(manufacturer) {
  storeView = { manufacturer, family: null };
  updateStoreBreadcrumb();
  document.getElementById('store-manufacturer-grid').style.display = 'none';
  document.getElementById('store-model-list').style.display = 'none';
  const grid = document.getElementById('store-family-grid');
  grid.style.display = 'grid';
  grid.innerHTML = '';

  const meta = MANUFACTURER_META[manufacturer];
  const families = [...new Set(AIRPLANES.filter(p => p.manufacturer === manufacturer).map(p => p.family))];
  families.forEach(family => {
    const models = AIRPLANES.filter(p => p.manufacturer === manufacturer && p.family === family);
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.onclick = () => showModelList(manufacturer, family);
    tile.innerHTML = `
      <div class="tile-icon" style="background:${meta.color};">${family}</div>
      <div class="tile-label">${family} family</div>
      <div class="tile-sub">${models.length} variant${models.length > 1 ? 's' : ''}</div>
    `;
    grid.appendChild(tile);
  });
}

function showModelList(manufacturer, family) {
  storeView = { manufacturer, family };
  updateStoreBreadcrumb();
  document.getElementById('store-manufacturer-grid').style.display = 'none';
  document.getElementById('store-family-grid').style.display = 'none';
  const list = document.getElementById('store-model-list');
  list.style.display = 'flex';
  list.innerHTML = '';

  const models = AIRPLANES.filter(p => p.manufacturer === manufacturer && p.family === family);
  models.forEach(spec => {
    const card = document.createElement('div');
    card.className = 'model-card';
    card.innerHTML = `
      <div class="model-title">${spec.model}<span class="fam">${spec.category}</span></div>
      <div class="model-specs">
        <div><b>${formatNumber(spec.max_capacity)}</b>max seats</div>
        <div><b>${formatNumber(spec.range_km)} km</b>range</div>
        <div><b>${formatNumber(spec.cruise_kmh)} km/h</b>cruise</div>
        <div><b>${formatNumber(spec.min_runway_m)} m</b>min runway</div>
      </div>
      <div class="model-price">${formatMoney(spec.price_new_usd)}</div>
      <button class="btn primary" onclick='openPurchaseModal(${JSON.stringify(spec)})'>Buy</button>
    `;
    list.appendChild(card);
  });
}

// ---------------------------------------------------------
// Used market
// ---------------------------------------------------------
function generateUsedMarket() {
  const market = AIRPLANES.map((spec, i) => {
    const ageYears = 1 + Math.floor(Math.random() * 18);
    const depreciation = Math.max(0.25, Math.pow(0.93, ageYears));
    let condition = 'High-hours';
    if (ageYears <= 3) condition = 'Excellent';
    else if (ageYears <= 7) condition = 'Good';
    else if (ageYears <= 12) condition = 'Fair';
    return {
      id: 'USED' + i,
      manufacturer: spec.manufacturer,
      family: spec.family,
      model: spec.model,
      category: spec.category,
      ageYears,
      condition,
      price: Math.round(spec.price_new_usd * depreciation)
    };
  });
  gameState.usedMarket = market;
  saveGame();
}

function renderUsedMarket() {
  if (!gameState.usedMarket) generateUsedMarket();

  const manufFilter = document.getElementById('used-filter-manufacturer').value;
  const catFilter = document.getElementById('used-filter-category').value;
  const famFilter = document.getElementById('used-filter-family').value;
  const sort = document.getElementById('used-filter-sort').value;

  let items = gameState.usedMarket.filter(u =>
    (!manufFilter || u.manufacturer === manufFilter) &&
    (!catFilter || u.category === catFilter) &&
    (!famFilter || u.family === famFilter)
  );

  items = items.slice().sort((a, b) => {
    if (sort === 'price-asc') return a.price - b.price;
    if (sort === 'price-desc') return b.price - a.price;
    if (sort === 'age-asc') return a.ageYears - b.ageYears;
    if (sort === 'age-desc') return b.ageYears - a.ageYears;
    return 0;
  });

  const list = document.getElementById('used-list');
  list.innerHTML = '';

  if (items.length === 0) {
    list.innerHTML = '<div class="placeholder-block">No used aircraft match these filters.</div>';
    return;
  }

  items.forEach(u => {
    const spec = AIRPLANES.find(p => p.manufacturer === u.manufacturer && p.model === u.model);
    const card = document.createElement('div');
    card.className = 'model-card used';
    card.innerHTML = `
      <div class="model-title">${spec.manufacturer} ${spec.model}<span class="fam">${spec.family} family &middot; ${spec.category}</span></div>
      <div class="model-specs">
        <div><b>${u.ageYears} yr${u.ageYears > 1 ? 's' : ''}</b>age</div>
        <div><b>${u.condition}</b>condition</div>
        <div><b>${formatNumber(spec.max_capacity)}</b>max seats</div>
        <div><b>${formatNumber(spec.range_km)} km</b>range</div>
      </div>
      <div class="model-price">${formatMoney(u.price)}</div>
      <button class="btn primary" onclick='openPurchaseModal(${JSON.stringify(spec)}, ${JSON.stringify(u)})'>Buy</button>
    `;
    list.appendChild(card);
  });
}

// ---------------------------------------------------------
// Purchase modal (cabin configurator)
// ---------------------------------------------------------
function openPurchaseModal(spec, usedEntry) {
  const homeAirports = AIRPORTS.filter(a => a.country_code === gameState.airline.countryCode);
  purchaseDraft = {
    spec,
    usedEntry: usedEntry || null,
    price: usedEntry ? usedEntry.price : spec.price_new_usd,
    cabin: { premium: 0, business: 0, first: 0 },
    quality: 'standard',
    homeBase: gameState.airline.hubIata
  };
  renderPurchaseModal();
}

function renderPurchaseModal() {
  const { spec, usedEntry, price, cabin, quality, homeBase } = purchaseDraft;
  const unitsUsed = cabinUnitsUsed({ economy: 0, ...cabin });
  const economy = Math.floor(spec.max_capacity - unitsUsed);
  const totalSeats = Math.max(0, economy) + cabin.premium + cabin.business + cabin.first;
  const overCapacity = economy < 0;
  const homeAirports = AIRPORTS.filter(a => a.country_code === gameState.airline.countryCode);

  const cabinRow = (cls, label, color) => `
    <div class="cabin-row">
      <div class="cabin-label"><span class="cabin-unit-dot" style="background:${color};"></span>${label} <span style="color:var(--text-dim);">(${CABIN_UNIT_WEIGHTS[cls]}x space)</span></div>
      <input type="number" min="0" value="${cabin[cls] || 0}" onchange="updatePurchaseCabin('${cls}', this.value)">
    </div>`;

  const barSegments = [
    { cls: 'economy', count: Math.max(0, economy), color: 'var(--cyan)' },
    { cls: 'premium', count: cabin.premium, color: 'var(--green)' },
    { cls: 'business', count: cabin.business, color: 'var(--amber)' },
    { cls: 'first', count: cabin.first, color: 'var(--red)' }
  ];
  const barHtml = barSegments.map(s => {
    const units = s.count * CABIN_UNIT_WEIGHTS[s.cls];
    const pct = Math.max(0, Math.min(100, (units / spec.max_capacity) * 100));
    return `<div style="width:${pct}%; background:${s.color};"></div>`;
  }).join('');

  const qualityButtons = Object.entries(CABIN_QUALITIES).map(([key, q]) => `
    <button class="${quality === key ? 'selected' : ''}" onclick="setPurchaseQuality('${key}')">
      <span class="q-title">${q.label}</span>
      Fares &times;${q.fareMult.toFixed(2)} &middot; Maint. &times;${q.maintMult.toFixed(2)}
    </button>
  `).join('');

  const homeBaseOptions = homeAirports.map(a =>
    `<option value="${a.iata}" ${a.iata === homeBase ? 'selected' : ''}>${a.iata} — ${a.city}</option>`
  ).join('');

  const canAfford = gameState.finance.cash >= price;

  document.getElementById('modal-card').innerHTML = `
    <h2>${usedEntry ? 'Buy Used: ' : 'Buy New: '} ${spec.manufacturer} ${spec.model}</h2>
    <div class="modal-sub">
      ${usedEntry ? `${usedEntry.ageYears} yr old &middot; ${usedEntry.condition} condition &middot; ` : ''}
      Max capacity: ${formatNumber(spec.max_capacity)} seats (all-economy)
    </div>

    <div class="field">
      <label>Cabin layout</label>
      ${cabinRow('premium', 'Premium Economy', 'var(--green)')}
      ${cabinRow('business', 'Business', 'var(--amber)')}
      ${cabinRow('first', 'First', 'var(--red)')}
      <div class="cabin-units-bar">${barHtml}</div>
      <div style="font-family:var(--font-mono); font-size:12px; color:${overCapacity ? 'var(--red)' : 'var(--text-muted)'};">
        Economy: ${Math.max(0, economy)} seats &middot; Total: ${totalSeats} seats
        ${overCapacity ? ' &mdash; OVER CAPACITY' : ''}
      </div>
    </div>

    <div class="field">
      <label>Cabin quality</label>
      <div class="quality-options">${qualityButtons}</div>
    </div>

    <div class="field">
      <label>Home base</label>
      <select onchange="purchaseDraft.homeBase = this.value">${homeBaseOptions}</select>
    </div>

    <div class="modal-actions">
      <div style="font-family:var(--font-mono); font-size:18px; color:var(--cyan);">${formatMoney(price)}</div>
      <div>
        <button class="btn" onclick="closeModal()">Cancel</button>
        <button class="btn primary" id="confirm-purchase-btn" ${(!canAfford || overCapacity) ? 'disabled' : ''} onclick="confirmPurchase()">Confirm Purchase</button>
      </div>
    </div>
    <div class="modal-error">${!canAfford ? 'Not enough cash for this purchase.' : ''}</div>
  `;

  document.getElementById('modal-overlay').classList.remove('hidden');
}

function updatePurchaseCabin(cls, value) {
  purchaseDraft.cabin[cls] = Math.max(0, parseInt(value, 10) || 0);
  renderPurchaseModal();
}

function setPurchaseQuality(key) {
  purchaseDraft.quality = key;
  renderPurchaseModal();
}

function confirmPurchase() {
  const { spec, usedEntry, price, cabin, quality, homeBase } = purchaseDraft;
  if (gameState.finance.cash < price) return;

  const economy = Math.floor(spec.max_capacity - cabinUnitsUsed({ economy: 0, ...cabin }));
  if (economy < 0) return;

  const aircraft = createAircraftInstance(spec, {
    condition: usedEntry ? 'used' : 'new',
    cabin: { economy, premium: cabin.premium, business: cabin.business, first: cabin.first },
    cabinQuality: quality,
    homeBase
  });
  if (usedEntry) {
    aircraft.purchasePrice = price;
    aircraft.ageYears = usedEntry.ageYears;
    // remove this listing from the used market
    gameState.usedMarket = gameState.usedMarket.filter(u => u.id !== usedEntry.id);
  }

  gameState.fleet.push(aircraft);
  gameState.finance.cash -= price;

  closeModal();
  saveGame();
  renderFleetPage();
  renderOverviewPanel();
  updateTopbarStats();
  refreshMapMarkers();
  if (usedEntry) renderUsedMarket();
}

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