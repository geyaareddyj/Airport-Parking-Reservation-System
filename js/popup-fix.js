/**
 * popup-fix.js
 * Replaces CSS :hover popup with JS-driven show/hide
 * so popups never clip at viewport edges.
 *
 * _attachPopupBehavior(slotEl) is called by user.js and admin.js
 * on every slot card after it's built.
 */

const PAD = 10; // min px clearance from viewport edge

function _attachPopupBehavior(slot) {
  const popup = slot.querySelector('.slot-popup');
  if (!popup) return;

  slot.addEventListener('mouseenter', () => {
    _positionPopup(slot, popup);
    popup.style.opacity = '1';
    popup.style.pointerEvents = 'all';
  });

  slot.addEventListener('mouseleave', (e) => {
    // Don't hide if moving into the popup itself
    if (popup.contains(e.relatedTarget)) return;
    _hidePopup(popup);
  });

  popup.addEventListener('mouseleave', (e) => {
    // Don't hide if moving back into the slot
    if (slot.contains(e.relatedTarget)) return;
    _hidePopup(popup);
  });
}

function _hidePopup(popup) {
  popup.style.opacity = '0';
  popup.style.pointerEvents = 'none';
}

function _positionPopup(slot, popup) {
  // Make visible but off-screen to measure real dimensions
  popup.style.opacity = '0';
  popup.style.pointerEvents = 'none';
  popup.style.display = 'block';
  popup.style.top = '-9999px';
  popup.style.left = '-9999px';
  popup.style.transform = 'none';
  popup.style.bottom = 'auto';
  popup.style.right = 'auto';

  const slotR = slot.getBoundingClientRect();
  const popW = popup.offsetWidth;
  const popH = popup.offsetHeight;
  const vw = document.documentElement.clientWidth;

  // ── Vertical ──────────────────────────────────────────────
  // Default: above. Flip below if not enough room.
  if (slotR.top - popH - 10 < PAD) {
    popup.style.top = 'calc(100% + 10px)';
    popup.style.bottom = 'auto';
  } else {
    popup.style.bottom = 'calc(100% + 10px)';
    popup.style.top = 'auto';
  }

  // ── Horizontal ────────────────────────────────────────────
  const centeredLeft = slotR.left + slotR.width / 2 - popW / 2;

  if (centeredLeft < PAD) {
    // Near left edge — align popup's left to slot's left
    popup.style.left = '0';
    popup.style.right = 'auto';
    popup.style.transform = 'none';
  } else if (centeredLeft + popW > vw - PAD) {
    // Near right edge — align popup's right to slot's right
    popup.style.left = 'auto';
    popup.style.right = '0';
    popup.style.transform = 'none';
  } else {
    // Fits centered
    popup.style.left = '50%';
    popup.style.right = 'auto';
    popup.style.transform = 'translateX(-50%)';
  }
}

// Fix login page toggle button (calls toggleTheme() not UI_Theme.toggle)
window.toggleTheme = function () {
  if (typeof UI_Theme !== 'undefined') UI_Theme.toggle();
};