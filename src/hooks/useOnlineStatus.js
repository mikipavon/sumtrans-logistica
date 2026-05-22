/**
 * useOnlineStatus.js
 * React hook that tracks the browser's online/offline connectivity state.
 * Listens to window 'online' and 'offline' events for real-time updates.
 */
import { useState, useEffect } from 'react';

/**
 * @returns {{ isOnline: boolean, justReconnected: boolean }}
 * - isOnline: current connectivity state
 * - justReconnected: true for ~3 seconds after coming back online (used to show sync banner)
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setJustReconnected(true);
      // Reset the "just reconnected" flag after 4 seconds
      setTimeout(() => setJustReconnected(false), 4000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setJustReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, justReconnected };
}
