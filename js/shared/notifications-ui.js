// js/notifications-ui.js

import { escapeHtml } from '../utils/utils.js';

/**
 * @file In-app notification bell — Phase 3 (3.6).
 *
 * Session-based: notifications are collected in memory during the session
 * from realtime events and user actions. They do not persist across reloads.
 * Full DB persistence is Phase 5.
 *
 * Usage:
 *   import { pushNotification } from './notifications-ui.js';
 *   pushNotification('WO-0012 status changed to In Progress', 'success');
 */

const MAX_NOTIFICATIONS = 20;

let notifications  = [];
let unreadCount    = 0;
let dropdownOpen   = false;

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/**
 * Adds a new in-app notification and updates the bell badge.
 * @param {string} message
 * @param {'info'|'success'|'warning'|'danger'} type
 */
export function pushNotification(message, type = 'info') {
    notifications.unshift({
        id:      Date.now() + Math.random(),
        message,
        type,
        read:    false,
        ts:      new Date(),
    });

    if (notifications.length > MAX_NOTIFICATIONS) {
        notifications = notifications.slice(0, MAX_NOTIFICATIONS);
    }

    unreadCount++;
    updateBadge();

    // If dropdown is already open, refresh the list
    if (dropdownOpen) renderDropdown();
}

// ─── RENDER ───────────────────────────────────────────────────────────────────

function updateBadge() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    badge.textContent   = unreadCount > 9 ? '9+' : String(unreadCount);
    badge.style.display = unreadCount > 0 ? 'flex' : 'none';
}

function formatRelativeTime(date) {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60)    return 'just now';
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function renderDropdown() {
    const dropdown = document.getElementById('notif-dropdown');
    if (!dropdown) return;

    if (notifications.length === 0) {
        dropdown.innerHTML = `
            <div class="notif-header">Notifications</div>
            <div class="notif-empty">Nothing yet — actions and realtime events appear here.</div>`;
        return;
    }

    const items = notifications.map(n => `
        <div class="notif-item${n.read ? '' : ' notif-unread'}">
            <div class="notif-dot notif-dot-${escapeHtml(n.type)}"></div>
            <div style="flex:1;min-width:0;">
                <div class="notif-msg">${escapeHtml(n.message)}</div>
                <div class="notif-time">${formatRelativeTime(n.ts)}</div>
            </div>
        </div>
    `).join('');

    dropdown.innerHTML = `
        <div class="notif-header">
            Notifications
            <button class="notif-clear-btn" id="btn-notif-clear">Clear all</button>
        </div>
        <div>${items}</div>`;

    document.getElementById('btn-notif-clear')?.addEventListener('click', e => {
        e.stopPropagation();
        notifications = [];
        unreadCount   = 0;
        updateBadge();
        renderDropdown();
    });
}

// ─── INIT ─────────────────────────────────────────────────────────────────────

export function initNotificationBell() {
    const bell     = document.getElementById('notif-bell');
    const dropdown = document.getElementById('notif-dropdown');

    if (!bell || !dropdown) {
        console.warn('[notifications-ui] Bell or dropdown element not found.');
        return;
    }

    bell.addEventListener('click', e => {
        e.stopPropagation();
        dropdownOpen = !dropdownOpen;
        dropdown.style.display = dropdownOpen ? 'block' : 'none';

        if (dropdownOpen) {
            // Mark all as read when opened
            notifications.forEach(n => n.read = true);
            unreadCount = 0;
            updateBadge();
            renderDropdown();
        }
    });

    // Close when clicking outside
    document.addEventListener('click', e => {
        if (!bell.closest('.notif-bell-wrap').contains(e.target)) {
            dropdown.style.display = 'none';
            dropdownOpen = false;
        }
    });

    // Close on Escape
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && dropdownOpen) {
            dropdown.style.display = 'none';
            dropdownOpen = false;
        }
    });
}