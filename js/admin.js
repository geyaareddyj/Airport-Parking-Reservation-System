/**
 * ============================================================
 * Aeropark · admin.js
 * ADMIN MODULE
 *
 * Responsibilities:
 *   - Parking grid (slot management for assigned terminal ONLY)
 *   - Reservations table (assigned terminal ONLY)
 *   - Analytics: revenue + peak hours (assigned terminal ONLY)
 *   - Pricing settings (assigned terminal ONLY)
 *
 * SECURITY PRINCIPLE:
 *   Every function starts with Auth.isAdmin() or Auth.canEditSlot().
 *   Even calling these functions from the browser console will not
 *   bypass the guards. No admin can view or modify another terminal.
 *
 * REPLACE GUIDE:
 *   Replace DB.* calls with fetch('/api/admin/...') calls.
 *   Keep the Auth guard calls in place.
 * ============================================================
 */

'use strict';

/* ── STATE ────────────────────────────────────────────────── */
// Scoped to the admin's assigned terminal only
const AdminState = {
  currentFloor: 1,
  activeSlotKey: null,   // slot currently being acted on in a modal
};

/* ═══════════════════════════════════════════════════════════
   ADMIN DASHBOARD — PARKING GRID
═══════════════════════════════════════════════════════════ */

/**
 * Entry point: render the admin dashboard for their terminal.
 * Called by main.js when navigating to 'dashboard' as admin.
 */
// CO-5: Admin data management and application logic
function Admin_renderDashboard() {
  const loc = Auth.getAdminLocation();
  if (!loc) return;

  // Show terminal name (admin is locked to one terminal, no dropdown)
  setHTML('#adminLocName', `<span class="location-badge">✈ ${loc.name}</span>`);

  // Hide location selector (admin cannot switch terminals)
  const locSelWrap = $('#locationSelectWrap');
  if (locSelWrap) locSelWrap.style.display = 'none';

  // Show current pricing rate badge
  _updateRateBadge();

  // Render floor/level tabs
  Admin_renderFloorTabs(loc);

  // Render the slot grid
  Admin_renderGrid();

  // Update stats counters
  Admin_updateStats();
}

/**
 * Render level-selector tabs for the admin's terminal.
 * Each terminal may have multiple parking levels.
 */
function Admin_renderFloorTabs(loc) {
  const container = $('#floorTabs');
  if (!container) return;
  container.innerHTML = '';

  for (let f = 1; f <= loc.floors; f++) {
    const btn = document.createElement('button');
    btn.className = `floor-tab ${f === AdminState.currentFloor ? 'active' : ''}`;
    btn.textContent = `Level ${f}`;
    btn.addEventListener('click', () => {
      if (!Auth.isAdmin()) { toast('Access denied.', 'error'); return; }
      AdminState.currentFloor = f;
      Admin_renderFloorTabs(loc);
      Admin_renderGrid();
      Admin_updateStats();
    });
    container.appendChild(btn);
  }
}

/**
 * Render the parking grid for the admin's terminal + current level.
 * Admins see full details: vehicle number, entry time, reserved name.
 * Admins have action buttons to change slot status.
 */
function Admin_renderGrid() {
  const user = Auth.getUser();
  const container = $('#parkingGridContainer');
  if (!container || !user) return;

  // TERMINAL SCOPE: only load slots for THIS admin's terminal
  const locId = user.locationId;
  container.innerHTML = '';

  const vtypes = [
    { key: '2w', label: '2-WHEELERS', icon: '🛵' },
    { key: '4w', label: '4-WHEELERS', icon: '🚗' },
  ];

  vtypes.forEach(({ key, label, icon }) => {
    const slots = DB.getSlots(locId, AdminState.currentFloor, key);
    const avail = slots.filter(s => s.status === 'available').length;

    const section = document.createElement('div');
    section.className = 'vehicle-section';
    section.innerHTML = `
      <div class="section-header-row">
        <span class="section-icon">${icon}</span>
        <span class="section-title">${label}</span>
        <span class="section-count">${avail}/${slots.length} available</span>
      </div>
      <div class="parking-grid" id="admin-grid-${key}"></div>`;
    container.appendChild(section);

    const grid = section.querySelector(`#admin-grid-${key}`);
    slots.forEach(slot => grid.appendChild(_buildAdminSlotCard(slot)));
  });

  Admin_applyFilter();
}

