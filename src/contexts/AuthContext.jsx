import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getPublicSupabase, getSupabase, logAudit } from '../lib/supabase';

const AuthContext = createContext(null);

const SESSION_KEY = 'nrs_session';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setUser(parsed);
      } catch {
        localStorage.removeItem(SESSION_KEY);
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (userId, password) => {
    const supabase = getPublicSupabase();
    const { data, error } = await supabase
      .from('user_credentials')
      .select('user_id, password_hash, theme')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Login query error:', error);
      throw new Error('Invalid User ID or Password');
    }
    if (!data) {
      throw new Error('Invalid User ID or Password');
    }

    if (data.password_hash !== password) {
      throw new Error('Invalid User ID or Password');
    }

    const session = {
      userId: data.user_id,
      theme: data.theme || 'dark',
    };

    setUser(session);
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));

    // Log the login
    await logAudit(data.user_id, 'LOGIN', { timestamp: new Date().toISOString() });

    return session;
  }, []);

  const logout = useCallback(async () => {
    if (user) {
      await logAudit(user.userId, 'LOGOUT', { timestamp: new Date().toISOString() });
    }
    setUser(null);
    localStorage.removeItem(SESSION_KEY);
  }, [user]);

  const updateTheme = useCallback(async (theme) => {
    if (!user) return;
    const supabase = getSupabase(user.userId);
    await supabase
      .from('user_credentials')
      .update({ theme })
      .eq('user_id', user.userId);

    const updated = { ...user, theme };
    setUser(updated);
    localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
  }, [user]);

  const value = {
    user,
    loading,
    login,
    logout,
    updateTheme,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
