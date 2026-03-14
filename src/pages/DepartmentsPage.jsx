import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabase, logAudit } from '../lib/supabase';
import Modal from '../components/Modal';
import ColorPicker from '../components/ColorPicker';
import { Plus, Pencil, Trash2, Building2, Search } from 'lucide-react';

const EMPTY = { department_id: '', description: '', colour: '#4A90D9' };

export default function DepartmentsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const supabase = getSupabase(user.userId);
    const { data } = await supabase.from('departments').select('*').order('department_id');
    setItems(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm(EMPTY); setEditing(null); setModalOpen(true); };
  const openEdit = (item) => {
    setForm({ department_id: item.department_id, description: item.description || '', colour: item.colour || '#4A90D9' });
    setEditing(item);
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.department_id.trim()) return;
    setSaving(true);
    const supabase = getSupabase(user.userId);
    const record = { ...form, user_id: user.userId };

    if (editing) {
      await supabase.from('departments').update(record).eq('id', editing.id);
      await logAudit(user.userId, 'UPDATE_DEPARTMENT', { department_id: form.department_id });
    } else {
      await supabase.from('departments').insert(record);
      await logAudit(user.userId, 'CREATE_DEPARTMENT', { department_id: form.department_id });
    }

    setSaving(false);
    setModalOpen(false);
    load();
  };

  const remove = async (item) => {
    if (!confirm(`Delete department "${item.department_id}"?`)) return;
    const supabase = getSupabase(user.userId);
    await supabase.from('departments').delete().eq('id', item.id);
    await logAudit(user.userId, 'DELETE_DEPARTMENT', { department_id: item.department_id });
    load();
  };

  const filtered = items.filter(i =>
    i.department_id.toLowerCase().includes(search.toLowerCase()) ||
    (i.description || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <h1>Departments</h1>
        <p>Manage hospital departments</p>
      </div>

      <div className="page-actions">
        <div className="search-bar" style={{ flex: 1 }}>
          <Search size={16} />
          <input className="form-input" placeholder="Search departments..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 38 }} />
        </div>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Add Department</button>
      </div>

      {loading ? (
        <div className="empty-state"><p>Loading...</p></div>
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <Building2 size={48} />
          <h3>No departments yet</h3>
          <p>Create your first department to get started</p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Colour</th>
                <th>Department ID</th>
                <th>Description</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id}>
                  <td><div className="color-swatch" style={{ backgroundColor: item.colour, cursor: 'default' }} /></td>
                  <td style={{ fontWeight: 600 }}>{item.department_id}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{item.description || '—'}</td>
                  <td>
                    <div className="table-actions">
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openEdit(item)} title="Edit"><Pencil size={15} /></button>
                      <button className="btn btn-danger btn-sm btn-icon" onClick={() => remove(item)} title="Delete"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Department' : 'Add Department'}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </>}
      >
        <div className="form-group">
          <label className="form-label">Department ID</label>
          <input className="form-input" value={form.department_id} onChange={e => setForm({ ...form, department_id: e.target.value })} placeholder="e.g. ED" disabled={!!editing} />
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <input className="form-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="e.g. Emergency Department" />
        </div>
        <div className="form-group">
          <label className="form-label">Colour</label>
          <ColorPicker value={form.colour} onChange={c => setForm({ ...form, colour: c })} />
        </div>
      </Modal>
    </div>
  );
}
