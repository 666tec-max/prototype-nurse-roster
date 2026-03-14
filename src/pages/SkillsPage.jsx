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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {filtered.map(item => (
            <div key={item.id} className="card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="color-swatch" style={{ backgroundColor: item.colour, cursor: 'default', width: 36, height: 36, borderRadius: 'var(--radius-md)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{item.skill_id}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.description || 'No description'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(item)}><Pencil size={14} /></button>
                <button className="btn btn-danger btn-icon btn-sm" onClick={() => remove(item)}><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
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
          <input className="form-input" value={form.skill_id} onChange={e => setForm({ ...form, skill_id: e.target.value })} placeholder="e.g. ACLS" disabled={!!editing} />
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
