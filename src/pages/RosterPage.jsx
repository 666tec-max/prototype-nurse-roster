import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabase } from '../lib/supabase';
import { CalendarRange, Wand2, Loader2, Download, AlertTriangle, BarChart3 } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function RosterPage() {
  const { user } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [shiftsMap, setShiftsMap] = useState({});
  const [staffMap, setStaffMap] = useState({});

  const [filterDept, setFilterDept] = useState('');
  const [startDate, setStartDate] = useState(() => {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
  });

  const [endDate, setEndDate] = useState(() => {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }));
    d.setDate(d.getDate() + 13);
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
  });

  const handleShortcut = (type) => {
    const currentStartStr = startDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' });
    const sd = new Date(currentStartStr);
    
    if (type === '2weeks') {
      const ed = new Date(currentStartStr);
      ed.setDate(ed.getDate() + 13);
      setStartDate(currentStartStr);
      setEndDate(ed.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }));
    } else if (type === '1month') {
      const nextMonth = new Date(sd.getFullYear(), sd.getMonth() + 1, 1);
      const lastDayNextMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0);
      setStartDate(nextMonth.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }));
      setEndDate(lastDayNextMonth.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }));
    } else if (type === '2months') {
      const nextNextMonth = new Date(sd.getFullYear(), sd.getMonth() + 2, 1);
      const lastDayNextNextMonth = new Date(nextNextMonth.getFullYear(), nextNextMonth.getMonth() + 1, 0);
      setStartDate(nextNextMonth.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }));
      setEndDate(lastDayNextNextMonth.toLocaleDateString('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }));
    }
  };

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

    const { data: demandData } = await supabase
      .from('demand')
      .select('*')
      .eq('department_id', filterDept);

    const relevantDemand = (demandData || []).filter(d => 
      (!d.date_start || d.date_start <= endDate) && 
      (!d.date_end || d.date_end >= startDate)
    );

    if (relevantDemand.length === 0) {
      warnings.push('No demand configured for this department and date range. No shifts will be generated.');
    }

    const { data: staffData } = await supabase
      .from('staff')
      .select('staff_id')
      .eq('department_id', filterDept);

    if (!staffData || staffData.length === 0) {
      warnings.push('No staff members assigned to this department.');
    }

    const { data: leaves } = await supabase
      .from('leave_requests')
      .select('staff_id, start_date, end_date')
      .eq('status', 'Approved')
      .lte('start_date', endDate)
      .gte('end_date', startDate);

    if (leaves && leaves.length > 0) {
      warnings.push(`${leaves.length} approved leave request(s) overlap with this period — will be respected.`);
    }

    const { data: shiftReqs } = await supabase
      .from('fixed_assignments')
      .select('staff_id, start_date, end_date, shift_id')
      .lte('start_date', endDate)
      .gte('end_date', startDate);

    if (shiftReqs && shiftReqs.length > 0) {
      warnings.push(`${shiftReqs.length} shift request(s) will be enforced as hard constraints.`);
    }

    return warnings;
  };

  const generateRoster = async () => {
    if (!filterDept || !startDate || !endDate) return;

    const warnings = await validateBeforeGenerate();
    setValidationWarnings(warnings);

    const blocking = warnings.filter(w => w.includes('No demand') || w.includes('No staff'));
    if (blocking.length > 0) {
      return;
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
      const { data, error } = await supabase.functions.invoke('generate-roster', {
        body: {
          department_id: filterDept,
          start_date: startDate,
          end_date: endDate,
          user_id: user.userId
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

    const dates = getDatesBetween(startDate, endDate);
    
    // Create rows with Staff Member as first column and dates as subsequent columns
    const rows = Object.keys(staffAssignments).sort().map(staffId => {
      const staffName = staffMap[staffId]?.name || staffId;
      const row = { 'Staff Member': staffName };
      
      dates.forEach(date => {
        const dayName = getDayName(date);
        const columnHeader = `${date} (${dayName})`;
        row[columnHeader] = staffAssignments[staffId][date] || '-';
      });
      
      return row;
    });

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

  // ─── Fairness Analysis Metrics ───────────────────────────────────────────────
  const isNightShiftFn = (shiftId) => {
    const shift = shiftsMap[shiftId];
    if (!shift) return false;
    return shift.end_time < shift.start_time;
  };

  const staffMetrics = {};
  rosterData.forEach(r => {
    if (!staffMetrics[r.staff_id]) {
      staffMetrics[r.staff_id] = { night: 0, weekend: 0, total: 0 };
    }
    staffMetrics[r.staff_id].total++;
    if (isWeekend(r.date)) staffMetrics[r.staff_id].weekend++;
    if (isNightShiftFn(r.shift_id)) staffMetrics[r.staff_id].night++;
  });

  const fairnessStaffIds = Object.keys(staffMetrics).sort();
  const staffCount = fairnessStaffIds.length;

  const avgNight   = staffCount > 0 ? (fairnessStaffIds.reduce((s, id) => s + staffMetrics[id].night, 0) / staffCount).toFixed(1) : '—';
  const avgWeekend = staffCount > 0 ? (fairnessStaffIds.reduce((s, id) => s + staffMetrics[id].weekend, 0) / staffCount).toFixed(1) : '—';
  const avgTotal   = staffCount > 0 ? (fairnessStaffIds.reduce((s, id) => s + staffMetrics[id].total, 0) / staffCount).toFixed(1) : '—';

  const getFairnessBar = (value, max) => {
    if (!max || max === 0) return 0;
    return Math.round((value / max) * 100);
  };
  const maxNight   = staffCount > 0 ? Math.max(...fairnessStaffIds.map(id => staffMetrics[id].night)) : 0;
  const maxWeekend = staffCount > 0 ? Math.max(...fairnessStaffIds.map(id => staffMetrics[id].weekend)) : 0;
  const maxTotal   = staffCount > 0 ? Math.max(...fairnessStaffIds.map(id => staffMetrics[id].total)) : 0;

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
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3>Parameters</h3>
        </div>
        <div className="form-row" style={{ padding: '0 20px 20px 20px', alignItems: 'flex-start' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Start Date</label>
            <input type="date" className="form-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label className="form-label">Department</label>
            <select className="form-input" value={filterDept} onChange={e => setFilterDept(e.target.value)}>
              {departments.map(d => <option key={d.department_id} value={d.department_id}>{d.department_id} - {d.description || 'Dept'}</option>)}
              {departments.length === 0 && <option value="" disabled>No departments configured</option>}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">End Date</label>
            <input type="date" className="form-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
        <div style={{ padding: '0 20px 20px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 20 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => handleShortcut('2weeks')}>Next 2 weeks</button>
            <button className="btn btn-sm btn-ghost" onClick={() => handleShortcut('1month')}>Next month</button>
            <button className="btn btn-sm btn-ghost" onClick={() => handleShortcut('2months')}>Next next month</button>
          </div>
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

      {/* Schedule Viewer */}
      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', marginBottom: 20 }}>
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
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 350px)', padding: '0 20px 20px 20px' }}>
            <table className="data-table" style={{ margin: 0, minWidth: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <th style={{ 
                    width: 250, 
                    position: 'sticky', 
                    left: 0, 
                    top: 0,
                    background: 'var(--bg-secondary)', 
                    zIndex: 11, 
                    borderRight: '2px solid var(--border-color)',
                    borderBottom: '2px solid var(--border-color)'
                  }}>Staff Member</th>
                  {dates.map(date => (
                    <th key={date} style={{
                      textAlign: 'center',
                      minWidth: 80,
                      position: 'sticky',
                      top: 0,
                      background: isWeekend(date) ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                      zIndex: 9,
                      borderBottom: '2px solid var(--border-color)'
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

      {/* ── Fairness Analysis — shown only when roster exists ─────────────────── */}
      {rosterData.length > 0 && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BarChart3 size={18} style={{ color: 'var(--accent-primary)' }} />
            <h3 style={{ margin: 0 }}>Fairness Analysis</h3>
          </div>

          {/* Summary stat cards */}
          <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ textAlign: 'center', padding: '20px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg Night Shifts</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-primary)', lineHeight: 1 }}>{avgNight}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: 4 }}>per staff</div>
            </div>
            <div style={{ textAlign: 'center', padding: '20px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg Weekend Shifts</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-warning)', lineHeight: 1 }}>{avgWeekend}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: 4 }}>per staff</div>
            </div>
            <div style={{ textAlign: 'center', padding: '20px 12px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg Total Shifts</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent-info)', lineHeight: 1 }}>{avgTotal}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: 4 }}>per staff</div>
            </div>
          </div>

          {/* Per-staff breakdown table with inline bar charts */}
          <div style={{ padding: '20px' }}>
            <table className="data-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Staff Member</th>
                  <th style={{ textAlign: 'center', width: 80 }}>Total</th>
                  <th style={{ minWidth: 160 }}>Total Shifts</th>
                  <th style={{ textAlign: 'center', width: 80 }}>Nights</th>
                  <th style={{ minWidth: 160 }}>Night Shifts</th>
                  <th style={{ textAlign: 'center', width: 80 }}>Weekends</th>
                  <th style={{ minWidth: 160 }}>Weekend Shifts</th>
                </tr>
              </thead>
              <tbody>
                {fairnessStaffIds.map(staffId => {
                  const m = staffMetrics[staffId];
                  const staffName = staffMap[staffId]?.name || staffId;
                  return (
                    <tr key={staffId}>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600 }}>{staffName}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{staffId}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.1rem' }}>{m.total}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 8, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${getFairnessBar(m.total, maxTotal)}%`, height: '100%', background: 'var(--accent-info)', borderRadius: 4, transition: 'width 0.3s ease' }} />
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.1rem', color: m.night > 0 ? 'var(--accent-primary)' : 'var(--text-tertiary)' }}>{m.night}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 8, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${getFairnessBar(m.night, maxNight)}%`, height: '100%', background: 'var(--accent-primary)', borderRadius: 4, transition: 'width 0.3s ease' }} />
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, fontSize: '1.1rem', color: m.weekend > 0 ? 'var(--accent-warning)' : 'var(--text-tertiary)' }}>{m.weekend}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 8, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${getFairnessBar(m.weekend, maxWeekend)}%`, height: '100%', background: 'var(--accent-warning)', borderRadius: 4, transition: 'width 0.3s ease' }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
