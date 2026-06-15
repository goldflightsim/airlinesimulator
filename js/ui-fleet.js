// ============================================================
// UI: FLEET PAGE
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
      <div class="strip-row"><span class="k">Registration</span><span class="v">${ac.registration}
        <button class="btn" style="padding:2px 8px; font-size:11px; margin-left:6px;" onclick="openEditRegistrationModal('${ac.id}')">Edit</button>
      </span></div>
      <div class="strip-row"><span class="k">Category</span><span class="v">${ac.category}</span></div>
      <div class="strip-row"><span class="k">Range</span><span class="v">${formatNumber(ac.range_km)} km</span></div>
      <div class="strip-row"><span class="k">Cruise speed</span><span class="v">${formatNumber(ac.cruise_kmh)} km/h</span></div>
      <div class="strip-row"><span class="k">Min. runway</span><span class="v">${formatNumber(ac.min_runway_m)} m</span></div>
      <div class="strip-row"><span class="k">Cabin layout</span><span class="v">${ac.cabin.economy}Y / ${ac.cabin.premium}W / ${ac.cabin.business}J / ${ac.cabin.first}F (${seatsTotal} total)</span></div>
      <div class="strip-row"><span class="k">Cabin quality</span><span class="v">${CABIN_QUALITIES[ac.cabinQuality].label}</span></div>
      <div class="strip-row"><span class="k"></span><span class="v">
        <button class="btn" style="padding:2px 8px; font-size:11px;" onclick="openEditCabinModal('${ac.id}')">Edit Cabin &amp; Quality</button>
      </span></div>
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

// ---------------------------------------------------------
// Edit registration
// ---------------------------------------------------------
function openEditRegistrationModal(aircraftId) {
  const ac = gameState.fleet.find(a => a.id === aircraftId);
  if (!ac) return;
  const suffix = ac.registration.startsWith(ac.registrationPrefix)
    ? ac.registration.slice(ac.registrationPrefix.length)
    : ac.registration;

  openModal(`
    <h2>Edit Registration</h2>
    <div class="modal-sub">${ac.id} &mdash; ${ac.manufacturer} ${ac.model}</div>
    <div class="field">
      <label>Registration</label>
      <div style="display:flex; gap:8px; align-items:center;">
        <span style="font-family:var(--font-mono); font-size:16px;">${ac.registrationPrefix}</span>
        <input type="text" id="reg-suffix-input" value="${suffix}" maxlength="6" style="flex:1; text-transform:uppercase; font-family:var(--font-mono);">
      </div>
      <div style="font-family:var(--font-mono); font-size:11px; color:var(--text-muted); margin-top:4px;">Country prefix is fixed and cannot be changed.</div>
    </div>
    <div class="modal-actions">
      <div></div>
      <div>
        <button class="btn" onclick="closeModal()">Cancel</button>
        <button class="btn primary" onclick="confirmEditRegistration('${ac.id}')">Save</button>
      </div>
    </div>
  `);
}

function confirmEditRegistration(aircraftId) {
  const ac = gameState.fleet.find(a => a.id === aircraftId);
  if (!ac) return;
  const input = document.getElementById('reg-suffix-input');
  const suffix = input.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!suffix) return;

  ac.registration = ac.registrationPrefix + suffix;

  closeModal();
  saveGame();
  renderFleetPage();
  refreshMapMarkers();
}

// ---------------------------------------------------------
// Edit cabin layout & quality (at a refit cost)
// ---------------------------------------------------------
function openEditCabinModal(aircraftId) {
  const ac = gameState.fleet.find(a => a.id === aircraftId);
  if (!ac) return;
  cabinEditDraft = {
    aircraftId,
    cabin: { premium: ac.cabin.premium, business: ac.cabin.business, first: ac.cabin.first },
    quality: ac.cabinQuality
  };
  renderEditCabinModal();
}

