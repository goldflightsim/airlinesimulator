// ============================================================
// ECONOMY — route economics, cabin/pricing math, cash tick.
// New model: routes are O-D pairs with an `assignments` array.
// Each assignment has { id, aircraftId, weeklyFrequency, fareMultiplier }.
// Computed weekly economics are stored on each assignment object.
// ============================================================

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

// The smaller (more limiting) of the two endpoint airports' size tiers governs
// which cabin classes a route's market actually generates demand for.
function routeDemandTier(originAirport, destAirport) {
  const oRank = AIRPORT_SIZE_RANK[originAirport.size] ?? AIRPORT_SIZE_RANK.regional;
  const dRank = AIRPORT_SIZE_RANK[destAirport.size] ?? AIRPORT_SIZE_RANK.regional;
  const limitingRank = Math.max(oRank, dRank); // higher rank = smaller airport
  return Object.keys(AIRPORT_SIZE_RANK).find(size => AIRPORT_SIZE_RANK[size] === limitingRank) || 'regional';
}

// Per-class share of total demand for a given tier + combined gdp_index.
// gdp = 1.0 reproduces CLASS_DEMAND_SHARES[tier] exactly.
function computeClassShares(tier, gdp) {
  const base = CLASS_DEMAND_SHARES[tier] || CLASS_DEMAND_SHARES.regional;
  const economyShare = Math.max(CLASS_DEMAND_ECONOMY_MIN, Math.min(CLASS_DEMAND_ECONOMY_MAX,
    base.economy - CLASS_DEMAND_GDP_SLOPE * (gdp - 1)));
  const nonEconomyBase = 1 - base.economy;
  const nonEconomyScale = nonEconomyBase > 0 ? (1 - economyShare) / nonEconomyBase : 0;
  return {
    economy: economyShare,
    premium: base.premium * nonEconomyScale,
    business: base.business * nonEconomyScale,
    first: base.first * nonEconomyScale
  };
}

