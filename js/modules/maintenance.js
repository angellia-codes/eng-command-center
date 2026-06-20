// js/maintenance.js

import { supabase }                          from '../utils/supabase.js';
import { toast, switchFormTab, showPanelLoading, emptyStateHTML } from '../core/ui.js';
import { populateWoForm }                    from '../modules/workorders.js';
import { addAuditLog }                       from '../shared/audit.js';
import { getCurrentUserProfile, hasPermission } from '../shared/auth.js';
import { getAssets }                         from '../modules/assets.js';
import { escapeHtml }                        from '../utils/utils.js';

/**
 * @file Preventive Maintenance module.
 *
 * Phase 2 features retained (PM CRUD, schedule linkage, module-level cache).
 * Phase 3 additions:
 *   3.2 — Loading spinner while fetching schedules
 *   3.3 — PM Calendar view (toggle between "Due Now" and "Full Schedule")
 *   3.5 — Consistent empty states
 */

let schedulesCache = [];
let pmViewMode     = 'due'; // 'due' | 'calendar'

const pmListContainer = document.getElementById('pm-list-container');

// ─── FETCH ────────────────────────────────────────────────────────────────────

export async function fetchMaintenanceSchedules() {
    showPanelLoading(pmListContainer, 'Loading PM schedule…');

    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
        .from('maintenance_schedule')
        .select(`*, assets (id, asset_code, outlet, category, model)`)
        .eq('status', 'Pending')
        .lte('next_date', today)
        .order('next_date');

    if (error) {
        console.error('Error fetching PM schedules:', error);
        toast('Failed to load PM schedule', 'err');
        if (pmListContainer) pmListContainer.innerHTML = emptyStateHTML('Failed to load PM schedule.', 'Please refresh the page.');
        return [];
    }

    schedulesCache = data;
    return data;
}

/**
 * 3.3: Fetches all pending PM tasks for the next N days (not just overdue).
 */
async function fetchPmCalendar(daysAhead = 90) {
    showPanelLoading(pmListContainer, 'Loading PM calendar…');

    const future = new Date();
    future.setDate(future.getDate() + daysAhead);
    const futureStr = future.toISOString().split('T')[0];

    const { data, error } = await supabase
        .from('maintenance_schedule')
        .select(`*, assets (id, asset_code, outlet, category, model)`)
        .eq('status', 'Pending')
        .lte('next_date', futureStr)
        .order('next_date');

    if (error) {
        console.error('Error fetching PM calendar:', error);
        if (pmListContainer) pmListContainer.innerHTML = emptyStateHTML('Failed to load PM calendar.');
        return [];
    }
    return data;
}

// ─── RENDER: DUE NOW ─────────────────────────────────────────────────────────

export function renderMaintenancePanel(schedules) {
    schedulesCache = schedules;
    if (!pmListContainer) return;

    if (!schedules || schedules.length === 0) {
        pmListContainer.innerHTML = emptyStateHTML(
            'No PM tasks currently due.',
            'Switch to "Schedule" to see upcoming tasks.'
        );
        return;
    }

    const user      = getCurrentUserProfile();
    const canManage = user && hasPermission(user, 'manage_pm');

    pmListContainer.innerHTML = schedules.map(s => {
        if (!s.assets) return '';
        const asset    = s.assets;
        const dueLabel = new Date(s.next_date + 'T00:00:00')
            .toLocaleDateString('en-GB', { day:'2-digit', month:'short' });

        return `
            <div class="pm-item">
                <div>
                    <div class="asset-name">${escapeHtml(asset.asset_code||'N/A')}: ${escapeHtml(asset.model||asset.category)}</div>
                    <div class="asset-details">${escapeHtml(s.frequency)} @ ${escapeHtml(asset.outlet)}</div>
                </div>
                <div style="text-align:right;">
                    <div class="due-date">Due: ${dueLabel}</div>
                    <div style="display:flex;gap:4px;justify-content:flex-end;margin-top:4px;flex-wrap:wrap;">
                        <button class="btn-generate-wo" data-schedule-id="${s.id}">Create WO</button>
                        ${canManage ? `
                            <button class="btn-edit-pm admin-btn edit" data-schedule-id="${s.id}" style="font-size:10.5px;padding:3px 7px;">Edit</button>
                            <button class="btn-delete-pm admin-btn delete" data-schedule-id="${s.id}" style="font-size:10.5px;padding:3px 7px;">Del</button>
                        ` : ''}
                    </div>
                </div>
            </div>`;
    }).join('');
}

// ─── RENDER: CALENDAR (3.3) ───────────────────────────────────────────────────

