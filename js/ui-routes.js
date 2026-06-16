// ============================================================
// UI: ROUTES — Routes list, route creation (map-based), individual route page.
// ============================================================

// ---- Navigation state ----
let routeCreationStep = 1; // 1 = pick departure, 2 = pick destination
let routeCreationDraft = { originIata: null, destIata: null };
let currentRoutePageId = null; // which individual route page is open
// asnEditDraft is declared in state.js

// ---- Route creation Leaflet map ----
let rcMap = null;
let rcAirportLayer = null;
let rcRouteLine = null;

// ============================================================
// ROUTES LIST PAGE
// ============================================================
function initRoutesPage() {
  document.getElementById('new-route-btn').addEventListener('click', openRouteCreationPage);
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
    const profit = route.totalProfitWeekly || 0;
    const loadPct = Math.round((route.avgLoadFactor || 0) * 100);
    const flightHrs = Math.floor((route.flightTimeMin || 0) / 60);
    const flightMins = (route.flightTimeMin || 0) % 60;
    const served = Math.min(route.totalCapacityWeekly || 0, route.demandWeekly || 0);
    const asnCount = route.assignments.length;

    const card = document.createElement('div');
    card.className = 'route-card' + (profit < 0 && asnCount > 0 ? ' loss' : '');
    card.innerHTML = `
      <div class="route-head">
        <div class="route-title">${route.originIata}<span class="arrow">&rarr;</span>${route.destIata}
          <span style="color:var(--text-muted); font-size:12px; font-family:var(--font-mono);"> &middot; ${asnCount} aircraft assigned</span>
        </div>
        <div class="route-profit ${profit >= 0 ? 'pos' : 'neg'}">${asnCount > 0 ? formatMoney(profit) + '/wk' : 'No aircraft'}</div>
      </div>
      <div class="route-stats">
        <div><b>${formatNumber(route.distanceKm || 0)} km</b>distance</div>
        <div><b>${flightHrs}h ${flightMins}m</b>flight time</div>
        <div><b>${route.totalFrequency || 0}x</b>weekly round trips</div>
        <div><b>${formatNumber(served)} / ${formatNumber(Math.round(route.demandWeekly || 0))}</b>served / demand
          <div class="load-bar"><div style="width:${loadPct}%;"></div></div>
        </div>
        <div><b>${loadPct}%</b>avg load factor</div>
      </div>
      <div class="route-meta">
        Revenue ${formatMoney(route.totalRevenueWeekly || 0)}/wk &middot;
        Expenses ${formatMoney(route.totalExpensesWeekly || 0)}/wk
      </div>
      <div style="margin-top:10px; text-align:right;">
        <button class="btn" onclick="openIndividualRoutePage('${route.id}')">Manage Route</button>
        <button class="remove-route" onclick="removeRoute('${route.id}')">Remove Route</button>
      </div>
    `;
    list.appendChild(card);
  });
}

// ============================================================
// ROUTE CREATION — map-based 2-step flow
// ============================================================
function openRouteCreationPage() {
  if (gameState.airline.hubs.length === 0) {
    openModal(`
      <h2>New Route</h2>
      <div class="modal-sub">You need at least one hub before creating routes. Purchase a hub on the main map.</div>
      <div class="modal-actions"><div></div><button class="btn" onclick="closeModal()">Close</button></div>
    `);
    return;
  }

  routeCreationStep = 1;
  routeCreationDraft = { originIata: null, destIata: null };

  // Show creation page
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-route-creation').classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  renderRouteCreationPage();
  initRouteCreationMap();
}

