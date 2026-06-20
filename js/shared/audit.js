// js/audit.js

import { supabase } from './utils/supabase.js';
import { getCurrentUserProfile } from './shared/auth.js';
import { formatAuditTimestamp, escapeHtml } from './utils/utils.js'; // FIX 1.9: added escapeHtml

/**
 * @file Manages fetching, rendering, and creating audit log entries.
 */

const auditBody  = document.getElementById('audit-body');
const auditCount = document.getElementById('audit-ct');

/**
 * Renders the list of audit log entries in the UI.
 * FIX 1.9: log.msg and log.type come from the database (client-written via addAuditLog).
 *           Both are now escaped before injection into innerHTML to prevent stored XSS.
 */
export function renderAuditLog(logs) {
    if (!auditBody || !auditCount) return;

    auditCount.textContent = `${logs.length} event${logs.length !== 1 ? 's' : ''}`;

    if (logs.length === 0) {
        auditBody.innerHTML = '<div class="audit-entry"><span class="audit-msg">— No audit events recorded yet.</span></div>';
        return;
    }

    auditBody.innerHTML = logs
        .map(log => `
            <div class="audit-entry at-${escapeHtml(log.type || 'default')}">
                <span class="audit-ts">[${formatAuditTimestamp(log.ts)}]</span>
                <span class="audit-msg">— ${escapeHtml(log.msg)}</span>
            </div>
        `).join('');
}

/**
 * Fetches all audit logs from the database.
 */
export async function fetchAuditLogs() {
    const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .order('ts', { ascending: false })
        .limit(100);

    if (error) {
        console.error("Error fetching audit logs:", error);
        return [];
    }
    return data;
}

/**
 * Adds a new entry to the audit log.
 */
export async function addAuditLog(message, type) {
    const user = getCurrentUserProfile();
    if (!user) {
        console.error("Cannot add audit log: no user logged in.");
        return;
    }

    const { error } = await supabase
        .from('audit_log')
        .insert({
            msg:     message,
            type:    type,
            user_id: user.id
        });

    if (error) {
        console.error("Error adding audit log:", error);
    }
}