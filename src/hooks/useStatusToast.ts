import { useCallback, useEffect, useRef, useState } from 'react';

export function useStatusToast() {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const showStatus = useCallback((msgText: string, durationMs = 2600) => {
    setStatusMessage(msgText);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (durationMs > 0) {
      timerRef.current = window.setTimeout(() => {
        setStatusMessage(null);
        timerRef.current = null;
      }, durationMs);
    }
  }, []);

  return { statusMessage, showStatus };
}
