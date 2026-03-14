import { X } from 'lucide-react';

export default function Modal({ isOpen, onClose, title, children, footer, width }) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={width ? { maxWidth: width } : undefined}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
