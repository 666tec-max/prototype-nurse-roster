import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabase, logAudit } from '../lib/supabase';
import { SlidersHorizontal, Save, Loader2, Info } from 'lucide-react';

const SOFT_CONSTRAINTS = [
  {
    key: 'weekend_fairness',
    name: 'Weekend Fairness',
    description: 'Balance weekend shifts evenly among all staff members',
    icon: '📅',
  },
  {
    key: 'night_fairness',
    name: 'Night Fairness',
    description: 'Balance night shifts evenly among all staff members',
    icon: '🌙',
  },
  {
    key: 'shift_type_variety',
    name: 'Shift Type Variety',
    description: 'Avoid repeatedly assigning the same shift type to the same staff member',
    icon: '🔄',
  },
  {
    key: 'total_shift_fairness',
    name: 'Total Shift Fairness',
    description: 'Distribute total number of shifts evenly across all staff',
    icon: '⚖️',
  },
  {
    key: 'shift_coverage_utilisation',
    name: 'Shift Coverage Utilisation',
    description: 'Encourage assigning nurses beyond minimum coverage for efficiency',
    icon: '📈',
  },
];

export default function SoftConstraintsPage() {
  const { user } = useAuth();
  const [priorities, setPriorities] = useState({});
  const [savedPriorities, setSavedPriorities] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    const supabase = getSupabase(user.userId);
    const { data } = await supabase.from('soft_constraints').select('*');

    const map = {};
    SOFT_CONSTRAINTS.forEach(sc => { map[sc.key] = 5; }); // defaults
    (data || []).forEach(row => { map[row.constraint_key] = row.priority; });
    setPriorities(map);
    setSavedPriorities(map);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleChange = (key, value) => {
    setPriorities(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const saveAll = async () => {
    setSaving(true);
    const supabase = getSupabase(user.userId);

    try {
      for (const sc of SOFT_CONSTRAINTS) {
        await supabase.from('soft_constraints').upsert({
          user_id: user.userId,
          constraint_key: sc.key,
          priority: priorities[sc.key] || 5,
        }, { onConflict: 'user_id,constraint_key' });
      }
      await logAudit(user.userId, 'UPDATE_SOFT_CONSTRAINTS', priorities);
      setSavedPriorities({...priorities});
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
      alert('Failed to save soft constraints.');
    } finally {
      setSaving(false);
    }
  };

  const getPriorityLabel = (val) => {
    if (val <= 2) return 'Low';
    if (val <= 4) return 'Medium-Low';
    if (val <= 6) return 'Medium';
    if (val <= 8) return 'Medium-High';
    return 'High';
  };

  const getPriorityColor = (val) => {
    if (val <= 3) return 'var(--text-tertiary)';
    if (val <= 6) return 'var(--accent-warning)';
    return 'var(--accent-primary)';
  };

  if (loading) return <div className="empty-state"><p>Loading...</p></div>;

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Soft Constraints</h1>
          <p>Configure priority levels for fairness-based scheduling rules</p>
        </div>
        <button className="btn btn-primary" onClick={saveAll} disabled={saving}>
          {saving ? <Loader2 className="spin" size={16} /> : <Save size={16} />}
          {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Priorities'}
        </button>
      </div>

      {/* Info banner */}
      <div style={{
        padding: '14px 18px',
        background: 'var(--accent-info-subtle)',
        borderRadius: 'var(--radius-md)',
        fontSize: '0.85rem',
        color: 'var(--accent-info)',
        marginBottom: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <Info size={18} style={{ flexShrink: 0 }} />
        <span>Soft constraints guide the optimizer for fairness, but <strong>never override hard constraints</strong>. Priority 1 = low importance, 10 = high importance.</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {[...SOFT_CONSTRAINTS]
          .sort((a, b) => {
            const valA = savedPriorities[a.key] || 5;
            const valB = savedPriorities[b.key] || 5;
            if (valA !== valB) return valB - valA;
            return a.name.localeCompare(b.name);
          })
          .map(sc => {
          const val = priorities[sc.key] || 5;
          return (
            <div key={sc.key} className="card" style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <span style={{ fontSize: '1.5rem' }}>{sc.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '1rem' }}>{sc.name}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{sc.description}</div>
                </div>
                <div style={{
                  textAlign: 'center',
                  minWidth: 60,
                }}>
                  <div style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: getPriorityColor(val),
                    lineHeight: 1,
                  }}>{val}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                    {getPriorityLabel(val)}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', width: 16, textAlign: 'center' }}>1</span>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={val}
                  onChange={e => handleChange(sc.key, parseInt(e.target.value))}
                  style={{
                    flex: 1,
                    height: 6,
                    accentColor: getPriorityColor(val),
                    cursor: 'pointer',
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', width: 20, textAlign: 'center' }}>10</span>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
