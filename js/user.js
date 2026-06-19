/**
 * ============================================================
 * Aeropark · user.js
 * USER (PASSENGER) MODULE
 *
 * Responsibilities:
 *   - Parking grid: read-only availability view (no private data)
 *   - Reservation flow: 3 steps (Details → Payment → Confirmation)
 *   - My Bookings: shows only this user's own reservations
 *   - Trip Planner: real-time crowd prediction on input change
 *
 * PRIVACY PRINCIPLE:
 *   Users NEVER see: vehicle numbers of other passengers, entry times,
 *   reserved-person names, revenue figures, or pricing controls.
 *   Every slot card built here uses _buildUserSlotCard() which
 *   deliberately omits all private fields.
 *
 * REPLACE GUIDE:
 *   Replace DB.* calls with fetch('/api/user/...') calls.
 * ============================================================
 */

'use strict';

/* ── STATE ────────────────────────────────────────────────── */
// Passenger session state — resets on page navigation
const UserState = {
  currentLocId: null,  // selected terminal
  currentFloor: 1,     // selected parking level
  activeSlotKey: null,  // slot being reserved
  payMethod: null,  // chosen payment method
  payStep: 1,     // 1=details, 2=payment, 3=success
  _pendingTotal: 0,
  _pendingBase: 0,
  _pendingVehicle: '',
};

/* ═══════════════════════════════════════════════════════════
   USER DASHBOARD — PARKING GRID
═══════════════════════════════════════════════════════════ */

/**
 * Entry point: set up the user dashboard.
 * Called by main.js when navigating to 'dashboard' as a user.
 */
// CO-5: Dynamic user interface updates based on user actions
function User_renderDashboard() {
  if (!Auth.isUser()) { toast('Access denied.', 'error'); return; }

  // Populate terminal dropdown from all locations
  const locs = DB.getLocations();
  const sel = $('#locationSelect');
  if (sel) {
    sel.innerHTML = locs.map(l =>
      `<option value="${l.id}" ${l.id === UserState.currentLocId ? 'selected' : ''}>${l.name}</option>`
    ).join('');
    // Default to first terminal
    if (!UserState.currentLocId) UserState.currentLocId = locs[0]?.id;
    sel.value = UserState.currentLocId;
  }

  // Hide rate badge (users don't see pricing info on this page)
  const rateBadge = $('#rateBadge');
  if (rateBadge) rateBadge.style.display = 'none';

  // Ensure location selector is visible for users
  const locSelWrap = $('#locationSelectWrap');
  if (locSelWrap) locSelWrap.style.display = '';

  User_renderFloorTabs();
  User_renderGrid();
  User_updateStats();
}

/**
 * Render level-selector tabs for the selected terminal.
 */
function User_renderFloorTabs() {
  const loc = DB.getLocation(UserState.currentLocId);
  const container = $('#floorTabs');
  if (!container || !loc) return;
  container.innerHTML = '';

  for (let f = 1; f <= loc.floors; f++) {
    const btn = document.createElement('button');
    btn.className = `floor-tab ${f === UserState.currentFloor ? 'active' : ''}`;
    btn.textContent = `Level ${f}`;
    btn.addEventListener('click', () => {
      UserState.currentFloor = f;
      User_renderFloorTabs();
      User_renderGrid();
      User_updateStats();
    });
    container.appendChild(btn);
  }
}

/**
 * Render the parking grid for passengers.
 * PRIVACY: Only slot status is shown. No vehicle or personal data.
 */
