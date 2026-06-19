/**
 * ============================================================
 * AeroPark - js/main.js
 * Application Entry Point & Main Controller
 * 
 * Handles:
 *   - App initialization
 *   - Login / Logout
 *   - Navigation between pages
 *   - Role-based rendering (User vs Admin)
 * ============================================================
 */

'use strict';

document.addEventListener('DOMContentLoaded', () => {

  // 1. Initialize Database (seed data)
  DB.init();

  // 2. Initialize Theme
  UI_Theme.init();

  // 3. Restore previous session (if user was logged in)
  const wasLoggedIn = Auth.init();
  if (wasLoggedIn) {
    _showApp();
    const savedPage = sessionStorage.getItem('ap_current_page') || 'dashboard';
    UI_Nav.navigate(savedPage);
  }

  // ── BIND LOGIN FORM ───────────────────────────────────────
  const loginBtn = $('#loginBtn');
  const usernameInput = $('#loginUsername');
  const passwordInput = $('#loginPassword');

  loginBtn?.addEventListener('click', _handleLogin);
  usernameInput?.addEventListener('keydown', e => { if (e.key === 'Enter') _handleLogin(); });
  passwordInput?.addEventListener('keydown', e => { if (e.key === 'Enter') _handleLogin(); });

  // Role tab switching
  $$('.role-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.role-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _updateDemoHint(tab.dataset.role);
    });
  });

  // Theme toggle buttons
  $$('.theme-toggle-btn').forEach(btn => {
    btn.addEventListener('click', UI_Theme.toggle);
  });

  // Logout button
  $('#logoutBtn')?.addEventListener('click', _handleLogout);

  // Modal overlay click to close
  $$('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeAllModals();
    });
  });

  // Navigation event listener
  document.addEventListener('ps:navigate', e => {
    _onNavigate(e.detail.pageId);
  });

  // Location select for users
  $('#locationSelect')?.addEventListener('change', e => {
    if (Auth.isUser()) {
      User_onLocationChange(e.target.value);
    }
  });

  // Slot filter
  $('#slotFilter')?.addEventListener('change', () => {
    if (Auth.isAdmin()) Admin_applyFilter();
    else if (Auth.isUser()) User_applyFilter();
  });

  // Initialize Trip Planner
  User_initTripPlanner();

  // Save Pricing button
  $('#saveCostsBtn')?.addEventListener('click', Admin_savePricing);

  // Default demo hint
  _updateDemoHint('user');
});

/* =============================================
   LOGIN HANDLER
============================================= */
function _handleLogin() {
  const username = $('#loginUsername').value.trim();
  const password = $('#loginPassword').value.trim();
  const role = _getSelectedRole();
  const errEl = $('#loginError');

  errEl.textContent = '';

  const result = Auth.login(username, password, role);
  if (!result.ok) {
    errEl.textContent = result.error;
    shakeEl('loginCard');
    return;
  }

  // Successful login → transition to app
  pageTransition(() => {
    $('#loginPage').classList.add('hidden');
    _showApp();
    UI_Nav.navigate('dashboard');
  });
}

/* =============================================
   LOGOUT HANDLER
============================================= */
function _handleLogout() {
  pageTransition(() => {
    Auth.logout();
    sessionStorage.removeItem('ap_current_page');

    $('#appShell').classList.add('hidden');
    $('#loginPage').classList.remove('hidden');

    // Clear form
    $('#loginUsername').value = '';
    $('#loginPassword').value = '';
    $('#loginError').textContent = '';

    // Reset role tab to user
    $$('.role-tab').forEach(t => t.classList.remove('active'));
    $$('.role-tab')[0]?.classList.add('active');
    _updateDemoHint('user');
  });
}

/* =============================================
   SHOW APP AFTER LOGIN
============================================= */
function _showApp() {
  $('#loginPage').classList.add('hidden');
  $('#appShell').classList.remove('hidden');

  const user = Auth.getUser();
  const isAdmin = Auth.isAdmin();

  // Update user pill in navbar
  $('#navUserPill').innerHTML = `
    <span class="dot ${isAdmin ? 'dot-admin' : 'dot-user'}"></span>
    ${user.displayName} 
    ${isAdmin ? `<span class="pill-loc">(${Auth.getAdminLocation()?.name || ''})</span>` : '• Passenger'}
  `;

  // Show/hide sidebar sections based on role
  UI_Nav.applyRoleVisibility(user.role);

  // Bind sidebar navigation
  UI_Nav.bindSidebar();
}

/* =============================================
   NAVIGATION DISPATCHER
============================================= */
function _onNavigate(pageId) {
  const isAdmin = Auth.isAdmin();

  switch (pageId) {
    case 'dashboard':
      if (isAdmin) Admin_renderDashboard();
      else User_renderDashboard();
      break;

    case 'trip-planner':
      if (!isAdmin) User_updateTripResult();
      break;

    case 'my-reservations':
      if (!isAdmin) User_renderMyReservations();
      break;

    case 'admin-reservations':
      if (isAdmin) Admin_renderReservations();
      break;

    case 'admin-analytics':
      if (isAdmin) Admin_renderAnalytics();
      break;

    case 'admin-settings':
      if (isAdmin) Admin_renderPricingSettings();
      break;

    default:
      console.warn(`Unknown page: ${pageId}`);
  }
}

/* =============================================
   HELPER FUNCTIONS
============================================= */

function _getSelectedRole() {
  return $('.role-tab.active')?.dataset.role || 'user';
}

function _updateDemoHint(role) {
  const hint = $('#loginDemoHint');
  if (!hint) return;

  if (role === 'admin') {
    hint.innerHTML = `
      <strong>Staff Login:</strong><br>
      <code>admin_t1</code> / <code>t1123</code> (Terminal 1)<br>
      <code>admin_t2</code> / <code>t2123</code> (Terminal 2)<br>
      <code>admin_t3</code> / <code>t3123</code> (Terminal 3)
    `;
  } else {
    hint.innerHTML = `
      <strong>Passenger Demo:</strong><br>
      <code>user1</code> / <code>user123</code><br>
      <code>user2</code> / <code>user456</code>
    `;
  }
}

/* Page Transition Animation */
function pageTransition(callback) {
  const overlay = $('#pageTransition');
  if (!overlay) {
    callback();
    return;
  }
  overlay.style.transform = 'translateY(0)';
  setTimeout(() => {
    callback();
    overlay.classList.add('slide-up');
    setTimeout(() => {
      overlay.style.transform = 'translateY(100%)';
      overlay.classList.remove('slide-up');
    }, 600);
  }, 300);
}

// Expose necessary functions globally for inline onclick handlers
window.User_openReserveModal = User_openReserveModal;
window.User_goToPayment = User_goToPayment;
window.User_selectPayMethod = User_selectPayMethod;
window.User_confirmPayment = User_confirmPayment;
window.User_cancelReservation = User_cancelReservation;

window.Admin_openOccupyModal = Admin_openOccupyModal;
window.Admin_confirmOccupy = Admin_confirmOccupy;
window.Admin_openReserveModal = Admin_openReserveModal;
window.Admin_confirmReserve = Admin_confirmReserve;
window.Admin_freeSlot = Admin_freeSlot;
window.Admin_savePricing = Admin_savePricing;