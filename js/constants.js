// ============================================================
// CONSTANTS — all tunable numbers live here.
// Edit this file to rebalance the game without touching logic.
// ============================================================

const SAVE_KEY = 'airlineCommand_save_v1';
const STARTING_CASH = 500000000;

const LIVERY_COLORS = ['#4dd8c8', '#f2a93b', '#f76c6c', '#4ade80', '#a78bfa', '#60a5fa', '#fb923c', '#f472b6'];

// --- Cash flow tick -----------------------------------------
// How often (in in-game days) company cash is updated from route P&L.
// 1 = daily, 7 = weekly. Profit/loss applied is profitWeekly * (interval/7).
const CASH_UPDATE_INTERVAL_DAYS = 1;

// --- Hubs -----------------------------------------------------
const HUB_COST = 100000000; // cost to purchase a new hub airport

// Cost to set up a new route (marketing, staffing, ground ops, admin)
const ROUTE_CREATION_FEE = 500000;

// --- Cabin economics -------------------------------------------
// Cabin space: each seat "costs" this many capacity units.
const CABIN_UNIT_WEIGHTS = { economy: 1, premium: 1.5, business: 2.5, first: 4 };

// Cabin quality affects fares, weekly maintenance, and purchase/refit price.
const CABIN_QUALITIES = {
  low:      { label: 'Economy fit-out',  fareMult: 0.82, maintMult: 0.75, priceMult: 0.85, satisfactionMult: 0.90 },
  standard: { label: 'Standard fit-out', fareMult: 1.00, maintMult: 1.00, priceMult: 1.00, satisfactionMult: 1.00 },
  high:     { label: 'Premium fit-out',  fareMult: 1.25, maintMult: 1.40, priceMult: 1.25, satisfactionMult: 1.10 }
};

// --- Aircraft aging ---------------------------------------------
// 1 in-game year = 12 months * 28 days.
const AGING_YEAR_MINUTES = 336 * 1440;

// Tiers based on years since new / since last cabin refit.
// satisfactionMult feeds passenger satisfaction; fareCapMult limits the
// max fare multiplier reachable on the edit-route slider.
const AGING_TIERS = [
  { key: 'new',      label: 'New',      maxYears: 5,        satisfactionMult: 1.00, fareCapMult: 1.00 },
  { key: 'good',     label: 'Good',     maxYears: 10,       satisfactionMult: 0.95, fareCapMult: 0.95 },
  { key: 'aging',    label: 'Aging',    maxYears: 15,       satisfactionMult: 0.85, fareCapMult: 0.85 },
  { key: 'old',      label: 'Old',      maxYears: 20,       satisfactionMult: 0.70, fareCapMult: 0.75 },
  { key: 'outdated', label: 'Outdated', maxYears: Infinity, satisfactionMult: 0.50, fareCapMult: 0.60 }
];

// Extra purchase/refit cost (USD) per seat for non-economy classes.
const SEAT_PRICE_PER_UNIT = { economy: 0, premium: 150000, business: 400000, first: 900000 };

// Refit (re-cabin / re-quality) cost on existing aircraft.
const REFIT_BASE_FEE = 250000;
const REFIT_COST_FACTOR = 0.5; // fraction of the config price delta charged on top of base fee

// Ticket fare = (flatFare + perKm * distance) * cabinQuality.fareMult
const FARE_PARAMS = {
  economy:  { flat: 25,  perKm: 0.085 },
  premium:  { flat: 55,  perKm: 0.145 },
  business: { flat: 120, perKm: 0.29 },
  first:    { flat: 250, perKm: 0.55 }
};

// Player-adjustable per-route fare multiplier (applies on top of FARE_PARAMS)
const FARE_MULT_MIN = 0.5;
const FARE_MULT_MAX = 1.5;
const FARE_MULT_STEP = 0.05;

const FUEL_PRICE_PER_KG = 0.85; // USD per kg of jet fuel

// USD per flight-hour, covers pilots + cabin crew
const CREW_COST_PER_HOUR = { regional: 900, narrowbody: 1500, widebody: 3500 };

// Base weekly maintenance/ownership cost per aircraft category (before quality multiplier)
const MAINTENANCE_WEEKLY_BASE = { regional: 15000, narrowbody: 35000, widebody: 90000 };

// Gravity-model demand calibration
const DEMAND_CONST = 4.5;
const DEMAND_DIST_OFFSET = 500; // km, softens very short routes

// Minimum ground turnaround between legs (hours)
const TURNAROUND_HOURS = 0.5;
// Max aircraft utilization per week (hours)
const MAX_WEEKLY_HOURS = 150;

// --- Airport size tiers ------------------------------------------
// Used for hub-select ordering and map rendering (e.g. only show
// smaller airports once the map is zoomed in far enough).
const AIRPORT_SIZE_RANK = { major: 0, large: 1, regional: 2 };
const AIRPORT_SIZE_MIN_ZOOM = { major: 0, large: 0, regional: 6 };

// Manufacturer tile styling
const MANUFACTURER_META = {
  Airbus:     { code: 'AB', color: '#4dd8c8' },
  Boeing:     { code: 'BA', color: '#60a5fa' },
  Embraer:    { code: 'EMB', color: '#4ade80' },
  Comac:      { code: 'CMC', color: '#f2a93b' },
  Bombardier: { code: 'BMQ', color: '#f472b6' }
};

// --- Aircraft registration prefixes (per country) -------------
// "new" = prefix for brand-new aircraft, "used" = prefix already on used aircraft.
// Most countries use the same prefix for both; Brazil is a notable exception.
const REGISTRATION_PREFIXES = {
  BR: { new: 'PS-', used: 'PR-' },
  US: { new: 'N',   used: 'N' },
  GB: { new: 'G-',  used: 'G-' },
  AE: { new: 'A6-', used: 'A6-' },
  JP: { new: 'JA',  used: 'JA' },
  FR: { new: 'F-',  used: 'F-' },
  DE: { new: 'D-',  used: 'D-' },
  SG: { new: '9V-', used: '9V-' },
  CN: { new: 'B-',  used: 'B-' },
  ZA: { new: 'ZS-', used: 'ZS-' },
  DEFAULT: { new: 'XA-', used: 'XA-' }
};
