import { useEffect, useRef, useCallback } from 'react';

const EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
const THROTTLE_MS = 1000; // only reset timer once per second max

export default function useIdleTimer({ onWarn, onLogout, warnAfterMs, logoutAfterMs }) {
  const warnTimer   = useRef(null);
  const logoutTimer = useRef(null);
  const lastReset   = useRef(0);

  const reset = useCallback(() => {
    const now = Date.now();
    if (now - lastReset.current < THROTTLE_MS) return;
    lastReset.current = now;

    clearTimeout(warnTimer.current);
    clearTimeout(logoutTimer.current);

    warnTimer.current   = setTimeout(onWarn,   warnAfterMs);
    logoutTimer.current = setTimeout(onLogout, logoutAfterMs);
  }, [onWarn, onLogout, warnAfterMs, logoutAfterMs]);

  useEffect(() => {
    reset(); // start timers
    EVENTS.forEach(e => window.addEventListener(e, reset, { passive: true }));
    return () => {
      clearTimeout(warnTimer.current);
      clearTimeout(logoutTimer.current);
      EVENTS.forEach(e => window.removeEventListener(e, reset));
    };
  }, [reset]);
}
