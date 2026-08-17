import { useState, useCallback, useRef } from 'react';

export function useToast() {
  const [toast, setToast] = useState(null);
  const timerRef = useRef(null);

  const showToast = useCallback((message) => {
    clearTimeout(timerRef.current);
    setToast({ message, fading: false });
    timerRef.current = setTimeout(() => {
      setToast((prev) => (prev ? { ...prev, fading: true } : null));
      timerRef.current = setTimeout(() => setToast(null), 300);
    }, 2000);
  }, []);

  return { toast, showToast };
}
