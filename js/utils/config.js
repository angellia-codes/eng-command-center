// js/config.js

/**
 * @file Application configuration — client-safe constants only.
 *
 * SECURITY NOTE — FONNTE TOKEN:
 * The Fonnte API token has been REMOVED from this file (FIX 1.10).
 * It is now a server-side environment variable consumed exclusively by the
 * Netlify function at netlify/functions/send-notification.js.
 *
 * To set it up:
 *   Netlify Dashboard → Your Site → Site Settings → Environment Variables
 *   Key:   FONNTE_TOKEN
 *   Value: your_fonnte_api_token
 *
 * The Supabase anon key below is intentionally public — it is designed for
 * client-side use and is safe to expose when paired with correct RLS policies.
 */

// Supabase Configuration
export const SUPABASE_URL      = 'https://awkjzerjkhrswworxfkg.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF3a2p6ZXJqa2hyc3d3b3J4ZmtnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1Njk1NjIsImV4cCI6MjA5NjE0NTU2Mn0.BZtFu2dEQW0pvh2cYnyr-Apuh9S-VAkZnWgjxYpyjZ0';

// WhatsApp Notification Targets
// These are channel identifiers (group IDs), not secrets — safe to expose client-side.
export const FONNTE_TARGET_WO = '120363231248225311@g.us';
export const FONNTE_TARGET_PR = '120363231248225311@g.us';

// Application
export const APP_NAME = 'Nourish Engineering Command Center';