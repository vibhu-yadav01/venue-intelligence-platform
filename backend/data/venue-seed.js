/**
 * Venue Seed Data — MetLife Arena
 * 
 * Defines the complete venue layout including:
 * - 20 zones with positions for SVG rendering
 * - Zone adjacency graph for Dijkstra routing
 * - 10 vendors in food court zones
 * - Capacity and type metadata
 */

const venue = {
  id: 'venue-001',
  name: 'MetLife Arena',
  capacity: 55000,
  address: '1 MetLife Stadium Dr, East Rutherford, NJ',
  status: 'active',

  zones: [
    // ─── GATES (4) — Entry/exit points ───
    { id: 'gate-n', name: 'North Gate', type: 'gate', capacity: 5000, x: 350, y: 10, w: 200, h: 55 },
    { id: 'gate-s', name: 'South Gate', type: 'gate', capacity: 5000, x: 350, y: 635, w: 200, h: 55 },
    { id: 'gate-e', name: 'East Gate', type: 'gate', capacity: 4000, x: 790, y: 295, w: 55, h: 110 },
    { id: 'gate-w', name: 'West Gate', type: 'gate', capacity: 4000, x: 55, y: 295, w: 55, h: 110 },

    // ─── CONCOURSES (4) — Main circulation corridors ───
    { id: 'conc-n', name: 'North Concourse', type: 'concourse', capacity: 4000, x: 220, y: 75, w: 460, h: 55 },
    { id: 'conc-s', name: 'South Concourse', type: 'concourse', capacity: 4000, x: 220, y: 570, w: 460, h: 55 },
    { id: 'conc-e', name: 'East Concourse', type: 'concourse', capacity: 3000, x: 700, y: 170, w: 70, h: 360 },
    { id: 'conc-w', name: 'West Concourse', type: 'concourse', capacity: 3000, x: 130, y: 170, w: 70, h: 360 },

    // ─── SEATING (4) — Spectator seating sections ───
    { id: 'seat-n', name: 'North Stand', type: 'seating', capacity: 9000, x: 260, y: 145, w: 380, h: 90 },
    { id: 'seat-s', name: 'South Stand', type: 'seating', capacity: 9000, x: 260, y: 465, w: 380, h: 90 },
    { id: 'seat-e', name: 'East Stand', type: 'seating', capacity: 7000, x: 600, y: 250, w: 85, h: 200 },
    { id: 'seat-w', name: 'West Stand', type: 'seating', capacity: 7000, x: 215, y: 250, w: 85, h: 200 },

    // ─── FOOD COURTS (4) — Concession areas ───
    { id: 'food-ne', name: 'NE Food Court', type: 'food_court', capacity: 800, x: 690, y: 75, w: 90, h: 70 },
    { id: 'food-nw', name: 'NW Food Court', type: 'food_court', capacity: 800, x: 120, y: 75, w: 90, h: 70 },
    { id: 'food-se', name: 'SE Food Court', type: 'food_court', capacity: 800, x: 690, y: 555, w: 90, h: 70 },
    { id: 'food-sw', name: 'SW Food Court', type: 'food_court', capacity: 800, x: 120, y: 555, w: 90, h: 70 },

    // ─── RESTROOMS (4) — Facility areas ───
    { id: 'rest-ne', name: 'NE Restrooms', type: 'restroom', capacity: 250, x: 710, y: 160, w: 60, h: 50 },
    { id: 'rest-nw', name: 'NW Restrooms', type: 'restroom', capacity: 250, x: 130, y: 160, w: 60, h: 50 },
    { id: 'rest-se', name: 'SE Restrooms', type: 'restroom', capacity: 250, x: 710, y: 490, w: 60, h: 50 },
    { id: 'rest-sw', name: 'SW Restrooms', type: 'restroom', capacity: 250, x: 130, y: 490, w: 60, h: 50 },
  ],

  // ─── ZONE ADJACENCY GRAPH ───
  // { zoneId → [{ to, distance }] }
  // Distance units are abstract (travel time in seconds / 10)
  adjacency: {
    'gate-n':  [{ to: 'conc-n', d: 5 }, { to: 'food-ne', d: 8 }, { to: 'food-nw', d: 8 }],
    'gate-s':  [{ to: 'conc-s', d: 5 }, { to: 'food-se', d: 8 }, { to: 'food-sw', d: 8 }],
    'gate-e':  [{ to: 'conc-e', d: 5 }, { to: 'food-ne', d: 9 }, { to: 'food-se', d: 9 }],
    'gate-w':  [{ to: 'conc-w', d: 5 }, { to: 'food-nw', d: 9 }, { to: 'food-sw', d: 9 }],

    'conc-n':  [{ to: 'gate-n', d: 5 }, { to: 'seat-n', d: 3 }, { to: 'food-ne', d: 4 }, { to: 'food-nw', d: 4 }, { to: 'rest-ne', d: 5 }, { to: 'rest-nw', d: 5 }, { to: 'conc-e', d: 7 }, { to: 'conc-w', d: 7 }],
    'conc-s':  [{ to: 'gate-s', d: 5 }, { to: 'seat-s', d: 3 }, { to: 'food-se', d: 4 }, { to: 'food-sw', d: 4 }, { to: 'rest-se', d: 5 }, { to: 'rest-sw', d: 5 }, { to: 'conc-e', d: 7 }, { to: 'conc-w', d: 7 }],
    'conc-e':  [{ to: 'gate-e', d: 5 }, { to: 'seat-e', d: 3 }, { to: 'food-ne', d: 4 }, { to: 'food-se', d: 4 }, { to: 'rest-ne', d: 3 }, { to: 'rest-se', d: 3 }, { to: 'conc-n', d: 7 }, { to: 'conc-s', d: 7 }],
    'conc-w':  [{ to: 'gate-w', d: 5 }, { to: 'seat-w', d: 3 }, { to: 'food-nw', d: 4 }, { to: 'food-sw', d: 4 }, { to: 'rest-nw', d: 3 }, { to: 'rest-sw', d: 3 }, { to: 'conc-n', d: 7 }, { to: 'conc-s', d: 7 }],

    'seat-n':  [{ to: 'conc-n', d: 3 }, { to: 'seat-e', d: 5 }, { to: 'seat-w', d: 5 }],
    'seat-s':  [{ to: 'conc-s', d: 3 }, { to: 'seat-e', d: 5 }, { to: 'seat-w', d: 5 }],
    'seat-e':  [{ to: 'conc-e', d: 3 }, { to: 'seat-n', d: 5 }, { to: 'seat-s', d: 5 }],
    'seat-w':  [{ to: 'conc-w', d: 3 }, { to: 'seat-n', d: 5 }, { to: 'seat-s', d: 5 }],

    'food-ne': [{ to: 'conc-n', d: 4 }, { to: 'conc-e', d: 4 }, { to: 'gate-n', d: 8 }, { to: 'gate-e', d: 9 }, { to: 'rest-ne', d: 3 }],
    'food-nw': [{ to: 'conc-n', d: 4 }, { to: 'conc-w', d: 4 }, { to: 'gate-n', d: 8 }, { to: 'gate-w', d: 9 }, { to: 'rest-nw', d: 3 }],
    'food-se': [{ to: 'conc-s', d: 4 }, { to: 'conc-e', d: 4 }, { to: 'gate-s', d: 8 }, { to: 'gate-e', d: 9 }, { to: 'rest-se', d: 3 }],
    'food-sw': [{ to: 'conc-s', d: 4 }, { to: 'conc-w', d: 4 }, { to: 'gate-s', d: 8 }, { to: 'gate-w', d: 9 }, { to: 'rest-sw', d: 3 }],

    'rest-ne': [{ to: 'conc-n', d: 5 }, { to: 'conc-e', d: 3 }, { to: 'food-ne', d: 3 }],
    'rest-nw': [{ to: 'conc-n', d: 5 }, { to: 'conc-w', d: 3 }, { to: 'food-nw', d: 3 }],
    'rest-se': [{ to: 'conc-s', d: 5 }, { to: 'conc-e', d: 3 }, { to: 'food-se', d: 3 }],
    'rest-sw': [{ to: 'conc-s', d: 5 }, { to: 'conc-w', d: 3 }, { to: 'food-sw', d: 3 }],
  },

  vendors: [
    { id: 'v-001', name: 'Big Burger', type: 'food', zoneId: 'food-ne', avgServiceTime: 45, bidValue: 50 },
    { id: 'v-002', name: 'Pizza Palace', type: 'food', zoneId: 'food-ne', avgServiceTime: 60, bidValue: 30 },
    { id: 'v-003', name: 'Taco Town', type: 'food', zoneId: 'food-nw', avgServiceTime: 35, bidValue: 40 },
    { id: 'v-004', name: 'Hot Dog Hub', type: 'food', zoneId: 'food-nw', avgServiceTime: 25, bidValue: 20 },
    { id: 'v-005', name: 'Beer Garden', type: 'beverage', zoneId: 'food-se', avgServiceTime: 30, bidValue: 70 },
    { id: 'v-006', name: 'Soda Station', type: 'beverage', zoneId: 'food-se', avgServiceTime: 15, bidValue: 10 },
    { id: 'v-007', name: 'Nacho Stand', type: 'food', zoneId: 'food-sw', avgServiceTime: 40, bidValue: 25 },
    { id: 'v-008', name: 'Ice Cream Parlor', type: 'food', zoneId: 'food-sw', avgServiceTime: 50, bidValue: 35 },
    { id: 'v-009', name: 'Team Store East', type: 'merchandise', zoneId: 'conc-e', avgServiceTime: 120, bidValue: 100 },
    { id: 'v-010', name: 'Team Store West', type: 'merchandise', zoneId: 'conc-w', avgServiceTime: 120, bidValue: 100 },
  ],
};

module.exports = venue;