// Total weekly demand (existing gravity model) split into per-class pax buckets.
function computeDemandByClass(originAirport, destAirport, distanceKm) {
  const total = computeDemandWeekly(originAirport, destAirport, distanceKm);
  const gdp = Math.sqrt(originAirport.gdp_index * destAirport.gdp_index);
  const tier = routeDemandTier(originAirport, destAirport);
  const shares = computeClassShares(tier, gdp);
  const byClass = {};
  CABIN_CLASSES.forEach(cls => { byClass[cls] = Math.round(total * shares[cls]); });
  return { total, byClass, tier, gdp };
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

// Sum of weekly hours used across all of an aircraft's assignments across all routes.
// Pass excludeAssignmentId to skip one entry (useful during edits).
function aircraftWeeklyHoursUsed(aircraft, excludeAssignmentId) {
  let total = 0;
  gameState.routes.forEach(route => {
    route.assignments.forEach(asn => {
      if (asn.aircraftId !== aircraft.id) return;
      if (asn.id === excludeAssignmentId) return;
      total += asn.hoursUsed || 0;
    });
  });
  return total;
}

// ---------------------------------------------------------
// Aging & passenger satisfaction
// ---------------------------------------------------------
function getAircraftAgeYears(aircraft) {
  const resetAt = aircraft.agingResetAtMinute ?? aircraft.purchasedAtMinute ?? 0;
  return Math.max(0, (gameState.time.totalMinutes - resetAt) / AGING_YEAR_MINUTES);
}

function getAgingTier(aircraft) {
  const years = getAircraftAgeYears(aircraft);
  return AGING_TIERS.find(t => years < t.maxYears) || AGING_TIERS[AGING_TIERS.length - 1];
}

function effectiveFareMultMax(aircraft) {
  const tier = getAgingTier(aircraft);
  return 1 + (FARE_MULT_MAX - 1) * tier.fareCapMult;
}

function computeSatisfaction(aircraft, fareMultiplier) {
  const tier = getAgingTier(aircraft);
  const quality = CABIN_QUALITIES[aircraft.cabinQuality] || CABIN_QUALITIES.standard;
  const fareFactor = Math.max(0.4, 1 - (fareMultiplier - 1) * 0.6);
  const satisfaction = tier.satisfactionMult * (quality.satisfactionMult || 1) * fareFactor;
  return Math.max(0.3, Math.min(1.2, satisfaction));
}

// Normalized key for a route's origin-destination pair (order-independent)
function routePairKey(route) {
  return [route.originIata, route.destIata].sort().join('-');
}

// ---------------------------------------------------------
// Per-assignment economics (distance, hours, fuel, crew, satisfaction, capacity).
// Does NOT set demand/loadFactor/fares/revenue — those require the full group.
// Mutates and returns the assignment object (also reads route for O-D data).
// ---------------------------------------------------------
function computeAssignmentEconomics(assignment, route, aircraft) {
  const origin = AIRPORTS.find(a => a.iata === route.originIata);
  const dest = AIRPORTS.find(a => a.iata === route.destIata);

  const distance = haversineKm(origin.lat, origin.lon, dest.lat, dest.lon);
  const oneWayHours = flightTimeHours(distance, aircraft.cruise_kmh);

  assignment.distanceKm = Math.round(distance);
  assignment.flightTimeMin = Math.round(oneWayHours * 60);
  assignment.hoursUsed = routeHoursUsed(assignment.weeklyFrequency, oneWayHours);

  const totalSeats = cabinTotalSeats(aircraft.cabin);
  assignment.capacityWeekly = assignment.weeklyFrequency * 2 * totalSeats;
  assignment.satisfaction = computeSatisfaction(aircraft, assignment.fareMultiplier || 1);

  assignment.fuelWeekly = aircraft.fuel_burn_kgph * oneWayHours * 2 * assignment.weeklyFrequency * FUEL_PRICE_PER_KG;
  assignment.crewWeekly = (CREW_COST_PER_HOUR[aircraft.category] || 1500) * oneWayHours * 2 * assignment.weeklyFrequency;

  return assignment;
}

// ---------------------------------------------------------
// Apply shared per-class demand/load/fare/revenue across all assignments on
// the same O-D pair. `assignments` is the flat list of all assignment
// objects sharing this route pair. Each assignment must already have
// capacityWeekly + satisfaction computed.
// `demandInfo` is the object returned by computeDemandByClass: { total, byClass }.
// ---------------------------------------------------------
function applyGroupEconomics(assignments, demandInfo) {
  const byClass = demandInfo.byClass;

  // Group capacity per class — every assignment sharing this O-D pair
  // competes for the same class-specific demand pool.
  const groupCapacityByClass = {};
  CABIN_CLASSES.forEach(cls => {
    groupCapacityByClass[cls] = assignments.reduce((s, a) => {
      const aircraft = gameState.fleet.find(ac => ac.id === a.aircraftId);
      if (!aircraft) return s;
      return s + (aircraft.cabin[cls] || 0) * (a.weeklyFrequency || 0) * 2;
    }, 0);
  });

  const baseLoadFactorByClass = {};
  CABIN_CLASSES.forEach(cls => {
    baseLoadFactorByClass[cls] = groupCapacityByClass[cls] > 0
      ? Math.min(1, (byClass[cls] || 0) / groupCapacityByClass[cls])
      : 0;
  });

  assignments.forEach(asn => {
    const aircraft = gameState.fleet.find(a => a.id === asn.aircraftId);
    if (!aircraft) return;

    asn.demandWeekly = demandInfo.total;
    asn.demandByClass = byClass;
    asn.groupCapacityByClass = groupCapacityByClass;

    const fareMult = asn.fareMultiplier || 1;
    asn.fares = {};
    asn.loadFactorByClass = {};
    asn.seatsByClassWeekly = {};

    let ownSeats = 0, ownLoadedSeats = 0, revenue = 0;
    CABIN_CLASSES.forEach(cls => {
      const lf = Math.max(0, Math.min(1, baseLoadFactorByClass[cls] * (asn.satisfaction || 1)));
      asn.loadFactorByClass[cls] = lf;

      const seatsPerWeek = aircraft.cabin[cls] * asn.weeklyFrequency * 2;
      asn.seatsByClassWeekly[cls] = seatsPerWeek;
      const fare = fareForClass(cls, asn.distanceKm, aircraft.cabinQuality) * fareMult;
      asn.fares[cls] = fare;

      revenue += seatsPerWeek * lf * fare;
      ownSeats += seatsPerWeek;
      ownLoadedSeats += seatsPerWeek * lf;
    });

    asn.revenueWeekly = revenue;
    // Blended overall load factor across this assignment's own cabin mix
    // (kept for existing UI: per-aircraft load bar, route avgLoadFactor rollup).
    asn.loadFactor = ownSeats > 0 ? ownLoadedSeats / ownSeats : 0;
  });
}

// Recompute demand/loadFactor/fares/revenue for every O-D group in the network.
function recomputeRouteLoadFactors() {
  // Build a map from pair key -> all assignments across all routes sharing that pair
  const groups = new Map();
  gameState.routes.forEach(route => {
    const key = routePairKey(route);
    if (!groups.has(key)) groups.set(key, { route, assignments: [] });
    route.assignments.forEach(asn => groups.get(key).assignments.push(asn));
  });

  groups.forEach(({ route, assignments }) => {
    const origin = AIRPORTS.find(a => a.iata === route.originIata);
    const dest = AIRPORTS.find(a => a.iata === route.destIata);
    const distance = haversineKm(origin.lat, origin.lon, dest.lat, dest.lon);
    const demandInfo = computeDemandByClass(origin, dest, distance);
    applyGroupEconomics(assignments, demandInfo);
  });
}

// Recompute all assignments for one aircraft and redistribute maintenance.
function recomputeAircraftRoutes(aircraftId) {
  const aircraft = gameState.fleet.find(a => a.id === aircraftId);
  if (!aircraft) return;

  // Collect all assignments for this aircraft
  const myAssignments = [];
  gameState.routes.forEach(route => {
    route.assignments.forEach(asn => {
      if (asn.aircraftId === aircraftId) {
        computeAssignmentEconomics(asn, route, aircraft);
        myAssignments.push(asn);
      }
    });
  });

  // Distribute maintenance across this aircraft's assignments proportionally by hours
  const quality = CABIN_QUALITIES[aircraft.cabinQuality] || CABIN_QUALITIES.standard;
  const totalMaintenance = (MAINTENANCE_WEEKLY_BASE[aircraft.category] || 35000) * quality.maintMult;
  const totalHours = myAssignments.reduce((s, a) => s + a.hoursUsed, 0);
  myAssignments.forEach(asn => {
    asn.maintenanceWeekly = totalHours > 0 ? totalMaintenance * (asn.hoursUsed / totalHours) : 0;
  });

  // Refresh demand/load/revenue for the whole network (other aircraft share O-D pairs)
  recomputeRouteLoadFactors();

  // Final profitWeekly per assignment
  gameState.routes.forEach(route => {
    route.assignments.forEach(asn => {
      asn.profitWeekly = (asn.revenueWeekly || 0) - (asn.fuelWeekly || 0) - (asn.crewWeekly || 0) - (asn.maintenanceWeekly || 0);
    });
    // Roll up route-level aggregates for quick reads
    refreshRouteTotals(route);
  });
}

// Roll up per-assignment numbers into convenience fields on the route object itself.
function refreshRouteTotals(route) {
  const asns = route.assignments;
  if (asns.length === 0) {
    route.totalCapacityWeekly = 0;
    route.totalFrequency = 0;
    route.demandWeekly = 0;
    route.totalRevenueWeekly = 0;
    route.totalExpensesWeekly = 0;
    route.totalProfitWeekly = 0;
    route.avgLoadFactor = 0;
    route.distanceKm = 0;
    route.flightTimeMin = 0;
    route.demandByClass = { economy: 0, premium: 0, business: 0, first: 0 };
    route.totalCapacityByClass = { economy: 0, premium: 0, business: 0, first: 0 };
    route.avgLoadFactorByClass = { economy: 0, premium: 0, business: 0, first: 0 };
    return;
  }
  route.totalCapacityWeekly = asns.reduce((s, a) => s + (a.capacityWeekly || 0), 0);
  route.totalFrequency = asns.reduce((s, a) => s + (a.weeklyFrequency || 0), 0);
  route.demandWeekly = asns[0].demandWeekly || 0; // same for all in group
  route.totalRevenueWeekly = asns.reduce((s, a) => s + (a.revenueWeekly || 0), 0);
  route.totalExpensesWeekly = asns.reduce((s, a) => s + (a.fuelWeekly || 0) + (a.crewWeekly || 0) + (a.maintenanceWeekly || 0), 0);
  route.totalProfitWeekly = asns.reduce((s, a) => s + (a.profitWeekly || 0), 0);
  route.avgLoadFactor = route.totalCapacityWeekly > 0
    ? asns.reduce((s, a) => s + (a.loadFactor || 0) * (a.capacityWeekly || 0), 0) / route.totalCapacityWeekly
    : 0;
  // Distance/flightTime are the same for all assignments on same route
  route.distanceKm = asns[0].distanceKm || 0;
  route.flightTimeMin = asns[0].flightTimeMin || 0;

  // Per-class demand (shared across the O-D group, same for every assignment here)
  // and this route's own slice of capacity per class (this route's assignments only).
  route.demandByClass = asns[0].demandByClass || { economy: 0, premium: 0, business: 0, first: 0 };
  route.totalCapacityByClass = {};
  route.avgLoadFactorByClass = {};
  CABIN_CLASSES.forEach(cls => {
    const cap = asns.reduce((s, a) => s + (a.seatsByClassWeekly?.[cls] || 0), 0);
    route.totalCapacityByClass[cls] = cap;
    route.avgLoadFactorByClass[cls] = cap > 0
      ? asns.reduce((s, a) => s + (a.loadFactorByClass?.[cls] || 0) * (a.seatsByClassWeekly?.[cls] || 0), 0) / cap
      : 0;
  });
}

// Recompute every route in the game.
function recomputeAllRoutes() {
  const aircraftIds = new Set();
  gameState.routes.forEach(route => route.assignments.forEach(asn => aircraftIds.add(asn.aircraftId)));
  aircraftIds.forEach(id => recomputeAircraftRoutes(id));
  gameState.routes.forEach(route => refreshRouteTotals(route));
}

// ---------------------------------------------------------
// Preview economics for a draft assignment not yet in gameState.
// `tempAsn` needs { aircraftId, weeklyFrequency, fareMultiplier }.
// `route` needs { originIata, destIata }.
// Returns tempAsn mutated with all economics fields.
// ---------------------------------------------------------
function previewAssignmentEconomics(tempAsn, route, excludeAsnId) {
  const aircraft = gameState.fleet.find(a => a.id === tempAsn.aircraftId);
  if (!aircraft) return tempAsn;

  computeAssignmentEconomics(tempAsn, route, aircraft);

  const key = routePairKey(route);
  const origin = AIRPORTS.find(a => a.iata === route.originIata);
  const dest = AIRPORTS.find(a => a.iata === route.destIata);
  const distance = haversineKm(origin.lat, origin.lon, dest.lat, dest.lon);
  const demandInfo = computeDemandByClass(origin, dest, distance);

  // Gather all existing assignments on this pair (excluding the one being edited)
  const others = [];
  gameState.routes.forEach(r => {
    if (routePairKey(r) !== key) return;
    r.assignments.forEach(a => { if (a.id !== excludeAsnId) others.push(a); });
  });
  applyGroupEconomics([...others, tempAsn], demandInfo);

  // Compute maintenance for this aircraft
  const quality = CABIN_QUALITIES[aircraft.cabinQuality] || CABIN_QUALITIES.standard;
  const totalMaintenance = (MAINTENANCE_WEEKLY_BASE[aircraft.category] || 35000) * quality.maintMult;
  const otherHours = aircraftWeeklyHoursUsed(aircraft, excludeAsnId);
  const totalHours = otherHours + tempAsn.hoursUsed;
  tempAsn.maintenanceWeekly = totalHours > 0 ? totalMaintenance * (tempAsn.hoursUsed / totalHours) : 0;
  tempAsn.profitWeekly = tempAsn.revenueWeekly - tempAsn.fuelWeekly - tempAsn.crewWeekly - tempAsn.maintenanceWeekly;

  return tempAsn;
}

// ---------------------------------------------------------
// Pricing — purchase price & refit cost for a given cabin config/quality.
// ---------------------------------------------------------
function computeConfigPrice(spec, cabin, quality) {
  const q = CABIN_QUALITIES[quality] || CABIN_QUALITIES.standard;
  const basePrice = spec.price_new_usd * q.priceMult;
  const extra = (cabin.premium || 0) * SEAT_PRICE_PER_UNIT.premium +
                (cabin.business || 0) * SEAT_PRICE_PER_UNIT.business +
                (cabin.first || 0) * SEAT_PRICE_PER_UNIT.first;
  return basePrice + extra;
}

function computeRefitCost(aircraft, newCabin, newQuality) {
  const spec = AIRPLANES.find(p => p.manufacturer === aircraft.manufacturer && p.model === aircraft.model);
  if (!spec) return REFIT_BASE_FEE;
  const oldPrice = computeConfigPrice(spec, aircraft.cabin, aircraft.cabinQuality);
  const newPrice = computeConfigPrice(spec, newCabin, newQuality);
  return Math.round(REFIT_BASE_FEE + Math.abs(newPrice - oldPrice) * REFIT_COST_FACTOR);
}

// ---------------------------------------------------------
// Cash tick — apply route P&L to company cash on a configurable interval.
// ---------------------------------------------------------
function applyCashTick(prevDayIndex, newDayIndex) {
  if (newDayIndex <= prevDayIndex) return;
  if (gameState.finance.lastCashUpdateDay === undefined) {
    gameState.finance.lastCashUpdateDay = prevDayIndex;
  }
  const daysPassed = newDayIndex - gameState.finance.lastCashUpdateDay;
  if (daysPassed < CASH_UPDATE_INTERVAL_DAYS) return;

  const totalWeeklyProfit = gameState.routes.reduce((s, r) => s + (r.totalProfitWeekly || 0), 0);
  const intervals = Math.floor(daysPassed / CASH_UPDATE_INTERVAL_DAYS);
  const delta = totalWeeklyProfit * (CASH_UPDATE_INTERVAL_DAYS / 7) * intervals;

  gameState.finance.cash += delta;
  gameState.finance.lastCashUpdateDay += intervals * CASH_UPDATE_INTERVAL_DAYS;
}
