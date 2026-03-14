import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabase, logAudit } from '../lib/supabase';
import Modal from '../components/Modal';
import { Plus, Trash2, CalendarClock, Search, Clock, Info, ArrowUpDown } from 'lucide-react';

export default function ShiftRequestsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [staff, setStaff] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const [staffId, setStaffId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [shiftId, setShiftId] = useState('');

  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [sortField, setSortField] = useState('date');
  const [sortOrder, setSortOrder] = useState('desc');

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

    const [staffRes, shiftsRes, reqRes] = await Promise.all([
      supabase.from('staff').select('staff_id, name').order('name'),
      supabase.from('shifts').select('shift_id, description, colour').order('start_time'),
      supabase.from('fixed_assignments').select('*').order('date', { ascending: false })
    ]);

    setStaff(staffRes.data || []);
    setShifts(shiftsRes.data || []);
    setItems(reqRes.data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const openAdd = () => {
    setStaffId(staff.length > 0 ? staff[0].staff_id : '');
    setDate(new Date().toISOString().split('T')[0]);
    setShiftId(shifts.length > 0 ? shifts[0].shift_id : '');
    setModalOpen(true);
  };

  const save = async () => {
    if (!staffId || !shiftId || !date) return;
    setSaving(true);
    const supabase = getSupabase(user.userId);

    try {
      await supabase.from('fixed_assignments').insert({
        staff_id: staffId,
        date,
        shift_id: shiftId,
        user_id: user.userId
      });
      await logAudit(user.userId, 'CREATE_SHIFT_REQUEST', { staff_id: staffId, date, shift_id: shiftId });
      setModalOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      alert('Failed to save shift request. A duplicate may already exist.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item) => {
    if (!confirm(`Delete shift request for ${item.staff_id} on ${item.date}?`)) return;
    const supabase = getSupabase(user.userId);
    await supabase.from('fixed_assignments').delete().eq('id', item.id);
    await logAudit(user.userId, 'DELETE_SHIFT_REQUEST', { staff_id: item.staff_id, date: item.date });
    loadData();
  };

  const getStaffName = (id) => {
    const s = staff.find(st => st.staff_id === id);
    return s ? s.name : id;
  };

  const getShiftInfo = (id) => {
    return shifts.find(s => s.shift_id === id);
  };

  const filtered = items.filter(i =>
    i.staff_id.toLowerCase().includes(search.toLowerCase()) ||
    getStaffName(i.staff_id).toLowerCase().includes(search.toLowerCase()) ||
    i.date.includes(search) ||
    i.shift_id.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];
    if (sortField === 'name') {
      aVal = getStaffName(a.staff_id);
      bVal = getStaffName(b.staff_id);
    }
    if (!aVal) aVal = '';
    if (!bVal) bVal = '';
    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  return (
    <div>
      <div className="page-header">
        <h1>Staff Shift Requests</h1>
        <p>Manage specific shift requests — automatically approved as hard constraints</p>
      </div>

      <div className="page-actions">
        <div className="search-bar" style={{ flex: 1 }}>
          <Search size={16} />
          <input className="form-input" placeholder="Search by name, date, or shift..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 38 }} />
        </div>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Add Request</button>
      </div>

      {/* Hard constraint info banner */}
      <div style={{
        padding: '12px 16px',
        background: 'var(--accent-info-subtle)',
        borderRadius: 'var(--radius-md)',
        fontSize: '0.85rem',
        color: 'var(--accent-info)',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <Info size={18} style={{ flexShrink: 0 }} />
        <span><strong>Hard Constraint:</strong> All shift requests are automatically approved. The solver must assign the requested shift to the staff member on the specified date.</span>
      </div>

      {loading ? (
        <div className="empty-state"><p>Loading...</p></div>
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <CalendarClock size={48} />
          <h3>No shift requests yet</h3>
          <p>Staff can request specific shifts on specific dates</p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('name')}>
                  Staff {sortField === 'name' && <ArrowUpDown size={12} style={{marginLeft: 4, verticalAlign: 'middle'}}/>}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('date')}>
                  Date {sortField === 'date' && <ArrowUpDown size={12} style={{marginLeft: 4, verticalAlign: 'middle'}}/>}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('shift_id')}>
                  Requested Shift {sortField === 'shift_id' && <ArrowUpDown size={12} style={{marginLeft: 4, verticalAlign: 'middle'}}/>}
                </th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const shiftInfo = getShiftInfo(item.shift_id);
                return (
                  <tr key={item.id}>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 500 }}>{getStaffName(item.staff_id)}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{item.staff_id}</span>
                      </div>
                    </td>
                    <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{item.date}</td>
                    <td>
                      <span className="badge" style={{
                        background: shiftInfo?.colour || 'var(--bg-tertiary)',
                        color: shiftInfo?.colour ? '#fff' : 'var(--text-primary)',
                        border: 'none'
                      }}>
                        {item.shift_id}{shiftInfo?.description ? ` — ${shiftInfo.description}` : ''}
                      </span>
                    </td>
                    <td>
                      <span className="badge" style={{ background: 'var(--accent-success-subtle)', color: 'var(--accent-success)' }}>
                        Approved
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button className="btn btn-danger btn-sm btn-icon" onClick={() => remove(item)}><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Add Shift Request"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Request'}</button>
        </>}
      >
        <div className="form-group">
          <label className="form-label">Staff Member</label>
          <select className="form-input" value={staffId} onChange={e => setStaffId(e.target.value)}>
            {staff.map(s => (
              <option key={s.staff_id} value={s.staff_id}>{s.name} ({s.staff_id})</option>
            ))}
            {staff.length === 0 && <option value="" disabled>No staff defined yet</option>}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Date</label>
          <input type="date" className="form-input" value={date} onChange={e => setDate(e.target.value)} />
        </div>

        <div className="form-group">
          <label className="form-label">Requested Shift</label>
          <select className="form-input" value={shiftId} onChange={e => setShiftId(e.target.value)}>
            {shifts.map(s => (
              <option key={s.shift_id} value={s.shift_id}>{s.shift_id}{s.description ? ` — ${s.description}` : ''}</option>
            ))}
            {shifts.length === 0 && <option value="" disabled>No shifts defined yet</option>}
          </select>
        </div>

        <div style={{
          padding: '10px 14px',
          background: 'var(--accent-warning-subtle)',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.85rem',
          color: 'var(--accent-warning)',
          marginTop: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          <Clock size={16} />
          <span>This request will be treated as a <strong>hard constraint</strong> during roster generation.</span>
        </div>
      </Modal>
    </div>
  );
}
