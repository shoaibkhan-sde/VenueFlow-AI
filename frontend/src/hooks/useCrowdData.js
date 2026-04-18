import { useState, useEffect } from 'react';
import { socket } from '../socket';
import { useAuth } from '../context/AuthContext';

/**
 * Custom hook: listens for 'gates_update' socket events for live gate statuses
 * Returns { gates, recommendations, loading, error }
 */
export function useCrowdData() {
  const { token } = useAuth();
  const [gates, setGates] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) return; // wait for auth
    const headers = { 'Authorization': `Bearer ${token}` };

    // Initial fetch to populate immediately
    Promise.all([
      fetch('/api/gates', { headers }),
      fetch('/api/gates/optimal?top_k=10', { headers })
    ])
      .then(async ([gatesRes, optimalRes]) => {
        const gatesJson = await gatesRes.json();
        const optimalJson = await optimalRes.json();
        setGates(gatesJson.gates || []);
        setRecommendations(optimalJson.recommendations || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message);
        setLoading(false);
      });

    // Listen for real-time pushed updates
    const handleUpdate = (newData) => {
      setGates(newData.gates || []);
      setRecommendations(newData.optimal || []);
      setLoading(false);
      setError(null);
    };

    socket.on('gates_update', handleUpdate);

    return () => {
      socket.off('gates_update', handleUpdate);
    };
  }, [token]);

  return { gates, recommendations, loading, error };
}
