/**
 * Simulation Engine
 * 
 * Generates realistic crowd movement and queue data to simulate
 * a live sporting event. Replaces IoT sensor data for the MVP.
 * 
 * Game phases:
 *   1. pre-game   — People arrive through gates → concourses → seating
 *   2. first-half  — Most seated, light food/restroom traffic
 *   3. halftime    — Mass movement to food courts and restrooms
 *   4. second-half — Return to seats, similar to first half
 *   5. post-game   — Everyone exits through gates
 * 
 * Each tick (2s real-time):
 *   - Move people between adjacent zones based on phase-specific flow rates
 *   - Update vendor queue lengths
 *   - Serve customers from queues
 */

const store = require('../store');
const venueSeed = require('../data/venue-seed');

let simulationTimer = null;
let tickCount = 0;
let phaseTickCount = 0;

// ─── Phase configuration ───
// flow[phase][fromType] = { rate, destinations: { toType: weight } }
const PHASE_CONFIG = {
  'pre-game': {
    duration: 90,       // ticks (× 2s = 3 min at normal speed)
    gateInflow: 400,    // people entering per tick across all gates
    flows: {
      'gate':       { leaveRate: 0.15, dest: { 'concourse': 8, 'food_court': 2 } },
      'concourse':  { leaveRate: 0.10, dest: { 'seating': 7, 'food_court': 2, 'restroom': 1 } },
      'food_court': { leaveRate: 0.08, dest: { 'concourse': 5, 'seating': 5 } },
      'restroom':   { leaveRate: 0.15, dest: { 'concourse': 10 } },
      'seating':    { leaveRate: 0.01, dest: { 'concourse': 10 } },
    },
  },
  'first-half': {
    duration: 120,
    gateInflow: 20,
    flows: {
      'gate':       { leaveRate: 0.05, dest: { 'concourse': 10 } },
      'concourse':  { leaveRate: 0.04, dest: { 'seating': 5, 'food_court': 3, 'restroom': 2 } },
      'food_court': { leaveRate: 0.10, dest: { 'concourse': 5, 'seating': 5 } },
      'restroom':   { leaveRate: 0.20, dest: { 'concourse': 10 } },
      'seating':    { leaveRate: 0.005, dest: { 'concourse': 6, 'food_court': 2, 'restroom': 2 } },
    },
  },
  'halftime': {
    duration: 60,
    gateInflow: 5,
    flows: {
      'gate':       { leaveRate: 0.03, dest: { 'concourse': 10 } },
      'concourse':  { leaveRate: 0.08, dest: { 'food_court': 5, 'restroom': 3, 'seating': 2 } },
      'food_court': { leaveRate: 0.03, dest: { 'concourse': 10 } },
      'restroom':   { leaveRate: 0.10, dest: { 'concourse': 10 } },
      'seating':    { leaveRate: 0.06, dest: { 'concourse': 4, 'food_court': 4, 'restroom': 2 } },
    },
  },
  'second-half': {
    duration: 120,
    gateInflow: 5,
    flows: {
      'gate':       { leaveRate: 0.05, dest: { 'concourse': 10 } },
      'concourse':  { leaveRate: 0.05, dest: { 'seating': 6, 'food_court': 2, 'restroom': 2 } },
      'food_court': { leaveRate: 0.12, dest: { 'concourse': 5, 'seating': 5 } },
      'restroom':   { leaveRate: 0.20, dest: { 'concourse': 10 } },
      'seating':    { leaveRate: 0.003, dest: { 'concourse': 6, 'food_court': 2, 'restroom': 2 } },
    },
  },
  'post-game': {
    duration: 90,
    gateInflow: 0,
    gateOutflow: 0.12,
    flows: {
      'gate':       { leaveRate: 0, dest: {} },  // people leave the venue
      'concourse':  { leaveRate: 0.10, dest: { 'gate': 8, 'food_court': 1, 'restroom': 1 } },
      'food_court': { leaveRate: 0.15, dest: { 'concourse': 8, 'gate': 2 } },
      'restroom':   { leaveRate: 0.20, dest: { 'concourse': 8, 'gate': 2 } },
      'seating':    { leaveRate: 0.08, dest: { 'concourse': 10 } },
    },
  },
};

