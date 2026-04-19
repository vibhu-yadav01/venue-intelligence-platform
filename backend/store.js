/**
 * In-Memory Data Store
 * 
 * Production replacement: Redis (real-time state) + PostgreSQL (persistent).
 * For MVP, all state lives in memory with the same interface.
 */

const venueSeed = require('./data/venue-seed');
const { v4: uuid } = require('uuid');

// ─── State containers ───
const state = {
  venue: null,
  zones: new Map(),       // zoneId → zone object (with live currentCount)
  vendors: new Map(),     // vendorId → vendor object (with live queue data)
  alerts: [],             // recent alerts (capped at 200)
  crowdSnapshots: [],     // historical density snapshots (capped at 5000)
  queueSnapshots: [],     // historical queue snapshots (capped at 5000)
  totalAttendees: 0,      // total people inside venue
  simulationPhase: 'idle', // idle, pre-game, first-half, halftime, second-half, post-game
  simulationRunning: false,
  notifications: [],      // recent notifications for attendees (capped at 50)
};

// ─── Initialize from seed data ───
function init() {
  const v = venueSeed;
  state.venue = {
    id: v.id,
    name: v.name,
    capacity: v.capacity,
    address: v.address,
    status: v.status,
    adjacency: v.adjacency,
  };

  state.zones.clear();
  for (const z of v.zones) {
    state.zones.set(z.id, {
      ...z,
      currentCount: 0,
      density: 0,
    });
  }

  state.vendors.clear();
  for (const vendor of v.vendors) {
    state.vendors.set(vendor.id, {
      ...vendor,
      currentQueue: 0,
      estimatedWait: 0,
      isActive: true,
    });
  }

  state.alerts = [];
  state.crowdSnapshots = [];
  state.queueSnapshots = [];
  state.totalAttendees = 0;
  state.simulationPhase = 'idle';
  state.simulationRunning = false;
  state.notifications = [];
}

// ─── Venue ───
function getVenue() {
  return state.venue;
}

// ─── Zones ───
function getZones() {
  return Array.from(state.zones.values());
}

function getZone(id) {
  return state.zones.get(id);
}

function updateZoneCount(zoneId, count) {
  const zone = state.zones.get(zoneId);
  if (!zone) return;
  zone.currentCount = Math.max(0, count);
  zone.density = zone.capacity > 0 ? zone.currentCount / zone.capacity : 0;
}

function addToZone(zoneId, delta) {
  const zone = state.zones.get(zoneId);
  if (!zone) return;
  zone.currentCount = Math.max(0, zone.currentCount + delta);
  zone.density = zone.capacity > 0 ? zone.currentCount / zone.capacity : 0;
}

// ─── Vendors ───
function getVendors() {
  return Array.from(state.vendors.values());
}

function getVendor(id) {
  return state.vendors.get(id);
}

function updateVendorQueue(vendorId, queueLength, estimatedWait) {
  const vendor = state.vendors.get(vendorId);
  if (!vendor) return;
  vendor.currentQueue = Math.max(0, queueLength);
  vendor.estimatedWait = Math.max(0, estimatedWait);
}

// ─── Alerts ───
function addAlert(alert) {
  const entry = {
    id: uuid(),
    ...alert,
    isResolved: false,
    createdAt: new Date().toISOString(),
  };
  state.alerts.unshift(entry);
  if (state.alerts.length > 200) state.alerts.pop();
  return entry;
}

function getAlerts(limit = 50) {
  return state.alerts.slice(0, limit);
}

function resolveAlert(alertId) {
  const alert = state.alerts.find(a => a.id === alertId);
  if (alert) alert.isResolved = true;
  return alert;
}

// ─── Notifications ───
function addNotification(notification) {
  const entry = {
    id: uuid(),
    ...notification,
    createdAt: new Date().toISOString(),
  };
  state.notifications.unshift(entry);
  if (state.notifications.length > 50) state.notifications.pop();
  return entry;
}

function getNotifications(limit = 20) {
  return state.notifications.slice(0, limit);
}

// ─── Snapshots ───
function addCrowdSnapshot(zoneId, count, density) {
  state.crowdSnapshots.push({
    zoneId,
    count,
    density,
    timestamp: Date.now(),
  });
  if (state.crowdSnapshots.length > 5000) {
    state.crowdSnapshots = state.crowdSnapshots.slice(-3000);
  }
}

function addQueueSnapshot(vendorId, queueLength, estimatedWait) {
  state.queueSnapshots.push({
    vendorId,
    queueLength,
    estimatedWait,
    timestamp: Date.now(),
  });
  if (state.queueSnapshots.length > 5000) {
    state.queueSnapshots = state.queueSnapshots.slice(-3000);
  }
}

function getCrowdHistory(zoneId, limit = 60) {
  return state.crowdSnapshots
    .filter(s => s.zoneId === zoneId)
    .slice(-limit);
}

function getQueueHistory(vendorId, limit = 60) {
  return state.queueSnapshots
    .filter(s => s.vendorId === vendorId)
    .slice(-limit);
}

// ─── Simulation state ───
function setSimulationPhase(phase) {
  state.simulationPhase = phase;
}

function getSimulationPhase() {
  return state.simulationPhase;
}

function setSimulationRunning(running) {
  state.simulationRunning = running;
}

function isSimulationRunning() {
  return state.simulationRunning;
}

function getTotalAttendees() {
  let total = 0;
  for (const zone of state.zones.values()) {
    total += zone.currentCount;
  }
  state.totalAttendees = total;
  return total;
}

// ─── Full state snapshot for WebSocket broadcast ───
function getFullState() {
  return {
    venue: state.venue ? { id: state.venue.id, name: state.venue.name, capacity: state.venue.capacity } : null,
    zones: getZones(),
    vendors: getVendors(),
    alerts: getAlerts(20),
    notifications: getNotifications(10),
    totalAttendees: getTotalAttendees(),
    simulationPhase: state.simulationPhase,
    simulationRunning: state.simulationRunning,
    timestamp: Date.now(),
  };
}

// Initialize on load
init();

module.exports = {
  init,
  getVenue,
  getZones,
  getZone,
  updateZoneCount,
  addToZone,
  getVendors,
  getVendor,
  updateVendorQueue,
  addAlert,
  getAlerts,
  resolveAlert,
  addNotification,
  getNotifications,
  addCrowdSnapshot,
  addQueueSnapshot,
  getCrowdHistory,
  getQueueHistory,
  setSimulationPhase,
  getSimulationPhase,
  setSimulationRunning,
  isSimulationRunning,
  getTotalAttendees,
  getFullState,
};
