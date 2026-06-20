// js/engineering-requests.js

import { supabase } from '../utils/supabase.js';
import { getCurrentUserProfile } from '../shared/auth.js';
import { addAuditLog } from '../shared/audit.js';
import { toast, switchFormTab } from '../core/ui.js';
import { populateWoForm } from './workorders.js';
import { escapeHtml } from '../utils/utils.js';
import { populateOutletSelect } from '../utils/outlets.js';

/**
 * @file Engineering Requests module — Phase 2 (2.6).
 *
 * Allows any authenticated user to submit engineering requests.
 * Managers / admins / technicians can convert a request to a Work Order.
 *
 * Flow:  Submit ER → Pending → In Review → Converted to WO → WO submitted
 *                                        → Rejected / Closed
 */

let erCache = [];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

async function getNextERId() {
    const { data, error } = await supabase
        .from('engineering_requests')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1);

    if (error || !data || data.length === 0) return 'ER-0001';
    const lastId = parseInt(data[0].id.replace('ER-', ''), 10);
    return `ER-${String(lastId + 1).padStart(4, '0')}`;
}

const PRIORITY_CLASS = { Low: 'bp-low', Medium: 'bp-medium', High: 'bp-high', Emergency: 'bp-emergency' };

const STATUS_CLASS = {
    'Pending':         'bs-pending',
    'In Review':       'bs-ip',
    'Converted to WO': 'bs-done',
    'Rejected':        'b-overdue',
    'Closed':          'bs-done',
};

// ─── FETCH ────────────────────────────────────────────────────────────────────

export async function fetchEngineeringRequests() {
    const { data, error } = await supabase
        .from('engineering_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) {
        console.error('Error fetching engineering requests:', error);
        toast('Failed to load engineering requests', 'err');
        return [];
    }
    erCache = data;
    return data;
}

// ─── RENDER ───────────────────────────────────────────────────────────────────

