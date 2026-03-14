import { useState } from 'react';

const COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#14b8a6', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#d946ef', '#ec4899', '#f43f5e', '#78716c',
  '#4A90D9', '#7B74D4', '#4ECDC4', '#FF6B6B',
  '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD',
];

export default function ColorPicker({ value, onChange }) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div
        className="color-swatch"
        style={{ backgroundColor: value || '#6366f1' }}
        onClick={() => setShowPicker(!showPicker)}
      />
      {showPicker && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 50 }}
            onClick={() => setShowPicker(false)}
          />
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 6,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-secondary)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 51,
            padding: 8,
          }}>
            <div className="color-picker-grid">
              {COLORS.map(c => (
                <div
                  key={c}
                  className={`color-picker-swatch ${c === value ? 'active' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => { onChange(c); setShowPicker(false); }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, padding: '0 4px' }}>
              <input
                type="text"
                className="form-input"
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                placeholder="#hex"
                style={{ fontSize: '0.75rem', padding: '6px 8px' }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
