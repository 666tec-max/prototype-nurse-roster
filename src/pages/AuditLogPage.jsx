import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabase } from '../lib/supabase';
import { ScrollText, Search, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';

export default function AuditLogPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState(new Set());

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const supabase = getSupabase(user.userId);
    const { data } = await supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setItems(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (id) => {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedIds(next);
  };

  const filtered = items.filter(i =>
    (i.action || '').toLowerCase().includes(search.toLowerCase()) ||
    JSON.stringify(i.details || {}).toLowerCase().includes(search.toLowerCase())
  );

  const formatTime = (ts) => {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };

  const getActionColor = (action) => {
    if (!action) return 'var(--text-secondary)';
    if (action.includes('DELETE')) return 'var(--accent-danger)';
    if (action.includes('CREATE')) return 'var(--accent-success)';
    if (action.includes('UPDATE')) return 'var(--accent-info)';
    if (action === 'LOGIN') return 'var(--accent-primary)';
    if (action === 'LOGOUT') return 'var(--text-tertiary)';
    return 'var(--accent-warning)';
  };

  return (
    <div>
      <div className="page-header">
        <h1>Audit Log</h1>
        <p>System activity history</p>
      </div>

      <div className="page-actions">
        <div className="search-bar" style={{ flex: 1 }}>
          <Search size={16} />
          <input className="form-input" placeholder="Search actions..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 38 }} />
        </div>
        <button className="btn btn-secondary" onClick={load}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="empty-state"><p>Loading...</p></div>
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <ScrollText size={48} />
          <h3>No audit entries</h3>
          <p>Actions will appear here as you use the system</p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}></th>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const isExpanded = expandedIds.has(item.id);
                return (
                  <tr key={item.id} onClick={() => toggleExpand(item.id)} style={{ cursor: 'pointer' }}>
                    <td>
                      {item.details && Object.keys(item.details).length > 0 ? (
                        isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
                      ) : null}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                      {formatTime(item.created_at)}
                    </td>
                    <td style={{ fontWeight: 500 }}>{item.user_id}</td>
                    <td>
                      <span className="badge" style={{
                        background: `${getActionColor(item.action)}20`,
                        color: getActionColor(item.action),
                      }}>
                        {item.action}
                      </span>
                    </td>
                    <td>
                      {item.details && Object.keys(item.details).length > 0 ? (
                        <div className={`audit-details ${isExpanded ? 'expanded' : ''}`}>
                          {JSON.stringify(item.details, null, isExpanded ? 2 : undefined)}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
