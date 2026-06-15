// ============================================================
// UI: ROUTES PAGE
// ============================================================

let freqEditDraft = null;

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
        <button class="btn" onclick="openEditFrequencyModal('${route.id}')">Edit frequency</button>
        <button class="remove-route" onclick="removeRoute('${route.id}')">Remove route</button>
      </div>
    `;
    list.appendChild(card);
  });
}

// ---------------------------------------------------------
// New route
// ---------------------------------------------------------
function openNewRouteModal() {
  if (gameState.fleet.length === 0) {
    openModal(`
      <h2>New Route</h2>
      <div class="modal-sub">You don't own any aircraft yet. Buy one in the Store first.</div>
      <div class="modal-actions"><div></div><button class="btn" onclick="closeModal()">Close</button></div>
    `);
    return;
  }

  if (gameState.airline.hubs.length === 0) {
    openModal(`
      <h2>New Route</h2>
      <div class="modal-sub">You don't own any hubs yet. Purchase a hub on the map first &mdash; routes must depart from a hub.</div>
      <div class="modal-actions"><div></div><button class="btn" onclick="closeModal()">Close</button></div>
    `);
    return;
  }

  const hubAirports = AIRPORTS.filter(a => gameState.airline.hubs.includes(a.iata));
  const defaultOrigin = hubAirports.find(a => a.iata === gameState.airline.hubIata) || hubAirports[0];
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
  const hubAirports = AIRPORTS.filter(a => gameState.airline.hubs.includes(a.iata));
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

  const originOptions = hubAirports.map(a =>
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
    <div class="modal-sub">Routes must depart from one of your hubs. Each aircraft has ${MAX_WEEKLY_HOURS} flight hours/week (incl. turnarounds).</div>

    <div class="field">
      <label>Aircraft</label>
      <select onchange="routeDraft.aircraftId = this.value; renderNewRouteModal()">${aircraftOptions}</select>
    </div>

    <div class="field-row">
      <div class="field">
        <label>Origin (hub)</label>
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

// ---------------------------------------------------------
// Edit weekly frequency
// ---------------------------------------------------------
function openEditFrequencyModal(routeId) {
  const route = gameState.routes.find(r => r.id === routeId);
  if (!route) return;
  freqEditDraft = { routeId, weeklyFrequency: route.weeklyFrequency };
  renderEditFrequencyModal();
}

function renderEditFrequencyModal() {
  const route = gameState.routes.find(r => r.id === freqEditDraft.routeId);
  const aircraft = gameState.fleet.find(a => a.id === route.aircraftId);

  const otherHours = aircraftWeeklyHoursUsed(aircraft, route.id);
  const hoursPerRoundTrip = route.hoursUsed / route.weeklyFrequency;
  const maxFreq = Math.max(1, Math.floor((MAX_WEEKLY_HOURS - otherHours) / hoursPerRoundTrip));

  if (freqEditDraft.weeklyFrequency > maxFreq) freqEditDraft.weeklyFrequency = maxFreq;
  if (freqEditDraft.weeklyFrequency < 1) freqEditDraft.weeklyFrequency = 1;

  const tempRoute = { originIata: route.originIata, destIata: route.destIata, weeklyFrequency: freqEditDraft.weeklyFrequency };
  computeRouteEconomics(tempRoute, aircraft);
  const totalHoursAfter = otherHours + tempRoute.hoursUsed;
  const quality = CABIN_QUALITIES[aircraft.cabinQuality] || CABIN_QUALITIES.standard;
  const totalMaintenance = (MAINTENANCE_WEEKLY_BASE[aircraft.category] || 35000) * quality.maintMult;
  tempRoute.maintenanceWeekly = totalHoursAfter > 0 ? totalMaintenance * (tempRoute.hoursUsed / totalHoursAfter) : 0;
  tempRoute.profitWeekly = tempRoute.revenueWeekly - tempRoute.fuelWeekly - tempRoute.crewWeekly - tempRoute.maintenanceWeekly;

  const loadPct = Math.round(tempRoute.loadFactor * 100);

  document.getElementById('modal-card').innerHTML = `
    <h2>Edit Frequency</h2>
    <div class="modal-sub">${route.originIata} &rarr; ${route.destIata} &middot; ${aircraft.id} ${aircraft.model}</div>

    <div class="field">
      <label>Weekly frequency (round trips)</label>
      <input type="number" min="1" max="${maxFreq}" value="${freqEditDraft.weeklyFrequency}"
        onchange="freqEditDraft.weeklyFrequency = parseInt(this.value)||1; renderEditFrequencyModal()">
      <div style="font-family:var(--font-mono); font-size:11px; color:var(--text-muted); margin-top:4px;">Max with current aircraft hours: ${maxFreq}/week</div>
    </div>

    <div class="opt-group" style="margin-top:6px;">
      <h2>Preview</h2>
      <div class="opt-row"><span>Aircraft hours/week</span><span class="v" style="font-family:var(--font-mono);">${tempRoute.hoursUsed.toFixed(1)} / ${MAX_WEEKLY_HOURS}</span></div>
      <div class="opt-row"><span>Load factor</span><span class="v" style="font-family:var(--font-mono);">${loadPct}%</span></div>
      <div class="opt-row"><span>Revenue</span><span class="v pos" style="font-family:var(--font-mono);">${formatMoney(tempRoute.revenueWeekly)}/wk</span></div>
      <div class="opt-row"><span>Fuel + Crew + Maintenance</span><span class="v neg" style="font-family:var(--font-mono);">${formatMoney(tempRoute.fuelWeekly + tempRoute.crewWeekly + tempRoute.maintenanceWeekly)}/wk</span></div>
      <div class="opt-row"><span>Profit</span><span class="v ${tempRoute.profitWeekly>=0?'pos':'neg'}" style="font-family:var(--font-mono); font-weight:600;">${formatMoney(tempRoute.profitWeekly)}/wk</span></div>
    </div>

    <div class="modal-actions">
      <div></div>
      <div>
        <button class="btn" onclick="closeModal()">Cancel</button>
        <button class="btn primary" onclick="confirmEditFrequency()">Save</button>
      </div>
    </div>
  `;

  document.getElementById('modal-overlay').classList.remove('hidden');
}

function confirmEditFrequency() {
  const route = gameState.routes.find(r => r.id === freqEditDraft.routeId);
  if (!route) return;
  route.weeklyFrequency = freqEditDraft.weeklyFrequency;
  recomputeAircraftRoutes(route.aircraftId);

  closeModal();
  saveGame();
  renderRoutesPage();
  renderFleetPage();
  renderOverviewPanel();
  updateTopbarStats();
  refreshMapMarkers();
}
