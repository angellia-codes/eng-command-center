// js/notifications.js

import { toast } from '../core/ui.js';
import { formatIDR, formatTargetDate, hoursBetween } from '../utils/utils.js';

/**
 * @file Manages sending WhatsApp notifications.
 *
 * FIX 1.10: Fonnte API calls are now proxied through a Netlify serverless function
 * (netlify/functions/send-notification.js) so the Fonnte API token never appears
 * in the client-side bundle. Set FONNTE_TOKEN as an environment variable in
 * your Netlify site settings: Site Settings → Environment Variables → FONNTE_TOKEN.
 */

/**
 * Sends a WhatsApp message via the server-side Netlify proxy.
 * FIX 1.10: Replaced direct Fonnte API call with a fetch to /.netlify/functions/send-notification.
 *
 * @param {string} message - The message content to send.
 * @param {string} target  - The target WhatsApp group or number ID.
 * @returns {Promise<{ok: boolean}>}
 */
export async function sendWhatsAppNotification(message, target) {
    // Guard against empty/undefined target or message
    if (!target || !message) {
        console.warn('[notifications] sendWhatsAppNotification called with missing target or message.', { target, message });
        toast('WA notification skipped (missing target or message)', 'err');
        return { ok: false };
    }

    try {
        const response = await fetch('/.netlify/functions/send-notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target, message }),
        });

        const result = await response.json();

        if (result.ok) {
            console.log('Notification sent successfully.');
            toast('📱 WA notification sent', 'wa');
            return { ok: true };
        } else {
            console.error('Notification proxy error:', result.error);
            toast('WA notification failed', 'err');
            return { ok: false };
        }
    } catch (error) {
        console.error('Error reaching notification proxy:', error);
        toast('WA notification failed', 'err');
        return { ok: false };
    }
}

// --- HELPERS ---

/**
 * Resolves the display label for a WO's asset.
 * FIX NOTIF-01: Updated to handle both the new schema (wo.assets join object)
 * and the legacy schema (wo.asset_type / wo.asset_other).
 * This ensures notifications sent immediately after WO creation (before a DB
 * re-fetch provides the join) still display meaningful asset information.
 *
 * @param {object} wo - The work order object.
 * @returns {string}
 */
function resolveAssetLabel(wo) {
    // New schema: freshly fetched WO with joined assets table
    if (wo.assets) {
        return `${wo.assets.asset_code || 'N/A'}: ${wo.assets.model || wo.assets.category || 'N/A'}`;
    }
    // New schema: freshly inserted record (no join yet) — use free-text field
    if (wo.asset_other) {
        return wo.asset_other;
    }
    // Legacy schema fallback
    if (wo.asset_type === 'Other') {
        return wo.asset_other || 'N/A';
    }
    return wo.asset_type || 'N/A';
}

// --- MESSAGE FORMATTERS ---

export function formatNewWoMessage(wo) {
    const assetLabel    = resolveAssetLabel(wo);
    const priority      = wo.priority || 'Unknown';
    const priorityEmoji = { Low: '🟢', Medium: '🟡', High: '🟠', Emergency: '🔴' }[priority] || '⚪';
    const nowStr        = new Date().toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    return `🔧 *WORK ORDER BARU*
Nourish Group Indonesia | Engineering

━━━━━━━━━━━━━━━━━━
📋 No. WO: *${wo.id}*
🏪 Outlet: ${wo.outlet || '-'}
⚙️ Asset: ${assetLabel}
${priorityEmoji} Prioritas: *${priority.toUpperCase()}*
📝 Deskripsi:
${wo.description || '-'}
━━━━━━━━━━━━━━━━━━
👤 Dilaporkan: ${wo.created_by || '-'}
🕐 Waktu: ${nowStr} WITA

_Proses via Engineering Command Center_`;
}

export function formatAcceptedWoMessage(wo) {
    const assetLabel = resolveAssetLabel(wo);

    return `✅ *WORK ORDER DITERIMA*

📋 No. WO: *${wo.id}*
🏪 Outlet: ${wo.outlet || '-'} | ${assetLabel}
👷 Engineer: *${wo.accepted_by || '-'}*
📅 Target Selesai: ${formatTargetDate(wo.target_date)}
💰 Estimasi Biaya: *${formatIDR(wo.cost)}*
🔄 Status: *IN PROGRESS*

_NGI Engineering · Nourish Group Indonesia_`;
}

export function formatCompletedWoMessage(wo) {
    const assetLabel = resolveAssetLabel(wo);

    let duration = '';
    if (wo.accepted_at && wo.completed_at) {
        const hours = hoursBetween(wo.accepted_at, wo.completed_at);
        if (typeof hours === 'number' && !isNaN(hours)) {
            duration = `⏱️ Durasi: ${hours.toFixed(1)} jam\n`;
        } else {
            console.warn('[notifications] hoursBetween returned non-numeric value:', hours);
        }
    }

    return `✅ *WORK ORDER SELESAI*

📋 No. WO: *${wo.id}*
🏪 Outlet: ${wo.outlet || '-'} | ${assetLabel}
👷 Diselesaikan: *${wo.completed_by || '-'}*
💰 Biaya Aktual: *${formatIDR(wo.cost)}*
${duration}🎯 Status: *COMPLETED* ✅

_NGI Engineering · Nourish Group Indonesia_`;
}

export function formatNewPrMessage(pr) {
    const nowStr = new Date().toLocaleString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    return `🛒 *PURCHASE REQUEST BARU*
Nourish Engineering

━━━━━━━━━━━━━━━━━━
📦 Item: *${pr.item_name || '-'}*
🔢 Qty: ${pr.qty || '-'} ${pr.unit || ''}
🏪 Outlet: ${pr.outlet || '-'}
💰 Est. Cost: *${formatIDR(pr.estimated_cost)}*

📝 Justifikasi:
${pr.notes || '-'}
━━━━━━━━━━━━━━━━━━
👤 Requestor: ${pr.created_by || '-'}
🕐 Waktu: ${nowStr} WITA

_Proses via Engineering Command Center_`;
    // FIX 1.7: Changed pr.justification → pr.notes to match the actual DB column name.
}