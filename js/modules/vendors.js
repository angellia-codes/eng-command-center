// js/vendors.js

import { supabase }                          from './utils/supabase.js';
import { getCurrentUserProfile, hasPermission } from './shared/auth.js';
import { addAuditLog }                       from './shared/audit.js';
import { toast, emptyStateHTML }             from './core/ui.js';
import { escapeHtml }                        from './utils/utils.js';

/**
 * @file Vendor Management module — Phase 5 (5.2).
 *
 * Features: vendor list, add/edit, contract expiry alerts, star ratings.
 */

let vendorsCache   = [];
let editingVendorId = null;

const VENDOR_CATEGORIES = ['Electrical','Mechanical','Plumbing','HVAC','Kitchen Equipment','Civil','IT','Cleaning','Pest Control','Other'];

// ─── FETCH ────────────────────────────────────────────────────────────────────

export async function fetchVendors() {
    const { data, error } = await supabase
        .from('vendors')
        .select('*')
        .order('name');
    if (error) { console.error('[vendors] Fetch error:', error); toast('Failed to load vendors', 'err'); return []; }
    vendorsCache = data;
    return data;
}

// ─── RENDER ───────────────────────────────────────────────────────────────────

function starsHtml(rating) {
    if (!rating) return '<span style="color:#D1D5DB;">Not rated</span>';
    return Array.from({ length: 5 }, (_, i) =>
        `<span style="color:${i < rating ? '#F59E0B' : '#E5E7EB'};">★</span>`
    ).join('');
}

function contractStatus(vendor) {
    if (!vendor.contract_end) return null;
    const daysLeft = Math.floor((new Date(vendor.contract_end) - Date.now()) / 86400000);
    if (daysLeft < 0)   return { label: 'Expired',  color: '#EF4444', bg: '#FEE2E2' };
    if (daysLeft <= 30) return { label: `${daysLeft}d left`, color: '#B45309', bg: '#FEF3C7' };
    return null;
}