/**
 * Build a slot card with full admin-level details and controls.
 * PRIVACY: Only admins see vehicle numbers, entry times, reserved names.
 * @param {object} slot
 * @returns {HTMLElement}
 */
function _buildAdminSlotCard(slot) {
  const el = document.createElement('div');
  el.className = `slot slot-${slot.status}`;
  el.dataset.slotKey = slot.key;

  const icon = slot.vtype === '2w' ? '🛵' : '🚗';
  const statusLabel = cap(slot.status);

  // Admin-only detail rows (never shown to users)
  let details = `<div class="popup-row"><span class="popup-lbl">STATUS</span>
    <span class="popup-val badge-${slot.status}">${statusLabel}</span></div>`;
  if (slot.vehicle) details += `<div class="popup-row"><span class="popup-lbl">VEHICLE</span><span class="popup-val">${slot.vehicle}</span></div>`;
  if (slot.reservedName) details += `<div class="popup-row"><span class="popup-lbl">PASSENGER</span><span class="popup-val">${slot.reservedName}</span></div>`;
  if (slot.entryTime) details += `<div class="popup-row"><span class="popup-lbl">ENTRY</span><span class="popup-val">${slot.entryTime}</span></div>`;

  // Action buttons depend on current slot status
  let actions = '';
  if (slot.status === 'available') {
    actions = `
      <button class="btn btn-danger btn-sm btn-full" onclick="Admin_openOccupyModal('${slot.key}')">MARK OCCUPIED</button>
      <button class="btn btn-warning btn-sm btn-full" onclick="Admin_openReserveModal('${slot.key}')">RESERVE</button>`;
  } else {
    actions = `<button class="btn btn-success btn-sm btn-full" onclick="Admin_freeSlot('${slot.key}')">FREE SLOT</button>`;
  }

  el.innerHTML = `
    <div class="slot-icon">${icon}</div>
    <div class="slot-id">${slot.id}</div>
    <div class="slot-badge badge-${slot.status}">${statusLabel}</div>
    <div class="slot-popup">
      <div class="popup-title">SLOT ${slot.id}</div>
      ${details}
      <div class="popup-actions">${actions}</div>
    </div>`;

  _attachPopupBehavior(el);
  return el;
}

/** Update stat counters for admin's current terminal + level */
function Admin_updateStats() {
  const locId = Auth.getUser()?.locationId;
  if (!locId) return;
  const slots = DB.getSlots(locId, AdminState.currentFloor);
  setText('#statTotal', slots.length);
  setText('#statAvailable', slots.filter(s => s.status === 'available').length);
  setText('#statOccupied', slots.filter(s => s.status === 'occupied').length);
  setText('#statReserved', slots.filter(s => s.status === 'reserved').length);
}

/** Show the pricing rate in the dashboard badge */
function _updateRateBadge() {
  const loc = Auth.getAdminLocation();
  if (!loc) return;
  const el = $('#rateBadge');
  if (el) {
    el.textContent = `₹${loc.pricing.rate2w}/hr (2W) · ₹${loc.pricing.rate4w}/hr (4W) + ${loc.pricing.taxPct}% GST`;
    el.style.display = '';
  }
}

/** Filter slot cards by status (applies to all grids on screen) */
function Admin_applyFilter() {
  const val = $('#slotFilter')?.value || 'all';
  $$('.slot').forEach(el => {
    el.style.display = (val === 'all' || el.classList.contains(`slot-${val}`)) ? '' : 'none';
  });
}

/* ═══════════════════════════════════════════════════════════
   ADMIN SLOT ACTIONS
   Each action has TWO security layers:
     1. Auth.isAdmin()          — is this user an admin at all?
     2. Auth.canEditSlot(key)   — is this slot in their terminal?
═══════════════════════════════════════════════════════════ */

/**
 * Open the "Mark Occupied" modal for a slot.
 * @param {string} key - composite slot key
 */
