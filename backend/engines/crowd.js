/**
 * Crowd Intelligence Engine
 * 
 * Aggregates zone-level crowd data, computes density metrics,
 * and records historical snapshots for time-series analysis.
 */

const store = require('../store');

/**
 * Recalculate density for all zones and record snapshots.
 * Called on every simulation tick.
 */
function update() {
  const zones = store.getZones();
  const results = [];

  for (const zone of zones) {
    const density = zone.capacity > 0 ? zone.currentCount / zone.capacity : 0;
    store.updateZoneCount(zone.id, zone.currentCount); // triggers density recalc
    store.addCrowdSnapshot(zone.id, zone.currentCount, density);

    results.push({
      zoneId: zone.id,
      name: zone.name,
      type: zone.type,
      count: zone.currentCount,
      capacity: zone.capacity,
      density: Math.round(density * 1000) / 1000,
    });
  }

  return results;
}

/**
 * Get current density map for the venue.
 * Returns { zoneId → { density, count, capacity, status } }
 */
function getDensityMap() {
  const zones = store.getZones();
  const map = {};

  for (const zone of zones) {
    const density = zone.density || 0;
    let status = 'normal';
    if (density > 0.95) status = 'critical';
    else if (density > 0.8) status = 'high';
    else if (density > 0.6) status = 'moderate';
    else if (density > 0.3) status = 'low';

    map[zone.id] = {
      density: Math.round(density * 1000) / 1000,
      count: zone.currentCount,
      capacity: zone.capacity,
      status,
    };
  }

  return map;
}

/**
 * Get the top N most congested zones.
 */
function getHotspots(n = 5) {
  const zones = store.getZones();
  return zones
    .map(z => ({ id: z.id, name: z.name, type: z.type, density: z.density, count: z.currentCount }))
    .sort((a, b) => b.density - a.density)
    .slice(0, n);
}

/**
 * Detect anomalies using statistical threshold.
 * An anomaly is when a zone's density changes by more than 2σ from its recent mean.
 */
function detectAnomalies() {
  const zones = store.getZones();
  const anomalies = [];

  for (const zone of zones) {
    const history = store.getCrowdHistory(zone.id, 30);
    if (history.length < 10) continue;

    const densities = history.map(h => h.density);
    const mean = densities.reduce((a, b) => a + b, 0) / densities.length;
    const variance = densities.reduce((a, b) => a + (b - mean) ** 2, 0) / densities.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev > 0 && Math.abs(zone.density - mean) > 2 * stdDev) {
      anomalies.push({
        zoneId: zone.id,
        zoneName: zone.name,
        currentDensity: zone.density,
        mean: Math.round(mean * 1000) / 1000,
        stdDev: Math.round(stdDev * 1000) / 1000,
        direction: zone.density > mean ? 'surge' : 'drop',
      });
    }
  }

  return anomalies;
}

module.exports = { update, getDensityMap, getHotspots, detectAnomalies };
