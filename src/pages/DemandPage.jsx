import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabase, logAudit } from '../lib/supabase';
import Modal from '../components/Modal';
import { Plus, Trash2, LayoutList, Filter, Pencil } from 'lucide-react';

export default function DemandPage() {
  const { user } = useAuth();

  const [items, setItems] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [grades, setGrades] = useState([]);
  const [skills, setSkills] = useState([]);

  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);

  const [filterDept, setFilterDept] = useState('');

  const [form, setForm] = useState({
    date_start: '',
    date_end: '',
    department_id: '',
    shift_id: '',
    requirements: [
      { required_grade: '', required_skill: '', minimum_staff: 1 }
    ]
  });

  const loadData = useCallback(async () => {
    if (!user) return;
    const supabase = getSupabase(user.userId);

    const [deptRes, shiftRes, gradeRes, skillRes, demandRes] = await Promise.all([
      supabase.from('departments').select('department_id, description'),
      supabase.from('shifts').select('shift_id, description').order('start_time'),
      supabase.from('grades').select('grade_id, description'),
      supabase.from('skills').select('skill_id, description'),
      supabase.from('demand').select('*').order('department_id')
    ]);

    setDepartments(deptRes.data || []);
    setShifts(shiftRes.data || []);
    setGrades(gradeRes.data || []);
    setSkills(skillRes.data || []);
    setItems(demandRes.data || []);

    if (!form.department_id && deptRes.data?.length > 0) form.department_id = deptRes.data[0].department_id;
    if (!form.shift_id && shiftRes.data?.length > 0) form.shift_id = shiftRes.data[0].shift_id;
    if (form.requirements[0].required_grade === '' && gradeRes.data?.length > 0) {
      form.requirements[0].required_grade = gradeRes.data[0].grade_id;
    }

    setLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const openAdd = () => {
    setEditing(null);
    setForm({
      date_start: '',
      date_end: '',
      department_id: filterDept || departments[0]?.department_id || '',
      shift_id: shifts[0]?.shift_id || '',
      requirements: [
        { required_grade: grades[0]?.grade_id || '', required_skill: '', minimum_staff: 1 }
      ]
    });
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({ 
      ...item, 
      date_start: item.date_start || '', 
      date_end: item.date_end || '',
      requirements: [{
        required_grade: item.required_grade,
        required_skill: item.required_skill || '',
        minimum_staff: item.minimum_staff
      }]
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.department_id || !form.shift_id) return;
    
    // Validate requirements
    for (const req of form.requirements) {
      if (!req.required_grade) {
        alert('All requirement rows must have a grade selected.');
        return;
      }
    }

    if (form.date_start && form.date_end && new Date(form.date_start) > new Date(form.date_end)) {
      alert('End Date must be on or after Start Date.');
      return;
    }
    setSaving(true);

    const supabase = getSupabase(user.userId);
    
    try {
      if (editing) {
        // If editing, we just update the specific underlying demand record since the edit UI
        // was opened from a specific row
        const record = {
          date_start: form.date_start || null,
          date_end: form.date_end || null,
          department_id: form.department_id,
          shift_id: form.shift_id,
          required_grade: form.requirements[0].required_grade,
          required_skill: form.requirements[0].required_skill || null,
          minimum_staff: form.requirements[0].minimum_staff,
          user_id: user.userId
        };
        await supabase.from('demand').update(record).eq('id', editing.id);
        await logAudit(user.userId, 'UPDATE_DEMAND', { id: editing.id, ...record });
      } else {
        // If adding new, we insert a row for each requirement object in the array
        const records = form.requirements.map(req => ({
          date_start: form.date_start || null,
          date_end: form.date_end || null,
          department_id: form.department_id,
          shift_id: form.shift_id,
          required_grade: req.required_grade,
          required_skill: req.required_skill || null,
          minimum_staff: req.minimum_staff,
          user_id: user.userId
        }));
        await supabase.from('demand').insert(records);
        await logAudit(user.userId, 'CREATE_DEMAND_BATCH', records);
      }
      setModalOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      alert('Failed to save demand. A duplicate requirement might already exist.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item) => {
    if (!confirm('Delete this demand requirement?')) return;
    const supabase = getSupabase(user.userId);
    await supabase.from('demand').delete().eq('id', item.id);
    await logAudit(user.userId, 'DELETE_DEMAND', { id: item.id });
    loadData();
  };

  let filtered = items;
  if (filterDept) filtered = filtered.filter(i => i.department_id === filterDept);

  // Group by department -> shift -> time
  const getGroupedData = () => {
    const shiftTimes = {};
    shifts.forEach(s => shiftTimes[s.shift_id] = s.start_time);
    
    // Sort items by department, then shift start time, then dates
    const sortedFiltered = [...filtered].sort((a, b) => {
      if (a.department_id !== b.department_id) return a.department_id.localeCompare(b.department_id);
      
      const timeA = shiftTimes[a.shift_id] || '23:59';
      const timeB = shiftTimes[b.shift_id] || '23:59';
      if (timeA !== timeB) return timeA.localeCompare(timeB);
      
      const dsA = a.date_start || '0000-00-00';
      const dsB = b.date_start || '0000-00-00';
      if (dsA !== dsB) return dsB.localeCompare(dsA);
      return 0;
    });

    const groups = {};
    sortedFiltered.forEach(item => {
      if (!groups[item.department_id]) groups[item.department_id] = {};
      if (!groups[item.department_id][item.shift_id]) groups[item.department_id][item.shift_id] = [];
      groups[item.department_id][item.shift_id].push(item);
    });
    return groups;
  };

  const groupedData = getGroupedData();

  if (loading) return <div className="empty-state"><p>Loading...</p></div>;

  return (
    <div>
      <div className="page-header">
        <h1>Demand Configuration</h1>
        <p>Define staffing requirements using date ranges per shift</p>
      </div>

      <div className="card" style={{ padding: '16px', marginBottom: '24px', display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Filter size={14}/> Department</label>
          <select className="form-input" value={filterDept} onChange={e => setFilterDept(e.target.value)}>
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.department_id} value={d.department_id}>{d.department_id} - {d.description || 'Dept'}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-primary" onClick={openAdd}>
            <Plus size={16} /> Add Requirement
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card empty-state">
          <LayoutList size={48} />
          <h3>No demand defined</h3>
          <p>Create staffing requirements for your shifts.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {Object.entries(groupedData).map(([deptId, shiftsGroup]) => (
            <div key={deptId} className="card">
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-color)',
                background: 'var(--bg-tertiary)',
                borderTopLeftRadius: 'var(--radius-lg)',
                borderTopRightRadius: 'var(--radius-lg)',
                fontWeight: 600,
                fontSize: '1.05rem',
                color: 'var(--text-primary)'
              }}>
                Department: {deptId}
              </div>

              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {Object.entries(shiftsGroup).map(([shiftId, requirements]) => {
                  const totalStaff = requirements.reduce((acc, req) => acc + parseInt(req.minimum_staff || 0), 0);

                  return (
                    <div key={shiftId} style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                      <div style={{
                        padding: '10px 16px',
                        background: 'var(--bg-secondary)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontWeight: 500
                      }}>
                        <span>Shift: {shiftId}</span>
                        <span className="badge" style={{ background: 'var(--accent-primary)', color: 'white' }}>Total: {totalStaff} Staff</span>
                      </div>

                      <table className="data-table" style={{ margin: 0, border: 'none', borderTop: '1px solid var(--border-color)' }}>
                        <thead>
                          <tr>
                            <th>Date Range</th>
                            <th>Grade Required</th>
                            <th>Specific Skill</th>
                            <th>Headcount</th>
                            <th style={{ textAlign: 'right', width: 60 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {requirements.map(req => (
                            <tr key={req.id}>
                              <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                                {req.date_start ? `${req.date_start}${req.date_end && req.date_end !== req.date_start ? ` → ${req.date_end}` : ''}` : <span style={{ color: 'var(--text-tertiary)'}}>Always applicable</span>}
                              </td>
                              <td>
                                <span className="badge">{req.required_grade}</span>
                              </td>
                              <td>
                                {req.required_skill ? (
                                  <span className="badge" style={{ border: '1px solid var(--accent-info)', color: 'var(--accent-info)', background: 'transparent' }}>
                                    {req.required_skill}
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem' }}>Any standard skills</span>
                                )}
                              </td>
                              <td style={{ fontWeight: 600 }}>{req.minimum_staff}</td>
                              <td>
                                  <div className="table-actions">
                                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(req)}><Pencil size={15} /></button>
                                    <button className="btn btn-danger btn-sm btn-icon" onClick={() => remove(req)}><Trash2 size={15} /></button>
                                  </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Staffing Requirement" : "Add Staffing Requirement"}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : (editing ? 'Save Changes' : 'Add Requirement')}</button>
        </>}
      >
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Start Date (Optional)</label>
            <input type="date" className="form-input" value={form.date_start} onChange={e => setForm({ ...form, date_start: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">End Date (Optional)</label>
            <input type="date" className="form-input" value={form.date_end} onChange={e => setForm({ ...form, date_end: e.target.value })} min={form.date_start} />
          </div>
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: '-12px', marginBottom: '16px' }}>Leave dates empty to make this requirement permanent/always applicable.</p>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Department</label>
            <select className="form-input" value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })} disabled={editing}>
              {departments.map(d => <option key={d.department_id} value={d.department_id}>{d.department_id} - {d.description || 'Dept'}</option>)}
              {departments.length === 0 && <option value="" disabled>No departments defined</option>}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Shift</label>
            <select className="form-input" value={form.shift_id} onChange={e => setForm({ ...form, shift_id: e.target.value })} disabled={editing}>
              {shifts.map(s => <option key={s.shift_id} value={s.shift_id}>{s.shift_id} - {s.description || 'Shift'}</option>)}
              {shifts.length === 0 && <option value="" disabled>No shifts defined</option>}
            </select>
          </div>
        </div>

        <div style={{ marginTop: '16px', marginBottom: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
          <label className="form-label" style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Staffing Requirements</span>
            {!editing && (
              <button 
                className="btn btn-sm btn-ghost" 
                onClick={() => setForm(f => ({
                  ...f, 
                  requirements: [...f.requirements, { required_grade: grades[0]?.grade_id || '', required_skill: '', minimum_staff: 1 }]
                }))}
              >
                + Add Role
              </button>
            )}
          </label>
          
          {form.requirements.map((req, idx) => (
            <div key={idx} style={{ 
              display: 'flex', 
              gap: '12px', 
              alignItems: 'flex-start',
              background: 'var(--bg-tertiary)', 
              padding: '12px', 
              borderRadius: 'var(--radius-md)',
              marginBottom: '12px' 
            }}>
              <div style={{ flex: 1.5 }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Required Grade</label>
                <select className="form-input" value={req.required_grade} onChange={e => {
                  const newReqs = [...form.requirements];
                  newReqs[idx].required_grade = e.target.value;
                  setForm({ ...form, requirements: newReqs });
                }}>
                  {grades.map(g => <option key={g.grade_id} value={g.grade_id}>{g.grade_id} - {g.description}</option>)}
                  {grades.length === 0 && <option value="" disabled>No grades defined</option>}
                </select>
              </div>
              
              <div style={{ flex: 1.5 }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Specific Skill (Optional)</label>
                <select className="form-input" value={req.required_skill} onChange={e => {
                  const newReqs = [...form.requirements];
                  newReqs[idx].required_skill = e.target.value;
                  setForm({ ...form, requirements: newReqs });
                }}>
                  <option value="">-- None --</option>
                  {skills.map(s => <option key={s.skill_id} value={s.skill_id}>{s.skill_id}</option>)}
                </select>
              </div>
              
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Headcount</label>
                <input type="number" className="form-input" value={req.minimum_staff} onChange={e => {
                  const newReqs = [...form.requirements];
                  newReqs[idx].minimum_staff = parseInt(e.target.value) || 1;
                  setForm({ ...form, requirements: newReqs });
                }} min={1} max={100} />
              </div>
              
              {!editing && form.requirements.length > 1 && (
                <button 
                  className="btn btn-danger btn-icon btn-sm" 
                  style={{ marginTop: '20px' }}
                  onClick={() => {
                    const newReqs = [...form.requirements];
                    newReqs.splice(idx, 1);
                    setForm({ ...form, requirements: newReqs });
                  }}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
