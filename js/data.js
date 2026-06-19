/**
 * ============================================================
 * Aeropark · data.js
 * DATA LAYER — Seed data, localStorage I/O, slot generation
 *
 * Airport Contexts:
 *   - 6 terminals/zones at Rajiv Gandhi International Airport (HYD)
 *   - Vehicle types: 2-wheeler (bikes) and 4-wheeler (cars)
 *   - Levels (floors) represent parking levels in multi-storey structures
 *
 * REPLACE GUIDE:
 *   Replace DB.* calls with fetch() to your backend API.
 *   Replace SEED_* with your real data.
 * ============================================================
 */

'use strict';

/* ── STORAGE KEYS ─────────────────────────────────────────── */
// CO-3: JavaScript constants for storage key management
const SK = {
  USERS: 'ap_users',
  ADMINS: 'ap_admins',
  LOCATIONS: 'ap_locations',
  RESERVATIONS: 'ap_reservations',
  SESSION: 'ap_session',
};

/* ── SEED: USERS ──────────────────────────────────────────── */
// CO-3: JavaScript objects and arrays for storing passenger data
const SEED_USERS = [
  { id: 'U001', username: 'traveller1', password: 'fly123', displayName: 'Arjun Mehta', role: 'user' },
  { id: 'U002', username: 'traveller2', password: 'soar456', displayName: 'Priya Sharma', role: 'user' },
  { id: 'U003', username: 'traveller3', password: 'wings789', displayName: 'Rahul Reddy', role: 'user' },
];

/* ── SEED: ADMINS ─────────────────────────────────────────── */
// Each admin controls one terminal/zone only
const SEED_ADMINS = [
  { id: 'A001', username: 'admin_t1', password: 'term1admin', displayName: 'Terminal 1 Admin', role: 'admin', locationId: 'terminal1' },
  { id: 'A002', username: 'admin_t2', password: 'term2admin', displayName: 'Terminal 2 Admin', role: 'admin', locationId: 'terminal2' },
  { id: 'A003', username: 'admin_intl', password: 'intladmin', displayName: 'Int\'l Terminal Admin', role: 'admin', locationId: 'intl' },
  { id: 'A004', username: 'admin_cargo', password: 'cargoadmin', displayName: 'Cargo Zone Admin', role: 'admin', locationId: 'cargo' },
  { id: 'A005', username: 'admin_vip', password: 'vipadmin', displayName: 'VIP Lounge Admin', role: 'admin', locationId: 'vip' },
  { id: 'A006', username: 'admin_econ', password: 'econadmin', displayName: 'Economy Lot Admin', role: 'admin', locationId: 'economy' },
];

/* ── SEED: LOCATIONS (Airport Terminals & Parking Zones) ──── */
/**
 * Each location represents an airport terminal or parking zone.
 * pricing: rate per hour in INR (₹) + GST percentage
 */
const SEED_LOCATIONS = [
  { id: 'terminal1', name: 'Terminal 1 — Domestic', floors: 3, adminId: 'A001', pricing: { rate2w: 30, rate4w: 80, taxPct: 18 } },
  { id: 'terminal2', name: 'Terminal 2 — Domestic', floors: 3, adminId: 'A002', pricing: { rate2w: 30, rate4w: 80, taxPct: 18 } },
  { id: 'intl', name: 'International Terminal', floors: 4, adminId: 'A003', pricing: { rate2w: 50, rate4w: 150, taxPct: 18 } },
  { id: 'cargo', name: 'Cargo & Freight Zone', floors: 2, adminId: 'A004', pricing: { rate2w: 20, rate4w: 60, taxPct: 18 } },
  { id: 'vip', name: 'VIP Executive Parking', floors: 2, adminId: 'A005', pricing: { rate2w: 80, rate4w: 250, taxPct: 18 } },
  { id: 'economy', name: 'Economy Long-Stay Lot', floors: 2, adminId: 'A006', pricing: { rate2w: 15, rate4w: 40, taxPct: 18 } },
];

/* ── DATA VERSION ─────────────────────────────────────────── */
// Bump this to force re-seed on next page load
const DATA_VERSION = 'aeropark-v1.0';

/* ── SLOT GENERATION ──────────────────────────────────────── */
/**
 * Generate parking slot objects for a given terminal + level.
 * Slot naming follows airport convention: Zone-Level-Row-Number
 * e.g., "A-01", "B-03" per row/column combination
 *
 * @param {string} locId  - terminal/zone ID
 * @param {number} floor  - level number (1-based)
 * @returns {object[]}    - array of slot objects
 */
