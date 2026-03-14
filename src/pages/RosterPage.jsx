import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabase } from '../lib/supabase';
import { CalendarRange, Wand2, Loader2, Download, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function RosterPage() {
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
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [validationWarnings, setValidationWarnings] = useState([]);

  useEffect(() => {
    if (user) loadInitialData();
  }, [user]);

  useEffect(() => {
    if (filterDept && startDate && endDate) {
      loadRoster();
    }
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
    if (!filterDept && deptRes.data?.length > 0) {
      setFilterDept(deptRes.data[0].department_id);
    }

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
    setLoading(true);

    const { data: metaData } = await supabase
      .from('roster_metadata')
      .select('*')
      .eq('department_id', filterDept)
      .eq('start_date', startDate)
      .eq('end_date', endDate)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    setMetadata(metaData || null);

    if (metaData) {
      const { data: assignments } = await supabase
        .from('roster')
        .select('*')
        .eq('roster_group_id', metaData.id);
      setRosterData(assignments || []);
    } else {
      setRosterData([]);
    }

    setLoading(false);
  };

  // Pre-generation validation
  const validateBeforeGenerate = async () => {
    const supabase = getSupabase(user.userId);
    const warnings = [];

    // Check demand exists
    const { data: demandData } = await supabase
      .from('demand')
      .select('*')
      .eq('department_id', filterDept)
      .lte('date_start', endDate)
      .gte('date_end', startDate);

    if (!demandData || demandData.length === 0) {
      warnings.push('No demand configured for this department and date range. No shifts will be generated.');
    }

    // Check staff available
    const { data: staffData } = await supabase
      .from('staff')
      .select('staff_id')
      .eq('department_id', filterDept);

    if (!staffData || staffData.length === 0) {
      warnings.push('No staff members assigned to this department.');
    }

    // Check for approved leaves
    const { data: leaves } = await supabase
      .from('leave_requests')
      .select('staff_id, start_date, end_date')
      .eq('status', 'Approved')
      .lte('start_date', endDate)
      .gte('end_date', startDate);

    if (leaves && leaves.length > 0) {
      warnings.push(`${leaves.length} approved leave request(s) overlap with this period — will be respected.`);
    }

    // Check for shift requests
    const { data: shiftReqs } = await supabase
      .from('fixed_assignments')
      .select('staff_id, date, shift_id')
      .gte('date', startDate)
      .lte('date', endDate);

    if (shiftReqs && shiftReqs.length > 0) {
      warnings.push(`${shiftReqs.length} shift request(s) will be enforced as hard constraints.`);
    }

    return warnings;
  };

  const generateRoster = async () => {
    if (!filterDept || !startDate || !endDate) return;

    // Run validation first
    const warnings = await validateBeforeGenerate();
    setValidationWarnings(warnings);

    // Block if no demand
    const blocking = warnings.filter(w => w.includes('No demand') || w.includes('No staff'));
    if (blocking.length > 0) {
      return; // Don't generate, just show warnings
    }

    setGenerating(true);
    const supabase = getSupabase(user.userId);

    if (metadata) {
      if (!confirm('This will overwrite the existing roster for this period. Continue?')) {
        setGenerating(false);
        return;
      }
      await supabase.from('roster').delete().eq('roster_group_id', metadata.id);
      await supabase.from('roster_metadata').delete().eq('id', metadata.id);
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const { data, error } = await supabase.functions.invoke('generate-roster', {
        body: {
          department_id: filterDept,
          start_date: startDate,
          end_date: endDate,
          user_id: user.userId
        },
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });

      if (error) throw error;

      alert(`Successfully generated roster with ${data.count} shift assignments.`);
      setValidationWarnings([]);
      loadRoster();
    } catch (err) {
      console.error(err);
      alert('Failed to generate roster: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const exportToExcel = () => {
    if (rosterData.length === 0) return;

    // Build rows: Date, Shift, Assigned Staff
    const rows = rosterData
      .sort((a, b) => a.date.localeCompare(b.date) || a.shift_id.localeCompare(b.shift_id))
      .map(r => ({
        Date: r.date,
        Shift: r.shift_id,
        'Staff ID': r.staff_id,
        'Staff Name': staffMap[r.staff_id]?.name || r.staff_id,
        Grade: staffMap[r.staff_id]?.grade_id || '',
      }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Roster');

    // Auto-size columns
    const colWidths = Object.keys(rows[0] || {}).map(key => ({
      wch: Math.max(key.length, ...rows.map(r => String(r[key] || '').length)) + 2
    }));
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, `roster_${filterDept}_${startDate}_${endDate}.xlsx`);
  };

  const getDatesBetween = (startStr, endStr) => {
    const dates = [];
    let currentDate = new Date(startStr);
    const stopDate = new Date(endStr);
    while (currentDate <= stopDate) {
      dates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }
    return dates;
  };

  const dates = getDatesBetween(startDate, endDate);

  const staffAssignments = {};
  rosterData.forEach(r => {
    if (!staffAssignments[r.staff_id]) staffAssignments[r.staff_id] = {};
    staffAssignments[r.staff_id][r.date] = r.shift_id;
  });

  const getDayName = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  };

  const isWeekend = (dateStr) => {
    const d = new Date(dateStr);
    return d.getDay() === 0 || d.getDay() === 6;
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1>Roster Generation</h1>
          <p>Generate and view shift schedules</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {rosterData.length > 0 && (
            <button className="btn btn-secondary" onClick={exportToExcel}>
              <Download size={18} /> Export Excel
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={generateRoster}
            disabled={generating || !filterDept}
          >
            {generating ? <Loader2 className="spin" size={18} /> : <Wand2 size={18} />}
            {generating ? 'Engine Running...' : 'Generate Auto Roster'}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3>Parameters</h3>
        </div>
        <div className="form-row" style={{ padding: '0 20px 20px 20px' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Department</label>
            <select className="form-input" value={filterDept} onChange={e => setFilterDept(e.target.value)}>
              {departments.map(d => <option key={d.department_id} value={d.department_id}>{d.department_id} - {d.description || 'Dept'}</option>)}
              {departments.length === 0 && <option value="" disabled>No departments configured</option>}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Start Date</label>
            <input type="date" className="form-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">End Date</label>
            <input type="date" className="form-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Validation Warnings */}
      {validationWarnings.length > 0 && (
        <div style={{ marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {validationWarnings.map((w, i) => (
            <div key={i} style={{
              padding: '10px 14px',
              background: w.includes('No demand') || w.includes('No staff')
                ? 'var(--accent-danger-subtle)' : 'var(--accent-warning-subtle)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              color: w.includes('No demand') || w.includes('No staff')
                ? 'var(--accent-danger)' : 'var(--accent-warning)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <AlertTriangle size={16} style={{ flexShrink: 0 }} />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Schedule Viewer</h3>
          {metadata && (
             <span className="badge" style={{ background: 'var(--accent-success-subtle)', color: 'var(--accent-success)' }}>
               Generated on {new Date(metadata.created_at).toLocaleString()}
             </span>
          )}
        </div>

        {loading ? (
          <div className="empty-state">
            <Loader2 className="spin" size={40} style={{ color: 'var(--text-tertiary)', marginBottom: 20 }} />
            <h3>Loading Roster...</h3>
          </div>
        ) : rosterData.length === 0 ? (
          <div className="empty-state">
            <CalendarRange size={48} style={{ color: 'var(--text-tertiary)', marginBottom: 20 }} />
            <h3>No Roster Found</h3>
            <p>Click "Generate Auto Roster" to run the scheduling engine for this period.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', padding: 20 }}>
            <table className="data-table" style={{ margin: 0, minWidth: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 250, position: 'sticky', left: 0, background: 'var(--bg-secondary)', zIndex: 1, borderRight: '2px solid var(--border-color)' }}>Staff Member</th>
                  {dates.map(date => (
                    <th key={date} style={{
                      textAlign: 'center',
                      minWidth: 80,
                      background: isWeekend(date) ? 'var(--accent-warning-subtle)' : undefined,
                    }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 500, color: isWeekend(date) ? 'var(--accent-warning)' : 'var(--text-tertiary)' }}>{getDayName(date)}</div>
                      <div>{date.split('-')[2]}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.keys(staffAssignments).sort().map(staffId => {
                  const staffName = staffMap[staffId]?.name || staffId;
                  const grade = staffMap[staffId]?.grade_id || '';

                  return (
                    <tr key={staffId}>
                      <td style={{ position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 1, borderRight: '2px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600 }}>{staffName}</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{staffId} • {grade}</span>
                        </div>
                      </td>
                      {dates.map(date => {
                        const shiftId = staffAssignments[staffId][date];
                        const shiftDetail = shiftsMap[shiftId];
                        return (
                          <td key={date} style={{ textAlign: 'center', padding: '8px 4px', background: isWeekend(date) ? 'rgba(245, 158, 11, 0.03)' : undefined }}>
                            {shiftId ? (
                              <div style={{
                                background: shiftDetail?.colour || 'transparent',
                                color: shiftDetail?.colour ? '#fff' : 'var(--text-primary)',
                                border: shiftDetail?.colour ? 'none' : '1px solid var(--border-color)',
                                padding: '4px',
                                borderRadius: '4px',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                margin: '0 auto',
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}>
                                {shiftId}
                              </div>
                            ) : '-'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
