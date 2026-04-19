/**
 * Smart Routing Engine
 * 
 * Represents the venue as a weighted graph and uses Dijkstra's algorithm
 * to find the least-congested path between any two zones.
 * 
 * Edge weight = base_distance + crowd_penalty(density)
 * crowd_penalty scales exponentially with density to strongly avoid congested zones.
 */

const store = require('../store');
const venueSeed = require('../data/venue-seed');

/**
 * Calculate crowd penalty for a given density (0-1).
 * Returns a multiplier that makes congested zones much more expensive to traverse.
 * 
 * density  →  penalty
 * 0.0      →  0.0
 * 0.3      →  0.5
 * 0.5      →  2.0
 * 0.8      →  8.0
 * 0.95     →  25.0
 * 1.0      →  50.0
 */
function crowdPenalty(density) {
  if (density <= 0) return 0;
  if (density >= 1) return 50;
  // Exponential curve: penalty = 50 * density^3
  return 50 * Math.pow(density, 3);
}

/**
 * Build the weighted adjacency graph from venue data + live density.
 * Returns: { nodeId → [{ to, weight }] }
 */
function buildGraph() {
  const adjacency = venueSeed.adjacency;
  const graph = {};

  for (const [zoneId, edges] of Object.entries(adjacency)) {
    const zone = store.getZone(zoneId);
    graph[zoneId] = [];

    for (const edge of edges) {
      const targetZone = store.getZone(edge.to);
      if (!targetZone) continue;

      // Weight = base distance + crowd penalty of destination zone
      const penalty = crowdPenalty(targetZone.density || 0);
      const weight = edge.d + penalty;

      graph[zoneId].push({
        to: edge.to,
        weight: Math.round(weight * 100) / 100,
        baseDistance: edge.d,
        penalty: Math.round(penalty * 100) / 100,
      });
    }
  }

  return graph;
}

/**
 * Dijkstra's shortest path algorithm.
 * Returns: { path: [zoneIds], totalCost, estimatedTimeSeconds, segments }
 */
function findRoute(fromZoneId, toZoneId) {
  if (fromZoneId === toZoneId) {
    return {
      path: [fromZoneId],
      totalCost: 0,
      estimatedTimeSeconds: 0,
      segments: [],
    };
  }

  const graph = buildGraph();
  
  // Check both zones exist
  if (!graph[fromZoneId] || !graph[toZoneId]) {
    return { error: 'Invalid zone ID', path: [], totalCost: Infinity, segments: [] };
  }

  // Dijkstra
  const distances = {};
  const previous = {};
  const visited = new Set();
  const pq = []; // simple priority queue (array)

  // Initialize
  for (const nodeId of Object.keys(graph)) {
    distances[nodeId] = Infinity;
    previous[nodeId] = null;
  }
  distances[fromZoneId] = 0;
  pq.push({ id: fromZoneId, dist: 0 });

  while (pq.length > 0) {
    // Extract min
    pq.sort((a, b) => a.dist - b.dist);
    const { id: current } = pq.shift();

    if (visited.has(current)) continue;
    visited.add(current);

    if (current === toZoneId) break;

    // Relax neighbors
    for (const edge of (graph[current] || [])) {
      if (visited.has(edge.to)) continue;

      const newDist = distances[current] + edge.weight;
      if (newDist < distances[edge.to]) {
        distances[edge.to] = newDist;
        previous[edge.to] = current;
        pq.push({ id: edge.to, dist: newDist });
      }
    }
  }

  // Reconstruct path
  if (distances[toZoneId] === Infinity) {
    return { error: 'No path found', path: [], totalCost: Infinity, segments: [] };
  }

  const path = [];
  let current = toZoneId;
  while (current !== null) {
    path.unshift(current);
    current = previous[current];
  }

  // Build segment details
  const segments = [];
  for (let i = 0; i < path.length - 1; i++) {
    const from = path[i];
    const to = path[i + 1];
    const edge = graph[from].find(e => e.to === to);
    const toZone = store.getZone(to);

    segments.push({
      from,
      to,
      fromName: store.getZone(from)?.name || from,
      toName: toZone?.name || to,
      distance: edge?.baseDistance || 0,
      crowdPenalty: edge?.penalty || 0,
      totalWeight: edge?.weight || 0,
      destinationDensity: toZone?.density || 0,
    });
  }

  // Estimate time: each distance unit ≈ 10 seconds of walking
  const estimatedTimeSeconds = Math.round(distances[toZoneId] * 10);

  return {
    path,
    totalCost: Math.round(distances[toZoneId] * 100) / 100,
    estimatedTimeSeconds,
    estimatedTimeMinutes: Math.round(estimatedTimeSeconds / 60 * 10) / 10,
    segments,
  };
}

/**
 * Find the best zone of a given type (lowest crowd penalty to reach).
 * E.g., find the nearest low-congestion restroom from the user's zone.
 */
function findNearest(fromZoneId, targetType) {
  const zones = store.getZones().filter(z => z.type === targetType);
  let bestRoute = null;

  for (const zone of zones) {
    const route = findRoute(fromZoneId, zone.id);
    if (!route.error && (!bestRoute || route.totalCost < bestRoute.totalCost)) {
      bestRoute = { ...route, destination: zone };
    }
  }

  return bestRoute;
}

module.exports = { findRoute, findNearest, crowdPenalty, buildGraph };
