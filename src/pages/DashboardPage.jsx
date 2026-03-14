import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabase } from '../lib/supabase';
import {
  Building2, Users, Award, Sparkles, Clock, ClipboardList,
  CheckCircle2, AlertCircle, XCircle, Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const CHECKLIST = [
  { key: 'departments', table: 'departments', label: 'Departments', desc: 'Define hospital departments', icon: Building2, path: '/departments' },
  { key: 'staff', table: 'staff', label: 'Staff', desc: 'Add nursing staff members', icon: Users, path: '/staff' },
  { key: 'grades', table: 'grades', label: 'Grades', desc: 'Configure seniority levels', icon: Award, path: '/grades' },
  { key: 'skills', table: 'skills', label: 'Skills', desc: 'Define clinical capabilities', icon: Sparkles, path: '/skills' },
  { key: 'shifts', table: 'shifts', label: 'Shifts', desc: 'Set up shift types', icon: Clock, path: '/shifts' },
  { key: 'demand', table: 'demand', label: 'Demand', desc: 'Configure staffing requirements', icon: ClipboardList, path: '/demand' },
];

function StatusIcon({ status }) {
  if (status === 'green') return <CheckCircle2 size={20} />;
  if (status === 'yellow') return <AlertCircle size={20} />;
  return <XCircle size={20} />;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCounts();
  }, [user]);

  const loadCounts = async () => {
    if (!user) return;
    setLoading(true);
    const supabase = getSupabase(user.userId);
    const results = {};

    for (const item of CHECKLIST) {
      const { count, error } = await supabase
        .from(item.table)
        .select('*', { count: 'exact', head: true });
      results[item.key] = error ? 0 : (count || 0);
    }

    setCounts(results);
    setLoading(false);
  };

  const getStatus = (key) => {
    if (loading) return 'loading';
    const count = counts[key] || 0;
    if (count === 0) return 'red';
    if (key === 'staff' && count < 1) return 'yellow';
    if (key === 'demand' && count < 1) return 'yellow';
    return 'green';
  };

  const completedCount = CHECKLIST.filter(item => getStatus(item.key) === 'green').length;
  const allConfigured = completedCount === CHECKLIST.length;

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Setup progress for roster generation</p>
      </div>

      {/* Progress summary */}
      <div className="card" style={{ marginBottom: 24, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: 4 }}>
              Configuration Progress
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
              {loading ? '...' : `${completedCount} / ${CHECKLIST.length}`}
            </div>
          </div>
          <div style={{
            padding: '8px 16px',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.8rem',
            fontWeight: 600,
            background: allConfigured ? 'var(--accent-success-subtle)' : 'var(--accent-warning-subtle)',
            color: allConfigured ? 'var(--accent-success)' : 'var(--accent-warning)',
          }}>
            {loading ? 'Loading...' : allConfigured ? 'Ready to Generate' : 'Setup Incomplete'}
          </div>
        </div>
        <div style={{
          height: 6,
          background: 'var(--bg-tertiary)',
          borderRadius: 3,
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%',
            width: loading ? '0%' : `${(completedCount / CHECKLIST.length) * 100}%`,
            background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-primary-hover))',
            borderRadius: 3,
            transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
          }} />
        </div>
      </div>

      {/* Checklist grid */}
      <div className="dashboard-grid">
        {CHECKLIST.map(item => {
          const status = getStatus(item.key);
          const Icon = item.icon;
          const count = counts[item.key] || 0;

          return (
            <div
              key={item.key}
              className="checklist-item"
              onClick={() => navigate(item.path)}
              style={{ cursor: 'pointer' }}
            >
              <div className={`checklist-icon ${status === 'loading' ? '' : status}`}>
                {status === 'loading' ? (
                  <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <StatusIcon status={status} />
                )}
              </div>
              <div className="checklist-info" style={{ flex: 1 }}>
                <h4>{item.label}</h4>
                <p>{item.desc}</p>
              </div>
              <div style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: status === 'green' ? 'var(--accent-success)' :
                       status === 'red' ? 'var(--accent-danger)' :
                       status === 'yellow' ? 'var(--accent-warning)' : 'var(--text-tertiary)',
              }}>
                {loading ? '' : count}
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
