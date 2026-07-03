// src/supabase.js
import { createClient } from '@supabase/supabase-js';

export let supabaseClient = null;

export const DEFAULT_URL = import.meta.env.VITE_SUPABASE_URL || "";
export const DEFAULT_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export function initSupabase(url, key) {
  try {
    supabaseClient = createClient(url, key);
    return supabaseClient;
  } catch (err) {
    console.error("Supabase client creation failed:", err.message);
    return null;
  }
}

export function loadDatabaseConfig() {
  const savedUrl = localStorage.getItem('supabase_url') || DEFAULT_URL;
  const savedKey = localStorage.getItem('supabase_key') || DEFAULT_ANON_KEY;

  if (savedUrl && savedKey) {
    return initSupabase(savedUrl, savedKey);
  }
  return null;
}

export function saveDatabaseConfig(url, key) {
  localStorage.setItem('supabase_url', url);
  localStorage.setItem('supabase_key', key);
  return initSupabase(url, key);
}
