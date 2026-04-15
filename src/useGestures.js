import { useEffect, useRef, useState } from 'react';

/**
 * Touch/pointer gesture hook for task rows.
 *
 *   tap        → onTap
 *   swipe left → onSwipeLeft (past SWIPE_THRESHOLD, then release)
 *   long press → onLongPress (hold LONG_PRESS_MS without moving)
 *
 * Returns handlers to spread on the draggable element and the current
 * translateX offset (in px) so the caller can animate the card.
 */
const SWIPE_THRESHOLD = 80;
const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 8;

export function useGestures({ onTap, onSwipeLeft, onLongPress }) {
  const [dx, setDx] = useState(0);
  const state = useRef({
    active: false,
    startX: 0,
    startY: 0,
    moved: false,
    longPressFired: false,
    longPressTimer: null,
    pointerId: null,
  });

  function clearLongPress() {
    if (state.current.longPressTimer) {
      clearTimeout(state.current.longPressTimer);
      state.current.longPressTimer = null;
    }
  }

  function reset() {
    state.current.active = false;
    state.current.moved = false;
    state.current.longPressFired = false;
    clearLongPress();
    setDx(0);
  }

  useEffect(() => () => clearLongPress(), []);

  function onPointerDown(e) {
    // Only primary button on mouse
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    state.current.active = true;
    state.current.startX = e.clientX;
    state.current.startY = e.clientY;
    state.current.moved = false;
    state.current.longPressFired = false;
    state.current.pointerId = e.pointerId;
    clearLongPress();
    state.current.longPressTimer = setTimeout(() => {
      if (state.current.active && !state.current.moved) {
        state.current.longPressFired = true;
        onLongPress?.();
      }
    }, LONG_PRESS_MS);
  }

  function onPointerMove(e) {
    if (!state.current.active) return;
    const dX = e.clientX - state.current.startX;
    const dY = e.clientY - state.current.startY;
    if (!state.current.moved && Math.abs(dX) + Math.abs(dY) > MOVE_TOLERANCE) {
      state.current.moved = true;
      clearLongPress();
    }
    // If vertical scroll is dominant, let the page scroll — don't capture.
    if (state.current.moved && Math.abs(dY) > Math.abs(dX) * 1.4) {
      reset();
      return;
    }
    // Only track leftward drag for snooze
    if (state.current.moved && dX < 0) {
      // dampen beyond threshold so it has a rubber feel
      const bounded = dX > -SWIPE_THRESHOLD * 2 ? dX : -SWIPE_THRESHOLD * 2;
      setDx(bounded);
    } else if (state.current.moved) {
      setDx(0);
    }
  }

  function onPointerUp(e) {
    if (!state.current.active) return;
    const dX = e.clientX - state.current.startX;
    const didLongPress = state.current.longPressFired;
    const didSwipe = dX <= -SWIPE_THRESHOLD;
    const didMove = state.current.moved;
    reset();
    if (didLongPress) return;
    if (didSwipe) {
      onSwipeLeft?.();
      return;
    }
    if (!didMove) {
      onTap?.();
    }
  }

  function onPointerCancel() {
    reset();
  }

  return {
    dx,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    },
  };
}
