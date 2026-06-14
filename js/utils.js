// ============================================================
// UTILS — generic helpers shared across modules.
// ============================================================

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

// ---------------------------------------------------------
// Geography / flight time
// ---------------------------------------------------------

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

// ---------------------------------------------------------
// Aircraft registration
// ---------------------------------------------------------
function getRegistrationPrefixes(countryCode) {
  return REGISTRATION_PREFIXES[countryCode] || REGISTRATION_PREFIXES.DEFAULT;
}

function randomRegistrationSuffix() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 3; i++) s += letters[Math.floor(Math.random() * letters.length)];
  return s;
}

// Generate a full registration string for a country + condition ('new'|'used')
function generateRegistration(countryCode, condition) {
  const prefixes = getRegistrationPrefixes(countryCode);
  const prefix = condition === 'used' ? prefixes.used : prefixes.new;
  return prefix + randomRegistrationSuffix();
}