function renderRouteCreationPage() {
  const stepEl = document.getElementById('rc-step-label');
  const statsEl = document.getElementById('rc-stats-panel');
  const createBtn = document.getElementById('rc-create-btn');
  const canAfford = gameState.finance.cash >= ROUTE_CREATION_COST;

  if (routeCreationStep === 1) {
    stepEl.textContent = 'Step 1: Click a hub to set departure';
  } else {
    const origin = AIRPORTS.find(a => a.iata === routeCreationDraft.originIata);
    stepEl.textContent = `Step 2: Departure set to ${origin.iata} (${origin.city}). Click any airport to set destination.`;
  }

  // Stats panel
  if (routeCreationDraft.originIata && routeCreationDraft.destIata) {
    const origin = AIRPORTS.find(a => a.iata === routeCreationDraft.originIata);
    const dest = AIRPORTS.find(a => a.iata === routeCreationDraft.destIata);
    const distKm = Math.round(haversineKm(origin.lat, origin.lon, dest.lat, dest.lon));
    const oneWayHrs = flightTimeHours(distKm, 900); // generic cruise speed for display
    const flightHrs = Math.floor(oneWayHrs);
    const flightMins = Math.round((oneWayHrs - flightHrs) * 60);
    const blockHrs = Math.floor(oneWayHrs + TURNAROUND_HOURS);
    const blockMins = Math.round(((oneWayHrs + TURNAROUND_HOURS) - blockHrs) * 60);
    const demand = computeDemandWeekly(origin, dest, distKm);

    // Check if route already exists
    const exists = gameState.routes.some(r =>
      (r.originIata === routeCreationDraft.originIata && r.destIata === routeCreationDraft.destIata) ||
      (r.originIata === routeCreationDraft.destIata && r.destIata === routeCreationDraft.originIata)
    );

    statsEl.classList.remove('hidden');
    statsEl.innerHTML = `
      <h3>${routeCreationDraft.originIata} &rarr; ${routeCreationDraft.destIata}</h3>
      <div class="rc-stat-row"><span>Weekly demand</span><span>${formatNumber(demand)} pax</span></div>
      <div class="rc-stat-row"><span>Distance</span><span>${formatNumber(distKm)} km</span></div>
      <div class="rc-stat-row"><span>Flight time</span><span>${flightHrs}h ${flightMins}m</span></div>
      <div class="rc-stat-row"><span>Block time (w/ turnaround)</span><span>${blockHrs}h ${blockMins}m</span></div>
      <div class="rc-stat-row"><span>Setup cost</span><span style="color:var(--amber)">${formatMoney(ROUTE_CREATION_COST)}</span></div>
      ${exists ? '<div style="color:var(--red); font-size:12px; margin-top:8px;">This route already exists.</div>' : ''}
      ${!canAfford ? '<div style="color:var(--red); font-size:12px; margin-top:4px;">Not enough cash.</div>' : ''}
    `;
    createBtn.disabled = exists || !canAfford;
  } else {
    statsEl.classList.add('hidden');
    createBtn.disabled = true;
  }

  updateRcMapMarkers();
  updateRcRouteLine();
}

function initRouteCreationMap() {
  // Small delay to let the DOM render
  setTimeout(() => {
    const container = document.getElementById('rc-map');
    if (rcMap) {
      rcMap.remove();
      rcMap = null;
    }
    rcMap = L.map('rc-map', { zoomControl: true, attributionControl: false })
      .setView([15, 10], 2);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, subdomains: 'abcd'
    }).addTo(rcMap);

    rcAirportLayer = L.layerGroup().addTo(rcMap);
    updateRcMapMarkers();
    setTimeout(() => rcMap.invalidateSize(), 100);
  }, 50);
}

function updateRcMapMarkers() {
  if (!rcAirportLayer) return;
  rcAirportLayer.clearLayers();

  const hubIatas = gameState.airline.hubs;

  if (routeCreationStep === 1) {
    // Only show hubs
    AIRPORTS.filter(a => hubIatas.includes(a.iata)).forEach(a => {
      const icon = L.divIcon({ className: 'airport-marker hub', iconSize: [18, 18], html: '' });
      const m = L.marker([a.lat, a.lon], { icon });
      const popup = `
        <b>${a.iata}</b> &mdash; HUB<br>
        ${a.name}<br>${a.city}, ${a.country}<br>
        Runway: ${formatNumber(a.runway_m)} m<br>
        <div style="margin-top:8px;">
          <button class="btn primary" onclick="setRouteCreationDeparture('${a.iata}')">Set Departure</button>
        </div>`;
      m.bindPopup(popup);
      m.addTo(rcAirportLayer);
    });
  } else {
    // Show all airports; hub is highlighted
    AIRPORTS.forEach(a => {
      const isHub = hubIatas.includes(a.iata);
      const isDeparture = a.iata === routeCreationDraft.originIata;
      const isDest = a.iata === routeCreationDraft.destIata;

      let cls = 'airport-marker';
      if (isDeparture) cls += ' hub rc-selected-dep';
      else if (isDest) cls += ' rc-selected-dest';
      else if (isHub) cls += ' hub';
      else if (a.size === 'large') cls += ' large';
      else if (a.size === 'regional') cls += ' regional';

      const size = isHub || isDeparture || isDest ? 18 : (a.size === 'major' ? 12 : a.size === 'large' ? 10 : 8);
      const icon = L.divIcon({ className: cls, iconSize: [size, size], html: '' });
      const m = L.marker([a.lat, a.lon], { icon });

      if (a.iata !== routeCreationDraft.originIata) {
        const popup = `
          <b>${a.iata}</b>${isHub ? ' &mdash; HUB' : ''}<br>
          ${a.name}<br>${a.city}, ${a.country}<br>
          Runway: ${formatNumber(a.runway_m)} m &middot; ${a.size}<br>
          <div style="margin-top:8px;">
            <button class="btn primary" onclick="setRouteCreationDestination('${a.iata}')">Set Destination</button>
          </div>`;
        m.bindPopup(popup);
      }
      m.addTo(rcAirportLayer);
    });
  }
}