const PHASE_ORDER = ['pre-game', 'first-half', 'halftime', 'second-half', 'post-game'];

/**
 * Get adjacent zones of a specific type for a given zone.
 */
function getAdjacentByType(zoneId, targetType) {
  const adj = venueSeed.adjacency[zoneId] || [];
  return adj
    .map(a => store.getZone(a.to))
    .filter(z => z && z.type === targetType);
}

/**
 * Get all adjacent zones for a given zone.
 */
function getAdjacent(zoneId) {
  const adj = venueSeed.adjacency[zoneId] || [];
  return adj.map(a => store.getZone(a.to)).filter(Boolean);
}

/**
 * Pick a destination zone from candidates, preferring less crowded ones.
 */
function pickDestination(candidates) {
  if (candidates.length === 0) return null;
  
  // Weight by remaining capacity (prefer less crowded)
  const weights = candidates.map(z => {
    const remaining = Math.max(1, z.capacity - z.currentCount);
    return { zone: z, weight: remaining };
  });

  const totalWeight = weights.reduce((a, b) => a + b.weight, 0);
  let rand = Math.random() * totalWeight;

  for (const { zone, weight } of weights) {
    rand -= weight;
    if (rand <= 0) return zone;
  }

  return candidates[0];
}

/**
 * Execute one simulation tick.
 */
function tick() {
  const phase = store.getSimulationPhase();
  if (phase === 'idle' || phase === 'completed') return;

  const config = PHASE_CONFIG[phase];
  if (!config) return;

  const zones = store.getZones();
  const movements = new Map(); // zoneId → delta

  // Initialize deltas
  for (const z of zones) {
    movements.set(z.id, 0);
  }

  // ─── Gate inflow (people entering venue) ───
  if (config.gateInflow > 0) {
    const gates = zones.filter(z => z.type === 'gate');
    const perGate = Math.floor(config.gateInflow / gates.length);
    for (const gate of gates) {
      // Add jitter ±20%
      const jitter = 1 + (Math.random() - 0.5) * 0.4;
      const inflow = Math.floor(perGate * jitter);
      movements.set(gate.id, movements.get(gate.id) + inflow);
    }
  }

  // ─── Gate outflow (people leaving venue) — post-game ───
  if (config.gateOutflow) {
    const gates = zones.filter(z => z.type === 'gate');
    for (const gate of gates) {
      const outflow = Math.floor(gate.currentCount * config.gateOutflow);
      movements.set(gate.id, movements.get(gate.id) - outflow);
    }
  }

  // ─── Zone-to-zone flow ───
  for (const zone of zones) {
    const flowConfig = config.flows[zone.type];
    if (!flowConfig || zone.currentCount <= 0) continue;

    // How many people want to leave this zone
    const jitter = 1 + (Math.random() - 0.5) * 0.3;
    const leavingCount = Math.min(
      zone.currentCount,
      Math.floor(zone.currentCount * flowConfig.leaveRate * jitter)
    );

    if (leavingCount <= 0) continue;

    // Distribute leaving people among destination types
    const destWeights = flowConfig.dest;
    const totalWeight = Object.values(destWeights).reduce((a, b) => a + b, 0);

    if (totalWeight === 0) continue;

    let remaining = leavingCount;

    for (const [destType, weight] of Object.entries(destWeights)) {
      const share = Math.floor(leavingCount * (weight / totalWeight));
      const actual = Math.min(share, remaining);
      if (actual <= 0) continue;

      // Find adjacent zones of this type
      let candidates = getAdjacentByType(zone.id, destType);
      
      // If no adjacent zone of that type, try through any adjacent zone
      if (candidates.length === 0) {
        candidates = getAdjacent(zone.id).filter(z => z.type === destType);
      }
      if (candidates.length === 0) {
        // Find any zone of that type (for simplicity)
        candidates = zones.filter(z => z.type === destType);
      }
      if (candidates.length === 0) continue;

      // Distribute among candidates (prefer less crowded)
      for (let i = 0; i < actual; i++) {
        const dest = pickDestination(candidates);
        if (dest) {
          movements.set(zone.id, movements.get(zone.id) - 1);
          movements.set(dest.id, movements.get(dest.id) + 1);
          remaining--;
        }
      }
    }
  }

  // ─── Apply movements ───
  for (const [zoneId, delta] of movements) {
    if (delta !== 0) {
      store.addToZone(zoneId, delta);
    }
  }

  // ─── Update vendor queues ───
  updateVendorQueues(phase);

  // ─── Phase transition ───
  phaseTickCount++;
  tickCount++;

  if (phaseTickCount >= config.duration) {
    const currentIndex = PHASE_ORDER.indexOf(phase);
    if (currentIndex < PHASE_ORDER.length - 1) {
      const nextPhase = PHASE_ORDER[currentIndex + 1];
      store.setSimulationPhase(nextPhase);
      phaseTickCount = 0;
      console.log(`[Simulation] Phase transition: ${phase} → ${nextPhase}`);
    } else {
      store.setSimulationPhase('completed');
      stop();
      console.log('[Simulation] Event completed.');
    }
  }
}

