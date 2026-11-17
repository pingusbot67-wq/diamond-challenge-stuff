import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

// These come from the git-ignored .env file (see .env.example). The anon key is designed to be public;
// the database security rules decide what it can do.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const isConfigured = /^https:\/\/.+/.test(url) && anonKey.length > 20 && !url.includes('YOUR-PROJECT');

export const supabase = createClient(isConfigured ? url : 'https://placeholder.supabase.co', isConfigured ? anonKey : 'placeholder-key-placeholder', {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

// keep the login fresh only while the app is open
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
