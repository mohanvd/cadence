import { useState, useRef, useCallback, useEffect } from 'react';

const OPTIONS = [
  { label: '15 min', ms: 15 * 60 * 1000 },
  { label: '30 min', ms: 30 * 60 * 1000 },
  { label: '45 min', ms: 45 * 60 * 1000 },
  { label: '60 min', ms: 60 * 60 * 1000 },
  { label: '90 min', ms: 90 * 60 * 1000 },
];

export function useSleepTimer(onExpire) {
  const [remainingMs, setRemainingMs] = useState(null);
  const endTimeRef = useRef(null);
  const intervalRef = useRef(null);

  const clear = useCallback(() => {
    clearInterval(intervalRef.current);
    endTimeRef.current = null;
    setRemainingMs(null);
  }, []);

  const start = useCallback(
    (ms) => {
      clear();
      endTimeRef.current = Date.now() + ms;
      setRemainingMs(ms);
      intervalRef.current = setInterval(() => {
        const left = endTimeRef.current - Date.now();
        if (left <= 0) {
          clear();
          onExpire?.();
        } else {
          setRemainingMs(left);
        }
      }, 1000);
    },
    [clear, onExpire]
  );

  useEffect(() => () => clearInterval(intervalRef.current), []);

  const formatRemaining = useCallback(() => {
    if (remainingMs === null) return null;
    const totalSec = Math.ceil(remainingMs / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, [remainingMs]);

  return {
    options: OPTIONS,
    remainingMs,
    isActive: remainingMs !== null,
    isUrgent: remainingMs !== null && remainingMs <= 60000,
    display: formatRemaining(),
    start,
    clear,
  };
}