/**
 * Update vendor queue lengths based on zone populations.
 */
function updateVendorQueues(phase) {
  const vendors = store.getVendors();

  for (const vendor of vendors) {
    const zone = store.getZone(vendor.zoneId);
    if (!zone) continue;

    // People joining queue = fraction of zone population
    let joinRate = 0.02;
    if (phase === 'halftime') joinRate = 0.08;
    else if (phase === 'pre-game') joinRate = 0.03;
    else if (phase === 'post-game') joinRate = 0.01;

    const newJoiners = Math.floor(zone.currentCount * joinRate * (0.8 + Math.random() * 0.4));

    // People served = depends on service time (faster service = more served)
    // Each tick = 2 seconds, serviceTime is in seconds
    const servedPerTick = Math.max(1, Math.floor(2 / vendor.avgServiceTime * 10));
    const served = Math.min(vendor.currentQueue, servedPerTick);

    // Update queue
    const newQueue = Math.max(0, vendor.currentQueue + newJoiners - served);
    const estimatedWait = newQueue * vendor.avgServiceTime;

    store.updateVendorQueue(vendor.id, newQueue, estimatedWait);
  }
}

/**
 * Start the simulation.
 */
function start(options = {}) {
  if (store.isSimulationRunning()) {
    return { status: 'already_running' };
  }

  // Reset state
  store.init();
  tickCount = 0;
  phaseTickCount = 0;

  const startPhase = options.phase || 'pre-game';
  store.setSimulationPhase(startPhase);
  store.setSimulationRunning(true);

  const interval = options.interval || 2000; // ms between ticks

  console.log(`[Simulation] Starting at phase: ${startPhase}, interval: ${interval}ms`);

  simulationTimer = setInterval(() => {
    tick();
  }, interval);

  return { status: 'started', phase: startPhase, interval };
}

/**
 * Stop the simulation.
 */
function stop() {
  if (simulationTimer) {
    clearInterval(simulationTimer);
    simulationTimer = null;
  }
  store.setSimulationRunning(false);
  console.log(`[Simulation] Stopped at tick ${tickCount}`);
  return { status: 'stopped', totalTicks: tickCount };
}

/**
 * Manually set the game phase (operator control).
 */
function setPhase(phase) {
  if (!PHASE_CONFIG[phase]) {
    return { error: `Invalid phase: ${phase}. Valid: ${PHASE_ORDER.join(', ')}` };
  }
  store.setSimulationPhase(phase);
  phaseTickCount = 0;
  console.log(`[Simulation] Manual phase change → ${phase}`);
  return { status: 'phase_changed', phase };
}

/**
 * Get simulation status.
 */
function getStatus() {
  return {
    running: store.isSimulationRunning(),
    phase: store.getSimulationPhase(),
    tickCount,
    phaseTickCount,
    totalAttendees: store.getTotalAttendees(),
  };
}

module.exports = { start, stop, tick, setPhase, getStatus };
