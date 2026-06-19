/**
 * ============================================================
 * Aeropark · ui.js
 * SHARED UI UTILITIES
 *
 * Responsibilities:
 *   - Dark/light theme toggle (CSS variables, persisted)
 *   - Toast notifications (status messages)
 *   - Modal open/close helpers
 *   - Page transition animation
 *   - Sidebar navigation with route guards and active state
 *   - Live clock widget
 *   - Utility DOM helpers ($, $$, setText, setHTML, shakeEl)
 *
 * NOTHING in this file reads or writes business data.
 * It only touches the DOM and localStorage for theme preference.
 * ============================================================
 */

'use strict';

/* ── DOM HELPERS ──────────────────────────────────────────── */

// CO-4: DOM helper functions for element selection
/** Shorthand for document.querySelector */
const $ = sel => document.querySelector(sel);

/** Shorthand for document.querySelectorAll */
const $$ = sel => document.querySelectorAll(sel);

/** Set textContent safely, accepts selector string or element */
const setText = (sel, val) => {
  const el = typeof sel === 'string' ? $(sel) : sel;
  if (el) el.textContent = val;
};

/** Set innerHTML safely, accepts selector string or element */
const setHTML = (sel, html) => {
  const el = typeof sel === 'string' ? $(sel) : sel;
  if (el) el.innerHTML = html;
};

/**
 * Shake an element to signal a validation error.
 * @param {string|HTMLElement} target - element ID or element
 */
function shakeEl(target) {
  const el = typeof target === 'string' ? document.getElementById(target) : target;
  if (!el) return;
  el.style.borderColor = 'var(--red)';
  el.style.animation = 'none';
  el.offsetHeight; // force reflow so animation restarts
  el.style.animation = 'shake 0.35s ease';
  setTimeout(() => { el.style.borderColor = ''; el.style.animation = ''; }, 600);
}

/* ── THEME ────────────────────────────────────────────────── */
// CO-4: Browser storage for persisting user theme preference
const UI_Theme = {
  current: localStorage.getItem('ap_theme') || 'dark',

  init() {
    UI_Theme.apply(UI_Theme.current);
  },

  toggle() {
    UI_Theme.current = UI_Theme.current === 'dark' ? 'light' : 'dark';
    UI_Theme.apply(UI_Theme.current);
    localStorage.setItem('ap_theme', UI_Theme.current);
  },

  apply(theme) {
    document.documentElement.dataset.theme = theme;
    $$('.theme-toggle-btn').forEach(btn => {
      btn.textContent = theme === 'dark' ? '☀️' : '🌙';
      btn.title = theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    });
  },
};

/* ── TOAST NOTIFICATIONS ──────────────────────────────────── */
let _toastTimer = null;

/**
 * Show a brief toast notification.
 * @param {string} msg   - message text
 * @param {'default'|'success'|'error'|'warning'} type
 */
