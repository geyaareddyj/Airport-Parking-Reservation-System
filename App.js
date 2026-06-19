import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import './style.css';

// ── DATA CONTEXT ──────────────────────────────────────────────
const DataContext = createContext();

export const useData = () => useContext(DataContext);

// ── STORAGE KEYS ─────────────────────────────────────────────
const SK = {
  USERS: 'ap_users',
  ADMINS: 'ap_admins',
  LOCATIONS: 'ap_locations',
  RESERVATIONS: 'ap_reservations',
  SESSION: 'ap_session',
};

// ── SEED DATA ────────────────────────────────────────────────
const SEED_USERS = [
  { id: 'U001', username: 'traveller1', password: 'fly123', displayName: 'Arjun Mehta', role: 'user' },
  { id: 'U002', username: 'traveller2', password: 'soar456', displayName: 'Priya Sharma', role: 'user' },
  { id: 'U003', username: 'traveller3', password: 'wings789', displayName: 'Rahul Reddy', role: 'user' },
];

const SEED_ADMINS = [
  { id: 'A001', username: 'admin_t1', password: 'term1admin', displayName: 'Terminal 1 Admin', role: 'admin', locationId: 'terminal1' },
  { id: 'A002', username: 'admin_t2', password: 'term2admin', displayName: 'Terminal 2 Admin', role: 'admin', locationId: 'terminal2' },
  { id: 'A003', username: 'admin_intl', password: 'intladmin', displayName: 'Int\'l Terminal Admin', role: 'admin', locationId: 'intl' },
  { id: 'A004', username: 'admin_cargo', password: 'cargoadmin', displayName: 'Cargo Zone Admin', role: 'admin', locationId: 'cargo' },
  { id: 'A005', username: 'admin_vip', password: 'vipadmin', displayName: 'VIP Lounge Admin', role: 'admin', locationId: 'vip' },
  { id: 'A006', username: 'admin_econ', password: 'econadmin', displayName: 'Economy Lot Admin', role: 'admin', locationId: 'economy' },
];

const SEED_LOCATIONS = [
  { id: 'terminal1', name: 'Terminal 1 — Domestic', floors: 3, adminId: 'A001', pricing: { rate2w: 30, rate4w: 80, taxPct: 18 } },
  { id: 'terminal2', name: 'Terminal 2 — Domestic', floors: 3, adminId: 'A002', pricing: { rate2w: 30, rate4w: 80, taxPct: 18 } },
  { id: 'intl', name: 'International Terminal', floors: 4, adminId: 'A003', pricing: { rate2w: 50, rate4w: 150, taxPct: 18 } },
  { id: 'cargo', name: 'Cargo & Freight Zone', floors: 2, adminId: 'A004', pricing: { rate2w: 20, rate4w: 60, taxPct: 18 } },
  { id: 'vip', name: 'VIP Executive Parking', floors: 2, adminId: 'A005', pricing: { rate2w: 80, rate4w: 250, taxPct: 18 } },
  { id: 'economy', name: 'Economy Long-Stay Lot', floors: 2, adminId: 'A006', pricing: { rate2w: 15, rate4w: 40, taxPct: 18 } },
];

const DATA_VERSION = 'aeropark-v1.0';

