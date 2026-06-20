// js/auth.js

import { supabase } from '../utils/supabase.js';
import { toast, showLoginError } from '../core/ui.js';

let currentUserProfile = null;

async function getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) { console.error('Error getting session:', error); return null; }
    return data.session;
}

async function fetchUserProfile(userId) {
    const { data, error } = await supabase
        .from('users').select('*').eq('id', userId).single();
    if (error) {
        console.error('Error fetching user profile:', error);
        showLoginError('Could not retrieve your user profile. Please contact support.');
        await signOut();
        return null;
    }
    return data;
}

export async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
    if (error) { console.error('Google sign-in error:', error); showLoginError(error.message); }
}

export async function signOut() {
    await supabase.auth.signOut();
    currentUserProfile = null;
}

/**
 * Checks auth state and blocks deactivated accounts.
 * Phase 1 FIX 1.3 + 1.6 retained here.
 */
export async function checkAuthState() {
    const session = await getSession();
    if (session?.user) {
        const profile = await fetchUserProfile(session.user.id);
        if (profile) {
            if (profile.active === false) {
                showLoginError('Your account has been deactivated. Please contact your administrator.');
                await signOut();
                return null;
            }
            currentUserProfile = profile;
            return profile;
        }
    }
    return null;
}

export function getCurrentUserProfile() {
    return currentUserProfile;
}

/**
 * Phase 2 (2.7): Centralised permission check.
 * Replaces scattered inline role comparisons across modules.
 *
 * @param {object} user
 * @param {'manage_assets'|'manage_pm'|'modify_wo'|'delete_wo'|'manage_users'|'convert_er'|'view_reports'} action
 * @returns {boolean}
 */
export function hasPermission(user, action) {
    if (!user) return false;
    if (user.role === 'admin') return true;

    const roleMap = {
        manager:    ['manage_assets', 'manage_pm', 'modify_wo', 'convert_er', 'view_reports'],
        technician: ['modify_wo', 'manage_pm', 'convert_er'],
    };

    return (roleMap[user.role] || []).includes(action);
}