export function renderVendorList(vendors) {
    const tbody = document.getElementById('vendors-tbody');
    if (!tbody) return;

    const user      = getCurrentUserProfile();
    const canManage = user && hasPermission(user, 'manage_assets');

    const active   = vendors.filter(v => v.active !== false);
    const expiring = active.filter(v => contractStatus(v));

    const alertEl = document.getElementById('vendor-alert');
    if (alertEl) {
        alertEl.style.display = expiring.length > 0 ? 'flex' : 'none';
        alertEl.textContent   = `⚠️ ${expiring.length} vendor contract${expiring.length !== 1 ? 's' : ''} expiring within 30 days`;
    }

    if (vendors.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="loading-cell" style="color:#9CA3AF;">
            No vendors registered. Click "+ Add Vendor" to get started.
        </td></tr>`;
        return;
    }

    tbody.innerHTML = vendors.map(v => {
        const cs = contractStatus(v);
        const contractDisplay = v.contract_end
            ? new Date(v.contract_end).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
            : '—';

        return `<tr style="${v.active === false ? 'opacity:0.5;' : ''}">
            <td>
                <div style="font-weight:600;font-size:13px;">${escapeHtml(v.name)}</div>
                ${v.active === false ? '<span style="font-size:10px;color:#9CA3AF;">Inactive</span>' : ''}
            </td>
            <td style="font-size:11.5px;">${escapeHtml(v.category || '—')}</td>
            <td>
                <div style="font-size:12px;">${escapeHtml(v.contact_person || '—')}</div>
                ${v.phone ? `<div style="font-size:10.5px;color:#6B7280;">${escapeHtml(v.phone)}</div>` : ''}
            </td>
            <td style="font-size:11.5px;">
                ${contractDisplay}
                ${cs ? `<div><span style="background:${cs.bg};color:${cs.color};padding:1px 7px;border-radius:10px;font-size:10px;font-weight:700;">${cs.label}</span></div>` : ''}
            </td>
            <td style="font-size:14px;">${starsHtml(v.performance_rating)}</td>
            <td>${v.active !== false
                ? '<span class="badge bs-done">Active</span>'
                : '<span class="badge bs-pending">Inactive</span>'}</td>
            <td>
                <div style="display:flex;gap:4px;">
                    ${canManage ? `<button class="admin-btn edit btn-edit-vendor"   data-id="${v.id}" style="font-size:10.5px;padding:3px 7px;">Edit</button>` : ''}
                    ${canManage && v.active !== false ? `<button class="admin-btn delete btn-deactivate-vendor" data-id="${v.id}" style="font-size:10.5px;padding:3px 7px;">Deactivate</button>` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ─── MODAL ────────────────────────────────────────────────────────────────────

export function openVendorModal(vendorId = null) {
    const user = getCurrentUserProfile();
    if (!hasPermission(user, 'manage_assets')) {
        toast('You do not have permission to manage vendors.', 'err');
        return;
    }

    editingVendorId = vendorId;
    const modal   = document.getElementById('vendor-modal');
    const form    = document.getElementById('vendor-form');
    const title   = document.getElementById('vendor-modal-title');
    const submit  = form?.querySelector('[type="submit"]');
    if (!modal || !form) return;

    form.reset();

    // Populate category select
    const catSel = form.querySelector('[name="category"]');
    if (catSel) {
        catSel.innerHTML = '<option value="">Select category...</option>' +
            VENDOR_CATEGORIES.map(c => `<option>${c}</option>`).join('');
    }

    if (vendorId) {
        const v = vendorsCache.find(x => x.id === vendorId);
        if (v) {
            if (title)  title.textContent  = 'Edit Vendor';
            if (submit) submit.textContent = 'Update Vendor';
            form.querySelector('[name="name"]').value             = v.name             || '';
            form.querySelector('[name="category"]').value         = v.category         || '';
            form.querySelector('[name="contact_person"]').value   = v.contact_person   || '';
            form.querySelector('[name="phone"]').value            = v.phone            || '';
            form.querySelector('[name="email"]').value            = v.email            || '';
            form.querySelector('[name="address"]').value          = v.address          || '';
            form.querySelector('[name="contract_start"]').value   = v.contract_start   || '';
            form.querySelector('[name="contract_end"]').value     = v.contract_end     || '';
            form.querySelector('[name="performance_rating"]').value = v.performance_rating || '';
            form.querySelector('[name="notes"]').value            = v.notes            || '';
        }
    } else {
        if (title)  title.textContent  = 'Add Vendor';
        if (submit) submit.textContent = 'Save Vendor';
    }

    modal.style.display = 'flex';
}

function closeVendorModal() {
    const modal = document.getElementById('vendor-modal');
    if (modal) modal.style.display = 'none';
    editingVendorId = null;
}

async function handleVendorFormSubmit(e) {
    e.preventDefault();
    const user     = getCurrentUserProfile();
    const formData = new FormData(e.target);
    const d        = Object.fromEntries(formData.entries());
    const submitBtn = e.target.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    const record = {
        name:               d.name,
        category:           d.category           || null,
        contact_person:     d.contact_person      || null,
        phone:              d.phone               || null,
        email:              d.email               || null,
        address:            d.address             || null,
        contract_start:     d.contract_start      || null,
        contract_end:       d.contract_end        || null,
        performance_rating: d.performance_rating ? parseInt(d.performance_rating, 10) : null,
        notes:              d.notes               || null,
    };

    try {
        if (editingVendorId) {
            const { error } = await supabase.from('vendors').update(record).eq('id', editingVendorId);
            if (error) { toast(`Error: ${error.message}`, 'err'); return; }
            toast(`✓ ${record.name} updated`, 'ok');
            addAuditLog(`Vendor "${record.name}" updated by ${user.full_name}.`, 'status');
        } else {
            const { error } = await supabase.from('vendors').insert(record);
            if (error) { toast(`Error: ${error.message}`, 'err'); return; }
            toast(`✓ ${record.name} added`, 'ok');
            addAuditLog(`New vendor registered: ${record.name}.`, 'create');
        }
        closeVendorModal();
        const fresh = await fetchVendors();
        renderVendorList(fresh);
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

async function deactivateVendor(vendorId) {
    const vendor = vendorsCache.find(v => v.id === vendorId);
    const user   = getCurrentUserProfile();
    const { error } = await supabase.from('vendors').update({ active: false }).eq('id', vendorId);
    if (error) { toast(`Error: ${error.message}`, 'err'); return; }
    toast(`${vendor?.name || 'Vendor'} deactivated.`, 'ok');
    addAuditLog(`Vendor "${vendor?.name || vendorId}" deactivated by ${user.full_name}.`, 'delete');
    const fresh = await fetchVendors();
    renderVendorList(fresh);
}

// ─── EVENT LISTENERS ──────────────────────────────────────────────────────────

export function initVendorEventListeners() {
    const addBtn      = document.getElementById('btn-show-add-vendor');
    const vendorModal = document.getElementById('vendor-modal');
    const vendorForm  = document.getElementById('vendor-form');
    const cancelBtn   = document.getElementById('btn-cancel-vendor-modal');
    const tbody       = document.getElementById('vendors-tbody');

    if (addBtn)      addBtn.addEventListener('click', () => openVendorModal());
    if (cancelBtn)   cancelBtn.addEventListener('click', closeVendorModal);
    if (vendorModal) vendorModal.addEventListener('click', e => { if (e.target === vendorModal) closeVendorModal(); });
    if (vendorForm)  vendorForm.addEventListener('submit', handleVendorFormSubmit);

    if (tbody) {
        tbody.addEventListener('click', e => {
            const id = parseInt(e.target.dataset.id, 10);
            if (!id) return;
            if (e.target.matches('.btn-edit-vendor'))        openVendorModal(id);
            if (e.target.matches('.btn-deactivate-vendor'))  deactivateVendor(id);
        });
    }
}