function User_renderGrid() {
  if (!Auth.isUser()) return;
  const container = $('#parkingGridContainer');
  if (!container) return;

  container.innerHTML = '';

  const vtypes = [
    { key: '2w', label: '2-WHEELERS', icon: '🛵' },
    { key: '4w', label: '4-WHEELERS', icon: '🚗' },
  ];

  vtypes.forEach(({ key, label, icon }) => {
    const slots = DB.getSlots(UserState.currentLocId, UserState.currentFloor, key);
    const avail = slots.filter(s => s.status === 'available').length;

    const section = document.createElement('div');
    section.className = 'vehicle-section';
    section.innerHTML = `
      <div class="section-header-row">
        <span class="section-icon">${icon}</span>
        <span class="section-title">${label}</span>
        <span class="section-count">${avail}/${slots.length} available</span>
      </div>
      <div class="parking-grid" id="user-grid-${key}"></div>`;
    container.appendChild(section);

    const grid = section.querySelector(`#user-grid-${key}`);
    slots.forEach(slot => grid.appendChild(_buildUserSlotCard(slot)));
  });

  User_applyFilter();
}

/**
 * Build a slot card for passengers.
 * DELIBERATELY omits: vehicle registration, entry time, reserved name, revenue.
 * Users can only see: slot ID, availability status, and a Reserve button if free.
 * @param {object} slot
 * @returns {HTMLElement}
 */
function _buildUserSlotCard(slot) {
  const el = document.createElement('div');
  el.className = `slot slot-${slot.status}`;

  const icon = slot.vtype === '2w' ? '🛵' : '🚗';
  const statusLabel = cap(slot.status);

  // Popup — availability ONLY, NO private data ever shown here
  const popupDetails = `
    <div class="popup-row">
      <span class="popup-lbl">STATUS</span>
      <span class="popup-val badge-${slot.status}">${statusLabel}</span>
    </div>
    <div class="popup-row">
      <span class="popup-lbl">TYPE</span>
      <span class="popup-val">${slot.vtype === '2w' ? '2-Wheeler' : '4-Wheeler'}</span>
    </div>`;

  // Only available slots show a Reserve button
  const action = slot.status === 'available'
    ? `<button class="btn btn-primary btn-sm btn-full" onclick="User_openReserveModal('${slot.key}')">RESERVE</button>`
    : `<div class="slot-unavail-note">${slot.status === 'occupied' ? 'Currently occupied' : 'Already booked'}</div>`;

  el.innerHTML = `
    <div class="slot-icon">${icon}</div>
    <div class="slot-id">${slot.id}</div>
    <div class="slot-badge badge-${slot.status}">${statusLabel}</div>
    <div class="slot-popup">
      <div class="popup-title">SLOT ${slot.id}</div>
      ${popupDetails}
      <div class="popup-actions">${action}</div>
    </div>`;

  _attachPopupBehavior(el);
  return el;
}

/** Update stats strip for the user's selected terminal + level */
function User_updateStats() {
  const slots = DB.getSlots(UserState.currentLocId, UserState.currentFloor);
  setText('#statTotal', slots.length);
  setText('#statAvailable', slots.filter(s => s.status === 'available').length);
  setText('#statOccupied', slots.filter(s => s.status === 'occupied').length);
  setText('#statReserved', slots.filter(s => s.status === 'reserved').length);
}

/** Filter slot cards by status */
function User_applyFilter() {
  const val = $('#slotFilter')?.value || 'all';
  $$('.slot').forEach(el => {
    el.style.display = (val === 'all' || el.classList.contains(`slot-${val}`)) ? '' : 'none';
  });
}

/* ═══════════════════════════════════════════════════════════
   RESERVATION FLOW (3 steps)
   Step 1 → Details (vehicle reg, duration, date)
   Step 2 → Payment method selection
   Step 3 → Booking confirmation
═══════════════════════════════════════════════════════════ */

/**
 * Open the reservation modal for a slot.
 * GUARD: only passengers (not admins) can use this flow.
 * @param {string} key - composite slot key
 */
