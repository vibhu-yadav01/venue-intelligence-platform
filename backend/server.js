/**
 * Intelligent Venue Experience Platform — API Server
 * 
 * Express + Socket.io server providing:
 * - REST API for venue data, routing, and simulation control
 * - WebSocket for real-time state broadcasts
 * - Static file serving for dashboard and mobile app
 * 
 * Port: 3000
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

// ─── Core modules ───
const store = require('./store');
const crowdEngine = require('./engines/crowd');
const queueEngine = require('./engines/queue');
const routingEngine = require('./engines/routing');
const decisionEngine = require('./engines/decision');
const simulation = require('./engines/simulation');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

app.use(cors());
app.use(express.json());

// ─── Static file serving for frontends ───
app.use('/dashboard', express.static(path.join(__dirname, '..', 'dashboard')));
app.use('/mobile', express.static(path.join(__dirname, '..', 'mobile')));

// ─── Root redirect ───
app.get('/', (req, res) => {
  res.json({
    name: 'Intelligent Venue Experience Platform',
    version: '1.0.0',
    endpoints: {
      dashboard: '/dashboard',
      mobile: '/mobile',
      api: '/api',
    },
  });
});

// ═══════════════════════════════════════════════════════════
// REST API ROUTES
// ═══════════════════════════════════════════════════════════

// ─── Venue ───
app.get('/api/venue', (req, res) => {
  const venue = store.getVenue();
  res.json({ venue });
});

// ─── Zones with live density ───
app.get('/api/zones', (req, res) => {
  const zones = store.getZones();
  const densityMap = crowdEngine.getDensityMap();
  res.json({ zones, densityMap });
});

// ─── Zone history ───
app.get('/api/zones/:id/history', (req, res) => {
  const history = store.getCrowdHistory(req.params.id, 60);
  res.json({ zoneId: req.params.id, history });
});

// ─── Vendors with queue data ───
app.get('/api/vendors', (req, res) => {
  const vendors = store.getVendors();
  res.json({ vendors });
});

// ─── Vendor recommendations (ranked by wait + bid) ───
app.get('/api/vendors/recommendations', (req, res) => {
  const recommendations = queueEngine.getRecommendations();
  res.json({ recommendations });
});

// ─── Vendor queue history ───
app.get('/api/vendors/:id/history', (req, res) => {
  const history = store.getQueueHistory(req.params.id, 60);
  res.json({ vendorId: req.params.id, history });
});

// ─── Smart routing ───
app.post('/api/route', (req, res) => {
  const { from, to } = req.body;
  if (!from || !to) {
    return res.status(400).json({ error: 'Missing from/to zone IDs' });
  }
  const route = routingEngine.findRoute(from, to);
  res.json({ route });
});

// ─── Find nearest facility ───
app.get('/api/nearest', (req, res) => {
  const { from, type } = req.query;
  if (!from || !type) {
    return res.status(400).json({ error: 'Missing from zone ID or facility type' });
  }
  const result = routingEngine.findNearest(from, type);
  res.json({ result });
});

// ─── Alerts ───
app.get('/api/alerts', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const alerts = store.getAlerts(limit);
  res.json({ alerts });
});

app.post('/api/alerts', (req, res) => {
  const { type, severity, message, zoneId } = req.body;
  const venueId = store.getVenue()?.id || 'venue-001';
  const alert = store.addAlert({ venueId, type: type || 'manual', severity: severity || 'info', message, zoneId });
  
  // Broadcast to operators
  io.emit('alert', alert);
  
  res.json({ alert });
});

app.put('/api/alerts/:id/resolve', (req, res) => {
  const alert = store.resolveAlert(req.params.id);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  res.json({ alert });
});

// ─── Notifications ───
app.get('/api/notifications', (req, res) => {
  const notifications = store.getNotifications(20);
  res.json({ notifications });
});

app.post('/api/notifications', (req, res) => {
  const { title, message, type, severity, zoneId } = req.body;
  const notification = store.addNotification({
    type: type || 'manual',
    severity: severity || 'info',
    title: title || 'Venue Update',
    message,
    zoneId,
  });

  // Broadcast to attendees
  io.emit('notification', notification);

  res.json({ notification });
});

// ─── Crowd analytics ───
app.get('/api/crowd/hotspots', (req, res) => {
  const hotspots = crowdEngine.getHotspots(5);
  res.json({ hotspots });
});

app.get('/api/crowd/density-map', (req, res) => {
  const densityMap = crowdEngine.getDensityMap();
  res.json({ densityMap });
});

// ─── Simulation control ───
app.post('/api/simulation/start', (req, res) => {
  const { phase, interval } = req.body || {};
  const result = simulation.start({ phase, interval });
  res.json(result);
});

app.post('/api/simulation/stop', (req, res) => {
  const result = simulation.stop();
  res.json(result);
});

app.post('/api/simulation/phase', (req, res) => {
  const { phase } = req.body;
  if (!phase) return res.status(400).json({ error: 'Missing phase' });
  const result = simulation.setPhase(phase);
  res.json(result);
});

app.get('/api/simulation/status', (req, res) => {
  const status = simulation.getStatus();
  res.json(status);
});

// ─── Full state (debug) ───
app.get('/api/state', (req, res) => {
  res.json(store.getFullState());
});

// ═══════════════════════════════════════════════════════════
// WEBSOCKET
// ═══════════════════════════════════════════════════════════

io.on('connection', (socket) => {
  console.log(`[WS] Client connected: ${socket.id}`);

  // Send initial state
  socket.emit('state', store.getFullState());

  // Handle route requests from mobile clients
  socket.on('route-request', (data) => {
    const route = routingEngine.findRoute(data.from, data.to);
    socket.emit('route-response', route);
  });

  // Handle nearest facility request
  socket.on('nearest-request', (data) => {
    const result = routingEngine.findNearest(data.from, data.type);
    socket.emit('nearest-response', result);
  });

  socket.on('disconnect', () => {
    console.log(`[WS] Client disconnected: ${socket.id}`);
  });
});

// ─── Periodic state broadcast ───
let broadcastTimer = null;

function startBroadcast() {
  broadcastTimer = setInterval(() => {
    if (!store.isSimulationRunning()) return;

    // Run engines
    crowdEngine.update();
    queueEngine.update();
    const decisions = decisionEngine.evaluate();

    // Broadcast full state
    const state = store.getFullState();
    io.emit('state', state);

    // Broadcast individual alerts and notifications
    for (const alert of decisions.alerts) {
      io.emit('alert', alert);
    }
    for (const notification of decisions.notifications) {
      io.emit('notification', notification);
    }
  }, 2000); // Every 2 seconds
}

// ═══════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  🏟️  Intelligent Venue Experience Platform              ║');
  console.log('║                                                        ║');
  console.log(`║  API Server:    http://localhost:${PORT}                  ║`);
  console.log(`║  Dashboard:     http://localhost:${PORT}/dashboard        ║`);
  console.log(`║  Mobile App:    http://localhost:${PORT}/mobile           ║`);
  console.log('║                                                        ║');
  console.log('║  Start simulation: POST /api/simulation/start          ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');

  // Start the broadcast loop
  startBroadcast();
});

// ─── Graceful shutdown ───
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  simulation.stop();
  if (broadcastTimer) clearInterval(broadcastTimer);
  server.close();
  process.exit(0);
});