function updateRcRouteLine() {
  if (rcRouteLine) { rcMap && rcMap.removeLayer(rcRouteLine); rcRouteLine = null; }
  if (!rcMap || !routeCreationDraft.originIata || !routeCreationDraft.destIata) return;
  const o = AIRPORTS.find(a => a.iata === routeCreationDraft.originIata);
  const d = AIRPORTS.find(a => a.iata === routeCreationDraft.destIata);
  rcRouteLine = L.polyline([[o.lat, o.lon], [d.lat, d.lon]], {
    color: '#4dd8c8', weight: 2, opacity: 0.9
  }).addTo(rcMap);
}

function setRouteCreationDeparture(iata) {
  routeCreationDraft.originIata = iata;
  routeCreationDraft.destIata = null;
  routeCreationStep = 2;
  if (rcMap) { const a = AIRPORTS.find(x => x.iata === iata); rcMap.closePopup(); }
  renderRouteCreationPage();
}

function setRouteCreationDestination(iata) {
  if (iata === routeCreationDraft.originIata) return;
  routeCreationDraft.destIata = iata;
  if (rcMap) rcMap.closePopup();
  renderRouteCreationPage();
}

function confirmCreateRoute() {
  const { originIata, destIata } = routeCreationDraft;
  if (!originIata || !destIata) {
    alert('Select departure and destination airports first.');
    return;
  }
  if (gameState.finance.cash < ROUTE_CREATION_COST) return;

  const exists = gameState.routes.some(r =>
    (r.originIata === originIata && r.destIata === destIata) ||
    (r.originIata === destIata && r.destIata === originIata)
  );
  if (exists) return;

  gameState.finance.cash -= ROUTE_CREATION_COST;

  const route = {
    id: 'RT' + Math.random().toString(36).slice(2, 8).toUpperCase(),
    originIata,
    destIata,
    createdAtMinute: gameState.time.totalMinutes,
    assignments: [],
    // Aggregate fields (populated once assignments exist)
    totalCapacityWeekly: 0, totalFrequency: 0, demandWeekly: 0,
    totalRevenueWeekly: 0, totalExpensesWeekly: 0, totalProfitWeekly: 0,
    avgLoadFactor: 0, distanceKm: 0, flightTimeMin: 0
  };

  gameState.routes.push(route);
  saveGame();
  updateTopbarStats();
  refreshMapMarkers();

  // Navigate straight to the individual route page
  closeRouteCreationPage();
  openIndividualRoutePage(route.id);
}

function closeRouteCreationPage() {
  document.getElementById('view-route-creation').classList.remove('active');
  document.getElementById('view-routes').classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === 'routes');
  });
  if (rcMap) { rcMap.remove(); rcMap = null; rcAirportLayer = null; rcRouteLine = null; }
  renderRoutesPage();
}

// ============================================================
// INDIVIDUAL ROUTE PAGE
// ============================================================
function openIndividualRoutePage(routeId) {
  currentRoutePageId = routeId;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-route-detail').classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  renderIndividualRoutePage();
}

function closeIndividualRoutePage() {
  currentRoutePageId = null;
  document.getElementById('view-route-detail').classList.remove('active');
  document.getElementById('view-routes').classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === 'routes');
  });
  renderRoutesPage();
}

