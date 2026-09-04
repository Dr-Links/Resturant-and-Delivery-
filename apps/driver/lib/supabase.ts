import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Same backend as the web app.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://ylgvwzwmgeiuyhomxvuh.supabase.co';
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_6Jzncu3t9rb2bwi5hHWRYg_VTKFXyLE';

export const supabase = createClient(url, key, {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});
