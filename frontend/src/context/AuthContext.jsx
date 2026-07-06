import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setToken(session.access_token);
        fetchUserProfile(session.user);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setToken(session.access_token);
        fetchUserProfile(session.user);
      } else {
        setUser(null);
        setRole(null);
        setToken(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserProfile = async (authUser) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('role')
        .eq('id', authUser.id)
        .single();

      if (error) throw error;
      
      setUser(authUser);
      setRole(data.role);
    } catch (err) {
      console.error('Error fetching user profile:', err);
      setUser(null);
      setRole(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      throw error;
    }
    return data;
  };

  const logout = async () => {
    setLoading(true);
    await supabase.auth.signOut();
  };

  // Helper function to make authenticated API requests
  const apiFetch = async (url, options = {}) => {
    if (!token) throw new Error('No estás autenticado');
    
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
      'Authorization': `Bearer ${token}`
    };

    const res = await fetch(`http://localhost:3001${url}`, { ...options, headers });
    return res;
  };

  return (
    <AuthContext.Provider value={{ user, role, token, login, logout, loading, apiFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