function renderIndividualRoutePage() {
  const route = gameState.routes.find(r => r.id === currentRoutePageId);
  if (!route) { closeIndividualRoutePage(); return; }

  const origin = AIRPORTS.find(a => a.iata === route.originIata);
  const dest = AIRPORTS.find(a => a.iata === route.destIata);

  // Header
  document.getElementById('rp-title').textContent = `${route.originIata} — ${route.destIata}`;
  document.getElementById('rp-subtitle').textContent = `${origin.city}, ${origin.country}  →  ${dest.city}, ${dest.country}`;

  // Route-level stats
  const flightHrs = Math.floor((route.flightTimeMin || 0) / 60);
  const flightMins = (route.flightTimeMin || 0) % 60;
  const blockMin = route.flightTimeMin ? route.flightTimeMin + TURNAROUND_HOURS * 60 : 0;
  const blockHrs = Math.floor(blockMin / 60);
  const blockMinRem = Math.round(blockMin % 60);
  const demand = route.demandWeekly || (() => {
    const d = haversineKm(origin.lat, origin.lon, dest.lat, dest.lon);
    return computeDemandWeekly(origin, dest, d);
  })();
  const served = Math.min(route.totalCapacityWeekly || 0, demand);
  const demandCoveredPct = demand > 0 ? Math.round((served / demand) * 100) : 0;

  document.getElementById('rp-stats').innerHTML = `
    <div class="rp-stat"><b>${formatNumber(route.distanceKm || Math.round(haversineKm(origin.lat, origin.lon, dest.lat, dest.lon)))} km</b><span>Distance</span></div>
    <div class="rp-stat"><b>${route.flightTimeMin ? `${flightHrs}h ${flightMins}m` : 'N/A'}</b><span>Flight time</span></div>
    <div class="rp-stat"><b>${route.flightTimeMin ? `${blockHrs}h ${blockMinRem}m` : 'N/A'}</b><span>Block time</span></div>
    <div class="rp-stat"><b>${formatNumber(demand)}/wk</b><span>Market demand</span></div>
  `;

  // Financials
  const profitColor = (route.totalProfitWeekly || 0) >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('rp-financials').innerHTML = `
    <div class="rp-fin-row"><span>Revenue</span><span class="pos">${formatMoney(route.totalRevenueWeekly || 0)}/wk</span></div>
    <div class="rp-fin-row"><span>Expenses</span><span class="neg">${formatMoney(route.totalExpensesWeekly || 0)}/wk</span></div>
    <div class="rp-fin-row" style="font-weight:600;"><span>Profit</span><span style="color:${profitColor}">${formatMoney(route.totalProfitWeekly || 0)}/wk</span></div>
    <div class="rp-fin-row"><span>Demand covered</span><span>${demandCoveredPct}% (${formatNumber(served)} / ${formatNumber(demand)} pax)</span></div>
    <div class="rp-fin-row"><span>Avg load factor</span><span>${Math.round((route.avgLoadFactor || 0) * 100)}%</span></div>
    <div class="rp-fin-row"><span>Weekly frequency</span><span>${route.totalFrequency || 0}x round trips</span></div>
  `;

  // Aircraft assignments table
  renderAssignmentsTable(route);

  // Mini-map
  renderRouteDetailMiniMap(route, origin, dest);
}