window.User_openReserveModal = function (key) {
  if (!Auth.isUser()) { toast('Access denied.', 'error'); return; }

  const slot = DB.getSlot(key);
  if (!slot || slot.status !== 'available') {
    toast('⚠️ This slot is no longer available.', 'error');
    User_renderGrid();
    return;
  }

  UserState.activeSlotKey = key;
  UserState.payMethod = null;

  const loc = DB.getLocation(slot.locId);
  const label = `Slot ${slot.id} · ${loc?.name} · Level ${slot.floor} · ${slot.vtype === '2w' ? '2-Wheeler' : '4-Wheeler'}`;
  setText('#resSlotInfo', label);

  document.getElementById('resVehicle').value = '';
  document.getElementById('resDuration').value = '2';  // default 2hr for airports
  document.getElementById('resDate').value = todayISO();

  // Real-time price update when duration changes
  document.getElementById('resDuration').oninput = _updatePaySummary;

  _updatePaySummary();
  _setPayStep(1);
  openModal('reserveModal');
};

/** Recalculate and display price summary in Step 1 */
function _updatePaySummary() {
  const slot = DB.getSlot(UserState.activeSlotKey);
  if (!slot) return;
  const hrs = parseFloat(document.getElementById('resDuration')?.value) || 1;
  const { rate, base, tax, total } = DB.calcAmount(slot.locId, slot.vtype, hrs);

  setText('#baseRate', `₹${rate}/hr × ${hrs}hr = ₹${base.toFixed(2)}`);
  setText('#taxAmt', `₹${tax.toFixed(2)}`);
  setText('#payTotal', `₹${total.toFixed(2)}`);

  UserState._pendingTotal = total;
  UserState._pendingBase = base;
}

/** Advance from Step 1 (details) to Step 2 (payment) */
window.User_goToPayment = function () {
  const veh = document.getElementById('resVehicle').value.trim().toUpperCase();
  if (!veh) { shakeEl('resVehicle'); return; }
  UserState._pendingVehicle = veh;

  // Show the total amount prominently on the payment step
  setText('#payAmountDisplay', `₹${UserState._pendingTotal.toFixed(2)}`);

  _setPayStep(2);
};

/** Select a payment method (called by onclick on pay-option buttons) */
window.User_selectPayMethod = function (method) {
  UserState.payMethod = method;
  $$('.pay-option').forEach(o => o.classList.remove('selected'));
  $(`[data-pay="${method}"]`)?.classList.add('selected');
};

/** Confirm payment and create the reservation */
window.User_confirmPayment = function () {
  if (!UserState.payMethod) { toast('⚠️ Please select a payment method.', 'error'); return; }

  const payBtn = $('#payBtn');
  payBtn.textContent = '⏳ Processing…';
  payBtn.disabled = true;

  // Simulate payment gateway delay
  setTimeout(() => {
    payBtn.textContent = 'CONFIRM PAYMENT';
    payBtn.disabled = false;
    _finalizeReservation();
  }, 1800);
};

/**
 * Write the reservation to DB and update the slot status.
 * Called after simulated payment succeeds.
 */
function _finalizeReservation() {
  const slot = DB.getSlot(UserState.activeSlotKey);
  if (!slot) { toast('Error: slot not found.', 'error'); return; }

  const user = Auth.getUser();
  const resId = DB.generateResId();
  const fmt = nowTime();

  // Mark the slot as reserved with the passenger's info
  DB.updateSlot(UserState.activeSlotKey, {
    status: 'reserved',
    vehicle: UserState._pendingVehicle,
    entryTime: fmt,
    reservedName: user.displayName,
    reservedUserId: user.id,
    reservationId: resId,
  });

  // Save the reservation record
  DB.addReservation({
    id: resId,
    slotKey: UserState.activeSlotKey,
    locId: slot.locId,
    floor: slot.floor,
    vtype: slot.vtype,
    slotId: slot.id,
    vehicle: UserState._pendingVehicle,
    userName: user.displayName,
    userId: user.id,
    entryTime: fmt,
    amount: UserState._pendingTotal,
    payMethod: UserState.payMethod,
    bookedAt: new Date().toISOString(),
  });

  _setPayStep(3);       // show success screen
  User_renderGrid();    // refresh grid to show updated slot
  User_updateStats();

  // Auto-close modal after 2 seconds
  setTimeout(() => {
    closeAllModals();
    toast(`🎉 Booking confirmed! ID: ${resId}`, 'success');
  }, 2000);
}