function _generateSlots(locId, floor) {
  const rows = ['A', 'B', 'C', 'D'];
  const cols = [1, 2, 3, 4, 5, 6];
  const vtypes = ['2w', '4w'];
  // Weighted so most slots appear available (realistic for an airport)
  const statuses = ['available', 'available', 'available', 'occupied', 'reserved'];
  const slots = [];

  vtypes.forEach(vtype => {
    rows.forEach(row => {
      cols.forEach(col => {
        const id = `${row}-0${col}`;
        const key = `${locId}_${floor}_${vtype}_${id}`;
        // Stable hash: same slot always gets the same seed status on fresh load
        const seed = key.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
        const status = statuses[seed % statuses.length];
        const h = 8 + (seed % 10), m = (seed * 7) % 60;
        const timeStr = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;

        slots.push({
          key,            // unique composite key: "locId_floor_vtype_id"
          id,             // display label e.g. "A-01"
          locId,          // which terminal/zone
          floor,          // which level
          vtype,          // '2w' = two-wheeler | '4w' = four-wheeler
          status,         // 'available' | 'occupied' | 'reserved'
          vehicle: status !== 'available' ? `TS${(seed * 31 % 99).toString().padStart(2, '0')}${String.fromCharCode(65 + (seed % 26))}${String.fromCharCode(65 + ((seed * 3) % 26))}${(seed * 137 % 9000 + 1000)}` : '',
          entryTime: status !== 'available' ? timeStr : '',
          reservedName: status === 'reserved' ? SEED_USERS[seed % SEED_USERS.length].displayName : '',
          reservedUserId: status === 'reserved' ? SEED_USERS[seed % SEED_USERS.length].id : '',
          reservationId: status === 'reserved' ? `ARK-${(seed * 73 % 9000 + 1000)}` : '',
        });
      });
    });
  });

  return slots;
}

/* ── PUBLIC DATA API ──────────────────────────────────────── */
/**
 * All reads and writes go through this DB object.
 * To connect a backend: replace each function body with a fetch() call.
 */
