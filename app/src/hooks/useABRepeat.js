import { useState, useCallback } from 'react';

/**
 * Hook for managing A-B repeat loop functionality.
 * @returns {object} A-B repeat state and controls
 */
export function useABRepeat() {
  const [pointA, setPointA] = useState(null);
  const [pointB, setPointB] = useState(null);

  const setA = useCallback((time) => {
    setPointA(time);
    // If B is set and A would be after B, clear B
    setPointB((prev) => (prev !== null && time >= prev ? null : prev));
  }, []);

  const setB = useCallback(
    (time) => {
      if (pointA === null) return; // Must set A first
      if (time <= pointA) return; // B must be after A
      setPointB(time);
    },
    [pointA]
  );

  const clear = useCallback(() => {
    setPointA(null);
    setPointB(null);
  }, []);

  const isActive = pointA !== null && pointB !== null;

  return {
    pointA,
    pointB,
    isActive,
    setA,
    setB,
    clear,
  };
}
