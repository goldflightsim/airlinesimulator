// ============================================================
// UI: STORE PAGE
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
    const locked = spec.category === 'widebody' && !hasLicense('widebody');
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
      <div class="model-price">From ${formatMoney(spec.price_new_usd)}</div>
      ${locked
        ? `<button class="btn" disabled>Requires Widebody License</button>`
        : `<button class="btn primary" onclick='openPurchaseModal(${JSON.stringify(spec)})'>Buy</button>`}
    `;
    list.appendChild(card);
  });
}

// ---------------------------------------------------------
// Used market
// ---------------------------------------------------------
function generateUsedMarket() {
  const countryCode = gameState.airline.countryCode;
  const market = AIRPLANES.map((spec, i) => {
    const ageYears = 1 + Math.floor(Math.random() * 18);
    const depreciation = Math.max(0.25, Math.pow(0.93, ageYears));
    let condition = 'High-hours';
    if (ageYears <= 3) condition = 'Excellent';
    else if (ageYears <= 7) condition = 'Good';
    else if (ageYears <= 12) condition = 'Fair';
    const prefixes = getRegistrationPrefixes(countryCode);
    return {
      id: 'USED' + i,
      manufacturer: spec.manufacturer,
      family: spec.family,
      model: spec.model,
      category: spec.category,
      ageYears,
      condition,
      price: Math.round(spec.price_new_usd * depreciation),
      registrationPrefix: prefixes.used,
      registration: generateRegistration(countryCode, 'used')
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
    const locked = spec.category === 'widebody' && !hasLicense('widebody');
    const card = document.createElement('div');
    card.className = 'model-card used';
    card.innerHTML = `
      <div class="model-title">${spec.manufacturer} ${spec.model}<span class="fam">${spec.family} family &middot; ${spec.category}</span></div>
      <div class="model-specs">
        <div><b>${u.ageYears} yr${u.ageYears > 1 ? 's' : ''}</b>age</div>
        <div><b>${u.condition}</b>condition</div>
        <div><b>${u.registration}</b>registration</div>
        <div><b>${formatNumber(spec.max_capacity)}</b>max seats</div>
        <div><b>${formatNumber(spec.range_km)} km</b>range</div>
      </div>
      <div class="model-price">From ${formatMoney(u.price)}</div>
      ${locked
        ? `<button class="btn" disabled>Requires Widebody License</button>`
        : `<button class="btn primary" onclick='openPurchaseModal(${JSON.stringify(spec)}, ${JSON.stringify(u)})'>Buy</button>`}
    `;
    list.appendChild(card);
  });
}

// ---------------------------------------------------------
// Purchase modal (cabin configurator, quality, registration, home base)
// ---------------------------------------------------------
function openPurchaseModal(spec, usedEntry) {
  purchaseDraft = {
    spec,
    usedEntry: usedEntry || null,
    cabin: { premium: 0, business: 0, first: 0 },
    quality: 'standard',
    homeBase: gameState.airline.hubs.includes(gameState.airline.hubIata) ? gameState.airline.hubIata : gameState.airline.hubs[0],
    registrationSuffix: randomRegistrationSuffix()
  };
  renderPurchaseModal();
}

// Compute the live purchase price given the current cabin/quality draft.
function purchaseDraftPrice() {
  const { spec, usedEntry, cabin, quality } = purchaseDraft;
  const configPrice = computeConfigPrice(spec, cabin, quality);
  if (!usedEntry) return Math.round(configPrice);
  const depreciationRatio = usedEntry.price / spec.price_new_usd;
  return Math.round(configPrice * depreciationRatio);
}

function renderPurchaseModal() {
  const { spec, usedEntry, cabin, quality, homeBase } = purchaseDraft;
  const price = purchaseDraftPrice();
  const unitsUsed = cabinUnitsUsed({ economy: 0, ...cabin });
  const economy = Math.floor(spec.max_capacity - unitsUsed);
  const totalSeats = Math.max(0, economy) + cabin.premium + cabin.business + cabin.first;
  const overCapacity = economy < 0;
  const hubAirports = AIRPORTS.filter(a => gameState.airline.hubs.includes(a.iata));

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
      Fares &times;${q.fareMult.toFixed(2)} &middot; Maint. &times;${q.maintMult.toFixed(2)} &middot; Price &times;${q.priceMult.toFixed(2)}
    </button>
  `).join('');

  const homeBaseOptions = hubAirports.map(a =>
    `<option value="${a.iata}" ${a.iata === homeBase ? 'selected' : ''}>${a.iata} — ${a.city}</option>`
  ).join('');

  // Registration field
  let registrationHtml;
  if (usedEntry) {
    registrationHtml = `
      <div class="field">
        <label>Registration</label>
        <div style="font-family:var(--font-mono); font-size:16px;">${usedEntry.registration}</div>
        <div style="font-family:var(--font-mono); font-size:11px; color:var(--text-muted); margin-top:4px;">Used aircraft come with a pre-assigned registration. You can edit it later from the Fleet page.</div>
      </div>`;
  } else {
    const prefix = getRegistrationPrefixes(gameState.airline.countryCode).new;
    registrationHtml = `
      <div class="field">
        <label>Registration</label>
        <div style="display:flex; gap:8px; align-items:center;">
          <span style="font-family:var(--font-mono); font-size:16px;">${prefix}</span>
          <input type="text" id="purchase-reg-suffix" value="${purchaseDraft.registrationSuffix}" maxlength="6" style="flex:1; text-transform:uppercase; font-family:var(--font-mono);" onchange="purchaseDraft.registrationSuffix = this.value.toUpperCase().replace(/[^A-Z0-9]/g,'')">
        </div>
        <div style="font-family:var(--font-mono); font-size:11px; color:var(--text-muted); margin-top:4px;">Country prefix (${prefix}) is fixed for new aircraft.</div>
      </div>`;
  }

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

    ${registrationHtml}

    <div class="field">
      <label>Home base (hub)</label>
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
  const { spec, usedEntry, cabin, quality, homeBase } = purchaseDraft;
  if (spec.category === 'widebody' && !hasLicense('widebody')) { closeModal(); return; }
  const price = purchaseDraftPrice();
  if (gameState.finance.cash < price) return;

  const economy = Math.floor(spec.max_capacity - cabinUnitsUsed({ economy: 0, ...cabin }));
  if (economy < 0) return;

  const opts = {
    condition: usedEntry ? 'used' : 'new',
    cabin: { economy, premium: cabin.premium, business: cabin.business, first: cabin.first },
    cabinQuality: quality,
    homeBase
  };

  if (usedEntry) {
    opts.registration = usedEntry.registration;
    opts.registrationPrefix = usedEntry.registrationPrefix;
    opts.ageYears = usedEntry.ageYears;
  } else {
    const prefix = getRegistrationPrefixes(gameState.airline.countryCode).new;
    const suffix = (document.getElementById('purchase-reg-suffix')?.value || purchaseDraft.registrationSuffix || randomRegistrationSuffix())
      .toUpperCase().replace(/[^A-Z0-9]/g, '') || randomRegistrationSuffix();
    opts.registrationPrefix = prefix;
    opts.registration = prefix + suffix;
  }

  const aircraft = createAircraftInstance(spec, opts);
  aircraft.purchasePrice = price;
  if (usedEntry) {
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
