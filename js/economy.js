// ============================================================
// ECONOMY — route economics, cabin/pricing math, cash tick.
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

// ---------------------------------------------------------
// Pricing — purchase price & refit cost for a given cabin config/quality.
// `spec` is an AIRPLANES row (has price_new_usd, max_capacity).
// `cabin` only needs { premium, business, first } (economy is implied/ignored for pricing).
// ---------------------------------------------------------
function computeConfigPrice(spec, cabin, quality) {
  const q = CABIN_QUALITIES[quality] || CABIN_QUALITIES.standard;
  const basePrice = spec.price_new_usd * q.priceMult;
  const extra = (cabin.premium || 0) * SEAT_PRICE_PER_UNIT.premium +
                (cabin.business || 0) * SEAT_PRICE_PER_UNIT.business +
                (cabin.first || 0) * SEAT_PRICE_PER_UNIT.first;
  return basePrice + extra;
}

// Cost to refit an existing aircraft to a new cabin/quality configuration.
function computeRefitCost(aircraft, newCabin, newQuality) {
  const spec = AIRPLANES.find(p => p.manufacturer === aircraft.manufacturer && p.model === aircraft.model);
  if (!spec) return REFIT_BASE_FEE;
  const oldPrice = computeConfigPrice(spec, aircraft.cabin, aircraft.cabinQuality);
  const newPrice = computeConfigPrice(spec, newCabin, newQuality);
  return Math.round(REFIT_BASE_FEE + Math.abs(newPrice - oldPrice) * REFIT_COST_FACTOR);
}

// ---------------------------------------------------------
// Cash tick — apply route P&L to company cash on a configurable interval.
// Called every time the in-game clock crosses a day boundary.
// ---------------------------------------------------------
function applyCashTick(prevDayIndex, newDayIndex) {
  if (newDayIndex <= prevDayIndex) return;
  if (gameState.finance.lastCashUpdateDay === undefined) {
    gameState.finance.lastCashUpdateDay = prevDayIndex;
  }
  const daysPassed = newDayIndex - gameState.finance.lastCashUpdateDay;
  if (daysPassed < CASH_UPDATE_INTERVAL_DAYS) return;

  const totalWeeklyProfit = gameState.routes.reduce((s, r) => s + (r.profitWeekly || 0), 0);
  const intervals = Math.floor(daysPassed / CASH_UPDATE_INTERVAL_DAYS);
  const delta = totalWeeklyProfit * (CASH_UPDATE_INTERVAL_DAYS / 7) * intervals;

  gameState.finance.cash += delta;
  gameState.finance.lastCashUpdateDay += intervals * CASH_UPDATE_INTERVAL_DAYS;
}