/**
 * Control which step panel is visible and update the step dots.
 * @param {number} step - 1, 2, or 3
 */
function _setPayStep(step) {
  UserState.payStep = step;
  $$('.payment-step').forEach((el, i) => el.classList.toggle('active', i + 1 === step));
  $$('.step-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i + 1 === step);
    dot.classList.toggle('complete', i + 1 < step);
  });
}

/* ═══════════════════════════════════════════════════════════
   MY BOOKINGS
   Shows ONLY the logged-in user's own reservations.
   Other passengers' data is NEVER fetched here.
═══════════════════════════════════════════════════════════ */

/** Render the current user's reservation list */
function User_renderMyReservations() {
  if (!Auth.isUser()) { toast('Access denied.', 'error'); return; }

  const userId = Auth.getUser().id;
  // USER FILTER: only fetch bookings belonging to this user
  const myRes = DB.getReservationsByUser(userId);
  const list = $('#myReservationsList');
  if (!list) return;

  if (!myRes.length) {
    list.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🅿</span>
        <p style="font-family:'Rajdhani',sans-serif;font-size:1rem;letter-spacing:0.1em;color:var(--text-secondary)">NO ACTIVE BOOKINGS</p>
        <p style="font-size:0.8rem;margin-top:6px;color:var(--text-dim)">Browse the Parking Grid to reserve a slot.</p>
      </div>`;
    return;
  }

  list.innerHTML = myRes.map(r => {
    const loc = DB.getLocation(r.locId);
    const locName = loc?.name || r.locId;
    const vtypeIcon = r.vtype === '2w' ? '🛵' : '🚗';
    const vtypeLbl = r.vtype === '2w' ? '2-Wheeler' : '4-Wheeler';
    // NOTE: Amount is shown (it's the user's own payment info).
    // NOT shown: other passengers' vehicles, revenue data, pricing controls.
    return `
      <div class="reservation-card">
        <span class="res-icon">${vtypeIcon}</span>
        <div class="res-info">
          <div class="res-id">
            Slot ${r.slotId}
            <span class="res-badge">${r.id}</span>
          </div>
          <div class="res-meta">${locName} · Level ${r.floor} · ${vtypeLbl} · Entry: ${r.entryTime}</div>
          <div class="res-pay-method">Paid via ${_payLabel(r.payMethod)}</div>
        </div>
        <div class="res-right">
          <div class="res-price">₹${typeof r.amount === 'number' ? r.amount.toFixed(2) : r.amount}</div>
          <button class="btn btn-danger btn-sm" onclick="User_cancelReservation('${r.id}')">CANCEL</button>
        </div>
      </div>`;
  }).join('');
}

/**
 * Cancel the user's own reservation.
 * GUARD: verifies the reservation belongs to THIS user before cancelling.
 * @param {string} resId
 */
window.User_cancelReservation = function (resId) {
  if (!Auth.isUser()) { toast('Access denied.', 'error'); return; }

  const userId = Auth.getUser().id;
  const res = DB.getReservations().find(r => r.id === resId);

  // Double-check ownership — user cannot cancel someone else's booking
  if (!res || res.userId !== userId) {
    toast('🚫 You cannot cancel another passenger\'s reservation.', 'error');
    return;
  }

  DB.cancelReservation(resId);
  User_renderMyReservations();
  toast('🗑️ Booking cancelled successfully.');
};

/** Convert payment method code to readable label */
function _payLabel(method) {
  const map = {
    upi: '📱 UPI',
    card: '💳 Card',
    netbanking: '🏦 Net Banking',
    cash: '💵 Cash',
    admin: '🛂 Admin',
  };
  return map[method] || method;
}

/* ═══════════════════════════════════════════════════════════
   TRIP PLANNER
   Real-time prediction that updates instantly on input change.
   No API call needed — purely client-side logic.
═══════════════════════════════════════════════════════════ */

/**
 * Prediction data keyed by time-of-day slot.
 * Each entry contains crowd level, parking status, availability %, and tip.
 */
const TRIP_DATA = {
  EarlyMorning: {
    crowd: 'Very Low', parking: 'Excellent', walkTime: '~2 min', tip: 'Best time to arrive — airport is nearly empty.', pct: 92, crowdClass: 'crowd-low'
  },
  Morning: {
    crowd: 'Low', parking: 'Good', walkTime: '~4 min', tip: 'Great time! Check-in queues are short.', pct: 78, crowdClass: 'crowd-low'
  },
  Afternoon: {
    crowd: 'Medium', parking: 'Limited', walkTime: '~8 min', tip: 'Moderate traffic. Arrive 15 min early.', pct: 48, crowdClass: 'crowd-medium'
  },
  Evening: {
    crowd: 'High', parking: 'Very Limited', walkTime: '~14 min', tip: 'Peak hours — book in advance!', pct: 20, crowdClass: 'crowd-high'
  },
  Night: {
    crowd: 'Medium', parking: 'Moderate', walkTime: '~6 min', tip: 'Good slot availability. Plan for late check-in.', pct: 60, crowdClass: 'crowd-medium'
  },
  LateNight: {
    crowd: 'Low', parking: 'Good', walkTime: '~3 min', tip: 'Light traffic. Drive safely at night.', pct: 75, crowdClass: 'crowd-low'
  },
};

/**
 * Update the trip prediction panel instantly when inputs change.
 * Also called when navigating to the trip-planner page.
 */
function User_updateTripResult() {
  const timeEl = $('#tripTimeSelect');
  const resultEl = $('#tripResultCard');
  if (!timeEl || !resultEl) return;

  const time = timeEl.value;
  const data = TRIP_DATA[time];
  if (!data) return;

  setText('#tripCrowd', data.crowd);
  setText('#tripParking', data.parking);
  setText('#tripWalkTime', data.walkTime);
  setText('#tripTip', `💡 ${data.tip}`);

  // Apply crowd color class
  const crowdEl = $('#tripCrowd');
  if (crowdEl) crowdEl.className = `trip-metric-value ${data.crowdClass}`;

  // Update availability bar
  const fillEl = $('#tripBarFill');
  const pctEl = $('#tripBarPct');
  if (fillEl) fillEl.style.width = `${data.pct}%`;
  if (pctEl) pctEl.textContent = `${data.pct}% slots expected available`;

  resultEl.classList.add('visible');
}

/**
 * Populate trip planner location select and bind real-time listeners.
 * Called once by main.js on DOMContentLoaded.
 */
function User_initTripPlanner() {
  const timeEl = $('#tripTimeSelect');
  const locEl = $('#tripLocationSelect');

  // Populate terminal options in trip planner
  if (locEl) {
    const locs = DB.getLocations();
    locEl.innerHTML = locs.map(l =>
      `<option value="${l.id}">${l.name}</option>`
    ).join('');
  }

  // Real-time prediction — no button click required
  timeEl?.addEventListener('change', User_updateTripResult);
  locEl?.addEventListener('change', User_updateTripResult);

  // Update on first render
  User_updateTripResult();
}

/* ── LOCATION CHANGE HANDLER (user dashboard) ───────────── */

/**
 * Called when user selects a different terminal from the dropdown.
 * @param {string} locId
 */
function User_onLocationChange(locId) {
  UserState.currentLocId = locId;
  UserState.currentFloor = 1;
  User_renderFloorTabs();
  User_renderGrid();
  User_updateStats();
}