export function renderERList(requests) {
    const tbody = document.getElementById('er-tbody');
    if (!tbody) return;

    if (!requests || requests.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;color:#9CA3AF;">
            No engineering requests yet. Click "+ Submit Request" to create one.
        </td></tr>`;
        return;
    }

    const user       = getCurrentUserProfile();
    const canConvert = user && (user.role === 'admin' || user.role === 'manager' || user.role === 'technician');

    tbody.innerHTML = requests.map(er => {
        const rawDesc  = er.description || '';
        const desc     = escapeHtml(rawDesc.length > 80 ? rawDesc.slice(0, 80) + '…' : rawDesc);
        const deptLine = er.department ? ` · ${escapeHtml(er.department)}` : '';

        let actionsHTML = '';
        if (er.status === 'Pending' || er.status === 'In Review') {
            if (canConvert) {
                actionsHTML += `<button class="btn-accept btn-convert-er" data-er-id="${escapeHtml(er.id)}"
                    style="font-size:11px;padding:3px 8px;margin-right:4px;">→ Create WO</button>`;
            }
            actionsHTML += `<button class="btn-close-er admin-btn" data-er-id="${escapeHtml(er.id)}"
                style="font-size:11px;padding:3px 8px;">Close</button>`;
        }

        return `
            <tr>
                <td>
                    <div class="wo-id">${escapeHtml(er.id)}</div>
                    <div style="font-size:10px;color:#9CA3AF;margin-top:2px;">${escapeHtml(er.created_by)}</div>
                </td>
                <td>
                    <div style="font-size:12px;font-weight:600;color:#374151;">${escapeHtml(er.outlet)}${deptLine}</div>
                    ${er.location ? `<div style="font-size:10.5px;color:#9CA3AF;">${escapeHtml(er.location)}</div>` : ''}
                </td>
                <td><div style="font-size:12px;color:#374151;line-height:1.4;">${desc}</div></td>
                <td><span class="badge ${PRIORITY_CLASS[er.priority] || 'bp-low'}">${escapeHtml(er.priority)}</span></td>
                <td><span class="badge ${STATUS_CLASS[er.status] || 'bs-pending'}">${escapeHtml(er.status)}</span></td>
                <td><div style="display:flex;flex-direction:column;gap:4px;">${actionsHTML || '<span style="font-size:11px;color:#9CA3AF;">—</span>'}</div></td>
            </tr>
        `;
    }).join('');
}

// ─── MODAL ────────────────────────────────────────────────────────────────────

export function openERModal() {
    const modal = document.getElementById('er-modal');
    const form  = document.getElementById('er-form');
    if (!modal || !form) return;

    form.reset();

    // Populate outlet select fresh from cache
    populateOutletSelect(document.getElementById('er-outlet'));

    modal.style.display = 'flex';
}

export function closeERModal() {
    const modal = document.getElementById('er-modal');
    if (modal) modal.style.display = 'none';
}

// ─── MUTATIONS ────────────────────────────────────────────────────────────────

async function handleERFormSubmit(e) {
    e.preventDefault();

    const user = getCurrentUserProfile();
    if (!user) { toast('Session expired. Please log in again.', 'err'); return; }

    const submitBtn = e.target.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
        const formData = new FormData(e.target);
        const d        = Object.fromEntries(formData.entries());

        if (!d.outlet || !d.description || !d.priority) {
            toast('Outlet, priority, and description are required.', 'err');
            return;
        }

        const record = {
            id:          await getNextERId(),
            outlet:      d.outlet,
            department:  d.department  || null,
            location:    d.location    || null,
            description: d.description,
            priority:    d.priority,
            status:      'Pending',
            created_by:  user.full_name,
            user_id:     user.id,
        };

        const { error } = await supabase.from('engineering_requests').insert(record);

        if (error) {
            toast(`Error submitting request: ${error.message}`, 'err');
            return;
        }

        toast(`✓ ${record.id} submitted successfully`, 'ok');
        addAuditLog(
            `${record.id} — Engineering request submitted by ${user.full_name}. Outlet: ${record.outlet}. Priority: ${record.priority}.`,
            'create'
        );
        closeERModal();

        const fresh = await fetchEngineeringRequests();
        renderERList(fresh);

    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

/**
 * Converts an ER to a WO by pre-populating the WO form and
 * updating the ER status to 'Converted to WO'.
 */
async function convertERtoWO(erId) {
    const er   = erCache.find(r => r.id === erId);
    const user = getCurrentUserProfile();
    if (!er || !user) return;

    const woData = {
        outlet:      er.outlet,
        type:        'Corrective',
        priority:    er.priority,
        description: `[From ${er.id}] ${er.description}${er.location ? `\n\nLocation: ${er.location}` : ''}`,
    };

    const { error } = await supabase
        .from('engineering_requests')
        .update({ status: 'Converted to WO', assigned_wo_id: null })
        .eq('id', erId);

    if (error) {
        toast(`Error updating ER status: ${error.message}`, 'err');
        return;
    }

    switchFormTab('wo');
    populateWoForm(woData);

    addAuditLog(`${erId} converted to Work Order by ${user.full_name}.`, 'create');
    toast(`${erId} converted — complete the WO form and submit.`, 'ok');

    const fresh = await fetchEngineeringRequests();
    renderERList(fresh);

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function closeER(erId) {
    const user = getCurrentUserProfile();
    const { error } = await supabase
        .from('engineering_requests')
        .update({ status: 'Closed' })
        .eq('id', erId);

    if (error) { toast(`Error closing ER: ${error.message}`, 'err'); return; }
    toast(`${erId} closed.`, 'ok');
    addAuditLog(`${erId} closed by ${user.full_name}.`, 'status');
    const fresh = await fetchEngineeringRequests();
    renderERList(fresh);
}

// ─── EVENT LISTENERS ──────────────────────────────────────────────────────────

export function initEngineeringRequestsEventListeners() {
    const btnNew    = document.getElementById('btn-new-er');
    const btnCancel = document.getElementById('btn-cancel-er-modal');
    const erModal   = document.getElementById('er-modal');
    const erForm    = document.getElementById('er-form');
    const erTbody   = document.getElementById('er-tbody');

    if (btnNew)    btnNew.addEventListener('click', openERModal);
    if (btnCancel) btnCancel.addEventListener('click', closeERModal);

    if (erModal) {
        erModal.addEventListener('click', e => { if (e.target === erModal) closeERModal(); });
    }

    if (erForm) erForm.addEventListener('submit', handleERFormSubmit);

    // Table action delegation
    if (erTbody) {
        erTbody.addEventListener('click', e => {
            const erId = e.target.dataset.erId;
            if (!erId) return;
            if (e.target.matches('.btn-convert-er')) convertERtoWO(erId);
            if (e.target.matches('.btn-close-er'))   closeER(erId);
        });
    }
}