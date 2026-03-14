import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabase, logAudit } from '../lib/supabase';
import Modal from '../components/Modal';
import ColorPicker from '../components/ColorPicker';
import { Plus, Pencil, Trash2, Award, Search, GripVertical, ArrowUp, ArrowDown } from 'lucide-react';

const EMPTY = { grade_id: '', description: '', colour: '#7B74D4', hierarchy_level: 0 };

export default function GradesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState('table'); // 'table' or 'pyramid'

  const load = useCallback(async () => {
    if (!user) return;
    const supabase = getSupabase(user.userId);
    const { data } = await supabase.from('grades').select('*').order('hierarchy_level', { ascending: true });
    setItems(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    const maxLevel = items.length > 0 ? Math.max(...items.map(i => i.hierarchy_level)) + 1 : 0;
    setForm({ ...EMPTY, hierarchy_level: maxLevel });
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setForm({ grade_id: item.grade_id, description: item.description || '', colour: item.colour || '#7B74D4', hierarchy_level: item.hierarchy_level });
    setEditing(item);
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.grade_id.trim()) return;
    setSaving(true);
    const supabase = getSupabase(user.userId);
    const record = { ...form, user_id: user.userId };

    if (editing) {
      await supabase.from('grades').update(record).eq('id', editing.id);
      await logAudit(user.userId, 'UPDATE_GRADE', { grade_id: form.grade_id });
    } else {
      await supabase.from('grades').insert(record);
      await logAudit(user.userId, 'CREATE_GRADE', { grade_id: form.grade_id });
    }

    setSaving(false);
    setModalOpen(false);
    load();
  };

  const remove = async (item) => {
    if (!confirm(`Delete grade "${item.grade_id}"?`)) return;
    const supabase = getSupabase(user.userId);
    await supabase.from('grades').delete().eq('id', item.id);
    await logAudit(user.userId, 'DELETE_GRADE', { grade_id: item.grade_id });
    load();
  };

  const moveGrade = async (item, direction) => {
    const supabase = getSupabase(user.userId);
    const sorted = [...items].sort((a, b) => a.hierarchy_level - b.hierarchy_level);
    const idx = sorted.findIndex(i => i.id === item.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const a = sorted[idx];
    const b = sorted[swapIdx];
    await supabase.from('grades').update({ hierarchy_level: b.hierarchy_level }).eq('id', a.id);
    await supabase.from('grades').update({ hierarchy_level: a.hierarchy_level }).eq('id', b.id);
    load();
  };

  const filtered = items.filter(i =>
    i.grade_id.toLowerCase().includes(search.toLowerCase()) ||
    (i.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const sortedForPyramid = [...items].sort((a, b) => a.hierarchy_level - b.hierarchy_level);

  return (
    <div>
      <div className="page-header">
        <h1>Grades</h1>
        <p>Manage seniority levels and hierarchy</p>
      </div>

      <div className="page-actions">
        <div className="search-bar" style={{ flex: 1 }}>
          <Search size={16} />
          <input className="form-input" placeholder="Search grades..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 38 }} />
        </div>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: 3 }}>
          <button className={`btn btn-sm ${view === 'table' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('table')}>Table</button>
          <button className={`btn btn-sm ${view === 'pyramid' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setView('pyramid')}>Pyramid</button>
        </div>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Add Grade</button>
      </div>

      {loading ? (
        <div className="empty-state"><p>Loading...</p></div>
      ) : items.length === 0 ? (
        <div className="card empty-state">
          <Award size={48} />
          <h3>No grades yet</h3>
          <p>Create your first grade to define the seniority hierarchy</p>
        </div>
      ) : view === 'pyramid' ? (
        <div className="card">
          <div style={{ textAlign: 'center', marginBottom: 12, fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
            Higher positions = more senior. Use arrows to reorder.
          </div>
          <div className="pyramid-container">
            {sortedForPyramid.map((item, idx) => {
              const total = sortedForPyramid.length;
              const minWidth = 120;
              const maxWidth = 400;
              const width = minWidth + ((maxWidth - minWidth) * (idx / Math.max(total - 1, 1)));
              return (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => moveGrade(item, 'up')} disabled={idx === 0}><ArrowUp size={14} /></button>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => moveGrade(item, 'down')} disabled={idx === total - 1}><ArrowDown size={14} /></button>
                  </div>
                  <div className="pyramid-level" style={{ backgroundColor: item.colour, width }}>
                    <span>{item.grade_id} — {item.description}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 2 }}>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(item)}><Pencil size={14} /></button>
                    <button className="btn btn-danger btn-icon btn-sm" onClick={() => remove(item)}><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Colour</th>
                <th>Grade ID</th>
                <th>Description</th>
                <th>Hierarchy Level</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id}>
                  <td><div className="color-swatch" style={{ backgroundColor: item.colour, cursor: 'default' }} /></td>
                  <td style={{ fontWeight: 600 }}>{item.grade_id}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{item.description || '—'}</td>
                  <td>
                    <span className="badge" style={{ background: 'var(--accent-primary-subtle)', color: 'var(--accent-primary)' }}>
                      Level {item.hierarchy_level}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(item)}><Pencil size={15} /></button>
                      <button className="btn btn-danger btn-sm btn-icon" onClick={() => remove(item)}><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Grade' : 'Add Grade'}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </>}
      >
        <div className="form-group">
          <label className="form-label">Grade ID</label>
          <input className="form-input" value={form.grade_id} onChange={e => setForm({ ...form, grade_id: e.target.value })} placeholder="e.g. NM" disabled={!!editing} />
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <input className="form-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="e.g. Nurse Manager" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Colour</label>
            <ColorPicker value={form.colour} onChange={c => setForm({ ...form, colour: c })} />
          </div>
          <div className="form-group">
            <label className="form-label">Hierarchy Level</label>
            <input type="number" className="form-input" value={form.hierarchy_level} onChange={e => setForm({ ...form, hierarchy_level: parseInt(e.target.value) || 0 })} min={0} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