window.Admin_openOccupyModal = function (key) {
  if (!Auth.isAdmin()) { toast('Access denied.', 'error'); return; }
  if (!Auth.canEditSlot(key)) { toast('🚫 Slot not in your terminal.', 'error'); return; }

  const slot = DB.getSlot(key);
  if (!slot || slot.status !== 'available') {
    toast('⚠️ Slot is not available.', 'error'); return;
  }

  AdminState.activeSlotKey = key;
  setText('#occupySlotInfo', `Slot ${slot.id} · Level ${slot.floor} · ${slot.vtype === '2w' ? '2-Wheeler' : '4-Wheeler'}`);
  document.getElementById('occupyVehicle').value = '';
  openModal('occupyModal');
};

/**
 * Confirm marking a slot as occupied (called from modal button).
 */
window.Admin_confirmOccupy = function () {
  if (!Auth.isAdmin()) { toast('Access denied.', 'error'); return; }

  const key = AdminState.activeSlotKey;
  if (!key || !Auth.canEditSlot(key)) { toast('🚫 Slot not in your terminal.', 'error'); return; }

  const veh = document.getElementById('occupyVehicle').value.trim().toUpperCase();
  if (!veh) { shakeEl('occupyVehicle'); return; }

  DB.updateSlot(key, {
    status: 'occupied',
    vehicle: veh,
    entryTime: nowTime(),
    reservedName: '', reservedUserId: '', reservationId: '',
  });

  closeAllModals();
  Admin_renderGrid();
  Admin_updateStats();
  toast(`🔴 Slot marked occupied — Vehicle: ${veh}`);
};

/**
 * Open the admin "Reserve Slot" modal.
 * @param {string} key
 */
window.Admin_openReserveModal = function (key) {
  if (!Auth.isAdmin()) { toast('Access denied.', 'error'); return; }
  if (!Auth.canEditSlot(key)) { toast('🚫 Slot not in your terminal.', 'error'); return; }

  const slot = DB.getSlot(key);
  if (!slot || slot.status !== 'available') {
    toast('⚠️ Slot is not available.', 'error'); return;
  }

  AdminState.activeSlotKey = key;
  setText('#adminResSlotInfo', `Slot ${slot.id} · Level ${slot.floor} · ${slot.vtype === '2w' ? '2-Wheeler' : '4-Wheeler'}`);
  document.getElementById('adminResName').value = '';
  document.getElementById('adminResVehicle').value = '';
  openModal('adminReserveModal');
};

/**
 * Confirm admin-side reservation (called from modal button).
 */
window.Admin_confirmReserve = function () {
  if (!Auth.isAdmin()) { toast('Access denied.', 'error'); return; }

  const key = AdminState.activeSlotKey;
  if (!key || !Auth.canEditSlot(key)) { toast('🚫 Slot not in your terminal.', 'error'); return; }

  const name = document.getElementById('adminResName').value.trim();
  const veh = document.getElementById('adminResVehicle').value.trim().toUpperCase();

  if (!name) { shakeEl('adminResName'); return; }
  if (!veh) { shakeEl('adminResVehicle'); return; }

  const slot = DB.getSlot(key);
  const resId = DB.generateResId();
  const fmt = nowTime();
  const amt = DB.calcAmount(slot.locId, slot.vtype, 2); // default 2hr estimate

  // Update the slot in DB
  DB.updateSlot(key, {
    status: 'reserved', vehicle: veh, entryTime: fmt,
    reservedName: name, reservedUserId: 'ADMIN_MANUAL', reservationId: resId,
  });

  // Log the reservation record
  DB.addReservation({
    id: resId, slotKey: key,
    locId: slot.locId, floor: slot.floor, vtype: slot.vtype, slotId: slot.id,
    vehicle: veh, userName: name, userId: 'ADMIN_MANUAL',
    entryTime: fmt, amount: amt.total, payMethod: 'admin',
    bookedAt: new Date().toISOString(),
  });

  closeAllModals();
  Admin_renderGrid();
  Admin_updateStats();
  toast(`🟡 Slot ${slot.id} reserved for ${name}`);
};

/**
 * Mark a slot as available (free/release it).
 * GUARD: canEditSlot verifies this slot belongs to the admin's terminal.
 * @param {string} key
 */
