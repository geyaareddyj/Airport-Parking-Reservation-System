/**
 * ============================================================
 * Aeropark · auth.js
 * AUTHENTICATION & ROUTE GUARDS
 *
 * Responsibilities:
 *   - Login / logout flow
 *   - Session persistence via localStorage
 *   - Route guard: blocks page access that doesn't match
 *     the logged-in user's role AND terminal scope
 *   - Slot/pricing guards: admin scoped to their terminal only
 *
 * REPLACE GUIDE:
 *   Replace DB.authenticate() with fetch('/api/login')
 *   Replace session storage with server-side sessions or JWT
 * ============================================================
 */

'use strict';

/* ── ROUTE PERMISSION MAP ─────────────────────────────────────
   Defines which roles can access which page IDs.
   'admin' pages also require a terminal-scope check.
───────────────────────────────────────────────────────────── */
const ROUTE_PERMISSIONS = {
  // Shared (role-filtered content)
  'page-dashboard': ['user', 'admin'],
  // User-only pages
  'page-trip-planner': ['user'],
  'page-my-reservations': ['user'],
  // Admin-only pages (also require terminal scope check)
  'page-admin-reservations': ['admin'],
  'page-admin-analytics': ['admin'],
  'page-admin-settings': ['admin'],
};

const Auth = {

  /* Current session reference (populated after login) */
  currentUser: null,

  /* ──────────────────────────────────────────────────────────
     INIT — restore session on page load
  ────────────────────────────────────────────────────────── */
  init() {
    const saved = DB.getSession();
    if (saved) {
      Auth.currentUser = saved;
      return true;   // user was logged in
    }
    return false;
  },

  /* ──────────────────────────────────────────────────────────
     LOGIN
     1. Validate credentials against DB
     2. Build safe session object (no password)
     3. Persist session to localStorage
  ────────────────────────────────────────────────────────── */
  // CO-3: Conditional logic for login authentication
  /**
   * @param {string} username
   * @param {string} password
   * @param {'user'|'admin'} role
   * @returns {{ ok: boolean, error?: string }}
   */
  login(username, password, role) {
    if (!username || !password) {
      return { ok: false, error: 'Please enter both username and access code.' };
    }

    // Validate against stored credentials
    const account = DB.authenticate(username, password, role);
    if (!account) {
      return { ok: false, error: '❌ Invalid credentials. Check your user ID and access code.' };
    }

    // Build session (never store the password)
    Auth.currentUser = {
      id: account.id,
      username: account.username,
      displayName: account.displayName,
      role: account.role,
      locationId: account.locationId || null,  // null for regular passengers
    };
    DB.saveSession(Auth.currentUser);

    return { ok: true };
  },

  /* ──────────────────────────────────────────────────────────
     LOGOUT
  ────────────────────────────────────────────────────────── */
  logout() {
    Auth.currentUser = null;
    DB.clearSession();
  },

  /* ──────────────────────────────────────────────────────────
     ROUTE GUARD
     Called before rendering any page section.
     Returns true if access is allowed, false if blocked.

     LOGIC:
       1. Must be authenticated.
       2. Role must be in the page's allowed roles list.
       3. For admin pages: admin's locationId must match
          the currently viewed terminal (prevents cross-terminal access).
  ────────────────────────────────────────────────────────── */
  /**
   * @param {string} pageId  - e.g. 'page-admin-analytics'
   * @param {string} [locId] - terminal being viewed (for admin scope check)
   * @returns {boolean}
   */
  canAccess(pageId, locId = null) {
    const user = Auth.currentUser;

    // 1. Must be logged in
    if (!user) return false;

    // 2. Role permission check
    const allowed = ROUTE_PERMISSIONS[pageId];
    if (!allowed) return false;
    if (!allowed.includes(user.role)) return false;

    // 3. Terminal scope check for admin pages
    //    Admins can ONLY manage their own assigned terminal
    if (user.role === 'admin' && locId) {
      if (user.locationId !== locId) {
        console.warn(`[Auth] Admin ${user.id} tried to access terminal "${locId}" but is scoped to "${user.locationId}"`);
        return false;
      }
    }

    return true;
  },

  /* ──────────────────────────────────────────────────────────
     SLOT GUARD
     Before any admin slot mutation, verify:
       - User is admin
       - Slot belongs to admin's terminal
  ────────────────────────────────────────────────────────── */
  /**
   * @param {string} slotKey - composite key e.g. "terminal1_1_4w_A-01"
   * @returns {boolean}
   */
  canEditSlot(slotKey) {
    const user = Auth.currentUser;
    if (!user || user.role !== 'admin') return false;

    // Extract terminal ID from the slot key (format: "locId_floor_vtype_id")
    const locId = slotKey.split('_')[0];
    if (locId !== user.locationId) {
      console.warn(`[Auth] Blocked: Admin "${user.id}" tried to edit slot in terminal "${locId}"`);
      return false;
    }
    return true;
  },

  /* ──────────────────────────────────────────────────────────
     PRICING GUARD
     Only the admin assigned to a terminal can change its pricing.
  ────────────────────────────────────────────────────────── */
  /**
   * @param {string} locId
   * @returns {boolean}
   */
  canEditPricing(locId) {
    const user = Auth.currentUser;
    if (!user || user.role !== 'admin') return false;
    if (user.locationId !== locId) {
      console.warn(`[Auth] Blocked: Admin "${user.id}" tried to edit pricing for "${locId}"`);
      return false;
    }
    return true;
  },

  /* ── HELPERS ─────────────────────────────────────────────── */
  isLoggedIn() { return !!Auth.currentUser; },
  isAdmin() { return Auth.currentUser?.role === 'admin'; },
  isUser() { return Auth.currentUser?.role === 'user'; },
  getUser() { return Auth.currentUser; },

  /**
   * For admins: return the terminal object they're assigned to manage.
   * For passengers: returns null.
   */
  getAdminLocation() {
    if (!Auth.isAdmin()) return null;
    return DB.getLocation(Auth.currentUser.locationId);
  },
};