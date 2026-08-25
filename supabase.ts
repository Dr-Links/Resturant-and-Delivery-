
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ylgvwzwmgeiuyhomxvuh.supabase.cotabl'
const supabaseAnonKey = 'sb_publishable_6Jzncu3t9rb2bwi5hHWRYg_VTKFXyLE'

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
)