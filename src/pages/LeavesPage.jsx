import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSupabase, logAudit } from '../lib/supabase';
import Modal from '../components/Modal';
import { Plus, Trash2, CalendarHeart, Search, Clock, Info, ArrowUpDown } from 'lucide-react';

export default function LeavesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  
  // Date range form
  const [staffId, setStaffId] = useState('');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('Annual Leave');
  
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [sortField, setSortField] = useState('start_date');
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
    
    const [staffRes, leavesRes] = await Promise.all([
      supabase.from('staff').select('staff_id, name, department_id').order('name'),
      supabase.from('leave_requests').select('*').order('start_date', { ascending: false })
    ]);

    setStaff(staffRes.data || []);
    setItems(leavesRes.data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadData(); }, [loadData]);

  const openAdd = () => {
    setStaffId(staff.length > 0 ? staff[0].staff_id : '');
    setStartDate(new Date().toISOString().split('T')[0]);
    setEndDate(new Date().toISOString().split('T')[0]);
    setReason('Annual Leave');
    setModalOpen(true);
  };

  const getDaysArray = function(start, end) {
    const dates = [];
    let curr = new Date(start);
    const last = new Date(end);
    
    // ensure chronological
    if (curr > last) return [];

    while (curr <= last) {
      dates.push(new Date(curr).toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
    }
    return dates;
  };

  const save = async () => {
    if (!staffId) return;
    
    // Validate dates
    if (new Date(startDate) > new Date(endDate)) {
      alert("End Date must be after Start Date");
      return;
    }

    setSaving(true);
    const supabase = getSupabase(user.userId);
    
    // Create one entry for the range
    const record = {
      staff_id: staffId,
      start_date: startDate,
      end_date: endDate,
      leave_type: reason,
      status: 'Approved',
      user_id: user.userId
    };

    try {
      await supabase.from('leave_requests').insert([record]);
      await logAudit(user.userId, 'CREATE_LEAVE_REQUEST', { staff_id: staffId, dates: [startDate, endDate] });
      setModalOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      alert('Failed to save leave request. It might already exist for these specific dates.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item) => {
    if (!confirm(`Delete leave from ${item.start_date} for ${item.staff_id}?`)) return;
    const supabase = getSupabase(user.userId);
    await supabase.from('leave_requests').delete().eq('id', item.id);
    await logAudit(user.userId, 'DELETE_LEAVE_REQUEST', { staff_id: item.staff_id, date: item.start_date });
    loadData();
  };

  const getStaffName = (empId) => {
    const s = staff.find(staff => staff.staff_id === empId);
    return s ? s.name : empId;
  };

  const filtered = items.filter(i =>
    i.staff_id.toLowerCase().includes(search.toLowerCase()) ||
    getStaffName(i.staff_id).toLowerCase().includes(search.toLowerCase()) ||
    i.start_date.includes(search) ||
    (i.leave_type || '').toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];
    if (sortField === 'name') {
      aVal = getStaffName(a.staff_id);
      bVal = getStaffName(b.staff_id);
    } else if (sortField === 'department_id') {
      const sA = staff.find(st => st.staff_id === a.staff_id);
      const sB = staff.find(st => st.staff_id === b.staff_id);
      aVal = sA ? sA.department_id : '';
      bVal = sB ? sB.department_id : '';
    }
    
    if (!aVal) aVal = '';
    if (!bVal) bVal = '';
    
    const res = aVal.localeCompare(bVal, undefined, { numeric: true });
    return sortOrder === 'asc' ? res : -res;
  });

  return (
    <div>
      <div className="page-header">
        <h1>Leave Requests</h1>
        <p>Manage approved leave and unavailable days</p>
      </div>

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
        <span><strong>Hard Constraint:</strong> All leave requests are automatically approved. The solver must enforce the leave for the staff member on the specified dates.</span>
      </div>

      <div className="page-actions">
        <div className="search-bar" style={{ flex: 1 }}>
          <Search size={16} />
          <input className="form-input" placeholder="Search by name, ID, reason, or date..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 38 }} />
        </div>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={16} /> Add Leave</button>
      </div>

      {loading ? (
        <div className="empty-state"><p>Loading...</p></div>
      ) : filtered.length === 0 ? (
        <div className="card empty-state">
          <CalendarHeart size={48} />
          <h3>No time off recorded</h3>
          <p>These act as hard constraints ensuring a nurse isn't rostered</p>
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('staff_id')}>
                  Staff ID {sortField === 'staff_id' && <ArrowUpDown size={12} style={{marginLeft: 4, verticalAlign: 'middle'}}/>}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('name')}>
                  Name {sortField === 'name' && <ArrowUpDown size={12} style={{marginLeft: 4, verticalAlign: 'middle'}}/>}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('department_id')}>
                  Department {sortField === 'department_id' && <ArrowUpDown size={12} style={{marginLeft: 4, verticalAlign: 'middle'}}/>}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('start_date')}>
                  Date {sortField === 'start_date' && <ArrowUpDown size={12} style={{marginLeft: 4, verticalAlign: 'middle'}}/>}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('leave_type')}>
                  Reason {sortField === 'leave_type' && <ArrowUpDown size={12} style={{marginLeft: 4, verticalAlign: 'middle'}}/>}
                </th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>{item.staff_id}</td>
                  <td style={{ fontWeight: 500 }}>{getStaffName(item.staff_id)}</td>
                  <td>{staff.find(st => st.staff_id === item.staff_id)?.department_id || '—'}</td>
                  <td style={{ fontWeight: 600, fontFamily: 'monospace' }}>
                    {item.start_date} {item.start_date !== item.end_date ? `to ${item.end_date}` : ''}
                  </td>
                  <td>
                    <span className="badge" style={{ background: 'var(--bg-tertiary)' }}>{item.leave_type || 'UNAVAILABLE'}</span>
                  </td>
                  <td>
                    <span className="badge" style={{ background: 'var(--accent-success-subtle)', color: 'var(--accent-success)' }}>
                      {item.status || 'APPROVED'}
                    </span>
                  </td>
                  <td>
                    <div className="table-actions">
                      <button className="btn btn-danger btn-sm btn-icon" onClick={() => remove(item)}><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Record Time Off"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
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
        
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Start Date</label>
            <input type="date" className="form-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">End Date (Inclusive)</label>
            <input type="date" className="form-input" value={endDate} onChange={e => setEndDate(e.target.value)} min={startDate} />
          </div>
        </div>
        
        <div className="form-group">
          <label className="form-label">Reason / Type</label>
          <select className="form-input" value={reason} onChange={e => setReason(e.target.value)}>
            <option value="ANNUAL">Annual Leave / Vacation</option>
            <option value="SICK">Sick Leave / Medical</option>
            <option value="TRAINING">Study / Training</option>
            <option value="MATERNITY">Maternity / Paternity</option>
            <option value="UNPAID">Unpaid Leave</option>
            <option value="PREFERENCE">RDO Preference</option>
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
          <span>Note: Time off acts as a <strong>hard constraint</strong> during rostering.</span>
        </div>
      </Modal>
    </div>
  );
}
