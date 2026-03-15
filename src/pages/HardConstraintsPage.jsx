import { Shield, CheckCircle2 } from 'lucide-react';

const CONSTRAINTS = [
  {
    name: 'Maximum One Shift Per Day',
    description: 'Staff cannot work more than one shift per day',
    icon: '🔒',
  },
  {
    name: 'No Overlapping Shifts',
    description: 'Shifts assigned to a staff member cannot overlap in time',
    icon: '🚫',
  },
  {
    name: 'Approved Leave Protection',
    description: 'Staff on approved leave cannot be scheduled for any shift',
    icon: '🏖️',
  },
  {
    name: 'Approved Shift Request',
    description: 'Staff with approved shift requests must be assigned their requested shift on that date',
    icon: '📋',
  },
  {
    name: 'Maximum Consecutive Shifts',
    description: 'Staff cannot exceed their configured maximum consecutive shift days (1–7)',
    icon: '📊',
  },
  {
    name: 'Maximum Shifts Per Week',
    description: 'Staff cannot exceed their configured maximum weekly shift count (1–6)',
    icon: '📅',
  },
  {
    name: 'Maximum Monthly Working Hours',
    description: 'Staff cannot exceed 196 working hours per month',
    icon: '⏱️',
  },
  {
    name: 'Night Shift Recovery',
    description: '1 night → 1 off | 2-3 nights → 2 off | 4 nights → 3 off | Max 4 consecutive nights',
    icon: '🌙',
  },
  {
    name: 'Grade Eligibility',
    description: 'Staff can fill roles requiring their own grade or any level below it',
    icon: '🎖️',
  },
];

export default function HardConstraintsPage() {
  return (
    <div>
      <div className="page-header">
        <h1>Hard Constraints</h1>
        <p>Rules that must always be satisfied during roster generation</p>
      </div>

      {/* Info banner */}
      <div style={{
        padding: '14px 18px',
        background: 'var(--accent-danger-subtle)',
        borderRadius: 'var(--radius-md)',
        fontSize: '0.85rem',
        color: 'var(--accent-danger)',
        marginBottom: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <Shield size={18} style={{ flexShrink: 0 }} />
        <span><strong>Hard constraints are non-negotiable.</strong> The scheduler will never violate these rules. If constraints cannot all be satisfied, the system will report a conflict.</span>
      </div>

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 48 }}></th>
              <th>Constraint</th>
              <th>Description</th>
              <th style={{ width: 80, textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {CONSTRAINTS.map((c, i) => (
              <tr key={i}>
                <td style={{ textAlign: 'center', fontSize: '1.2rem' }}>{c.icon}</td>
                <td style={{ fontWeight: 600 }}>{c.name}</td>
                <td style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{c.description}</td>
                <td style={{ textAlign: 'center' }}>
                  <CheckCircle2 size={20} style={{ color: 'var(--accent-success)' }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