const DB = {

  /* ── INIT ─────────────────────────────────────────────── */
  /**
   * Seed localStorage on first run (or after a version bump).
   * Called once from main.js on DOMContentLoaded.
   */
  init() {
    // If stored version doesn't match, wipe and re-seed automatically
    if (localStorage.getItem('ap_data_version') !== DATA_VERSION) {
      [SK.USERS, SK.ADMINS, SK.LOCATIONS, SK.RESERVATIONS, SK.SESSION].forEach(k =>
        localStorage.removeItem(k)
      );
      localStorage.setItem('ap_data_version', DATA_VERSION);
    }

    // Seed each collection if not yet stored
    if (!localStorage.getItem(SK.USERS)) {
      localStorage.setItem(SK.USERS, JSON.stringify(SEED_USERS));
    }
    if (!localStorage.getItem(SK.ADMINS)) {
      localStorage.setItem(SK.ADMINS, JSON.stringify(SEED_ADMINS));
    }

    // Seed locations with generated slots
    if (!localStorage.getItem(SK.LOCATIONS)) {
      const locations = SEED_LOCATIONS.map(loc => {
        const slots = [];
        for (let f = 1; f <= loc.floors; f++) {
          slots.push(..._generateSlots(loc.id, f));
        }
        return { ...loc, slots };
      });
      localStorage.setItem(SK.LOCATIONS, JSON.stringify(locations));
    }

    // Seed demo reservations from pre-reserved slots
    if (!localStorage.getItem(SK.RESERVATIONS)) {
      const allSlots = DB.getAllSlots();
      const reserved = allSlots.filter(s => s.status === 'reserved' && s.reservationId).slice(0, 10);
      const reservations = reserved.map(s => ({
        id: s.reservationId,
        slotKey: s.key,
        locId: s.locId,
        floor: s.floor,
        vtype: s.vtype,
        slotId: s.id,
        vehicle: s.vehicle,
        userName: s.reservedName,
        userId: s.reservedUserId,
        entryTime: s.entryTime,
        amount: DB.calcAmount(s.locId, s.vtype, 3).total, // 3hr default
        payMethod: 'upi',
        bookedAt: new Date(Date.now() - Math.random() * 86400000 * 3).toISOString(),
      }));
      localStorage.setItem(SK.RESERVATIONS, JSON.stringify(reservations));
    }
  },

  /* ── LOCATIONS ─────────────────────────────────────────── */

  /** Return all terminal/zone locations */
  getLocations() {
    return JSON.parse(localStorage.getItem(SK.LOCATIONS)) || [];
  },

  /** Return a single location by id */
  getLocation(locId) {
    return DB.getLocations().find(l => l.id === locId) || null;
  },

  /** Persist an updated location object */
  saveLocation(updatedLoc) {
    const locs = DB.getLocations().map(l => l.id === updatedLoc.id ? updatedLoc : l);
    localStorage.setItem(SK.LOCATIONS, JSON.stringify(locs));
  },

  /**
   * Update pricing for a location.
   * SECURITY: caller must verify admin.locationId === locId first.
   */
  savePricing(locId, pricing) {
    const loc = DB.getLocation(locId);
    if (!loc) return;
    loc.pricing = { ...loc.pricing, ...pricing };
    DB.saveLocation(loc);
  },

  /* ── SLOTS ─────────────────────────────────────────────── */

  /** Return all slots across all locations (flat array) */
  getAllSlots() {
    return DB.getLocations().flatMap(l => l.slots || []);
  },

  /**
   * Return slots filtered by location + level + vehicle type.
   * @param {string} locId
   * @param {number} floor
   * @param {string} vtype - '2w' | '4w' | 'all'
   */
  getSlots(locId, floor, vtype = 'all') {
    const loc = DB.getLocation(locId);
    if (!loc) return [];
    return (loc.slots || []).filter(s =>
      s.floor === floor && (vtype === 'all' || s.vtype === vtype)
    );
  },

  /** Find a slot by its composite key */
  getSlot(key) {
    return DB.getAllSlots().find(s => s.key === key) || null;
  },

  /**
   * Update a single slot and persist.
   * SECURITY: admin.js verifies slot.locId === admin.locationId before calling.
   */
  updateSlot(key, patch) {
    const locs = DB.getLocations();
    locs.forEach(loc => {
      const idx = (loc.slots || []).findIndex(s => s.key === key);
      if (idx !== -1) loc.slots[idx] = { ...loc.slots[idx], ...patch };
    });
    localStorage.setItem(SK.LOCATIONS, JSON.stringify(locs));
  },

  /* ── RESERVATIONS ──────────────────────────────────────── */

  /** Return all reservations */
  getReservations() {
    return JSON.parse(localStorage.getItem(SK.RESERVATIONS)) || [];
  },

  /**
   * Return reservations for a specific location.
   * Used by admins — they only see their terminal's bookings.
   */
  getReservationsByLocation(locId) {
    return DB.getReservations().filter(r => r.locId === locId);
  },

  /**
   * Return reservations for a specific user.
   * Users only ever see their own bookings.
   */
  getReservationsByUser(userId) {
    return DB.getReservations().filter(r => r.userId === userId);
  },

  /** Add a new reservation record */
  addReservation(reservation) {
    const all = DB.getReservations();
    all.push(reservation);
    localStorage.setItem(SK.RESERVATIONS, JSON.stringify(all));
  },

  /**
   * Cancel a reservation by ID and free its slot back to available.
   */
  cancelReservation(resId) {
    const all = DB.getReservations();
    const res = all.find(r => r.id === resId);
    if (!res) return false;

    DB.updateSlot(res.slotKey, {
      status: 'available', vehicle: '', entryTime: '',
      reservedName: '', reservedUserId: '', reservationId: '',
    });

    const updated = all.filter(r => r.id !== resId);
    localStorage.setItem(SK.RESERVATIONS, JSON.stringify(updated));
    return true;
  },

  /* ── AUTH ──────────────────────────────────────────────── */

  getUsers() { return JSON.parse(localStorage.getItem(SK.USERS)) || []; },
  getAdmins() { return JSON.parse(localStorage.getItem(SK.ADMINS)) || []; },

  /**
   * Look up credentials; returns the account object or null.
   * @param {string} username
   * @param {string} password
   * @param {'user'|'admin'} role
   */
  authenticate(username, password, role) {
    const list = role === 'admin' ? DB.getAdmins() : DB.getUsers();
    return list.find(u => u.username === username && u.password === password && u.role === role) || null;
  },

  /* ── SESSION ───────────────────────────────────────────── */

  saveSession(user) {
    const safe = {
      id: user.id, username: user.username, displayName: user.displayName,
      role: user.role, locationId: user.locationId || null,
    };
    localStorage.setItem(SK.SESSION, JSON.stringify(safe));
  },

  clearSession() { localStorage.removeItem(SK.SESSION); },

  getSession() {
    try { return JSON.parse(localStorage.getItem(SK.SESSION)); } catch { return null; }
  },

  /* ── HELPERS ───────────────────────────────────────────── */

  /**
   * Calculate total reservation amount including GST.
   * Formula: base = rate × hours; tax = base × (taxPct/100); total = base + tax
   *
   * @param {string} locId
   * @param {string} vtype  - '2w' | '4w'
   * @param {number} hours
   * @returns {{ rate, base, tax, total }}
   */
  calcAmount(locId, vtype, hours = 1) {
    const loc = DB.getLocation(locId);
    if (!loc) return { rate: 0, base: 0, tax: 0, total: 0 };
    const rate = vtype === '2w' ? loc.pricing.rate2w : loc.pricing.rate4w;
    const base = +(rate * hours).toFixed(2);
    const tax = +(base * (loc.pricing.taxPct / 100)).toFixed(2);
    return { rate, base, tax, total: +(base + tax).toFixed(2) };
  },

  /**
   * Compute revenue summary for a terminal (admin analytics).
   * @param {string} locId
   * @returns {{ total, count, byHour }}
   */
  getRevenueSummary(locId) {
    const reservations = DB.getReservationsByLocation(locId);
    const total = reservations.reduce((sum, r) => sum + (r.amount || 0), 0);
    const count = reservations.length;
    const byHour = Array(24).fill(0);
    reservations.forEach(r => {
      const h = new Date(r.bookedAt).getHours();
      byHour[h]++;
    });
    return { total: +total.toFixed(2), count, byHour };
  },

  /** Generate a unique reservation/booking ID with airport-style prefix */
  generateResId() {
    return `ARK-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`;
  },
};