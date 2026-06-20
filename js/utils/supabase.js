// js/supabase.js

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

/**
 * @file Initializes and exports the Supabase client instance.
 * This ensures we only have one instance of the client throughout the application.
 */

// Create a single Supabase client for interacting with your database
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);