function toast(msg, type = 'default') {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.className = '';
  if (type !== 'default') el.classList.add(type);
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

/* ── MODALS ───────────────────────────────────────────────── */

function openModal(id) { $(`#${id}`)?.classList.add('open'); }
function closeModal(id) { $(`#${id}`)?.classList.remove('open'); }

function closeAllModals() {
  $$('.modal-overlay').forEach(m => m.classList.remove('open'));
}

/* ── PAGE TRANSITION ──────────────────────────────────────── */
/**
 * Animate a wipe transition. Calls cb() at the midpoint
 * while the screen is covered so the switch is seamless.
 * @param {Function} cb
 */
function pageTransition(cb) {
  const ov = $('#pageTransition');
  if (!ov) { cb(); return; }
  ov.style.transform = 'translateY(0)';
  setTimeout(() => {
    cb();
    ov.classList.add('slide-up');
    ov.addEventListener('animationend', () => {
      ov.style.transform = 'translateY(100%)';
      ov.classList.remove('slide-up');
    }, { once: true });
  }, 280);
}

/* ── LIVE CLOCK ───────────────────────────────────────────── */
/**
 * Update the clock widget in the top bar every second.
 * Shows current local time in HH:MM:SS format.
 */
function _startClock() {
  const el = $('#clockWidget');
  if (!el) return;
  const tick = () => {
    const d = new Date();
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    el.textContent = `${h}:${m}:${s}`;
  };
  tick();
  setInterval(tick, 1000);
}

/* ── SIDEBAR NAVIGATION ───────────────────────────────────── */
// CO-4: Dynamic DOM updates for navigation state management
const UI_Nav = {

  /**
   * Navigate to a page section.
   * Route guard is checked BEFORE showing anything.
   * @param {string} pageId - matches data-page attribute on nav items
   * @param {string} [locId] - current terminal for admin scope check
   */
  navigate(pageId, locId) {
    // ── ROUTE GUARD ───────────────────────────────────────
    // This is checked even if called programmatically from the console.
    if (!Auth.canAccess(`page-${pageId}`, locId)) {
      toast('🚫 Access denied.', 'error');
      console.warn(`[Nav] Denied: page "${pageId}" for role "${Auth.getUser()?.role}"`);
      return;
    }

    // Hide all page sections
    $$('.page-section').forEach(p => {
      p.classList.add('hidden');
      p.classList.remove('visible');
    });

    // Show the target section
    const section = $(`#page-${pageId}`);
    if (section) {
      section.classList.remove('hidden');
      section.classList.add('visible');
    }

    // Update sidebar active state
    $$('.nav-item').forEach(n => n.classList.remove('active'));
    $(`[data-page="${pageId}"]`)?.classList.add('active');

    // Update the top-bar title
    _updateTopbarTitle(pageId);

    // Persist current page for refresh recovery
    sessionStorage.setItem('ap_current_page', pageId);

    // Fire render event (handled by main.js _onNavigate)
    document.dispatchEvent(new CustomEvent('ps:navigate', { detail: { pageId, locId } }));
  },

  /**
   * Bind click handlers to sidebar nav items.
   * Called once after login.
   */
  bindSidebar() {
    $$('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const pageId = item.dataset.page;
        if (pageId) UI_Nav.navigate(pageId);
      });
    });
  },

  /**
   * Show or hide nav items based on the logged-in role.
   * @param {'user'|'admin'} role
   */
  applyRoleVisibility(role) {
    $$('[data-admin-only]').forEach(el => el.classList.toggle('hidden', role !== 'admin'));
    $$('[data-user-only]').forEach(el => el.classList.toggle('hidden', role !== 'user'));
  },
};

/**
 * Update the top bar page title & subtitle based on active page.
 * Called whenever navigation changes.
 * @param {string} pageId
 */
function _updateTopbarTitle(pageId) {
  const titles = {
    'dashboard': { title: 'PARKING GRID', sub: 'Real-time slot availability' },
    'trip-planner': { title: 'TRIP PLANNER', sub: 'Crowd prediction & parking forecast' },
    'my-reservations': { title: 'MY BOOKINGS', sub: 'Your active reservations' },
    'admin-reservations': { title: 'ALL RESERVATIONS', sub: 'Terminal booking records' },
    'admin-analytics': { title: 'ANALYTICS', sub: 'Revenue & traffic data for your terminal' },
    'admin-settings': { title: 'PRICING CONFIGURATION', sub: 'Set parking rates for your terminal' },
  };
  const info = titles[pageId] || { title: 'AEROPARK', sub: '' };
  setText('#dashPageTitle', info.title);
  setText('#dashPageSubtitle', info.sub);
}

/* ── TIME UTILITIES ───────────────────────────────────────── */

/** Current time as "H:MM AM/PM" */
function nowTime() {
  const d = new Date(), h = d.getHours(), m = d.getMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Convert "HH:MM" input string to "H:MM AM/PM" */
function fmtTime(t) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Today's date as YYYY-MM-DD */
function todayISO() {
  return new Date().toISOString().split('T')[0];
}

/** Capitalize first letter */
const cap = str => str.charAt(0).toUpperCase() + str.slice(1);

/* ── EXPOSE GLOBALS ───────────────────────────────────────── */
// Inline onclick="" handlers in HTML reach these
window.closeModal = closeModal;
window.closeAllModals = closeAllModals;
window._startClock = _startClock;