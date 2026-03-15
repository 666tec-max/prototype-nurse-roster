import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabase, logAudit } from '../lib/supabase';
import Modal from '../components/Modal';
import { Plus, Pencil, Trash2, Users, Search, X, Eye, ArrowUpDown } from 'lucide-react';

const EMPTY = {
  staff_id: '',
  name: '',
  ic_number: '',
  phone: '',
  email: '',
  department_id: '',
  grade: '',
  max_shifts_per_week: null,
  max_consecutive_shifts: null,
  skills: []
};

export default function StaffPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [grades, setGrades] = useState([]);
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  
  const [sortField, setSortField] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const loadData = useCallback(async () => {
    if (!user) return;
    const supabase = getSupabase(user.userId);

    const [deptRes, gradesRes, skillsRes, staffRes, staffSkillsRes] = await Promise.all([
      supabase.from('departments').select('*').order('department_id'),
      supabase.from('grades').select('*').order('hierarchy_level', { ascending: true }),
      supabase.from('skills').select('*').order('skill_id'),
      supabase.from('staff').select('*').order('name'),
      supabase.from('staff_skills').select('staff_id, skill_id')
    ]);

    setDepartments(deptRes.data || []);
    setGrades(gradesRes.data || []);
    setSkills(skillsRes.data || []);

    const staffList = staffRes.data || [];
    const staffSkills = staffSkillsRes.data || [];

    const merged = staffList.map(emp => ({
      ...emp,
      skills: staffSkills.filter(ss => ss.staff_id === emp.staff_id).map(ss => ss.skill_id)
    }));

    setItems(merged);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const openAdd = () => {
    setForm({
      ...EMPTY,
      department_id: departments.length > 0 ? departments[0].department_id : '',
      grade: grades.length > 0 ? grades[0].grade_id : '',
    });
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setForm({
      staff_id: item.staff_id,
      name: item.name,
      ic_number: item.ic_number || '',
      phone: item.phone || '',
      email: item.email || '',
      department_id: item.department_id || '',
      grade: item.grade_id,
      max_shifts_per_week: item.max_shifts_per_week || null,
      max_consecutive_shifts: item.max_consecutive_shifts || null,
      skills: item.skills || []
    });
    setEditing(item);
    setModalOpen(true);
  };

  const toggleSkill = (skillId) => {
    setForm(prev => {
      const skills = prev.skills.includes(skillId)
        ? prev.skills.filter(s => s !== skillId)
        : [...prev.skills, skillId];
      return { ...prev, skills };
    });
  };

  const save = async () => {
    if (!form.staff_id.trim() || !form.name.trim() || !form.grade) return;
    setSaving(true);
    const supabase = getSupabase(user.userId);

    const staffRecord = {
      staff_id: form.staff_id,
      name: form.name,
      ic_number: form.ic_number || null,
      phone: form.phone || null,
      email: form.email || null,
      department_id: form.department_id || null,
      grade_id: form.grade,
      max_shifts_per_week: form.max_shifts_per_week,
      max_consecutive_shifts: form.max_consecutive_shifts,
      user_id: user.userId
    };

    try {
      if (editing) {
        await supabase.from('staff').update(staffRecord).eq('id', editing.id);
        await supabase.from('staff_skills').delete().eq('staff_id', form.staff_id);
      } else {
        await supabase.from('staff').insert(staffRecord);
      }

      if (form.skills.length > 0) {
        const skillRecords = form.skills.map(skillId => ({
          staff_id: form.staff_id,
          skill_id: skillId,
          user_id: user.userId
        }));
        await supabase.from('staff_skills').insert(skillRecords);
      }

      await logAudit(user.userId, editing ? 'UPDATE_STAFF' : 'CREATE_STAFF', { staff_id: form.staff_id });

      setModalOpen(false);
      loadData();
    } catch (err) {
      console.error('Error saving staff:', err);
      alert('Failed to save staff member. Ensure Employee ID is unique.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item) => {
    if (!confirm(`Delete staff member "${item.name}"?`)) return;
    const supabase = getSupabase(user.userId);
    await supabase.from('staff').delete().eq('id', item.id);
    await logAudit(user.userId, 'DELETE_STAFF', { staff_id: item.staff_id });
    loadData();
  };

  const filtered = items.filter(i =>
    i.staff_id.toLowerCase().includes(search.toLowerCase()) ||
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    (i.department_id && i.department_id.toLowerCase().includes(search.toLowerCase())) ||
    (i.grade_id && i.grade_id.toLowerCase().includes(search.toLowerCase()))
  ).sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];
    
    if (!aVal) aVal = '';
    if (!bVal) bVal = '';

    const res = aVal.localeCompare(bVal, undefined, { numeric: true });
    return sortOrder === 'asc' ? res : -res;
  });

  const getGradeColor = (gradeId) => {
    const grade = grades.find(g => g.grade_id === gradeId);
    return grade ? grade.colour : 'var(--border-color)';
  };

  const getSkillColor = (skillId) => {
    const skill = skills.find(s => s.skill_id === skillId);
    return skill ? skill.colour : 'var(--text-secondary)';
  };

  const getDeptName = (deptId) => {
    const d = departments.find(dep => dep.department_id === deptId);
    return d ? (d.description || deptId) : deptId || '—';
  };

  return (
    <div>
      <div className="page-header">
        <h1>Staff Management</h1>
        <p>Manage nurses, skills, and scheduling constraints</p>
      </div>

      <div className="page-actions">
        <div className="search-bar" style={{ flex: 1 }}>
          <Search size={16} />
          <input className="form-input" placeholder="Search by name, ID, department, or grade..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 38 }} />
        </div>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Add Staff</button>
      </div>

      {loading ? (
        <div className="empty-state"><p>Loading...</p></div>
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <Users size={48} />
          <h3>No staff yet</h3>
          <p>Add your nursing team members here</p>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 20 }}>
          <div className="data-table-wrapper" style={{ flex: 1 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('staff_id')}>Staff ID {sortField === 'staff_id' && <ArrowUpDown size={12} style={{marginLeft: 4, verticalAlign: 'middle'}}/>}</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('name')}>Name {sortField === 'name' && <ArrowUpDown size={12} style={{marginLeft: 4, verticalAlign: 'middle'}}/>}</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('department_id')}>Department {sortField === 'department_id' && <ArrowUpDown size={12} style={{marginLeft: 4, verticalAlign: 'middle'}}/>}</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('grade_id')}>Grade {sortField === 'grade_id' && <ArrowUpDown size={12} style={{marginLeft: 4, verticalAlign: 'middle'}}/>}</th>
                  <th>Skills</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr
                    key={item.id}
                    onClick={() => setDetailItem(item)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{item.staff_id}</td>
                    <td style={{ fontWeight: 500 }}>{item.name}</td>
                    <td>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                        {getDeptName(item.department_id)}
                      </span>
                    </td>
                    <td>
                      <span className="badge" style={{ backgroundColor: getGradeColor(item.grade_id), color: '#fff', border: 'none' }}>
                        {item.grade_id || '—'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {item.skills?.length > 0 ? item.skills.map(s => (
                          <span key={s} className="badge" style={{ fontSize: '0.7rem', border: `1px solid ${getSkillColor(s)}`, color: getSkillColor(s), background: 'transparent' }}>
                            {s}
                          </span>
                        )) : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                      </div>
                    </td>
                    <td>
                      <div className="table-actions" onClick={e => e.stopPropagation()}>
                        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(item)}><Pencil size={15} /></button>
                        <button className="btn btn-danger btn-sm btn-icon" onClick={() => remove(item)}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Detail Panel */}
          {detailItem && (
            <div className="card" style={{ width: 320, flexShrink: 0, padding: 0, alignSelf: 'flex-start', position: 'sticky', top: 32 }}>
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-primary)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Staff Details</h3>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setDetailItem(null)}><X size={16} /></button>
              </div>
              <div style={{ padding: '20px' }}>
                <div style={{ marginBottom: 20, textAlign: 'center' }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%',
                    background: 'var(--accent-primary-subtle)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 10px',
                    color: 'var(--accent-primary)', fontWeight: 700, fontSize: '1.2rem',
                  }}>
                    {detailItem.name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{detailItem.name}</div>
                  <div style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>{detailItem.staff_id}</div>
                </div>

                {[
                  { label: 'IC Number', value: detailItem.ic_number },
                  { label: 'Phone', value: detailItem.phone },
                  { label: 'Email', value: detailItem.email },
                  { label: 'Department', value: getDeptName(detailItem.department_id) },
                  { label: 'Grade', value: detailItem.grade_id },
                  { label: 'Max Shifts/Week', value: detailItem.max_shifts_per_week || 5 },
                  { label: 'Max Consecutive', value: detailItem.max_consecutive_shifts || 4 },
                ].map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-primary)', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
                    <span style={{ fontWeight: 500 }}>{value || '—'}</span>
                  </div>
                ))}

                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: 8 }}>Skills</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {detailItem.skills?.length > 0 ? detailItem.skills.map(s => (
                      <span key={s} className="badge" style={{ border: `1px solid ${getSkillColor(s)}`, color: getSkillColor(s), background: 'transparent' }}>{s}</span>
                    )) : <span style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>No skills assigned</span>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Staff Member' : 'Add Staff Member'}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </>}
      >
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Staff ID</label>
            <input className="form-input" value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })} placeholder="e.g. EMP001" disabled={!!editing} />
          </div>
          <div className="form-group" style={{ flex: 2 }}>
            <label className="form-label">Full Name</label>
            <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Jane Doe" />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">IC Number</label>
            <input className="form-input" value={form.ic_number} onChange={e => setForm({ ...form, ic_number: e.target.value })} placeholder="e.g. 900101-01-1234" />
          </div>
          <div className="form-group">
            <label className="form-label">Phone</label>
            <input className="form-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="e.g. 012-3456789" />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Email</label>
          <input type="email" className="form-input" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="e.g. jane@hospital.com" />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Department</label>
            <select className="form-input" value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })}>
              <option value="">-- Select Department --</option>
              {departments.map(d => (
                <option key={d.department_id} value={d.department_id}>{d.department_id} - {d.description || 'Dept'}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Grade</label>
            <select className="form-input" value={form.grade} onChange={e => setForm({ ...form, grade: e.target.value })}>
              {grades.map(g => (
                <option key={g.grade_id} value={g.grade_id}>{g.grade_id} - {g.description}</option>
              ))}
              {grades.length === 0 && <option value="" disabled>No grades defined yet</option>}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Skills & Certifications</label>
          {skills.length === 0 ? (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', padding: '8px 0' }}>No skills defined yet. Add them in the Skills menu.</div>
          ) : (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {skills.map(s => {
                const active = form.skills.includes(s.skill_id);
                return (
                  <button
                    key={s.skill_id}
                    onClick={() => toggleSkill(s.skill_id)}
                    className="badge"
                    style={{
                      cursor: 'pointer',
                      border: `1px solid ${s.colour}`,
                      background: active ? s.colour : 'transparent',
                      color: active ? '#fff' : s.colour,
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-full)'
                    }}
                  >
                    {s.skill_id}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '20px 0' }} />
        <h4 style={{ margin: '0 0 4px 0', fontSize: '0.95rem' }}>Labour Constraints (Optional)</h4>
        <p style={{ margin: '0 0 16px 0', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Leave unselected to use system defaults (Max 6 shifts/week, Max 6 consecutive shifts).</p>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Max Shifts / Week (1–6)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[1, 2, 3, 4, 5, 6].map(num => (
                <button
                  key={`ms-${num}`}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, max_shifts_per_week: f.max_shifts_per_week === num ? null : num }))}
                  style={{
                    width: 32, height: 32, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid',
                    borderColor: form.max_shifts_per_week === num ? 'var(--accent-primary)' : 'var(--border-color)',
                    background: form.max_shifts_per_week === num ? 'var(--accent-primary)' : 'transparent',
                    color: form.max_shifts_per_week === num ? '#fff' : 'inherit',
                    cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500
                  }}
                >{num}</button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Max Consecutive Shifts (1–7)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[1, 2, 3, 4, 5, 6, 7].map(num => (
                <button
                  key={`mc-${num}`}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, max_consecutive_shifts: f.max_consecutive_shifts === num ? null : num }))}
                  style={{
                    width: 32, height: 32, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid',
                    borderColor: form.max_consecutive_shifts === num ? 'var(--accent-primary)' : 'var(--border-color)',
                    background: form.max_consecutive_shifts === num ? 'var(--accent-primary)' : 'transparent',
                    color: form.max_consecutive_shifts === num ? '#fff' : 'inherit',
                    cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500
                  }}
                >{num}</button>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
