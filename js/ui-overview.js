// ============================================================
// UI: OVERVIEW PANEL & TOPBAR
// ============================================================

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

function renderOverviewPanel() {
  const { airline, finance, fleet, routes } = gameState;
  const hub = AIRPORTS.find(a => a.iata === airline.hubIata);

  document.getElementById('ov-airline-name').textContent = airline.name;
  document.getElementById('ov-country').textContent = airline.countryName;
  document.getElementById('ov-hub').textContent = hub ? `${hub.iata} — ${hub.city}` : airline.hubIata;
  document.getElementById('ov-livery-dot').style.background = airline.livery;

  const revenue = routes.reduce((s, r) => s + (r.totalRevenueWeekly || 0), 0);
  const expenses = routes.reduce((s, r) => s + (r.totalExpensesWeekly || 0), 0);
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
