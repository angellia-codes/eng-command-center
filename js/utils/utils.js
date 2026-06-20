// js/utils.js

/**
 * Shared month abbreviations — single source of truth.
 */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function isFiniteNumber(n) {
    return typeof n === 'number' && isFinite(n);
}

function isValidDate(d) {
    return d instanceof Date && !isNaN(d.getTime());
}

export function formatIDR(n) {
    if (!isFiniteNumber(n)) return '—';
    return 'Rp\u00A0' + Math.round(n).toLocaleString('id-ID');
}

export function formatIDRCompact(n) {
    if (!isFiniteNumber(n)) return '—';
    const abs    = Math.abs(n);
    const prefix = n < 0 ? '-' : '';
    if (abs >= 1_000_000) return `Rp\u00A0${prefix}${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000)     return `Rp\u00A0${prefix}${(abs / 1_000).toFixed(0)}K`;
    return 'Rp\u00A0' + Math.round(n).toLocaleString('id-ID');
}

export function hoursBetween(startISODate, endISODate) {
    if (!startISODate || !endISODate) return 0;
    const start = new Date(startISODate);
    const end   = new Date(endISODate);
    if (!isValidDate(start) || !isValidDate(end)) return 0;
    return (end - start) / 3_600_000;
}

export function formatDateShort(isoDate) {
    if (!isoDate) return '—';
    const d = new Date(isoDate);
    if (!isValidDate(d)) return '—';
    return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]}`;
}

export function formatTargetDate(dateStr) {
    if (!dateStr) return '—';
    const normalized = dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00Z';
    const d = new Date(normalized);
    if (!isValidDate(d)) return '—';
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatAuditTimestamp(isoDate) {
    if (!isoDate) return '—';
    const d = new Date(isoDate);
    if (!isValidDate(d)) return '—';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * FIX 1.9: Escapes HTML special characters in a string before injecting into innerHTML.
 * Use on every user-supplied or database-sourced value rendered via innerHTML.
 * @param {*} str
 * @returns {string}
 */
export function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}