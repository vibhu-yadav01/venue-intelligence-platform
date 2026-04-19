/**
 * Decision Engine
 * 
 * Rule-based + ML-assisted decision system that evaluates venue state
 * and generates alerts/notifications.
 * 
 * Rules:
 * 1. Zone density > 0.8  → congestion warning for attendees
 * 2. Zone density > 0.95 → critical alert for operators
 * 3. Queue wait drops significantly → notify nearby attendees
 * 4. Anomaly detected → alert operators
 * 5. Vendor with low wait + high bid → promotional notification
 */

const store = require('../store');
const crowdEngine = require('./crowd');
const queueEngine = require('./queue');

// Track which alerts have been fired recently to avoid spam
const recentAlerts = new Map(); // key → timestamp
const ALERT_COOLDOWN_MS = 30000; // 30 seconds between same alerts

/**
 * Check if an alert was recently fired.
 */
function wasRecentlyAlerted(key) {
  const last = recentAlerts.get(key);
  if (!last) return false;
  return (Date.now() - last) < ALERT_COOLDOWN_MS;
}

function markAlerted(key) {
  recentAlerts.set(key, Date.now());
  // Cleanup old entries
  if (recentAlerts.size > 500) {
    const cutoff = Date.now() - ALERT_COOLDOWN_MS * 2;
    for (const [k, v] of recentAlerts) {
      if (v < cutoff) recentAlerts.delete(k);
    }
  }
}

/**
 * Evaluate all rules and return generated alerts + notifications.
 * Called on every simulation tick.
 */
function evaluate() {
  const alerts = [];
  const notifications = [];
  const zones = store.getZones();
  const venueId = store.getVenue()?.id || 'venue-001';

  // ─── Rule 1: Zone congestion warnings ───
  for (const zone of zones) {
    if (zone.density > 0.95) {
      const key = `critical-${zone.id}`;
      if (!wasRecentlyAlerted(key)) {
        const alert = store.addAlert({
          venueId,
          type: 'congestion',
          severity: 'critical',
          message: `CRITICAL: ${zone.name} at ${Math.round(zone.density * 100)}% capacity (${zone.currentCount}/${zone.capacity})`,
          zoneId: zone.id,
        });
        alerts.push(alert);
        markAlerted(key);

        // Also notify attendees in/near this zone
        const notification = store.addNotification({
          type: 'congestion',
          severity: 'critical',
          title: '⚠️ Area Overcrowded',
          message: `${zone.name} is extremely crowded. Consider alternative routes.`,
          zoneId: zone.id,
        });
        notifications.push(notification);
      }
    } else if (zone.density > 0.8) {
      const key = `warning-${zone.id}`;
      if (!wasRecentlyAlerted(key)) {
        const alert = store.addAlert({
          venueId,
          type: 'congestion',
          severity: 'warning',
          message: `${zone.name} reaching high density: ${Math.round(zone.density * 100)}% capacity`,
          zoneId: zone.id,
        });
        alerts.push(alert);
        markAlerted(key);
      }
    }
  }

  // ─── Rule 2: Anomaly detection ───
  const anomalies = crowdEngine.detectAnomalies();
  for (const anomaly of anomalies) {
    const key = `anomaly-${anomaly.zoneId}-${anomaly.direction}`;
    if (!wasRecentlyAlerted(key)) {
      const alert = store.addAlert({
        venueId,
        type: 'anomaly',
        severity: 'warning',
        message: `Anomaly in ${anomaly.zoneName}: crowd ${anomaly.direction} detected (${Math.round(anomaly.currentDensity * 100)}% vs avg ${Math.round(anomaly.mean * 100)}%)`,
        zoneId: anomaly.zoneId,
      });
      alerts.push(alert);
      markAlerted(key);
    }
  }

  // ─── Rule 3: Queue spike alerts ───
  const queueSpikes = queueEngine.detectQueueSpikes();
  for (const spike of queueSpikes) {
    const key = `queue-spike-${spike.vendorId}`;
    if (!wasRecentlyAlerted(key)) {
      const alert = store.addAlert({
        venueId,
        type: 'queue_spike',
        severity: 'info',
        message: `Queue spike at ${spike.vendorName}: ${spike.currentQueue} people (${spike.growthRate}x growth)`,
        zoneId: null,
      });
      alerts.push(alert);
      markAlerted(key);
    }
  }

  // ─── Rule 4: Promotional notifications for low-wait vendors ───
  const recommendations = queueEngine.getRecommendations();
  const topVendor = recommendations[0];
  if (topVendor && topVendor.estimatedWaitMinutes < 2 && topVendor.isSponsored) {
    const key = `promo-${topVendor.vendorId}`;
    if (!wasRecentlyAlerted(key)) {
      const notification = store.addNotification({
        type: 'promotion',
        severity: 'info',
        title: '🎉 Quick Bite Available!',
        message: `${topVendor.name} has a ${topVendor.estimatedWaitMinutes} min wait. Skip the lines!`,
        vendorId: topVendor.vendorId,
        zoneId: topVendor.zoneId,
      });
      notifications.push(notification);
      markAlerted(key);
    }
  }

  // ─── Rule 5: Rerouting suggestion when gates are congested ───
  const gates = zones.filter(z => z.type === 'gate');
  const congestedGates = gates.filter(g => g.density > 0.7);
  const clearGates = gates.filter(g => g.density < 0.4);

  if (congestedGates.length > 0 && clearGates.length > 0) {
    for (const cg of congestedGates) {
      const key = `reroute-${cg.id}`;
      if (!wasRecentlyAlerted(key)) {
        const bestGate = clearGates.reduce((a, b) => a.density < b.density ? a : b);
        const notification = store.addNotification({
          type: 'reroute',
          severity: 'info',
          title: '🔀 Faster Exit Available',
          message: `${cg.name} is busy. Try ${bestGate.name} for a quicker exit.`,
          zoneId: cg.id,
        });
        notifications.push(notification);
        markAlerted(key);
      }
    }
  }

  return { alerts, notifications };
}

module.exports = { evaluate };
