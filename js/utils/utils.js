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

// utils.js — Shared utility functions 
// NGI Engineering Command Center

import { supabase } from './supabase.js';

// ── Photo upload helper ───────────────────────────────────────
// bucket: 'wo-photos' | 'asset-photos' | 'pr-photos' | 'daily-photos'
export async function uploadPhoto(file, bucket = 'wo-photos') {
  if (!file) return null;

  // Resize & compress on mobile before uploading
  const compressed = await compressImage(file, 1200, 0.8);
  const ext  = file.name.split('.').pop().toLowerCase().replace('heic','jpg');
  const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, compressed, { cacheControl: '3600', upsert: false });

  if (error) throw new Error(`Photo upload failed: ${error.message}`);

  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(data.path);
  return publicUrl;
}

// ── Image compression (client-side, mobile-friendly) ─────────
function compressImage(file, maxWidth = 1200, quality = 0.8) {
  return new Promise((resolve) => {
    // If already small enough, skip compression
    if (file.size < 300 * 1024) { resolve(file); return; }

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let { width, height } = img;
      if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth; }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

// ── PR PDF export ─────────────────────────────────────────────
export function exportPRtoPDF(pr) {
  const w = window.open('', '_blank');
  const logoSVG = `<svg viewBox="0 0 42 42" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:40px;height:40px;">
    <rect width="42" height="42" rx="10" fill="#1B3A2D"/>
    <path d="M21 7C21 7 10 15.5 10 24C10 29.8 15 34.5 21 34.5C27 34.5 32 29.8 32 24C32 15.5 21 7 21 7Z" fill="rgba(255,255,255,0.88)"/>
  </svg>`;

  const formatIDR = v => v ? 'Rp ' + Number(v).toLocaleString('id-ID') : '—';
  const photoHTML = pr.photo_url
    ? `<div style="margin:16px 0;"><img src="${pr.photo_url}" style="max-width:100%;max-height:280px;border-radius:8px;border:1px solid #E5E7EB;object-fit:contain;"></div>`
    : '';

  w.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Purchase Request ${pr.pr_number || ''}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #111827; background: white; padding: 40px; font-size: 13px; }
    .header { display: flex; align-items: center; gap: 16px; padding-bottom: 20px; border-bottom: 2px solid #1B3A2D; margin-bottom: 24px; }
    .brand { flex: 1; }
    .brand-name { font-size: 16px; font-weight: 700; color: #1B3A2D; letter-spacing: 0.04em; }
    .brand-sub  { font-size: 10px; color: #9CA3AF; letter-spacing: 0.1em; text-transform: uppercase; margin-top: 2px; }
    .doc-title  { font-size: 20px; font-weight: 700; color: #1B3A2D; margin-bottom: 4px; }
    .pr-number  { font-family: monospace; font-size: 13px; color: #6B7280; background: #F3F4F6; padding: 2px 8px; border-radius: 4px; }
    .section    { margin-bottom: 20px; }
    .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #9CA3AF; margin-bottom: 8px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .field-label { font-size: 10px; font-weight: 700; color: #6B7280; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
    .field-value { font-size: 13px; color: #111827; }
    .status-badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; background: #FEF3C7; color: #B45309; }
    .notes-box { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 10px 12px; font-size: 12.5px; color: #374151; line-height: 1.5; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #E5E7EB; display: flex; justify-content: space-between; font-size: 11px; color: #9CA3AF; }
    .sig-box { border-top: 1px solid #374151; width: 200px; padding-top: 4px; font-size: 11px; color: #374151; }
    @media print { body { padding: 20px; } @page { margin: 15mm; } }
  </style>
</head>
<body>
  <div class="header">
    ${logoSVG}
    <div class="brand">
      <div class="brand-name">PT NOURISH GROUP INDONESIA</div>
      <div class="brand-sub">Engineering Command Center · Purchase Request</div>
    </div>
    <div style="text-align:right;">
      <div class="doc-title">PURCHASE REQUEST</div>
      <div class="pr-number">${pr.pr_number || '—'}</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Request Details</div>
    <div class="grid">
      <div><div class="field-label">Outlet</div><div class="field-value">${pr.outlet || '—'}</div></div>
      <div><div class="field-label">Requested By</div><div class="field-value">${pr.created_by || '—'}</div></div>
      <div><div class="field-label">Date</div><div class="field-value">${pr.created_at ? new Date(pr.created_at).toLocaleDateString('en-ID',{day:'numeric',month:'long',year:'numeric'}) : '—'}</div></div>
      <div><div class="field-label">Status</div><div><span class="status-badge">${pr.status || 'Pending'}</span></div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Item Details</div>
    <div class="grid">
      <div><div class="field-label">Item / Material</div><div class="field-value">${pr.item_name || '—'}</div></div>
      <div><div class="field-label">Unit</div><div class="field-value">${pr.unit || '—'}</div></div>
      <div><div class="field-label">Quantity</div><div class="field-value">${pr.qty || '—'}</div></div>
      <div><div class="field-label">Estimated Cost</div><div class="field-value" style="font-weight:700;color:#1B3A2D;">${formatIDR(pr.estimated_cost)}</div></div>
    </div>
  </div>

  ${pr.justification ? `
  <div class="section">
    <div class="section-title">Justification / Notes</div>
    <div class="notes-box">${pr.justification}</div>
  </div>` : ''}

  ${photoHTML}

  <div style="display:flex;gap:40px;margin-top:32px;">
    <div><div class="sig-box">Requested By</div><div style="font-size:11px;color:#6B7280;margin-top:4px;">${pr.created_by || '_______________'}</div></div>
    <div><div class="sig-box">Approved By</div><div style="font-size:11px;color:#6B7280;margin-top:4px;">${pr.approved_by || '_______________'}</div></div>
    <div><div class="sig-box">HOD / GM</div><div style="font-size:11px;color:#6B7280;margin-top:4px;">_______________</div></div>
  </div>

  <div class="footer">
    <span>Generated: ${new Date().toLocaleString('en-ID')}</span>
    <span>NGI Engineering Command Center · Confidential</span>
  </div>

  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`);
  w.document.close();
}

// ── Format currency IDR ───────────────────────────────────────
export function formatIDR(value) {
  if (!value && value !== 0) return '—';
  return 'Rp ' + Number(value).toLocaleString('id-ID');
}

// ── Date formatting ───────────────────────────────────────────
export function formatDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleDateString('en-ID', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

// ── Debounce ──────────────────────────────────────────────────
export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}