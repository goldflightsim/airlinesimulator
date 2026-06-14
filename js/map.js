// ============================================================
// MAP — leaflet map, airport/fleet/route markers, hub purchase.
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

  renderAirportMarkers();

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

// Draw/redraw airport markers (hubs highlighted, click-to-purchase popup).
function renderAirportMarkers() {
  if (!airportLayer) return;
  airportLayer.clearLayers();

  AIRPORTS.forEach(a => {
    const isHub = gameState.airline.hubs.includes(a.iata);
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

    let popupHtml = `<b>${a.iata}</b> ${isHub ? '— HUB' : ''}<br>` +
      `${a.name}<br>${a.city}, ${a.country}<br>` +
      `Runway: ${formatNumber(a.runway_m)} m &middot; ${a.size}`;

    if (!isHub) {
      const canAfford = gameState.finance.cash >= HUB_COST;
      popupHtml += `<div style="margin-top:8px;">` +
        `<button class="btn primary" ${canAfford ? '' : 'disabled'} onclick="purchaseHub('${a.iata}')">Purchase Hub — ${formatMoney(HUB_COST)}</button>` +
        `</div>`;
      if (!canAfford) popupHtml += `<div style="color:var(--red); font-size:11px; margin-top:4px;">Not enough cash.</div>`;
    }

    marker.bindPopup(popupHtml);
    marker.addTo(airportLayer);
  });
}

// Purchase a new hub at the given airport (costs HUB_COST).
function purchaseHub(iata) {
  if (gameState.airline.hubs.includes(iata)) return;
  if (gameState.finance.cash < HUB_COST) return;

  gameState.finance.cash -= HUB_COST;
  gameState.airline.hubs.push(iata);

  saveGame();
  renderAirportMarkers();
  updateTopbarStats();
  renderOverviewPanel();
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
      `Registration: ${ac.registration}<br>` +
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