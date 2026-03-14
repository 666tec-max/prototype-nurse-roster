import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabase, logAudit } from '../lib/supabase';
import Modal from '../components/Modal';
import ColorPicker from '../components/ColorPicker';
import { Plus, Pencil, Trash2, Clock, Search } from 'lucide-react';

const EMPTY = { shift_id: '', description: '', start_time: '07:00', end_time: '15:00', colour: '#FF6B6B' };

function calcDuration(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin <= startMin) endMin += 24 * 60; // overnight shift
  return endMin - startMin;
}

function formatDuration(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m > 0 ? `${m}m` : ''}`.trim();
}

export default function ShiftsPage() {
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
    const { data } = await supabase.from('shifts').select('*').order('shift_id');
    setItems(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm(EMPTY); setEditing(null); setModalOpen(true); };
  const openEdit = (item) => {
    setForm({
      shift_id: item.shift_id,
      description: item.description || '',
      start_time: item.start_time || '07:00',
      end_time: item.end_time || '15:00',
      colour: item.colour || '#FF6B6B',
    });
    setEditing(item);
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.shift_id.trim()) return;
    setSaving(true);
    const duration = calcDuration(form.start_time, form.end_time);
    const supabase = getSupabase(user.userId);
    const record = { ...form, duration_minutes: duration, user_id: user.userId };

    if (editing) {
      await supabase.from('shifts').update(record).eq('id', editing.id);
      await logAudit(user.userId, 'UPDATE_SHIFT', { shift_id: form.shift_id });
    } else {
      await supabase.from('shifts').insert(record);
      await logAudit(user.userId, 'CREATE_SHIFT', { shift_id: form.shift_id });
    }

    setSaving(false);
    setModalOpen(false);
    load();
  };

  const remove = async (item) => {
    if (!confirm(`Delete shift "${item.shift_id}"?`)) return;
    const supabase = getSupabase(user.userId);
    await supabase.from('shifts').delete().eq('id', item.id);
    await logAudit(user.userId, 'DELETE_SHIFT', { shift_id: item.shift_id });
    load();
  };

  const filtered = items.filter(i =>
    i.shift_id.toLowerCase().includes(search.toLowerCase()) ||
    (i.description || '').toLowerCase().includes(search.toLowerCase())
  );

  const previewDuration = calcDuration(form.start_time, form.end_time);

  return (
    <div>
      <div className="page-header">
        <h1>Shifts</h1>
        <p>Define shift types with start/end times</p>
      </div>

      <div className="page-actions">
        <div className="search-bar" style={{ flex: 1 }}>
          <Search size={16} />
          <input className="form-input" placeholder="Search shifts..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 38 }} />
        </div>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Add Shift</button>
      </div>

      {loading ? (
        <div className="empty-state"><p>Loading...</p></div>
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <Clock size={48} />
          <h3>No shifts yet</h3>
          <p>Define shifts like Morning, Evening, Night</p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Colour</th>
                <th>Shift ID</th>
                <th>Description</th>
                <th>Start</th>
                <th>End</th>
                <th>Duration</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id}>
                  <td><div className="color-swatch" style={{ backgroundColor: item.colour, cursor: 'default' }} /></td>
                  <td style={{ fontWeight: 600 }}>{item.shift_id}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{item.description || '—'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{item.start_time?.slice(0, 5) || '—'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{item.end_time?.slice(0, 5) || '—'}</td>
                  <td>
                    <span className="badge" style={{ background: 'var(--accent-info-subtle)', color: 'var(--accent-info)' }}>
                      {item.duration_minutes ? `${item.duration_minutes} min` : '—'}
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

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Shift' : 'Add Shift'}
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </>}
      >
        <div className="form-group">
          <label className="form-label">Shift ID</label>
          <input className="form-input" value={form.shift_id} onChange={e => setForm({ ...form, shift_id: e.target.value })} placeholder="e.g. N" disabled={!!editing} />
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <input className="form-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="e.g. Night Shift" />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Start Time</label>
            <input type="time" className="form-input" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">End Time</label>
            <input type="time" className="form-input" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} />
          </div>
        </div>
        {/* Duration preview */}
        <div style={{
          padding: '10px 14px',
          background: 'var(--accent-info-subtle)',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.85rem',
          color: 'var(--accent-info)',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <Clock size={16} />
          <span>Duration: <strong>{previewDuration} minutes</strong> ({formatDuration(previewDuration)})</span>
        </div>
        <div className="form-group">
          <label className="form-label">Colour</label>
          <ColorPicker value={form.colour} onChange={c => setForm({ ...form, colour: c })} />
        </div>
      </Modal>
    </div>
  );
}