function renderEditCabinModal() {
  const ac = gameState.fleet.find(a => a.id === cabinEditDraft.aircraftId);
  if (!ac) return;
  const { cabin, quality } = cabinEditDraft;

  const unitsUsed = cabinUnitsUsed({ economy: 0, ...cabin });
  const economy = Math.floor(ac.max_capacity - unitsUsed);
  const totalSeats = Math.max(0, economy) + cabin.premium + cabin.business + cabin.first;
  const overCapacity = economy < 0;

  const cabinRow = (cls, label, color) => `
    <div class="cabin-row">
      <div class="cabin-label"><span class="cabin-unit-dot" style="background:${color};"></span>${label} <span style="color:var(--text-dim);">(${CABIN_UNIT_WEIGHTS[cls]}x space)</span></div>
      <input type="number" min="0" value="${cabin[cls] || 0}" onchange="updateCabinEditField('${cls}', this.value)">
    </div>`;

  const barSegments = [
    { cls: 'economy', count: Math.max(0, economy), color: 'var(--cyan)' },
    { cls: 'premium', count: cabin.premium, color: 'var(--green)' },
    { cls: 'business', count: cabin.business, color: 'var(--amber)' },
    { cls: 'first', count: cabin.first, color: 'var(--red)' }
  ];
  const barHtml = barSegments.map(s => {
    const units = s.count * CABIN_UNIT_WEIGHTS[s.cls];
    const pct = Math.max(0, Math.min(100, (units / ac.max_capacity) * 100));
    return `<div style="width:${pct}%; background:${s.color};"></div>`;
  }).join('');

  const qualityButtons = Object.entries(CABIN_QUALITIES).map(([key, q]) => `
    <button class="${quality === key ? 'selected' : ''}" onclick="setCabinEditQuality('${key}')">
      <span class="q-title">${q.label}</span>
      Fares &times;${q.fareMult.toFixed(2)} &middot; Maint. &times;${q.maintMult.toFixed(2)}
    </button>
  `).join('');

  let refitCost = 0;
  let errors = [];
  if (overCapacity) {
    errors.push('Cabin configuration exceeds aircraft capacity.');
  } else {
    refitCost = computeRefitCost(ac, cabin, quality);
  }
  const canAfford = gameState.finance.cash >= refitCost;
  if (!overCapacity && !canAfford) errors.push('Not enough cash for this refit.');

  document.getElementById('modal-card').innerHTML = `
    <h2>Edit Cabin &amp; Quality</h2>
    <div class="modal-sub">${ac.id} &mdash; ${ac.manufacturer} ${ac.model} (${ac.registration})<br>Max capacity: ${formatNumber(ac.max_capacity)} seats (all-economy)</div>

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

    <div class="modal-actions">
      <div style="font-family:var(--font-mono); font-size:18px; color:var(--cyan);">Refit cost: ${formatMoney(refitCost)}</div>
      <div>
        <button class="btn" onclick="closeModal()">Cancel</button>
        <button class="btn primary" ${errors.length > 0 ? 'disabled' : ''} onclick="confirmEditCabin()">Confirm Refit</button>
      </div>
    </div>
    <div class="modal-error">${errors.join('<br>')}</div>
  `;

  document.getElementById('modal-overlay').classList.remove('hidden');
}

function updateCabinEditField(cls, value) {
  cabinEditDraft.cabin[cls] = Math.max(0, parseInt(value, 10) || 0);
  renderEditCabinModal();
}

function setCabinEditQuality(key) {
  cabinEditDraft.quality = key;
  renderEditCabinModal();
}

function confirmEditCabin() {
  const ac = gameState.fleet.find(a => a.id === cabinEditDraft.aircraftId);
  if (!ac) return;
  const { cabin, quality } = cabinEditDraft;

  const unitsUsed = cabinUnitsUsed({ economy: 0, ...cabin });
  const economy = Math.floor(ac.max_capacity - unitsUsed);
  if (economy < 0) return;

  const refitCost = computeRefitCost(ac, cabin, quality);
  if (gameState.finance.cash < refitCost) return;

  gameState.finance.cash -= refitCost;
  ac.cabin = { economy, premium: cabin.premium, business: cabin.business, first: cabin.first };
  ac.cabinQuality = quality;

  recomputeAircraftRoutes(ac.id);

  closeModal();
  saveGame();
  renderFleetPage();
  renderRoutesPage();
  renderOverviewPanel();
  updateTopbarStats();
  refreshMapMarkers();
}
