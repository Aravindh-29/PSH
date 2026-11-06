import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/axios';
import { useAuth } from './AuthContext';

const BrandingContext = createContext(null);
export function BrandingProvider({ children }) {
  const { user } = useAuth();
  const [branding, setBranding] = useState(null);
  const [error, setError] = useState('');
  const load = async () => {
    try { setBranding((await api.get(user ? '/config/branding' : '/config/branding/public')).data.branding); setError(''); }
    catch { setError('Could not load branding settings. Please retry.'); }
  };
  useEffect(() => { load(); }, [user?.id]);
  useEffect(() => {
    const root = document.documentElement;
    const styles = branding?.customize ? {
      '--orange': branding.accent_color,
      '--orange-hover': `color-mix(in srgb, ${branding.accent_color} 85%, black)`,
      '--orange-light': `color-mix(in srgb, ${branding.accent_color} 9%, white)`,
      '--sb-active-bg': `color-mix(in srgb, ${branding.accent_color} 9%, transparent)`,
    } : {};
    for (const [key, value] of Object.entries(styles)) root.style.setProperty(key, value);
    return () => { for (const key of Object.keys(styles)) root.style.removeProperty(key); };
  }, [branding]);
  return <BrandingContext.Provider value={{ branding, setBranding, error, load }}>{children}</BrandingContext.Provider>;
}
export const useBranding = () => useContext(BrandingContext);
