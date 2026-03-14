import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabase, logAudit } from '../lib/supabase';
import Modal from '../components/Modal';
import { Plus, Trash2, LayoutList, Filter } from 'lucide-react';

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

  const [filterDept, setFilterDept] = useState('');

  const [form, setForm] = useState({
    date_start: new Date().toISOString().split('T')[0],
    date_end: '',
    department_id: '',
    shift_id: '',
    required_grade: '',
    required_skill: '',
    minimum_staff: 1
  });

  const loadData = useCallback(async () => {
    if (!user) return;
    const supabase = getSupabase(user.userId);

    const [deptRes, shiftRes, gradeRes, skillRes, demandRes] = await Promise.all([
      supabase.from('departments').select('department_id, description'),
      supabase.from('shifts').select('shift_id, description').order('start_time'),
      supabase.from('grades').select('grade_id, description'),
      supabase.from('skills').select('skill_id, description'),
      supabase.from('demand').select('*').order('date_start', { ascending: false }).order('department_id').order('shift_id')
    ]);

    setDepartments(deptRes.data || []);
    setShifts(shiftRes.data || []);
    setGrades(gradeRes.data || []);
    setSkills(skillRes.data || []);
    setItems(demandRes.data || []);

    if (!form.department_id && deptRes.data?.length > 0) form.department_id = deptRes.data[0].department_id;
    if (!form.shift_id && shiftRes.data?.length > 0) form.shift_id = shiftRes.data[0].shift_id;
    if (!form.required_grade && gradeRes.data?.length > 0) form.required_grade = gradeRes.data[0].grade_id;

    setLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const openAdd = () => {
    const today = new Date().toISOString().split('T')[0];
    setForm(prev => ({
      ...prev,
      date_start: today,
      date_end: today,
      department_id: filterDept || departments[0]?.department_id || '',
      minimum_staff: 1
    }));
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.department_id || !form.shift_id || !form.required_grade) return;
    if (!form.date_start || !form.date_end) return;
    if (new Date(form.date_start) > new Date(form.date_end)) {
      alert('End Date must be on or after Start Date.');
      return;
    }
    setSaving(true);

    const supabase = getSupabase(user.userId);
    const record = {
      date_start: form.date_start,
      date_end: form.date_end,
      department_id: form.department_id,
      shift_id: form.shift_id,
      required_grade: form.required_grade,
      required_skill: form.required_skill || null,
      minimum_staff: form.minimum_staff,
      user_id: user.userId
    };

    try {
      await supabase.from('demand').insert(record);
      await logAudit(user.userId, 'CREATE_DEMAND', {
        date_start: record.date_start, date_end: record.date_end,
        dept: record.department_id, shift: record.shift_id, grade: record.required_grade
      });
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

  // Group by department -> shift
  const getGroupedData = () => {
    const groups = {};
    filtered.forEach(item => {
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
                                {req.date_start}{req.date_end && req.date_end !== req.date_start ? ` → ${req.date_end}` : ''}
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

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Add Staffing Requirement"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Add Requirement'}</button>
        </>}
      >
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Start Date</label>
            <input type="date" className="form-input" value={form.date_start} onChange={e => setForm({ ...form, date_start: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">End Date</label>
            <input type="date" className="form-input" value={form.date_end} onChange={e => setForm({ ...form, date_end: e.target.value })} min={form.date_start} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Department</label>
            <select className="form-input" value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })}>
              {departments.map(d => <option key={d.department_id} value={d.department_id}>{d.department_id} - {d.description || 'Dept'}</option>)}
              {departments.length === 0 && <option value="" disabled>No departments defined</option>}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Shift</label>
            <select className="form-input" value={form.shift_id} onChange={e => setForm({ ...form, shift_id: e.target.value })}>
              {shifts.map(s => <option key={s.shift_id} value={s.shift_id}>{s.shift_id} - {s.description || 'Shift'}</option>)}
              {shifts.length === 0 && <option value="" disabled>No shifts defined</option>}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Required Grade</label>
            <select className="form-input" value={form.required_grade} onChange={e => setForm({ ...form, required_grade: e.target.value })}>
              {grades.map(g => <option key={g.grade_id} value={g.grade_id}>{g.grade_id} - {g.description}</option>)}
              {grades.length === 0 && <option value="" disabled>No grades defined</option>}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Required Count</label>
            <input type="number" className="form-input" value={form.minimum_staff} onChange={e => setForm({ ...form, minimum_staff: parseInt(e.target.value) || 1 })} min={1} max={100} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Specific Skill Required (Optional)</label>
          <select className="form-input" value={form.required_skill || ''} onChange={e => setForm({ ...form, required_skill: e.target.value || null })}>
            <option value="">-- No specific skill required --</option>
            {skills.map(s => <option key={s.skill_id} value={s.skill_id}>{s.skill_id} - {s.description}</option>)}
          </select>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: 4 }}>
            Only assign if the role absolutely requires a certification (e.g. Triage).
          </div>
        </div>
      </Modal>
    </div>
  );
}
