/**
 * Queue Prediction Engine
 * 
 * Estimates wait times for vendors using:
 * - Current queue length × average service time
 * - Exponential smoothing (α=0.3) with historical data
 * - Anomaly detection for queue spikes
 */

const store = require('../store');

const SMOOTHING_ALPHA = 0.3;
const previousPredictions = new Map(); // vendorId → last predicted wait

/**
 * Update all vendor queue estimates.
 * Called on every simulation tick.
 */
function update() {
  const vendors = store.getVendors();
  const results = [];

  for (const vendor of vendors) {
    // Raw estimate: queue_length × avg_service_time
    const rawWait = vendor.currentQueue * vendor.avgServiceTime;

    // Exponential smoothing with previous prediction
    const prevPrediction = previousPredictions.get(vendor.id) || rawWait;
    const smoothedWait = SMOOTHING_ALPHA * rawWait + (1 - SMOOTHING_ALPHA) * prevPrediction;
    previousPredictions.set(vendor.id, smoothedWait);

    // Update store
    store.updateVendorQueue(vendor.id, vendor.currentQueue, Math.round(smoothedWait));

    // Record snapshot
    store.addQueueSnapshot(vendor.id, vendor.currentQueue, Math.round(smoothedWait));

    results.push({
      vendorId: vendor.id,
      name: vendor.name,
      type: vendor.type,
      zoneId: vendor.zoneId,
      queueLength: vendor.currentQueue,
      estimatedWait: Math.round(smoothedWait),
      estimatedWaitMinutes: Math.round(smoothedWait / 60 * 10) / 10,
    });
  }

  return results;
}

/**
 * Get ranked vendor recommendations for attendees.
 * Rank by: (low wait time) + (bid value for monetization)
 * Formula: score = (1 / (1 + waitMinutes)) * 50 + normalizedBid * 50
 */
function getRecommendations() {
  const vendors = store.getVendors().filter(v => v.isActive);
  const maxBid = Math.max(...vendors.map(v => v.bidValue), 1);

  return vendors
    .map(v => {
      const waitMinutes = v.estimatedWait / 60;
      const waitScore = (1 / (1 + waitMinutes)) * 50;
      const bidScore = (v.bidValue / maxBid) * 50;
      const totalScore = waitScore + bidScore;

      return {
        vendorId: v.id,
        name: v.name,
        type: v.type,
        zoneId: v.zoneId,
        queueLength: v.currentQueue,
        estimatedWait: v.estimatedWait,
        estimatedWaitMinutes: Math.round(waitMinutes * 10) / 10,
        score: Math.round(totalScore * 10) / 10,
        isSponsored: v.bidValue > maxBid * 0.7,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Detect queue spikes — vendors where queue suddenly grew.
 */
function detectQueueSpikes() {
  const vendors = store.getVendors();
  const spikes = [];

  for (const vendor of vendors) {
    const history = store.getQueueHistory(vendor.id, 20);
    if (history.length < 5) continue;

    const recent = history.slice(-5);
    const older = history.slice(-10, -5);
    if (older.length === 0) continue;

    const recentAvg = recent.reduce((a, b) => a + b.queueLength, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b.queueLength, 0) / older.length;

    if (olderAvg > 0 && recentAvg > olderAvg * 2) {
      spikes.push({
        vendorId: vendor.id,
        vendorName: vendor.name,
        currentQueue: vendor.currentQueue,
        growthRate: Math.round((recentAvg / olderAvg) * 100) / 100,
      });
    }
  }

  return spikes;
}

/**
 * Find the vendor with the shortest wait time of a given type.
 */
function findShortestWait(type = null) {
  let vendors = store.getVendors().filter(v => v.isActive);
  if (type) vendors = vendors.filter(v => v.type === type);
  
  if (vendors.length === 0) return null;
  return vendors.reduce((min, v) => v.estimatedWait < min.estimatedWait ? v : min);
}

module.exports = { update, getRecommendations, detectQueueSpikes, findShortestWait };