function renderPmCalendar(allSchedules) {
    if (!pmListContainer) return;

    if (!allSchedules || allSchedules.length === 0) {
        pmListContainer.innerHTML = emptyStateHTML(
            'No PM tasks scheduled in the next 90 days.',
            'Use "+ Add Schedule" to create one.'
        );
        return;
    }

    const today = new Date(); today.setHours(0,0,0,0);

    const groups = { Overdue:[], 'This Week':[], 'This Month':[], Later:[] };
    allSchedules.forEach(s => {
        const due  = new Date(s.next_date + 'T00:00:00');
        const diff = Math.floor((due - today) / 86400000);
        if      (diff < 0)  groups.Overdue.push(s);
        else if (diff <= 7) groups['This Week'].push(s);
        else if (diff <= 30) groups['This Month'].push(s);
        else                 groups.Later.push(s);
    });

    const groupColors = { Overdue:'#EF4444', 'This Week':'#C8882A', 'This Month':'#3B82F6', Later:'#6B7280' };

    let html = '';
    Object.entries(groups).forEach(([label, items]) => {
        if (items.length === 0) return;
        html += `<div class="pm-group-header" style="color:${groupColors[label]};">${label} · ${items.length}</div>`;
        html += items.map(s => {
            const asset    = s.assets;
            if (!asset) return '';
            const dueLabel = new Date(s.next_date + 'T00:00:00')
                .toLocaleDateString('en-GB', { day:'2-digit', month:'short' });
            return `
                <div class="pm-item">
                    <div>
                        <div class="asset-name">${escapeHtml(asset.asset_code||'N/A')}: ${escapeHtml(asset.model||asset.category)}</div>
                        <div class="asset-details">${escapeHtml(s.frequency)} @ ${escapeHtml(asset.outlet)}</div>
                    </div>
                    <div style="text-align:right;">
                        <div class="due-date">${dueLabel}</div>
                        <button class="btn-generate-wo" data-schedule-id="${s.id}" style="margin-top:4px;">Create WO</button>
                    </div>
                </div>`;
        }).join('');
    });

    pmListContainer.innerHTML = html;
}

// ─── PM → WO ──────────────────────────────────────────────────────────────────

function generateWoFromPm(scheduleId, schedules) {
    const schedule = schedules.find(s => String(s.id) === scheduleId);
    if (!schedule) { toast('Could not find schedule details.', 'err'); return; }

    const asset = schedule.assets;
    if (!asset)  { toast('Asset for this PM task no longer exists.', 'err'); return; }

    const today       = new Date();
    const dueDate     = new Date(schedule.next_date + 'T00:00:00');
    const daysOverdue = Math.floor((today - dueDate) / 86400000);

    switchFormTab('wo');
    populateWoForm({
        asset_id:    asset.id,
        type:        'Preventive',
        description: `Perform scheduled ${schedule.frequency} maintenance for ${asset.asset_code||''} (${asset.model||asset.category}).\n\nScope:\n- \n- \n- `,
        outlet:      asset.outlet,
        priority:    daysOverdue > 7 ? 'Medium' : 'Low',
        schedule_id: schedule.id,
    });

    toast('WO form populated from PM task.', 'ok');
    window.scrollTo({ top:0, behavior:'smooth' });
}

// ─── PM CRUD MODAL ────────────────────────────────────────────────────────────

let editingScheduleId = null;

export async function openPmModal(scheduleId = null) {
    const modal = document.getElementById('pm-modal');
    const form  = document.getElementById('pm-form');
    if (!modal || !form) { console.warn('[maintenance] #pm-modal not found'); return; }

    const user = getCurrentUserProfile();
    if (!hasPermission(user, 'manage_pm')) { toast('You do not have permission to manage PM schedules.', 'err'); return; }

    editingScheduleId = scheduleId;
    form.reset();

    const assetSel = document.getElementById('pm-asset-id');
    if (assetSel) {
        assetSel.innerHTML = '<option value="">Select asset...</option>';
        getAssets().forEach(a => {
            const opt = document.createElement('option');
            opt.value = a.id;
            opt.textContent = `${a.asset_code||'N/A'} — ${a.model||a.category} (${a.outlet})`;
            assetSel.appendChild(opt);
        });
    }

    const titleEl  = document.getElementById('pm-modal-title');
    const submitBtn = document.getElementById('btn-submit-pm');

    if (scheduleId) {
        if (titleEl)   titleEl.textContent   = 'Edit PM Schedule';
        if (submitBtn) submitBtn.textContent = 'Update Schedule';
        const { data } = await supabase.from('maintenance_schedule').select('*').eq('id',scheduleId).single();
        if (data) {
            if (assetSel) assetSel.value = data.asset_id;
            const freqEl = document.getElementById('pm-frequency');
            const dateEl = document.getElementById('pm-next-date');
            if (freqEl) freqEl.value = data.frequency;
            if (dateEl) dateEl.value = data.next_date;
        }
    } else {
        if (titleEl)   titleEl.textContent   = 'Schedule PM Task';
        if (submitBtn) submitBtn.textContent = 'Save Schedule';
    }

    modal.style.display = 'flex';
}