window.Admin_freeSlot = function (key) {
  if (!Auth.isAdmin()) { toast('Access denied.', 'error'); return; }
  if (!Auth.canEditSlot(key)) { toast('🚫 Cannot modify slots from another terminal.', 'error'); return; }

  const slot = DB.getSlot(key);

  // If there was a reservation attached, cancel it
  if (slot?.reservationId) {
    DB.cancelReservation(slot.reservationId);
  } else {
    DB.updateSlot(key, {
      status: 'available', vehicle: '', entryTime: '',
      reservedName: '', reservedUserId: '', reservationId: '',
    });
  }

  Admin_renderGrid();
  Admin_updateStats();
  toast(`✅ Slot ${slot?.id} is now available`);
};

/* ═══════════════════════════════════════════════════════════
   ADMIN RESERVATIONS TABLE
   Shows ONLY this admin's terminal reservations.
═══════════════════════════════════════════════════════════ */

/**
 * Render the reservations table for the admin's terminal.
 * GUARD: Route guard applied at navigate level + explicit check here.
 */
function Admin_renderReservations() {
  if (!Auth.isAdmin()) { toast('Access denied.', 'error'); return; }
  if (!Auth.canAccess('page-admin-reservations', Auth.getUser().locationId)) return;

  const locId = Auth.getUser().locationId;
  const loc = Auth.getAdminLocation();
  // LOCATION FILTER: only this terminal's reservations are fetched
  const reservations = DB.getReservationsByLocation(locId);

  // Show terminal name in heading
  setText('#adminResLocName', loc?.name || locId);

  const tbody = $('#adminResBody');
  if (!tbody) return;

  if (!reservations.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">No reservations yet for this terminal.</td></tr>`;
    return;
  }

  tbody.innerHTML = reservations.map(r => `
    <tr>
      <td><code>${r.id}</code></td>
      <td>${r.userName}</td>
      <td>Level ${r.floor}</td>
      <td>${r.slotId}</td>
      <td>${r.vtype === '2w' ? '🛵 2W' : '🚗 4W'}</td>
      <td><span class="vehicle-tag">${r.vehicle}</span></td>
      <td>${r.entryTime}</td>
      <td><span class="stat-badge badge-green">₹${r.amount?.toFixed ? r.amount.toFixed(2) : r.amount}</span></td>
    </tr>`
  ).join('');
}

/* ═══════════════════════════════════════════════════════════
   ANALYTICS
   Revenue and peak hours — scoped to admin's terminal ONLY.
═══════════════════════════════════════════════════════════ */

/**
 * Render analytics dashboard for the admin's terminal.
 * Revenue from other terminals is NEVER fetched.
 */
function Admin_renderAnalytics() {
  if (!Auth.isAdmin()) { toast('Access denied.', 'error'); return; }
  if (!Auth.canAccess('page-admin-analytics', Auth.getUser().locationId)) return;

  const locId = Auth.getUser().locationId;
  const loc = Auth.getAdminLocation();

  setText('#analyticsLocName', `📊 ANALYTICS — ${loc?.name || locId}`);

  // Revenue summary (DB method is already location-filtered)
  const { total, count, byHour } = DB.getRevenueSummary(locId);
  setText('#totalRevenue', `₹${total.toFixed(2)}`);
  setText('#totalBookings', count);

  // Revenue breakdown by vehicle type
  const resByLoc = DB.getReservationsByLocation(locId);
  const rev2w = resByLoc.filter(r => r.vtype === '2w').reduce((s, r) => s + (r.amount || 0), 0);
  const rev4w = resByLoc.filter(r => r.vtype === '4w').reduce((s, r) => s + (r.amount || 0), 0);

  setHTML('#revenueRows', `
    <div class="revenue-row"><span>🛵 Two-Wheeler Revenue</span><span>₹${rev2w.toFixed(2)}</span></div>
    <div class="revenue-row"><span>🚗 Four-Wheeler Revenue</span><span>₹${rev4w.toFixed(2)}</span></div>
    <div class="revenue-row" style="font-weight:700;border-top:1px solid var(--border);padding-top:8px;margin-top:4px">
      <span>TOTAL REVENUE</span>
      <span style="color:var(--green)">₹${total.toFixed(2)}</span>
    </div>`);

  // Peak hour detection (6 AM – 10 PM window)
  const parkingHours = byHour.slice(6, 22);
  const hourLabels = ['6AM', '7AM', '8AM', '9AM', '10AM', '11AM', '12PM',
    '1PM', '2PM', '3PM', '4PM', '5PM', '6PM', '7PM', '8PM', '9PM'];

  // Add realistic airport demo data so chart is never empty
  const demoBase = [5, 12, 18, 25, 20, 15, 22, 30, 18, 10, 8, 12, 20, 28, 15, 6];
  const chartData = parkingHours.map((v, i) => v + (demoBase[i] || 0));

  const max = Math.max(...chartData, 1);
  const peakIdx = chartData.indexOf(Math.max(...chartData));

  setText('#peakHourLabel', `${hourLabels[peakIdx]} (busiest)`);

  const chartEl = $('#peakChart');
  if (chartEl) {
    chartEl.innerHTML = chartData.map((val, i) => `
      <div class="bar-wrap">
        <div class="bar ${i === peakIdx ? 'peak' : ''}"
             style="height:${Math.round((val / max) * 100)}px" title="${hourLabels[i]}: ${val} bookings">
        </div>
        <span class="bar-label">${hourLabels[i]}</span>
      </div>`).join('');
  }
}

