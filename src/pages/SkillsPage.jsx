import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabase, logAudit } from '../lib/supabase';
import Modal from '../components/Modal';
import ColorPicker from '../components/ColorPicker';
import { Plus, Pencil, Trash2, Sparkles, Search } from 'lucide-react';

const EMPTY = { skill_id: '', description: '', colour: '#4ECDC4' };

export default function SkillsPage() {
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
    const { data } = await supabase.from('skills').select('*').order('skill_id');
    setItems(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm(EMPTY); setEditing(null); setModalOpen(true); };
  const openEdit = (item) => {
    setForm({ skill_id: item.skill_id, description: item.description || '', colour: item.colour || '#4ECDC4' });
    setEditing(item);
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.skill_id.trim()) return;
    setSaving(true);
    const supabase = getSupabase(user.userId);
    const record = { ...form, user_id: user.userId };

    if (editing) {
      await supabase.from('skills').update(record).eq('id', editing.id);
      await logAudit(user.userId, 'UPDATE_SKILL', { skill_id: form.skill_id });
    } else {
      await supabase.from('skills').insert(record);
      await logAudit(user.userId, 'CREATE_SKILL', { skill_id: form.skill_id });
    }

    setSaving(false);
    setModalOpen(false);
    load();
  };

  const remove = async (item) => {
    if (!confirm(`Delete skill "${item.skill_id}"?`)) return;
    const supabase = getSupabase(user.userId);
    await supabase.from('skills').delete().eq('id', item.id);
    await logAudit(user.userId, 'DELETE_SKILL', { skill_id: item.skill_id });
    load();
  };

  const filtered = items.filter(i =>
    i.skill_id.toLowerCase().includes(search.toLowerCase()) ||
    (i.description || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="page-header">
        <h1>Skills</h1>
        <p>Define clinical capabilities and certifications</p>
      </div>

      <div className="page-actions">
        <div className="search-bar" style={{ flex: 1 }}>
          <Search size={16} />
          <input className="form-input" placeholder="Search skills..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 38 }} />
        </div>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Add Skill</button>
      </div>

      {loading ? (
        <div className="empty-state"><p>Loading...</p></div>
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <Sparkles size={48} />
          <h3>No skills yet</h3>
          <p>Define clinical skills like ACLS, PALS, ICU, etc.</p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Colour</th>
                <th>Skill ID</th>
                <th>Description</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id}>
                  <td><div className="color-swatch" style={{ backgroundColor: item.colour, cursor: 'default' }} /></td>
                  <td style={{ fontWeight: 600 }}>{item.skill_id}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{item.description || '—'}</td>
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

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Skill' : 'Add Skill'}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </>}
      >
        <div className="form-group">
          <label className="form-label">Skill ID</label>
          <input className="form-input" value={form.skill_id} onChange={e => setForm({ ...form, skill_id: e.target.value })} placeholder="e.g. ACLS" />
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <input className="form-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="e.g. Advanced Cardiac Life Support" />
        </div>
        <div className="form-group">
          <label className="form-label">Colour</label>
          <ColorPicker value={form.colour} onChange={c => setForm({ ...form, colour: c })} />
        </div>
      </Modal>
    </div>
  );
}
