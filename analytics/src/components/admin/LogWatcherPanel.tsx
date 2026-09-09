import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Clock, TrendingUp } from 'lucide-react';
import { supabaseAuth as supabase } from '@/lib/supabaseAuth';

interface Incident {
  id: string;
  status: string;
  severity: string;
  service: string;
  title: string;
  event_count: number;
  first_seen: string;
  last_seen: string;
  investigation_status: string;
  diagnosis: string | null;
  confidence: number | null;
}

export function LogWatcherPanel() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'critical'>('open');
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [details, setDetails] = useState<any>(null);

  const fetchIncidents = useCallback(async () => {
    try {
      setLoading(true);

      // Use RPC function instead of direct table access
      // The ops schema is not directly accessible to authenticated users
      const filterStatus = filter === 'open' ? 'OPEN' : filter === 'critical' ? 'CRITICAL' : null;

      const { data, error } = await supabase.rpc('get_incidents_summary', {
        p_limit: 50,
        p_status: filterStatus,
      });

      if (error) {
        console.error('Failed to fetch incidents:', error);
        return;
      }

      setIncidents((data || []) as Incident[]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchIncidents();
    const interval = setInterval(() => fetchIncidents(), 10000);
    return () => clearInterval(interval);
  }, [fetchIncidents]);

  async function fetchIncidentDetails(incidentId: string) {
    try {
      const { data, error } = await supabase
        .rpc('get_incident_details', { p_incident_id: incidentId });

      if (error) {
        console.error('Failed to fetch incident details:', error);
        return;
      }

      setDetails(data);
    } catch (err) {
      console.error('Error fetching details:', err);
    }
  }

  async function updateIncidentStatus(incidentId: string, newStatus: string) {
    try {
      // Use RPC to update incident status
      const { error } = await supabase.rpc('update_incident_status', {
        p_incident_id: incidentId,
        p_new_status: newStatus,
      });

      if (error) {
        console.error('Failed to update incident:', error);
        return;
      }

      await fetchIncidents();
    } catch (err) {
      console.error('Error updating incident:', err);
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'HIGH':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'MEDIUM':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-300';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'RESOLVED':
        return <CheckCircle className="w-4 h-4" />;
      case 'INVESTIGATING':
        return <TrendingUp className="w-4 h-4" />;
      case 'OPEN':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Log Watcher</h2>
        <div className="flex gap-2">
          {(['all', 'open', 'critical'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded text-sm font-medium ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading && !incidents.length ? (
        <div className="text-center py-12 text-gray-500">Loading incidents...</div>
      ) : incidents.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No incidents detected</div>
      ) : (
        <div className="grid gap-4">
          {incidents.map((incident) => (
            <div
              key={incident.id}
              className="border rounded-lg p-4 hover:shadow-md cursor-pointer transition"
              onClick={() => {
                setSelectedIncident(incident);
                fetchIncidentDetails(incident.id);
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {getStatusIcon(incident.status)}
                    <h3 className="font-semibold text-lg">{incident.title}</h3>
                    <span className={`px-2 py-1 rounded text-xs font-medium border ${getSeverityColor(incident.severity)}`}>
                      {incident.severity}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{incident.service}</p>
                  <div className="text-xs text-gray-500 space-y-1">
                    <p>Events: {incident.event_count} | First: {formatTime(incident.first_seen)} | Last: {formatTime(incident.last_seen)}</p>
                    {incident.investigation_status === 'COMPLETE' && incident.diagnosis && (
                      <p className="text-blue-600 font-medium">
                        Diagnosis (confidence: {((incident.confidence || 0) * 100).toFixed(0)}%): {incident.diagnosis.substring(0, 100)}...
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  {incident.status !== 'RESOLVED' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateIncidentStatus(incident.id, 'RESOLVED');
                      }}
                      className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs hover:bg-green-200"
                    >
                      Resolve
                    </button>
                  )}
                  {incident.status === 'OPEN' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateIncidentStatus(incident.id, 'IGNORED');
                      }}
                      className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs hover:bg-gray-200"
                    >
                      Ignore
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedIncident && details && (
        <div className="border-t pt-6 mt-6">
          <h3 className="text-xl font-bold mb-4">Incident Details</h3>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold mb-2">Events</h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {details.events?.map((event: any, i: number) => (
                  <div key={i} className="text-xs bg-gray-50 p-2 rounded">
                    <p className="font-mono text-gray-700">[{new Date(event.captured_at).toLocaleTimeString()}] {event.level}</p>
                    <p className="text-gray-600">{event.message}</p>
                    {event.route && <p className="text-gray-500">{event.method} {event.route} → {event.status_code}</p>}
                  </div>
                ))}
              </div>
            </div>
            {details.investigation && (
              <div>
                <h4 className="font-semibold mb-2">AI Investigation</h4>
                <div className="space-y-2 text-sm">
                  <div>
                    <strong>Root Cause:</strong>
                    <p className="text-gray-700">{details.investigation.likely_root_cause}</p>
                  </div>
                  <div>
                    <strong>Confidence:</strong>
                    <p className="text-gray-700">{((details.investigation.confidence || 0) * 100).toFixed(0)}%</p>
                  </div>
                  {details.investigation.evidence && (
                    <div>
                      <strong>Evidence:</strong>
                      <ul className="list-disc list-inside text-gray-700">
                        {details.investigation.evidence.map((e: string, i: number) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {details.investigation.recommended_actions && (
                    <div>
                      <strong>Recommended Actions:</strong>
                      <ul className="list-disc list-inside text-gray-700">
                        {details.investigation.recommended_actions.map((a: string, i: number) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