function renderAssignmentsTable(route) {
  const tbody = document.getElementById('rp-assignments-body');
  tbody.innerHTML = '';

  if (route.assignments.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="7" style="text-align:center; color:var(--text-muted); padding:18px;">No aircraft assigned yet.</td>';
    tbody.appendChild(tr);
    return;
  }

  route.assignments.forEach(asn => {
    const ac = gameState.fleet.find(a => a.id === asn.aircraftId);
    if (!ac) return;
    const loadPct = Math.round((asn.loadFactor || 0) * 100);
    const fareLine = ['economy', 'premium', 'business', 'first']
      .filter(cls => ac.cabin[cls] > 0)
      .map(cls => `${cls[0].toUpperCase()} $${Math.round(asn.fares?.[cls] || 0)}`)
      .join(' / ');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="reg-tag">${ac.registration}</span></td>
      <td>${ac.manufacturer} ${ac.model}</td>
      <td>${formatNumber(cabinTotalSeats(ac.cabin))}</td>
      <td>${asn.weeklyFrequency}x</td>
      <td>
        <div style="display:flex; align-items:center; gap:8px;">
          <div class="load-bar" style="width:70px;"><div style="width:${loadPct}%;"></div></div>
          <span style="font-family:var(--font-mono); font-size:12px;">${loadPct}%</span>
        </div>
      </td>
      <td style="font-family:var(--font-mono); font-size:11px; color:var(--text-muted);">${fareLine}</td>
      <td>
        <button class="btn btn-sm" onclick="openEditAssignmentModal('${route.id}','${asn.id}')">Edit Frequency</button>
        <button class="remove-route btn-sm" onclick="removeAssignment('${route.id}','${asn.id}')">Remove</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

let rpDetailMap = null;
let rpDetailRouteLine = null;

function renderRouteDetailMiniMap(route, origin, dest) {
  setTimeout(() => {
    const container = document.getElementById('rp-minimap');
    if (rpDetailMap) { rpDetailMap.remove(); rpDetailMap = null; }
    rpDetailMap = L.map('rp-minimap', { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, subdomains: 'abcd'
    }).addTo(rpDetailMap);

    const oIcon = L.divIcon({ className: 'airport-marker hub', iconSize: [14, 14], html: '' });
    const dIcon = L.divIcon({ className: 'airport-marker large', iconSize: [12, 12], html: '' });
    L.marker([origin.lat, origin.lon], { icon: oIcon }).bindTooltip(origin.iata, { permanent: true, direction: 'top', className: 'iata-tooltip' }).addTo(rpDetailMap);
    L.marker([dest.lat, dest.lon], { icon: dIcon }).bindTooltip(dest.iata, { permanent: true, direction: 'top', className: 'iata-tooltip' }).addTo(rpDetailMap);

    rpDetailRouteLine = L.polyline([[origin.lat, origin.lon], [dest.lat, dest.lon]], {
      color: '#4dd8c8', weight: 2, opacity: 0.85
    }).addTo(rpDetailMap);

    const bounds = L.latLngBounds([[origin.lat, origin.lon], [dest.lat, dest.lon]]);
    rpDetailMap.fitBounds(bounds, { padding: [30, 30] });
    setTimeout(() => rpDetailMap.invalidateSize(), 80);
  }, 50);
}

// ============================================================
// ADD AIRCRAFT ASSIGNMENT MODAL
// ============================================================
function openAddAssignmentModal(routeId) {
  const route = gameState.routes.find(r => r.id === routeId);
  if (!route) return;

  if (gameState.fleet.length === 0) {
    openModal(`<h2>Add Aircraft</h2><div class="modal-sub">Buy an aircraft in the Store first.</div>
      <div class="modal-actions"><div></div><button class="btn" onclick="closeModal()">Close</button></div>`);
    return;
  }

  // Default to first aircraft with any spare hours
  const defaultAc = gameState.fleet.find(ac => aircraftWeeklyHoursUsed(ac, null) < MAX_WEEKLY_HOURS) || gameState.fleet[0];
  asnEditDraft = {
    routeId,
    asnId: null,  // null = new
    aircraftId: defaultAc.id,
    weeklyFrequency: 7,
    fareMultiplier: 1
  };
  renderAddAssignmentModal();
}

function renderAddAssignmentModal() {
  const route = gameState.routes.find(r => r.id === asnEditDraft.routeId);
  const aircraft = gameState.fleet.find(a => a.id === asnEditDraft.aircraftId);
  if (!route || !aircraft) return;

  const origin = AIRPORTS.find(a => a.iata === route.originIata);
  const dest = AIRPORTS.find(a => a.iata === route.destIata);

  const existingHours = aircraftWeeklyHoursUsed(aircraft, null);
  const remainingHours = Math.max(0, MAX_WEEKLY_HOURS - existingHours);

  // Compute max frequency from available hours
  const distKm = haversineKm(origin.lat, origin.lon, dest.lat, dest.lon);
  const oneWayHrs = flightTimeHours(distKm, aircraft.cruise_kmh);
  const hoursPerRoundTrip = 2 * oneWayHrs + 2 * TURNAROUND_HOURS;
  const maxFreq = Math.max(0, Math.floor(remainingHours / hoursPerRoundTrip));

  const errors = [];
  if (distKm > aircraft.range_km) errors.push(`Distance (${formatNumber(Math.round(distKm))} km) exceeds aircraft range (${formatNumber(aircraft.range_km)} km).`);
  if (origin.runway_m < aircraft.min_runway_m) errors.push(`${origin.iata} runway too short for this aircraft.`);
  if (dest.runway_m < aircraft.min_runway_m) errors.push(`${dest.iata} runway too short for this aircraft.`);
  if (maxFreq <= 0) errors.push(`No spare hours on this aircraft (${existingHours.toFixed(1)} / ${MAX_WEEKLY_HOURS} hrs used).`);

  if (asnEditDraft.weeklyFrequency > maxFreq) asnEditDraft.weeklyFrequency = Math.max(1, maxFreq);
  if (asnEditDraft.weeklyFrequency < 1) asnEditDraft.weeklyFrequency = 1;

  const fareMultMax = effectiveFareMultMax(aircraft);
  asnEditDraft.fareMultiplier = Math.min(fareMultMax, Math.max(FARE_MULT_MIN, asnEditDraft.fareMultiplier));

  let preview = null;
  if (errors.length === 0) {
    const tempAsn = {
      id: '__preview__',
      aircraftId: aircraft.id,
      weeklyFrequency: asnEditDraft.weeklyFrequency,
      fareMultiplier: asnEditDraft.fareMultiplier
    };
    previewAssignmentEconomics(tempAsn, route, null);
    preview = tempAsn;
  }

  const aircraftOptions = gameState.fleet.map(ac => {
    const hrs = aircraftWeeklyHoursUsed(ac, null);
    return `<option value="${ac.id}" ${ac.id === aircraft.id ? 'selected' : ''}>${ac.registration} — ${ac.manufacturer} ${ac.model} (${hrs.toFixed(0)}/${MAX_WEEKLY_HOURS} hrs)</option>`;
  }).join('');

  let previewHtml = '';
  if (preview) {
    const loadPct = Math.round(preview.loadFactor * 100);
    const fareLine = ['economy', 'premium', 'business', 'first']
      .filter(cls => aircraft.cabin[cls] > 0)
      .map(cls => `${cls[0].toUpperCase()} $${Math.round(preview.fares?.[cls] || 0)}`).join(' · ');
    previewHtml = `
      <div class="opt-group" style="margin-top:8px;">
        <h2>Preview</h2>
        <div class="opt-row"><span>Hours used/wk</span><span class="v" style="font-family:var(--font-mono);">${preview.hoursUsed.toFixed(1)} / ${MAX_WEEKLY_HOURS}</span></div>
        <div class="opt-row"><span>Load factor</span><span class="v" style="font-family:var(--font-mono);">${loadPct}%</span></div>
        <div class="opt-row"><span>Satisfaction</span><span class="v" style="font-family:var(--font-mono);">${Math.round(preview.satisfaction * 100)}% (${getAgingTier(aircraft).label})</span></div>
        <div class="opt-row"><span>Fares (one-way)</span><span class="v" style="font-family:var(--font-mono); font-size:11px;">${fareLine}</span></div>
        <div class="opt-row"><span>Revenue</span><span class="v pos" style="font-family:var(--font-mono);">${formatMoney(preview.revenueWeekly)}/wk</span></div>
        <div class="opt-row"><span>Expenses</span><span class="v neg" style="font-family:var(--font-mono);">${formatMoney(preview.fuelWeekly + preview.crewWeekly + preview.maintenanceWeekly)}/wk</span></div>
        <div class="opt-row"><span>Profit</span><span class="v ${preview.profitWeekly >= 0 ? 'pos' : 'neg'}" style="font-family:var(--font-mono); font-weight:600;">${formatMoney(preview.profitWeekly)}/wk</span></div>
      </div>`;
  }

  document.getElementById('modal-card').innerHTML = `
    <h2>Add Aircraft to ${route.originIata} — ${route.destIata}</h2>
    <div class="modal-sub">Each aircraft has ${MAX_WEEKLY_HOURS} flight hours/week available across all its routes.</div>
    <div class="field">
      <label>Aircraft</label>
      <select onchange="asnEditDraft.aircraftId = this.value; renderAddAssignmentModal()">${aircraftOptions}</select>
    </div>
    <div class="field">
      <label>Weekly frequency (round trips)</label>
      <input type="number" min="1" max="${Math.max(1, maxFreq)}" value="${asnEditDraft.weeklyFrequency}"
        onchange="asnEditDraft.weeklyFrequency = parseInt(this.value)||1; renderAddAssignmentModal()">
      <div style="font-family:var(--font-mono); font-size:11px; color:var(--text-muted); margin-top:4px;">Max available: ${maxFreq}/week</div>
    </div>
    <div class="field">
      <label>Fare multiplier (&times;${asnEditDraft.fareMultiplier.toFixed(2)})</label>
      <input type="range" min="${FARE_MULT_MIN}" max="${fareMultMax}" step="${FARE_MULT_STEP}" value="${asnEditDraft.fareMultiplier}"
        oninput="asnEditDraft.fareMultiplier = parseFloat(this.value); renderAddAssignmentModal()">
      <div style="font-family:var(--font-mono); font-size:11px; color:var(--text-muted); margin-top:4px;">Max &times;${fareMultMax.toFixed(2)} for ${getAgingTier(aircraft).label} condition</div>
    </div>
    ${previewHtml}
    <div class="modal-actions">
      <div></div>
      <div>
        <button class="btn" onclick="closeModal()">Cancel</button>
        <button class="btn primary" ${errors.length > 0 ? 'disabled' : ''} onclick="confirmAddAssignment()">Add to Route</button>
      </div>
    </div>
    <div class="modal-error">${errors.join('<br>')}</div>
  `;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function confirmAddAssignment() {
  if (!asnEditDraft) return;
  const route = gameState.routes.find(r => r.id === asnEditDraft.routeId);
  if (!route) return;

  const asn = {
    id: 'ASN' + Math.random().toString(36).slice(2, 8).toUpperCase(),
    aircraftId: asnEditDraft.aircraftId,
    weeklyFrequency: asnEditDraft.weeklyFrequency,
    fareMultiplier: asnEditDraft.fareMultiplier
  };
  route.assignments.push(asn);
  recomputeAircraftRoutes(asn.aircraftId);

  closeModal();
  saveGame();
  renderIndividualRoutePage();
  renderFleetPage();
  renderOverviewPanel();
  updateTopbarStats();
  refreshMapMarkers();
}

// ============================================================
// EDIT ASSIGNMENT MODAL
// ============================================================
function openEditAssignmentModal(routeId, asnId) {
  const route = gameState.routes.find(r => r.id === routeId);
  const asn = route?.assignments.find(a => a.id === asnId);
  if (!route || !asn) return;

  asnEditDraft = {
    routeId,
    asnId,
    aircraftId: asn.aircraftId,
    weeklyFrequency: asn.weeklyFrequency,
    fareMultiplier: asn.fareMultiplier || 1
  };
  renderEditAssignmentModal();
}

function renderEditAssignmentModal() {
  const route = gameState.routes.find(r => r.id === asnEditDraft.routeId);
  const aircraft = gameState.fleet.find(a => a.id === asnEditDraft.aircraftId);
  const asn = route?.assignments.find(a => a.id === asnEditDraft.asnId);
  if (!route || !aircraft || !asn) return;

  const origin = AIRPORTS.find(a => a.iata === route.originIata);
  const dest = AIRPORTS.find(a => a.iata === route.destIata);

  const otherHours = aircraftWeeklyHoursUsed(aircraft, asnEditDraft.asnId);
  const distKm = haversineKm(origin.lat, origin.lon, dest.lat, dest.lon);
  const oneWayHrs = flightTimeHours(distKm, aircraft.cruise_kmh);
  const hoursPerRoundTrip = 2 * oneWayHrs + 2 * TURNAROUND_HOURS;
  const maxFreq = Math.max(1, Math.floor((MAX_WEEKLY_HOURS - otherHours) / hoursPerRoundTrip));

  if (asnEditDraft.weeklyFrequency > maxFreq) asnEditDraft.weeklyFrequency = maxFreq;
  if (asnEditDraft.weeklyFrequency < 1) asnEditDraft.weeklyFrequency = 1;

  const fareMultMax = effectiveFareMultMax(aircraft);
  asnEditDraft.fareMultiplier = Math.min(fareMultMax, Math.max(FARE_MULT_MIN, asnEditDraft.fareMultiplier));

  const tempAsn = {
    id: '__preview__',
    aircraftId: aircraft.id,
    weeklyFrequency: asnEditDraft.weeklyFrequency,
    fareMultiplier: asnEditDraft.fareMultiplier
  };
  previewAssignmentEconomics(tempAsn, route, asnEditDraft.asnId);

  const loadPct = Math.round(tempAsn.loadFactor * 100);
  const fareLine = ['economy', 'premium', 'business', 'first']
    .filter(cls => aircraft.cabin[cls] > 0)
    .map(cls => `${cls[0].toUpperCase()} $${Math.round(tempAsn.fares?.[cls] || 0)}`).join(' · ');

  document.getElementById('modal-card').innerHTML = `
    <h2>Edit Assignment</h2>
    <div class="modal-sub">${route.originIata} &rarr; ${route.destIata} &middot; ${aircraft.registration} ${aircraft.model}</div>
    <div class="field">
      <label>Weekly frequency (round trips)</label>
      <input type="number" min="1" max="${maxFreq}" value="${asnEditDraft.weeklyFrequency}"
        onchange="asnEditDraft.weeklyFrequency = parseInt(this.value)||1; renderEditAssignmentModal()">
      <div style="font-family:var(--font-mono); font-size:11px; color:var(--text-muted); margin-top:4px;">Max: ${maxFreq}/week</div>
    </div>
    <div class="field">
      <label>Fare multiplier (&times;${asnEditDraft.fareMultiplier.toFixed(2)})</label>
      <input type="range" min="${FARE_MULT_MIN}" max="${fareMultMax}" step="${FARE_MULT_STEP}" value="${asnEditDraft.fareMultiplier}"
        oninput="asnEditDraft.fareMultiplier = parseFloat(this.value); renderEditAssignmentModal()">
      <div style="font-family:var(--font-mono); font-size:11px; color:var(--text-muted); margin-top:4px;">Fares: ${fareLine}</div>
    </div>
    <div class="opt-group" style="margin-top:8px;">
      <h2>Preview</h2>
      <div class="opt-row"><span>Hours/wk</span><span class="v" style="font-family:var(--font-mono);">${tempAsn.hoursUsed.toFixed(1)} / ${MAX_WEEKLY_HOURS}</span></div>
      <div class="opt-row"><span>Load factor</span><span class="v" style="font-family:var(--font-mono);">${loadPct}%</span></div>
      <div class="opt-row"><span>Satisfaction</span><span class="v" style="font-family:var(--font-mono);">${Math.round(tempAsn.satisfaction * 100)}%</span></div>
      <div class="opt-row"><span>Revenue</span><span class="v pos" style="font-family:var(--font-mono);">${formatMoney(tempAsn.revenueWeekly)}/wk</span></div>
      <div class="opt-row"><span>Expenses</span><span class="v neg" style="font-family:var(--font-mono);">${formatMoney(tempAsn.fuelWeekly + tempAsn.crewWeekly + tempAsn.maintenanceWeekly)}/wk</span></div>
      <div class="opt-row"><span>Profit</span><span class="v ${tempAsn.profitWeekly >= 0 ? 'pos' : 'neg'}" style="font-family:var(--font-mono); font-weight:600;">${formatMoney(tempAsn.profitWeekly)}/wk</span></div>
    </div>
    <div class="modal-actions">
      <div></div>
      <div>
        <button class="btn" onclick="closeModal()">Cancel</button>
        <button class="btn primary" onclick="confirmEditAssignment()">Save</button>
      </div>
    </div>
  `;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function confirmEditAssignment() {
  if (!asnEditDraft?.asnId) return;
  const route = gameState.routes.find(r => r.id === asnEditDraft.routeId);
  const asn = route?.assignments.find(a => a.id === asnEditDraft.asnId);
  if (!asn) return;

  asn.weeklyFrequency = asnEditDraft.weeklyFrequency;
  asn.fareMultiplier = asnEditDraft.fareMultiplier;
  recomputeAircraftRoutes(asn.aircraftId);

  closeModal();
  saveGame();
  renderIndividualRoutePage();
  renderFleetPage();
  renderOverviewPanel();
  updateTopbarStats();
  refreshMapMarkers();
}

// ============================================================
// REMOVE ACTIONS
// ============================================================
function removeAssignment(routeId, asnId) {
  const route = gameState.routes.find(r => r.id === routeId);
  const asn = route?.assignments.find(a => a.id === asnId);
  if (!route || !asn) return;

  const aircraftId = asn.aircraftId;
  route.assignments = route.assignments.filter(a => a.id !== asnId);
  recomputeAircraftRoutes(aircraftId);
  refreshRouteTotals(route);

  saveGame();
  renderIndividualRoutePage();
  renderFleetPage();
  renderOverviewPanel();
  updateTopbarStats();
  refreshMapMarkers();
}

function removeRoute(routeId) {
  const route = gameState.routes.find(r => r.id === routeId);
  if (!route) return;

  // Recompute all affected aircraft after removing
  const affectedAircraftIds = new Set(route.assignments.map(a => a.aircraftId));
  gameState.routes = gameState.routes.filter(r => r.id !== routeId);
  affectedAircraftIds.forEach(id => recomputeAircraftRoutes(id));

  saveGame();
  if (currentRoutePageId === routeId) {
    closeIndividualRoutePage();
  } else {
    renderRoutesPage();
  }
  renderFleetPage();
  renderOverviewPanel();
  updateTopbarStats();
  refreshMapMarkers();
}
