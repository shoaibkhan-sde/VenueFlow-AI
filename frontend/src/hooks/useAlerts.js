/**
 * useAlerts — subscribes to the `alert_event` WebSocket event.
 * Maintains a rolling buffer of the last 30 venue alerts.
 */
import { useState, useEffect } from 'react';
import { socket } from '../socket';
import { useAuth } from '../context/AuthContext';

export function useAlerts(maxAlerts = 30) {
  const { token } = useAuth();
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    if (!token) return;

    // Load historical alerts on mount
    fetch('/api/alerts', { headers: { 'Authorization': `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setAlerts(d.alerts || []))
      .catch(() => { });

    // Live events
    const onAlert = (alert) => {
      setAlerts((prev) => {
        // Prevent duplicates by ID
        const filtered = prev.filter(a => a.id !== alert.id);
        return [alert, ...filtered].slice(0, maxAlerts);
      });
    };

    socket.on('alert_event', onAlert);
    return () => socket.off('alert_event', onAlert);
  }, [token, maxAlerts]);

  return alerts;
}