// ── SLOT GENERATION ───────────────────────────────────────────
function generateSlots(locId, floor) {
  const rows = ['A', 'B', 'C', 'D'];
  const cols = [1, 2, 3, 4, 5, 6];
  const vtypes = ['2w', '4w'];
  const statuses = ['available', 'available', 'available', 'occupied', 'reserved'];
  const slots = [];

  vtypes.forEach(vtype => {
    rows.forEach(row => {
      cols.forEach(col => {
        const id = `${row}-0${col}`;
        const key = `${locId}_${floor}_${vtype}_${id}`;
        const seed = key.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
        const status = statuses[seed % statuses.length];
        const h = 8 + (seed % 10), m = (seed * 7) % 60;
        const timeStr = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;

        slots.push({
          key, id, locId, floor, vtype, status,
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

// ── DATA SERVICE ─────────────────────────────────────────────
const DB = {
  init() {
    if (localStorage.getItem('ap_data_version') !== DATA_VERSION) {
      [SK.USERS, SK.ADMINS, SK.LOCATIONS, SK.RESERVATIONS, SK.SESSION].forEach(k => localStorage.removeItem(k));
      localStorage.setItem('ap_data_version', DATA_VERSION);
    }

    if (!localStorage.getItem(SK.USERS)) {
      localStorage.setItem(SK.USERS, JSON.stringify(SEED_USERS));
    }
    if (!localStorage.getItem(SK.ADMINS)) {
      localStorage.setItem(SK.ADMINS, JSON.stringify(SEED_ADMINS));
    }

    if (!localStorage.getItem(SK.LOCATIONS)) {
      const locations = SEED_LOCATIONS.map(loc => {
        const slots = [];
        for (let f = 1; f <= loc.floors; f++) {
          slots.push(...generateSlots(loc.id, f));
        }
        return { ...loc, slots };
      });
      localStorage.setItem(SK.LOCATIONS, JSON.stringify(locations));
    }

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
        amount: DB.calcAmount(s.locId, s.vtype, 3).total,
        payMethod: 'upi',
        bookedAt: new Date(Date.now() - Math.random() * 86400000 * 3).toISOString(),
      }));
      localStorage.setItem(SK.RESERVATIONS, JSON.stringify(reservations));
    }
  },

  getLocations() { return JSON.parse(localStorage.getItem(SK.LOCATIONS)) || []; },
  getLocation(locId) { return DB.getLocations().find(l => l.id === locId) || null; },
  saveLocation(updatedLoc) {
    const locs = DB.getLocations().map(l => l.id === updatedLoc.id ? updatedLoc : l);
    localStorage.setItem(SK.LOCATIONS, JSON.stringify(locs));
  },
  savePricing(locId, pricing) {
    const loc = DB.getLocation(locId);
    if (!loc) return;
    loc.pricing = { ...loc.pricing, ...pricing };
    DB.saveLocation(loc);
  },

  getAllSlots() { return DB.getLocations().flatMap(l => l.slots || []); },
  getSlots(locId, floor, vtype = 'all') {
    const loc = DB.getLocation(locId);
    if (!loc) return [];
    return (loc.slots || []).filter(s => s.floor === floor && (vtype === 'all' || s.vtype === vtype));
  },
  getSlot(key) { return DB.getAllSlots().find(s => s.key === key) || null; },
  updateSlot(key, patch) {
    const locs = DB.getLocations();
    locs.forEach(loc => {
      const idx = (loc.slots || []).findIndex(s => s.key === key);
      if (idx !== -1) loc.slots[idx] = { ...loc.slots[idx], ...patch };
    });
    localStorage.setItem(SK.LOCATIONS, JSON.stringify(locs));
  },

  getReservations() { return JSON.parse(localStorage.getItem(SK.RESERVATIONS)) || []; },
  getReservationsByLocation(locId) { return DB.getReservations().filter(r => r.locId === locId); },
  getReservationsByUser(userId) { return DB.getReservations().filter(r => r.userId === userId); },
  addReservation(reservation) {
    const all = DB.getReservations();
    all.push(reservation);
    localStorage.setItem(SK.RESERVATIONS, JSON.stringify(all));
  },
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

  getUsers() { return JSON.parse(localStorage.getItem(SK.USERS)) || []; },
  getAdmins() { return JSON.parse(localStorage.getItem(SK.ADMINS)) || []; },
  authenticate(username, password, role) {
    const list = role === 'admin' ? DB.getAdmins() : DB.getUsers();
    return list.find(u => u.username === username && u.password === password && u.role === role) || null;
  },

  saveSession(user) {
    const safe = { id: user.id, username: user.username, displayName: user.displayName, role: user.role, locationId: user.locationId || null };
    localStorage.setItem(SK.SESSION, JSON.stringify(safe));
  },
  clearSession() { localStorage.removeItem(SK.SESSION); },
  getSession() { try { return JSON.parse(localStorage.getItem(SK.SESSION)); } catch { return null; } },

  calcAmount(locId, vtype, hours = 1) {
    const loc = DB.getLocation(locId);
    if (!loc) return { rate: 0, base: 0, tax: 0, total: 0 };
    const rate = vtype === '2w' ? loc.pricing.rate2w : loc.pricing.rate4w;
    const base = +(rate * hours).toFixed(2);
    const tax = +(base * (loc.pricing.taxPct / 100)).toFixed(2);
    return { rate, base, tax, total: +(base + tax).toFixed(2) };
  },

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

  generateResId() { return `ARK-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`; },
};

// ── ROUTE PERMISSIONS ────────────────────────────────────────
const ROUTE_PERMISSIONS = {
  'dashboard': ['user', 'admin'],
  'trip-planner': ['user'],
  'my-reservations': ['user'],
  'admin-reservations': ['admin'],
  'admin-analytics': ['admin'],
  'admin-settings': ['admin'],
};

// ── AUTH CONTEXT ─────────────────────────────────────────────
const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = DB.getSession();
    if (saved) setUser(saved);
    setLoading(false);
  }, []);

  const login = (username, password, role) => {
    if (!username || !password) return { ok: false, error: 'Please enter both username and access code.' };
    const account = DB.authenticate(username, password, role);
    if (!account) return { ok: false, error: '❌ Invalid credentials. Check your user ID and access code.' };
    const session = { id: account.id, username: account.username, displayName: account.displayName, role: account.role, locationId: account.locationId || null };
    setUser(session);
    DB.saveSession(session);
    return { ok: true };
  };

  const logout = () => {
    setUser(null);
    DB.clearSession();
  };

  const isAdmin = () => user?.role === 'admin';
  const isUser = () => user?.role === 'user';
  const isLoggedIn = () => !!user;

  const canAccess = (pageId, locId = null) => {
    if (!user) return false;
    const allowed = ROUTE_PERMISSIONS[pageId];
    if (!allowed) return false;
    if (!allowed.includes(user.role)) return false;
    if (user.role === 'admin' && locId && user.locationId !== locId) return false;
    return true;
  };

  const canEditSlot = (slotKey) => {
    if (!user || user.role !== 'admin') return false;
    const locId = slotKey.split('_')[0];
    return locId === user.locationId;
  };

  const canEditPricing = (locId) => {
    if (!user || user.role !== 'admin') return false;
    return user.locationId === locId;
  };

  const getAdminLocation = () => {
    if (!isAdmin()) return null;
    return DB.getLocation(user.locationId);
  };

  const value = { user, login, logout, isAdmin, isUser, isLoggedIn, canAccess, canEditSlot, canEditPricing, getAdminLocation };

  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>;
};

// ── UTILITY HELPERS ──────────────────────────────────────────
const nowTime = () => {
  const d = new Date(), h = d.getHours(), m = d.getMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

const todayISO = () => new Date().toISOString().split('T')[0];

const cap = str => str.charAt(0).toUpperCase() + str.slice(1);

const payLabel = (method) => {
  const map = { upi: '📱 UPI', card: '💳 Card', netbanking: '🏦 Net Banking', cash: '💵 Cash', admin: '🛂 Admin' };
  return map[method] || method;
};

// ── TOAST CONTEXT ────────────────────────────────────────────
const ToastContext = createContext();

export const useToast = () => useContext(ToastContext);

const ToastProvider = ({ children }) => {
  const [message, setMessage] = useState('');
  const [type, setType] = useState('default');
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  const showToast = (msg, type = 'default') => {
    setMessage(msg);
    setType(type);
    setVisible(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 3500);
  };

  const value = { showToast, visible, message, type };

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
};

// ── THEME CONTEXT ────────────────────────────────────────────
const ThemeContext = createContext();

export const useTheme = () => useContext(ThemeContext);

const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(localStorage.getItem('ap_theme') || 'dark');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('ap_theme', theme);
  }, [theme]);

  const toggle = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  const value = { theme, toggle };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

// ── CLOCK ────────────────────────────────────────────────────
const Clock = () => {
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  return <div className="clock-widget">{time}</div>;
};

// ── SLOT POPUP BEHAVIOR ─────────────────────────────────────
const attachPopupBehavior = (slotRef, popupRef) => {
  const PAD = 10;

  const positionPopup = () => {
    if (!slotRef.current || !popupRef.current) return;
    const slot = slotRef.current;
    const popup = popupRef.current;
    const slotR = slot.getBoundingClientRect();
    const popW = popup.offsetWidth || 200;
    const popH = popup.offsetHeight || 200;
    const vw = document.documentElement.clientWidth;

    if (slotR.top - popH - 10 < PAD) {
      popup.style.top = 'calc(100% + 10px)';
      popup.style.bottom = 'auto';
    } else {
      popup.style.bottom = 'calc(100% + 10px)';
      popup.style.top = 'auto';
    }

    const centeredLeft = slotR.left + slotR.width / 2 - popW / 2;
    if (centeredLeft < PAD) {
      popup.style.left = '0';
      popup.style.right = 'auto';
      popup.style.transform = 'none';
    } else if (centeredLeft + popW > vw - PAD) {
      popup.style.left = 'auto';
      popup.style.right = '0';
      popup.style.transform = 'none';
    } else {
      popup.style.left = '50%';
      popup.style.right = 'auto';
      popup.style.transform = 'translateX(-50%)';
    }
  };

  const show = () => {
    if (popupRef.current) {
      positionPopup();
      popupRef.current.style.opacity = '1';
      popupRef.current.style.pointerEvents = 'all';
    }
  };

  const hide = () => {
    if (popupRef.current) {
      popupRef.current.style.opacity = '0';
      popupRef.current.style.pointerEvents = 'none';
    }
  };

  return { show, hide };
};

// ── SLOT CARD COMPONENT (FIXED) ─────────────────────────────
const SlotCard = ({ slot, isAdmin, onReserve, onOccupy, onFree, onAdminReserve }) => {
  const slotRef = useRef(null);
  const popupRef = useRef(null);
  const { show, hide } = attachPopupBehavior(slotRef, popupRef);

  const icon = slot.vtype === '2w' ? '🛵' : '🚗';
  const statusLabel = cap(slot.status);

  let details = '';
  let actions = '';

  if (isAdmin) {
    details = `
      <div className="popup-row"><span className="popup-lbl">STATUS</span><span className="popup-val badge-${slot.status}">${statusLabel}</span></div>
      ${slot.vehicle ? `<div className="popup-row"><span className="popup-lbl">VEHICLE</span><span className="popup-val">${slot.vehicle}</span></div>` : ''}
      ${slot.reservedName ? `<div className="popup-row"><span className="popup-lbl">PASSENGER</span><span className="popup-val">${slot.reservedName}</span></div>` : ''}
      ${slot.entryTime ? `<div className="popup-row"><span className="popup-lbl">ENTRY</span><span className="popup-val">${slot.entryTime}</span></div>` : ''}
    `;

    if (slot.status === 'available') {
      actions = `
        <button className="btn btn-danger btn-sm btn-full" onClick={() => onOccupy(slot.key)}>MARK OCCUPIED</button>
        <button className="btn btn-warning btn-sm btn-full" onClick={() => onAdminReserve(slot.key)}>RESERVE</button>
      `;
    } else {
      actions = `<button className="btn btn-success btn-sm btn-full" onClick={() => onFree(slot.key)}>FREE SLOT</button>`;
    }
  } else {
    details = `
      <div className="popup-row"><span className="popup-lbl">STATUS</span><span className="popup-val badge-${slot.status}">${statusLabel}</span></div>
      <div className="popup-row"><span className="popup-lbl">TYPE</span><span className="popup-val">${slot.vtype === '2w' ? '2-Wheeler' : '4-Wheeler'}</span></div>
    `;
    actions = slot.status === 'available'
      ? `<button className="btn btn-primary btn-sm btn-full" onClick={() => onReserve(slot.key)}>RESERVE</button>`
      : `<div className="slot-unavail-note">${slot.status === 'occupied' ? 'Currently occupied' : 'Already booked'}</div>`;
  }

  const handleSlotLeave = (e) => {
    const related = e.relatedTarget;
    if (!related || !(related instanceof Node)) {
      hide();
      return;
    }
    if (!popupRef.current?.contains(related)) {
      hide();
    }
  };

  const handlePopupLeave = (e) => {
    const related = e.relatedTarget;
    if (!related || !(related instanceof Node)) {
      hide();
      return;
    }
    if (!slotRef.current?.contains(related)) {
      hide();
    }
  };

  return (
    <div
      ref={slotRef}
      className={`slot slot-${slot.status}`}
      onMouseEnter={show}
      onMouseLeave={handleSlotLeave}
    >
      <div className="slot-icon">{icon}</div>
      <div className="slot-id">{slot.id}</div>
      <div className={`slot-badge badge-${slot.status}`}>{statusLabel}</div>
      <div
        ref={popupRef}
        className="slot-popup"
        style={{ opacity: 0, pointerEvents: 'none' }}
        onMouseLeave={handlePopupLeave}
        dangerouslySetInnerHTML={{
          __html: `
          <div className="popup-title">SLOT ${slot.id}</div>
          ${details}
          <div className="popup-actions">${actions}</div>
        ` }}
      />
    </div>
  );
};

// ── LOGIN COMPONENT ──────────────────────────────────────────
const LoginPage = () => {
  const { login, isLoggedIn } = useAuth();
  const { showToast } = useToast();
  const { theme, toggle } = useTheme();
  const [role, setRole] = useState('user');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    setError('');
    const result = login(username, password, role);
    if (!result.ok) {
      setError(result.error);
    }
  };

  if (isLoggedIn()) return null;

  return (
    <div id="loginPage">
      <div className="runway-bg">
        <div className="runway-line"></div>
        <div className="runway-line"></div>
        <div className="runway-line"></div>
      </div>

      <div id="loginCard">
        <button className="theme-toggle-btn" style={{ position: 'absolute', top: '16px', right: '16px' }} onClick={toggle}>
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>

        <div className="login-brand">
          <div className="brand-icon">✈</div>
          <div className="brand-text">
            <span className="brand-name">AEROPARK</span>
            <span className="brand-sub">AIRPORT PARKING SYSTEM</span>
          </div>
        </div>

        <div className="iata-display">HYD · RAJIV GANDHI INTL AIRPORT</div>

        <div className="role-tabs" role="tablist">
          <button
            className={`role-tab ${role === 'user' ? 'active' : ''}`}
            onClick={() => { setRole('user'); setError(''); }}
          >
            <span className="tab-icon">👤</span> PASSENGER
          </button>
          <button
            className={`role-tab ${role === 'admin' ? 'active' : ''}`}
            onClick={() => { setRole('admin'); setError(''); }}
          >
            <span className="tab-icon">🛂</span> AUTHORITY
          </button>
        </div>

        <form className="login-form" onSubmit={handleLogin}>
          <div className="input-group">
            <label className="input-label">USER ID</label>
            <input
              type="text"
              className="login-input"
              placeholder="Enter your user ID"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div className="input-group">
            <label className="input-label">ACCESS CODE</label>
            <input
              type="password"
              className="login-input"
              placeholder="Enter access code"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="login-btn">
            <span>CLEAR FOR BOARDING</span>
            <span className="btn-arrow">→</span>
          </button>
        </form>

        <div id="loginDemoHint" className="demo-hint">
          {role === 'admin' ? (
            <>
              <strong>Staff Login:</strong><br />
              <code>admin_t1</code> / <code>term1admin</code> (Terminal 1)<br />
              <code>admin_t2</code> / <code>term2admin</code> (Terminal 2)<br />
              <code>admin_intl</code> / <code>intladmin</code> (International)
            </>
          ) : (
            <>
              <strong>Passenger Demo:</strong><br />
              <code>traveller1</code> / <code>fly123</code><br />
              <code>traveller2</code> / <code>soar456</code>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ── SIDEBAR COMPONENT ────────────────────────────────────────
const Sidebar = ({ currentPage, onNavigate }) => {
  const { user, logout, isAdmin, getAdminLocation } = useAuth();
  const { theme, toggle } = useTheme();

  const navItems = [
    { id: 'dashboard', label: 'Parking Grid', icon: '🅿', show: ['user', 'admin'] },
    { id: 'trip-planner', label: 'Trip Planner', icon: '🗺', show: ['user'] },
    { id: 'my-reservations', label: 'My Bookings', icon: '🎫', show: ['user'] },
    { id: 'admin-reservations', label: 'All Reservations', icon: '📋', show: ['admin'] },
    { id: 'admin-analytics', label: 'Analytics', icon: '📊', show: ['admin'] },
    { id: 'admin-settings', label: 'Pricing', icon: '⚙', show: ['admin'] },
  ];

  const admin = isAdmin();
  const loc = admin ? getAdminLocation() : null;

  return (
    <aside id="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand">
          <span className="sb-icon">✈</span>
          <div>
            <div className="sb-name">AEROPARK</div>
            <div className="sb-code">HYD</div>
          </div>
        </div>
      </div>

      <div className="nav-user-pill">
        <span className={`dot ${admin ? 'dot-admin' : 'dot-user'}`}></span>
        {user?.displayName}
        {admin && <span className="pill-loc">({loc?.name || ''})</span>}
        {!admin && ' • Passenger'}
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-label">OPERATIONS</div>
        {navItems.filter(item => item.show.includes(user?.role || '')).map(item => (
          <a
            key={item.id}
            className={`nav-item ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onNavigate(item.id)}
            role="button"
            tabIndex="0"
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </a>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button className="theme-toggle-btn" onClick={toggle}>{theme === 'dark' ? '☀️' : '🌙'}</button>
        <button className="logout-btn" onClick={logout}><span>⏻</span> SIGN OUT</button>
      </div>
    </aside>
  );
};

// ── PARKING GRID COMPONENT ──────────────────────────────────
const ParkingGrid = ({ isAdminMode, onReserve, onOccupy, onFree, onAdminReserve }) => {
  const { user } = useAuth();
  const [locId, setLocId] = useState('');
  const [floor, setFloor] = useState(1);
  const [filter, setFilter] = useState('all');
  const [locations, setLocations] = useState([]);
  const [slots, setSlots] = useState({ '2w': [], '4w': [] });
  const [stats, setStats] = useState({ total: 0, available: 0, occupied: 0, reserved: 0 });

  useEffect(() => {
    const locs = DB.getLocations();
    setLocations(locs);
    if (locs.length > 0) {
      const defaultLoc = isAdminMode ? user?.locationId : locs[0]?.id;
      if (defaultLoc) setLocId(defaultLoc);
    }
  }, [isAdminMode, user]);

  useEffect(() => {
    if (!locId) return;
    const loc = DB.getLocation(locId);
    if (!loc) return;

    const allSlots = DB.getSlots(locId, floor);
    const slots2w = allSlots.filter(s => s.vtype === '2w');
    const slots4w = allSlots.filter(s => s.vtype === '4w');
    setSlots({ '2w': slots2w, '4w': slots4w });

    setStats({
      total: allSlots.length,
      available: allSlots.filter(s => s.status === 'available').length,
      occupied: allSlots.filter(s => s.status === 'occupied').length,
      reserved: allSlots.filter(s => s.status === 'reserved').length,
    });
  }, [locId, floor]);

  const handleFloorChange = (f) => setFloor(f);

  const getFilteredSlots = (slots) => {
    if (filter === 'all') return slots;
    return slots.filter(s => s.status === filter);
  };

  const loc = DB.getLocation(locId);

  if (!locId) return <div>Loading...</div>;

  return (
    <>
      <div className="controls-bar">
        {!isAdminMode ? (
          <div className="control-group" id="locationSelectWrap">
            <label className="ctrl-label">TERMINAL</label>
            <select className="ctrl-select" value={locId} onChange={(e) => setLocId(e.target.value)}>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        ) : (
          <div id="adminLocName">
            <span className="location-badge">✈ {loc?.name}</span>
          </div>
        )}

        <div className="control-group">
          <label className="ctrl-label">LEVEL</label>
          <div id="floorTabs" className="floor-tabs">
            {loc && Array.from({ length: loc.floors }, (_, i) => i + 1).map(f => (
              <button
                key={f}
                className={`floor-tab ${f === floor ? 'active' : ''}`}
                onClick={() => handleFloorChange(f)}
              >
                Level {f}
              </button>
            ))}
          </div>
        </div>

        <div className="control-group">
          <label className="ctrl-label">FILTER</label>
          <select className="ctrl-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All Slots</option>
            <option value="available">Available</option>
            <option value="occupied">Occupied</option>
            <option value="reserved">Reserved</option>
          </select>
        </div>

        {isAdminMode && (
          <div id="rateBadge" className="rate-badge">
            ₹{loc?.pricing.rate2w}/hr (2W) · ₹{loc?.pricing.rate4w}/hr (4W) + {loc?.pricing.taxPct}% GST
          </div>
        )}
      </div>

      <div className="stats-strip">
        <div className="stat-tile">
          <div className="stat-num">{stats.total}</div>
          <div className="stat-lbl">TOTAL SLOTS</div>
        </div>
        <div className="stat-tile stat-green">
          <div className="stat-num">{stats.available}</div>
          <div className="stat-lbl">AVAILABLE</div>
        </div>
        <div className="stat-tile stat-red">
          <div className="stat-num">{stats.occupied}</div>
          <div className="stat-lbl">OCCUPIED</div>
        </div>
        <div className="stat-tile stat-amber">
          <div className="stat-num">{stats.reserved}</div>
          <div className="stat-lbl">RESERVED</div>
        </div>
      </div>

      <div className="legend-bar">
        <span className="legend-item"><span className="leg-dot dot-available"></span> Available</span>
        <span className="legend-item"><span className="leg-dot dot-occupied"></span> Occupied</span>
        <span className="legend-item"><span className="leg-dot dot-reserved"></span> Reserved</span>
      </div>

      <div id="parkingGridContainer" className="parking-grid-container">
        {[
          { key: '2w', label: '2-WHEELERS', icon: '🛵', data: slots['2w'] },
          { key: '4w', label: '4-WHEELERS', icon: '🚗', data: slots['4w'] },
        ].map(({ key, label, icon, data }) => {
          const filtered = getFilteredSlots(data);
          const avail = data.filter(s => s.status === 'available').length;
          return (
            <div key={key} className="vehicle-section">
              <div className="section-header-row">
                <span className="section-icon">{icon}</span>
                <span className="section-title">{label}</span>
                <span className="section-count">{avail}/{data.length} available</span>
              </div>
              <div className="parking-grid">
                {filtered.map(slot => (
                  <SlotCard
                    key={slot.key}
                    slot={slot}
                    isAdmin={isAdminMode}
                    onReserve={onReserve}
                    onOccupy={onOccupy}
                    onFree={onFree}
                    onAdminReserve={onAdminReserve}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

// ── TRIP PLANNER COMPONENT ──────────────────────────────────
const TRIP_DATA = {
  EarlyMorning: { crowd: 'Very Low', parking: 'Excellent', walkTime: '~2 min', tip: 'Best time to arrive — airport is nearly empty.', pct: 92, crowdClass: 'crowd-low' },
  Morning: { crowd: 'Low', parking: 'Good', walkTime: '~4 min', tip: 'Great time! Check-in queues are short.', pct: 78, crowdClass: 'crowd-low' },
  Afternoon: { crowd: 'Medium', parking: 'Limited', walkTime: '~8 min', tip: 'Moderate traffic. Arrive 15 min early.', pct: 48, crowdClass: 'crowd-medium' },
  Evening: { crowd: 'High', parking: 'Very Limited', walkTime: '~14 min', tip: 'Peak hours — book in advance!', pct: 20, crowdClass: 'crowd-high' },
  Night: { crowd: 'Medium', parking: 'Moderate', walkTime: '~6 min', tip: 'Good slot availability. Plan for late check-in.', pct: 60, crowdClass: 'crowd-medium' },
  LateNight: { crowd: 'Low', parking: 'Good', walkTime: '~3 min', tip: 'Light traffic. Drive safely at night.', pct: 75, crowdClass: 'crowd-low' },
};

const TripPlanner = () => {
  const [timeSlot, setTimeSlot] = useState('Evening');
  const [locationId, setLocationId] = useState('');
  const [locations, setLocations] = useState([]);

  useEffect(() => {
    const locs = DB.getLocations();
    setLocations(locs);
    if (locs.length > 0) setLocationId(locs[0].id);
  }, []);

  const data = TRIP_DATA[timeSlot] || TRIP_DATA.Evening;

  return (
    <div className="section-card">
      <div className="section-card-title">✈ FLIGHT & TRIP PLANNER</div>
      <p className="section-card-desc">Check crowd predictions and parking availability before heading to the airport.</p>

      <div className="planner-grid">
        <div className="planner-form">
          <div className="input-group">
            <label className="input-label">SELECT TERMINAL</label>
            <select className="ctrl-select full-select" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">ARRIVAL TIME</label>
            <select className="ctrl-select full-select" value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)}>
              <option value="EarlyMorning">Early Morning (4 AM – 7 AM)</option>
              <option value="Morning">Morning (7 AM – 11 AM)</option>
              <option value="Afternoon">Afternoon (11 AM – 3 PM)</option>
              <option value="Evening">Evening (3 PM – 7 PM)</option>
              <option value="Night">Night (7 PM – 11 PM)</option>
              <option value="LateNight">Late Night (11 PM – 4 AM)</option>
            </select>
          </div>
          <div className="input-group">
            <label className="input-label">VEHICLE TYPE</label>
            <select className="ctrl-select full-select">
              <option value="2w">🛵 Two Wheeler</option>
              <option value="4w">🚗 Four Wheeler</option>
            </select>
          </div>
        </div>

        <div id="tripResultCard" className="trip-result-card">
          <div className="trip-result-header">FORECAST</div>
          <div className="trip-metrics">
            <div className="trip-metric">
              <div className="trip-metric-label">CROWD LEVEL</div>
              <div className={`trip-metric-value ${data.crowdClass}`}>{data.crowd}</div>
            </div>
            <div className="trip-metric">
              <div className="trip-metric-label">PARKING STATUS</div>
              <div className="trip-metric-value">{data.parking}</div>
            </div>
            <div className="trip-metric">
              <div className="trip-metric-label">EST. WALK TIME</div>
              <div className="trip-metric-value">{data.walkTime}</div>
            </div>
          </div>
          <div className="trip-tip">💡 {data.tip}</div>
          <div className="trip-availability-bar">
            <div className="trip-bar-label">SLOT AVAILABILITY</div>
            <div className="trip-bar-track">
              <div className="trip-bar-fill" style={{ width: `${data.pct}%` }}></div>
            </div>
            <div className="trip-bar-pct">{data.pct}% slots expected available</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── MY RESERVATIONS COMPONENT ───────────────────────────────
const MyReservations = () => {
  const { user } = useAuth();
  const [reservations, setReservations] = useState([]);

  const loadReservations = () => {
    const myRes = DB.getReservationsByUser(user.id);
    setReservations(myRes);
  };

  useEffect(() => {
    loadReservations();
  }, [user]);

  const handleCancel = (resId) => {
    const res = DB.getReservations().find(r => r.id === resId);
    if (!res || res.userId !== user.id) return;
    DB.cancelReservation(resId);
    loadReservations();
  };

  if (!reservations.length) {
    return (
      <div className="section-card">
        <div className="section-card-title">🎫 MY BOOKINGS</div>
        <div className="empty-state" style={{ marginTop: '16px' }}>
          <span className="empty-icon">🅿</span>
          <p style={{ fontFamily: "'Rajdhani', sans-serif", fontSize: '1rem', letterSpacing: '0.1em', color: 'var(--text-secondary)' }}>NO ACTIVE BOOKINGS</p>
          <p style={{ fontSize: '0.8rem', marginTop: '6px', color: 'var(--text-dim)' }}>Browse the Parking Grid to reserve a slot.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="section-card">
      <div className="section-card-title">🎫 MY BOOKINGS</div>
      <div id="myReservationsList" className="reservations-list">
        {reservations.map(r => {
          const loc = DB.getLocation(r.locId);
          const locName = loc?.name || r.locId;
          const vtypeIcon = r.vtype === '2w' ? '🛵' : '🚗';
          const vtypeLbl = r.vtype === '2w' ? '2-Wheeler' : '4-Wheeler';
          return (
            <div key={r.id} className="reservation-card">
              <span className="res-icon">{vtypeIcon}</span>
              <div className="res-info">
                <div className="res-id">
                  Slot {r.slotId}
                  <span className="res-badge">{r.id}</span>
                </div>
                <div className="res-meta">{locName} · Level {r.floor} · {vtypeLbl} · Entry: {r.entryTime}</div>
                <div className="res-pay-method">Paid via {payLabel(r.payMethod)}</div>
              </div>
              <div className="res-right">
                <div className="res-price">₹{typeof r.amount === 'number' ? r.amount.toFixed(2) : r.amount}</div>
                <button className="btn btn-danger btn-sm" onClick={() => handleCancel(r.id)}>CANCEL</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── ADMIN RESERVATIONS COMPONENT ────────────────────────────
const AdminReservations = () => {
  const { user } = useAuth();
  const [reservations, setReservations] = useState([]);

  useEffect(() => {
    const locId = user?.locationId;
    if (locId) {
      const res = DB.getReservationsByLocation(locId);
      setReservations(res);
    }
  }, [user]);

  const loc = user ? DB.getLocation(user.locationId) : null;

  return (
    <div className="section-card">
      <div className="section-card-title">📋 ALL RESERVATIONS — <span id="adminResLocName">{loc?.name || ''}</span></div>
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>BOOKING ID</th>
              <th>PASSENGER</th>
              <th>LEVEL</th>
              <th>SLOT</th>
              <th>TYPE</th>
              <th>VEHICLE</th>
              <th>ENTRY TIME</th>
              <th>AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {reservations.length === 0 ? (
              <tr><td colSpan="8" className="empty-cell">No reservations yet for this terminal.</td></tr>
            ) : (
              reservations.map(r => (
                <tr key={r.id}>
                  <td><code>{r.id}</code></td>
                  <td>{r.userName}</td>
                  <td>Level {r.floor}</td>
                  <td>{r.slotId}</td>
                  <td>{r.vtype === '2w' ? '🛵 2W' : '🚗 4W'}</td>
                  <td><span className="vehicle-tag">{r.vehicle}</span></td>
                  <td>{r.entryTime}</td>
                  <td><span className="stat-badge badge-green">₹{r.amount?.toFixed ? r.amount.toFixed(2) : r.amount}</span></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── ADMIN ANALYTICS COMPONENT ───────────────────────────────
const AdminAnalytics = () => {
  const { user } = useAuth();
  const [summary, setSummary] = useState({ total: 0, count: 0, byHour: Array(24).fill(0) });
  const [rev2w, setRev2w] = useState(0);
  const [rev4w, setRev4w] = useState(0);

  useEffect(() => {
    const locId = user?.locationId;
    if (!locId) return;

    const { total, count, byHour } = DB.getRevenueSummary(locId);
    setSummary({ total, count, byHour });

    const reservations = DB.getReservationsByLocation(locId);
    const r2w = reservations.filter(r => r.vtype === '2w').reduce((s, r) => s + (r.amount || 0), 0);
    const r4w = reservations.filter(r => r.vtype === '4w').reduce((s, r) => s + (r.amount || 0), 0);
    setRev2w(r2w);
    setRev4w(r4w);
  }, [user]);

  const loc = user ? DB.getLocation(user.locationId) : null;
  const hourLabels = ['6AM', '7AM', '8AM', '9AM', '10AM', '11AM', '12PM', '1PM', '2PM', '3PM', '4PM', '5PM', '6PM', '7PM', '8PM', '9PM'];
  const chartData = summary.byHour.slice(6, 22);
  const max = Math.max(...chartData, 1);
  const peakIdx = chartData.indexOf(Math.max(...chartData));

  return (
    <div className="section-card">
      <div className="section-card-title">📊 ANALYTICS — {loc?.name || ''}</div>

      <div className="analytics-summary">
        <div className="analytics-kpi">
          <div className="kpi-label">TOTAL REVENUE</div>
          <div className="kpi-value">₹{summary.total.toFixed(2)}</div>
        </div>
        <div className="analytics-kpi">
          <div className="kpi-label">TOTAL BOOKINGS</div>
          <div className="kpi-value">{summary.count}</div>
        </div>
        <div className="analytics-kpi">
          <div className="kpi-label">PEAK HOUR</div>
          <div className="kpi-value">{hourLabels[peakIdx] || '—'}</div>
        </div>
      </div>

      <div id="revenueRows" className="revenue-breakdown">
        <div className="revenue-row"><span>🛵 Two-Wheeler Revenue</span><span>₹{rev2w.toFixed(2)}</span></div>
        <div className="revenue-row"><span>🚗 Four-Wheeler Revenue</span><span>₹{rev4w.toFixed(2)}</span></div>
        <div className="revenue-row" style={{ fontWeight: '700', borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '4px' }}>
          <span>TOTAL REVENUE</span>
          <span style={{ color: 'var(--green)' }}>₹{summary.total.toFixed(2)}</span>
        </div>
      </div>

      <div className="chart-section">
        <div className="chart-title">HOURLY BOOKING ACTIVITY</div>
        <div id="peakChart" className="bar-chart">
          {chartData.map((val, i) => (
            <div key={i} className="bar-wrap">
              <div
                className={`bar ${i === peakIdx ? 'peak' : ''}`}
                style={{ height: `${Math.round((val / max) * 100)}px` }}
                title={`${hourLabels[i]}: ${val} bookings`}
              ></div>
              <span className="bar-label">{hourLabels[i]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── ADMIN PRICING COMPONENT ─────────────────────────────────
const AdminPricing = () => {
  const { user } = useAuth();
  const [rate2w, setRate2w] = useState('');
  const [rate4w, setRate4w] = useState('');
  const [taxPct, setTaxPct] = useState('');

  const loc = user ? DB.getLocation(user.locationId) : null;

  useEffect(() => {
    if (loc) {
      setRate2w(loc.pricing.rate2w);
      setRate4w(loc.pricing.rate4w);
      setTaxPct(loc.pricing.taxPct);
    }
  }, [loc]);

  const handleSave = () => {
    const r2w = parseFloat(rate2w);
    const r4w = parseFloat(rate4w);
    const tax = parseFloat(taxPct);
    if (r2w < 5 || r4w < 5) { alert('⚠️ Rates must be at least ₹5/hr.'); return; }
    DB.savePricing(user.locationId, { rate2w: r2w, rate4w: r4w, taxPct: tax });
    alert('💾 Pricing saved successfully!');
  };

  if (!loc) return null;

  return (
    <div className="section-card">
      <div className="section-card-title">⚙ PRICING CONFIGURATION</div>
      <div id="costSettingsContainer" className="cost-settings">
        <div className="cost-location-name">⚙ Pricing for <strong>{loc.name}</strong></div>
        <div className="cost-row">
          <div className="cost-label-group">
            <span className="cost-location">🛵 Two-Wheeler Rate</span>
            <span className="cost-unit">per hour</span>
          </div>
          <div className="cost-input-group">
            <span className="cost-prefix">₹</span>
            <input
              className="cost-input"
              type="number"
              value={rate2w}
              onChange={(e) => setRate2w(e.target.value)}
              min="5"
              max="500"
            />
          </div>
        </div>
        <div className="cost-row">
          <div className="cost-label-group">
            <span className="cost-location">🚗 Four-Wheeler Rate</span>
            <span className="cost-unit">per hour</span>
          </div>
          <div className="cost-input-group">
            <span className="cost-prefix">₹</span>
            <input
              className="cost-input"
              type="number"
              value={rate4w}
              onChange={(e) => setRate4w(e.target.value)}
              min="5"
              max="2000"
            />
          </div>
        </div>
        <div className="cost-row">
          <div className="cost-label-group">
            <span className="cost-location">🧾 GST / Tax Rate</span>
            <span className="cost-unit">percent</span>
          </div>
          <div className="cost-input-group">
            <span className="cost-prefix">%</span>
            <input
              className="cost-input"
              type="number"
              value={taxPct}
              onChange={(e) => setTaxPct(e.target.value)}
              min="0"
              max="28"
            />
          </div>
        </div>
      </div>
      <button className="btn btn-primary save-btn" onClick={handleSave}>💾 SAVE CONFIGURATION</button>
    </div>
  );
};

// ── RESERVE MODAL (FIXED) ───────────────────────────────────
const ReserveModal = ({ isOpen, onClose, slotKey, onSuccess }) => {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [vehicle, setVehicle] = useState('');
  const [duration, setDuration] = useState(2);
  const [date, setDate] = useState(todayISO());
  const [payMethod, setPayMethod] = useState(null);
  const [amount, setAmount] = useState({ total: 0, base: 0, tax: 0 });
  const [isProcessing, setIsProcessing] = useState(false);

  const slot = slotKey ? DB.getSlot(slotKey) : null;
  const loc = slot ? DB.getLocation(slot.locId) : null;

  useEffect(() => {
    if (slot) {
      const amt = DB.calcAmount(slot.locId, slot.vtype, duration);
      setAmount(amt);
    }
  }, [slot, duration]);

  const handleGoToPayment = () => {
    if (!vehicle.trim()) {
      document.getElementById('resVehicle')?.focus();
      return;
    }
    setStep(2);
  };

  const handleConfirmPayment = () => {
    if (!payMethod) { alert('⚠️ Please select a payment method.'); return; }
    setIsProcessing(true);

    setTimeout(() => {
      if (!slot) { setIsProcessing(false); return; }
      const resId = DB.generateResId();
      const fmt = nowTime();

      DB.updateSlot(slotKey, {
        status: 'reserved',
        vehicle: vehicle.trim().toUpperCase(),
        entryTime: fmt,
        reservedName: user.displayName,
        reservedUserId: user.id,
        reservationId: resId,
      });

      DB.addReservation({
        id: resId,
        slotKey: slotKey,
        locId: slot.locId,
        floor: slot.floor,
        vtype: slot.vtype,
        slotId: slot.id,
        vehicle: vehicle.trim().toUpperCase(),
        userName: user.displayName,
        userId: user.id,
        entryTime: fmt,
        amount: amount.total,
        payMethod: payMethod,
        bookedAt: new Date().toISOString(),
      });

      setStep(3);
      setIsProcessing(false);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    }, 1800);
  };

  const handleClose = () => {
    setStep(1);
    setVehicle('');
    setDuration(2);
    setPayMethod(null);
    setIsProcessing(false);
    onClose();
  };

  if (!isOpen) return null;

  const label = slot ? `Slot ${slot.id} · ${loc?.name} · Level ${slot.floor} · ${slot.vtype === '2w' ? '2-Wheeler' : '4-Wheeler'}` : '';

  return (
    <div className={`modal-overlay open`} onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">✈ RESERVE PARKING SLOT</span>
          <button className="modal-close" onClick={handleClose}>✕</button>
        </div>

        <div className="step-indicator">
          <div className={`step-dot ${step >= 1 ? 'active' : ''} ${step > 1 ? 'complete' : ''}`}>1</div>
          <div className="step-line"></div>
          <div className={`step-dot ${step >= 2 ? 'active' : ''} ${step > 2 ? 'complete' : ''}`}>2</div>
          <div className="step-line"></div>
          <div className={`step-dot ${step >= 3 ? 'active' : ''} ${step > 3 ? 'complete' : ''}`}>✓</div>
        </div>

        {step === 1 && (
          <div className="payment-step active">
            <div className="slot-info-banner">{label}</div>
            <div className="input-group">
              <label className="input-label">VEHICLE REGISTRATION</label>
              <input
                id="resVehicle"
                type="text"
                className="login-input"
                placeholder="e.g. TS09AB1234"
                maxLength="12"
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value)}
              />
            </div>
            <div className="input-row">
              <div className="input-group">
                <label className="input-label">DURATION (HRS)</label>
                <input
                  type="number"
                  className="login-input"
                  value={duration}
                  onChange={(e) => setDuration(Math.max(1, parseInt(e.target.value) || 1))}
                  min="1"
                  max="24"
                />
              </div>
              <div className="input-group">
                <label className="input-label">DATE</label>
                <input
                  type="date"
                  className="login-input"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>
            <div className="price-summary">
              <div className="price-row"><span>Base rate:</span><span>₹{amount.rate}/hr × {duration}hr = ₹{amount.base.toFixed(2)}</span></div>
              <div className="price-row"><span>Tax (GST):</span><span>₹{amount.tax.toFixed(2)}</span></div>
              <div className="price-row price-total"><span>TOTAL:</span><span>₹{amount.total.toFixed(2)}</span></div>
            </div>
            <button className="btn btn-primary btn-full" onClick={handleGoToPayment}>NEXT → PAYMENT</button>
          </div>
        )}

        {step === 2 && (
          <div className="payment-step active">
            <div className="pay-amount-display">₹{amount.total.toFixed(2)}</div>
            <div className="pay-options">
              {['upi', 'card', 'netbanking', 'cash'].map(method => (
                <button
                  key={method}
                  className={`pay-option ${payMethod === method ? 'selected' : ''}`}
                  onClick={() => setPayMethod(method)}
                >
                  <span className="pay-icon">
                    {method === 'upi' && '📱'}
                    {method === 'card' && '💳'}
                    {method === 'netbanking' && '🏦'}
                    {method === 'cash' && '💵'}
                  </span>
                  <span>{method.toUpperCase()}</span>
                </button>
              ))}
            </div>
            <button
              id="payBtn"
              className="btn btn-primary btn-full"
              onClick={handleConfirmPayment}
              disabled={isProcessing}
            >
              {isProcessing ? '⏳ Processing…' : 'CONFIRM PAYMENT'}
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="payment-step active">
            <div className="success-anim">
              <div className="success-icon">✓</div>
              <div className="success-title">BOOKING CONFIRMED</div>
              <div className="success-sub">Your parking slot is secured. Have a safe flight!</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── ADMIN OCCUPY MODAL ──────────────────────────────────────
const AdminOccupyModal = ({ isOpen, onClose, slotKey, onSuccess }) => {
  const [vehicle, setVehicle] = useState('');
  const slot = slotKey ? DB.getSlot(slotKey) : null;
  const loc = slot ? DB.getLocation(slot.locId) : null;

  const handleConfirm = () => {
    if (!vehicle.trim()) { document.getElementById('occupyVehicle')?.focus(); return; }
    DB.updateSlot(slotKey, {
      status: 'occupied',
      vehicle: vehicle.trim().toUpperCase(),
      entryTime: nowTime(),
      reservedName: '', reservedUserId: '', reservationId: '',
    });
    onSuccess();
    onClose();
    setVehicle('');
  };

  if (!isOpen) return null;

  const label = slot ? `Slot ${slot.id} · Level ${slot.floor} · ${slot.vtype === '2w' ? '2-Wheeler' : '4-Wheeler'}` : '';

  return (
    <div className={`modal-overlay open`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">🔴 MARK SLOT OCCUPIED</span>
          <button className="modal-close" onClick={() => { onClose(); setVehicle(''); }}>✕</button>
        </div>
        <div className="slot-info-banner">{label}</div>
        <div className="input-group">
          <label className="input-label">VEHICLE REGISTRATION</label>
          <input
            id="occupyVehicle"
            type="text"
            className="login-input"
            placeholder="e.g. TS09AB1234"
            maxLength="12"
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
          />
        </div>
        <button className="btn btn-danger btn-full" onClick={handleConfirm}>CONFIRM OCCUPIED</button>
      </div>
    </div>
  );
};

// ── ADMIN RESERVE MODAL ─────────────────────────────────────
const AdminReserveModal = ({ isOpen, onClose, slotKey, onSuccess }) => {
  const [name, setName] = useState('');
  const [vehicle, setVehicle] = useState('');
  const slot = slotKey ? DB.getSlot(slotKey) : null;
  const loc = slot ? DB.getLocation(slot.locId) : null;

  const handleConfirm = () => {
    if (!name.trim()) { document.getElementById('adminResName')?.focus(); return; }
    if (!vehicle.trim()) { document.getElementById('adminResVehicle')?.focus(); return; }
    const resId = DB.generateResId();
    const fmt = nowTime();
    const amt = DB.calcAmount(slot.locId, slot.vtype, 2);

    DB.updateSlot(slotKey, {
      status: 'reserved', vehicle: vehicle.trim().toUpperCase(), entryTime: fmt,
      reservedName: name.trim(), reservedUserId: 'ADMIN_MANUAL', reservationId: resId,
    });

    DB.addReservation({
      id: resId, slotKey: slotKey,
      locId: slot.locId, floor: slot.floor, vtype: slot.vtype, slotId: slot.id,
      vehicle: vehicle.trim().toUpperCase(), userName: name.trim(), userId: 'ADMIN_MANUAL',
      entryTime: fmt, amount: amt.total, payMethod: 'admin',
      bookedAt: new Date().toISOString(),
    });

    onSuccess();
    onClose();
    setName('');
    setVehicle('');
  };

  if (!isOpen) return null;

  const label = slot ? `Slot ${slot.id} · Level ${slot.floor} · ${slot.vtype === '2w' ? '2-Wheeler' : '4-Wheeler'}` : '';

  return (
    <div className={`modal-overlay open`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">🟡 RESERVE SLOT</span>
          <button className="modal-close" onClick={() => { onClose(); setName(''); setVehicle(''); }}>✕</button>
        </div>
        <div className="slot-info-banner">{label}</div>
        <div className="input-group">
          <label className="input-label">PASSENGER NAME</label>
          <input
            id="adminResName"
            type="text"
            className="login-input"
            placeholder="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="input-group">
          <label className="input-label">VEHICLE REGISTRATION</label>
          <input
            id="adminResVehicle"
            type="text"
            className="login-input"
            placeholder="e.g. TS09AB1234"
            maxLength="12"
            value={vehicle}
            onChange={(e) => setVehicle(e.target.value)}
          />
        </div>
        <button className="btn btn-warning btn-full" onClick={handleConfirm}>CONFIRM RESERVATION</button>
      </div>
    </div>
  );
};

// ── MAIN APP COMPONENT ──────────────────────────────────────
const AppContent = () => {
  const { isLoggedIn, isAdmin, user } = useAuth();
  const { showToast } = useToast();
  const [currentPage, setCurrentPage] = useState('dashboard');

  // Modal states
  const [reserveModalOpen, setReserveModalOpen] = useState(false);
  const [occupyModalOpen, setOccupyModalOpen] = useState(false);
  const [adminReserveModalOpen, setAdminReserveModalOpen] = useState(false);
  const [activeSlotKey, setActiveSlotKey] = useState('');

  const handleNavigate = (pageId) => {
    if (!isLoggedIn()) return;
    const locId = user?.locationId;
    if (!isAdmin() && pageId.startsWith('admin-')) {
      showToast('🚫 Access denied.', 'error');
      return;
    }
    setCurrentPage(pageId);
  };

  const handleReserve = (key) => {
    setActiveSlotKey(key);
    setReserveModalOpen(true);
  };

  const handleOccupy = (key) => {
    setActiveSlotKey(key);
    setOccupyModalOpen(true);
  };

  const handleAdminReserve = (key) => {
    setActiveSlotKey(key);
    setAdminReserveModalOpen(true);
  };

  const handleFreeSlot = (key) => {
    const slot = DB.getSlot(key);
    if (slot?.reservationId) {
      DB.cancelReservation(slot.reservationId);
    } else {
      DB.updateSlot(key, {
        status: 'available', vehicle: '', entryTime: '',
        reservedName: '', reservedUserId: '', reservationId: '',
      });
    }
    showToast(`✅ Slot ${slot?.id} is now available`);
    forceRerender();
  };

  const forceRerender = () => {
    setCurrentPage(prev => prev);
  };

  if (!isLoggedIn()) return <LoginPage />;

  const admin = isAdmin();

  return (
    <div id="appShell" className="visible">
      <Sidebar currentPage={currentPage} onNavigate={handleNavigate} />

      <main id="mainContent">
        <header id="topBar">
          <div className="topbar-left">
            <div id="dashPageTitle" className="page-title">
              {currentPage === 'dashboard' && 'PARKING GRID'}
              {currentPage === 'trip-planner' && 'TRIP PLANNER'}
              {currentPage === 'my-reservations' && 'MY BOOKINGS'}
              {currentPage === 'admin-reservations' && 'ALL RESERVATIONS'}
              {currentPage === 'admin-analytics' && 'ANALYTICS'}
              {currentPage === 'admin-settings' && 'PRICING CONFIGURATION'}
            </div>
            <div id="dashPageSubtitle" className="page-subtitle">
              {currentPage === 'dashboard' && 'Real-time slot availability'}
              {currentPage === 'trip-planner' && 'Crowd prediction & parking forecast'}
              {currentPage === 'my-reservations' && 'Your active reservations'}
              {currentPage === 'admin-reservations' && 'Terminal booking records'}
              {currentPage === 'admin-analytics' && 'Revenue & traffic data for your terminal'}
              {currentPage === 'admin-settings' && 'Set parking rates for your terminal'}
            </div>
          </div>
          <div className="topbar-right">
            <Clock />
          </div>
        </header>

        {currentPage === 'dashboard' && (
          <section id="page-dashboard" className="page-section visible">
            <ParkingGrid
              isAdminMode={admin}
              onReserve={handleReserve}
              onOccupy={handleOccupy}
              onFree={handleFreeSlot}
              onAdminReserve={handleAdminReserve}
            />
          </section>
        )}

        {currentPage === 'trip-planner' && !admin && (
          <section id="page-trip-planner" className="page-section visible">
            <TripPlanner />
          </section>
        )}

        {currentPage === 'my-reservations' && !admin && (
          <section id="page-my-reservations" className="page-section visible">
            <MyReservations />
          </section>
        )}

        {currentPage === 'admin-reservations' && admin && (
          <section id="page-admin-reservations" className="page-section visible">
            <AdminReservations />
          </section>
        )}

        {currentPage === 'admin-analytics' && admin && (
          <section id="page-admin-analytics" className="page-section visible">
            <AdminAnalytics />
          </section>
        )}

        {currentPage === 'admin-settings' && admin && (
          <section id="page-admin-settings" className="page-section visible">
            <AdminPricing />
          </section>
        )}
      </main>

      {/* Modals */}
      <ReserveModal
        isOpen={reserveModalOpen}
        onClose={() => { setReserveModalOpen(false); setActiveSlotKey(''); forceRerender(); }}
        slotKey={activeSlotKey}
        onSuccess={() => { showToast('🎉 Booking confirmed!', 'success'); forceRerender(); }}
      />

      <AdminOccupyModal
        isOpen={occupyModalOpen}
        onClose={() => { setOccupyModalOpen(false); setActiveSlotKey(''); }}
        slotKey={activeSlotKey}
        onSuccess={() => { showToast('🔴 Slot marked occupied'); forceRerender(); }}
      />

      <AdminReserveModal
        isOpen={adminReserveModalOpen}
        onClose={() => { setAdminReserveModalOpen(false); setActiveSlotKey(''); }}
        slotKey={activeSlotKey}
        onSuccess={() => { showToast('🟡 Slot reserved'); forceRerender(); }}
      />
    </div>
  );
};

// ── TOAST DISPLAY ────────────────────────────────────────────
const ToastDisplay = () => {
  const { visible, message, type } = useToast();
  if (!visible) return null;
  return <div id="toast" className={`show ${type}`}>{message}</div>;
};

// ── ROOT APP ──────────────────────────────────────────────────
const App = () => {
  useEffect(() => {
    DB.init();
  }, []);

  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <DataContext.Provider value={{ DB }}>
            <AppContent />
            <ToastDisplay />
            <div id="pageTransition" style={{ transform: 'translateY(100%)' }}></div>
          </DataContext.Provider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
};

export default App;