export function closePmModal() {
    const modal = document.getElementById('pm-modal');
    if (modal) modal.style.display = 'none';
    editingScheduleId = null;
}

async function handlePmFormSubmit(e) {
    e.preventDefault();
    const user     = getCurrentUserProfile();
    const assetId  = document.getElementById('pm-asset-id')?.value;
    const freq     = document.getElementById('pm-frequency')?.value;
    const nextDate = document.getElementById('pm-next-date')?.value;

    if (!assetId || !freq || !nextDate) { toast('All fields are required.', 'err'); return; }

    const record = { asset_id:parseInt(assetId,10), frequency:freq, next_date:nextDate, status:'Pending' };

    if (editingScheduleId) {
        const { error } = await supabase.from('maintenance_schedule').update(record).eq('id',editingScheduleId);
        if (error) { toast(`Error updating schedule: ${error.message}`,'err'); return; }
        toast('✓ PM schedule updated','ok');
        addAuditLog(`PM schedule #${editingScheduleId} updated by ${user.full_name}.`,'status');
    } else {
        const { error } = await supabase.from('maintenance_schedule').insert(record);
        if (error) { toast(`Error creating schedule: ${error.message}`,'err'); return; }
        toast('✓ PM schedule created','ok');
        addAuditLog(`New PM schedule (${freq}) created by ${user.full_name}.`,'create');
    }

    closePmModal();
    const fresh = await fetchMaintenanceSchedules();
    renderMaintenancePanel(fresh);
}

async function deletePmSchedule(scheduleId) {
    const user = getCurrentUserProfile();
    const { error } = await supabase.from('maintenance_schedule').delete().eq('id',scheduleId);
    if (error) { toast(`Error: ${error.message}`,'err'); return; }
    toast('PM schedule deleted.','ok');
    addAuditLog(`PM schedule #${scheduleId} deleted by ${user.full_name}.`,'delete');
    const fresh = await fetchMaintenanceSchedules();
    renderMaintenancePanel(fresh);
}

// ─── EVENT LISTENERS ──────────────────────────────────────────────────────────

export function initMaintenanceEventListeners() {
    if (!pmListContainer) {
        console.warn('[maintenance] #pm-list-container not found — listeners not attached.');
        return;
    }

    // PM list delegation (generate WO, edit, delete)
    pmListContainer.addEventListener('click', e => {
        const scheduleId = e.target.dataset.scheduleId;
        if (!scheduleId) return;
        if (e.target.matches('.btn-generate-wo')) {
            // Use the most recent full list (calendar may show more than overdue list)
            const allVisible = [...pmListContainer.querySelectorAll('[data-schedule-id]')]
                .map(el => el.dataset.scheduleId);
            generateWoFromPm(scheduleId, schedulesCache.length ? schedulesCache : []);
        }
        if (e.target.matches('.btn-edit-pm'))   openPmModal(parseInt(scheduleId,10));
        if (e.target.matches('.btn-delete-pm')) deletePmSchedule(parseInt(scheduleId,10));
    });

    // 3.3: View toggle buttons
    const btnDue      = document.getElementById('btn-pm-due');
    const btnCalendar = document.getElementById('btn-pm-calendar');

    if (btnDue) {
        btnDue.addEventListener('click', async () => {
            pmViewMode = 'due';
            btnDue.classList.add('active');
            if (btnCalendar) btnCalendar.classList.remove('active');
            const fresh = await fetchMaintenanceSchedules();
            renderMaintenancePanel(fresh);
        });
    }

    if (btnCalendar) {
        btnCalendar.addEventListener('click', async () => {
            pmViewMode = 'calendar';
            btnCalendar.classList.add('active');
            if (btnDue) btnDue.classList.remove('active');
            const all = await fetchPmCalendar();
            schedulesCache = all; // Update cache so "Create WO" button works from calendar view
            renderPmCalendar(all);
        });
    }

    // PM modal
    const btnShowPm   = document.getElementById('btn-show-pm-modal');
    const btnCancelPm = document.getElementById('btn-cancel-pm-modal');
    const pmModal     = document.getElementById('pm-modal');
    const pmForm      = document.getElementById('pm-form');

    if (btnShowPm)   btnShowPm.addEventListener('click', ()=>openPmModal());
    if (btnCancelPm) btnCancelPm.addEventListener('click', closePmModal);
    if (pmModal)     pmModal.addEventListener('click', e=>{ if(e.target===pmModal) closePmModal(); });
    if (pmForm)      pmForm.addEventListener('submit', handlePmFormSubmit);
}