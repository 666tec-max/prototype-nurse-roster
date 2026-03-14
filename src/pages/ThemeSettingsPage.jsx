import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { logAudit } from '../lib/supabase';
import { Sun, Moon, Eye, Check } from 'lucide-react';

const THEME_META = {
  bright: {
    icon: Sun,
    label: 'Bright',
    desc: 'Clean and light for daytime use',
    preview: 'linear-gradient(135deg, #f5f7fb, #e8ecf4)',
  },
  dark: {
    icon: Moon,
    label: 'Dark',
    desc: 'Easy on the eyes in low light',
    preview: 'linear-gradient(135deg, #0f1117, #1a1d27)',
  },
  comfort: {
    icon: Eye,
    label: 'Eye Comfort',
    desc: 'Warm tones to reduce eye strain',
    preview: 'linear-gradient(135deg, #E6DFAF, #F9F6ED)',
  },
};

export default function ThemeSettingsPage() {
  const { currentTheme, setTheme } = useTheme();
  const { user } = useAuth();

  const handleSetTheme = async (key) => {
    await setTheme(key);
    await logAudit(user.userId, 'CHANGE_THEME', { theme: key });
  };

  return (
    <div>
      <div className="page-header">
        <h1>Theme Settings</h1>
        <p>Choose your preferred visual theme</p>
      </div>

      <div className="theme-grid">
        {Object.entries(THEME_META).map(([key, meta]) => {
          const Icon = meta.icon;
          const isActive = currentTheme === key;

          return (
            <div
              key={key}
              className={`theme-card ${isActive ? 'active' : ''}`}
              onClick={() => handleSetTheme(key)}
            >
              <div className="theme-preview" style={{ background: meta.preview }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 6 }}>
                <Icon size={18} />
                <span style={{ fontWeight: 600 }}>{meta.label}</span>
                {isActive && <Check size={16} style={{ color: 'var(--accent-success)' }} />}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{meta.desc}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