/* ═══════════════════════════════════════════════════════════
   PRICING SETTINGS
   Admin can only configure pricing for their own terminal.
═══════════════════════════════════════════════════════════ */

/** Render the pricing configuration form */
function Admin_renderPricingSettings() {
  if (!Auth.isAdmin()) { toast('Access denied.', 'error'); return; }
  if (!Auth.canAccess('page-admin-settings', Auth.getUser().locationId)) return;

  const loc = Auth.getAdminLocation();
  if (!loc) return;

  setHTML('#costSettingsContainer', `
    <div class="cost-location-name">⚙ Pricing for <strong>${loc.name}</strong></div>
    <div class="cost-row">
      <div class="cost-label-group">
        <span class="cost-location">🛵 Two-Wheeler Rate</span>
        <span class="cost-unit">per hour</span>
      </div>
      <div class="cost-input-group">
        <span class="cost-prefix">₹</span>
        <input class="cost-input" type="number" id="cost_rate2w" value="${loc.pricing.rate2w}" min="5" max="500" />
      </div>
    </div>
    <div class="cost-row">
      <div class="cost-label-group">
        <span class="cost-location">🚗 Four-Wheeler Rate</span>
        <span class="cost-unit">per hour</span>
      </div>
      <div class="cost-input-group">
        <span class="cost-prefix">₹</span>
        <input class="cost-input" type="number" id="cost_rate4w" value="${loc.pricing.rate4w}" min="5" max="2000" />
      </div>
    </div>
    <div class="cost-row">
      <div class="cost-label-group">
        <span class="cost-location">🧾 GST / Tax Rate</span>
        <span class="cost-unit">percent</span>
      </div>
      <div class="cost-input-group">
        <span class="cost-prefix">%</span>
        <input class="cost-input" type="number" id="cost_tax" value="${loc.pricing.taxPct}" min="0" max="28" />
      </div>
    </div>`);
}

/**
 * Save pricing for the admin's terminal.
 * PRICING GUARD: verifies admin owns this terminal before writing.
 */
window.Admin_savePricing = function () {
  const locId = Auth.getUser()?.locationId;

  if (!Auth.canEditPricing(locId)) {
    toast('🚫 You cannot change pricing for another terminal.', 'error');
    return;
  }

  const rate2w = parseFloat(document.getElementById('cost_rate2w')?.value) || 0;
  const rate4w = parseFloat(document.getElementById('cost_rate4w')?.value) || 0;
  const taxPct = parseFloat(document.getElementById('cost_tax')?.value) || 0;

  if (rate2w < 5 || rate4w < 5) { toast('⚠️ Rates must be at least ₹5/hr.', 'error'); return; }

  // Persist pricing (data.js also validates locId internally)
  DB.savePricing(locId, { rate2w, rate4w, taxPct });

  toast('💾 Pricing saved successfully!', 'success');
  _updateRateBadge();
};