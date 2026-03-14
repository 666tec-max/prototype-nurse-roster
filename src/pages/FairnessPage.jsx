import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabase } from '../lib/supabase';
import { BarChart3, Loader2, CalendarRange } from 'lucide-react';

export default function FairnessPage() {
  const { user } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [shiftsMap, setShiftsMap] = useState({});
  const [staffMap, setStaffMap] = useState({});

  const [filterDept, setFilterDept] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7));
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + ((1 + 7 - d.getDay()) % 7 || 7) + 6);
    return d.toISOString().split('T')[0];
  });

  const [rosterData, setRosterData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(false);

  useEffect(() => {
    if (user) loadInitialData();
  }, [user]);

  useEffect(() => {
    if (filterDept && startDate && endDate) loadRoster();
  }, [filterDept, startDate, endDate]);

  const loadInitialData = async () => {
    const supabase = getSupabase(user.userId);
    setLoading(true);

    const [deptRes, shiftsRes, staffRes] = await Promise.all([
      supabase.from('departments').select('*').order('department_id'),
      supabase.from('shifts').select('*'),
      supabase.from('staff').select('staff_id, name, grade_id')
    ]);

    setDepartments(deptRes.data || []);
    if (!filterDept && deptRes.data?.length > 0) setFilterDept(deptRes.data[0].department_id);

    const smap = {};
    (shiftsRes.data || []).forEach(s => smap[s.shift_id] = s);
    setShiftsMap(smap);

    const stmap = {};
    (staffRes.data || []).forEach(s => stmap[s.staff_id] = s);
    setStaffMap(stmap);

    setLoading(false);
  };

  const loadRoster = async () => {
    const supabase = getSupabase(user.userId);
    setMetricsLoading(true);

    const { data: metaData } = await supabase
      .from('roster_metadata')
      .select('*')
      .eq('department_id', filterDept)
      .eq('start_date', startDate)
      .eq('end_date', endDate)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (metaData) {
      const { data: assignments } = await supabase
        .from('roster')
        .select('*')
        .eq('roster_group_id', metaData.id);
      setRosterData(assignments || []);
    } else {
      setRosterData([]);
    }

    setMetricsLoading(false);
  };

  // Compute fairness metrics
  const isWeekend = (dateStr) => {
    const d = new Date(dateStr);
    const day = d.getDay();
    return day === 0 || day === 6;
  };

  const isNightShift = (shiftId) => {
    const shift = shiftsMap[shiftId];
    if (!shift) return false;
    const start = shift.start_time;
    return start && (start >= '22:00' || start < '06:00');
  };

  const staffMetrics = {};
  rosterData.forEach(r => {
    if (!staffMetrics[r.staff_id]) {
      staffMetrics[r.staff_id] = { night: 0, weekend: 0, total: 0 };
    }
    staffMetrics[r.staff_id].total++;
    if (isWeekend(r.date)) staffMetrics[r.staff_id].weekend++;
    if (isNightShift(r.shift_id)) staffMetrics[r.staff_id].night++;
  });

  const staffIds = Object.keys(staffMetrics).sort();
  const staffCount = staffIds.length;

  const avgNight = staffCount > 0 ? (staffIds.reduce((s, id) => s + staffMetrics[id].night, 0) / staffCount).toFixed(1) : '—';
  const avgWeekend = staffCount > 0 ? (staffIds.reduce((s, id) => s + staffMetrics[id].weekend, 0) / staffCount).toFixed(1) : '—';
  const avgTotal = staffCount > 0 ? (staffIds.reduce((s, id) => s + staffMetrics[id].total, 0) / staffCount).toFixed(1) : '—';

  return (
    <div>
      <div className="page-header">
        <h1>Fairness Analysis</h1>
        <p>Analyze shift distribution equity after roster generation</p>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3>Parameters</h3>
        </div>
        <div className="form-row" style={{ padding: '0 20px 20px 20px' }}>
          <div className="form-group">
            <label className="form-label">Start Date</label>
            <input type="date" className="form-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Department</label>
            <select className="form-input" value={filterDept} onChange={e => setFilterDept(e.target.value)}>
              {departments.map(d => <option key={d.department_id} value={d.department_id}>{d.department_id} - {d.description || 'Dept'}</option>)}
              {departments.length === 0 && <option value="" disabled>No departments configured</option>}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">End Date</label>
            <input type="date" className="form-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
      </div>

      {loading || metricsLoading ? (
        <div className="empty-state">
          <Loader2 className="spin" size={40} style={{ color: 'var(--text-tertiary)', marginBottom: 20 }} />
          <h3>Loading...</h3>
        </div>
      ) : rosterData.length === 0 ? (
        <div className="card empty-state">
          <BarChart3 size={48} style={{ color: 'var(--text-tertiary)', marginBottom: 20 }} />
          <h3>No Roster Data</h3>
          <p>Generate a roster first, then return here to view fairness metrics.</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
            <div className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: 8 }}>Avg Night Shifts</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-primary)' }}>{avgNight}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>per staff</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: 8 }}>Avg Weekend Shifts</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-warning)' }}>{avgWeekend}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>per staff</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: 8 }}>Avg Total Shifts</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-info)' }}>{avgTotal}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>per staff</div>
            </div>
          </div>

          {/* Detailed table */}
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Staff</th>
                  <th style={{ textAlign: 'center' }}>Night Shifts</th>
                  <th style={{ textAlign: 'center' }}>Weekend Shifts</th>
                  <th style={{ textAlign: 'center' }}>Total Shifts</th>
                </tr>
              </thead>
              <tbody>
                {staffIds.map(staffId => {
                  const m = staffMetrics[staffId];
                  const staffName = staffMap[staffId]?.name || staffId;
                  return (
                    <tr key={staffId}>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600 }}>{staffName}</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{staffId}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{m.night}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{m.weekend}</td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{m.total}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <style>{`
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
