// js/daily-updates.js

import { supabase }                     from '../utils/supabase.js';
import { getCurrentUserProfile }        from '../shared/auth.js';
import { addAuditLog }                  from '../shared/audit.js';
import { toast, emptyStateHTML }        from '../core/ui.js';
import { escapeHtml }                   from '../utils/utils.js';
import { getOutlets }                   from '../utils/outlets.js';
import { populateOutletSelect }         from '../utils/outlets.js';

/**
 * @file Daily Engineering Updates module — Phase 5 (5.3).
 *
 * Each outlet submits one update per day covering:
 *   issues found, work completed, ongoing projects, pending items.
 * Unresolved pending items are carried forward as a pre-fill prompt.
 */

let updatesCache  = [];
let selectedDate  = new Date().toISOString().split('T')[0]; // today

// ─── FETCH ────────────────────────────────────────────────────────────────────

export async function fetchDailyUpdates(date = selectedDate) {
    const { data, error } = await supabase
        .from('daily_updates')
        .select('*')
        .eq('date', date)
        .order('outlet');
    if (error) { console.error('[daily-updates] Fetch error:', error); return []; }
    updatesCache = data;
    return data;
}

async function fetchYesterdayPending(outlet) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    const { data } = await supabase
        .from('daily_updates')
        .select('pending_items, target_completion')
        .eq('outlet', outlet)
        .eq('date', dateStr)
        .single();

    return data?.pending_items || null;
}

// ─── RENDER ───────────────────────────────────────────────────────────────────

export function renderDailyUpdatesGrid(updates) {
    const grid = document.getElementById('daily-updates-grid');
    if (!grid) return;

    const outlets = getOutlets();

    if (outlets.length === 0) {
        grid.innerHTML = emptyStateHTML('No outlets configured. Please add outlets first.');
        return;
    }

    const updateMap = {};
    updates.forEach(u => { updateMap[u.outlet] = u; });

    grid.innerHTML = outlets.map(outlet => {
        const update = updateMap[outlet];
        const isToday = selectedDate === new Date().toISOString().split('T')[0];

        if (update) {
            return `
                <div class="daily-card daily-card-submitted">
                    <div class="daily-card-header">
                        <div class="daily-card-outlet">${escapeHtml(outlet)}</div>
                        <span class="badge bs-done" style="font-size:10px;">✓ Submitted</span>
                    </div>
                    <div class="daily-card-engineer">👷 ${escapeHtml(update.engineer_name)}</div>
                    ${update.issues_found ? `
                        <div class="daily-field">
                            <div class="daily-field-label">Issues Found</div>
                            <div class="daily-field-value">${escapeHtml(update.issues_found)}</div>
                        </div>` : ''}
                    ${update.work_completed ? `
                        <div class="daily-field">
                            <div class="daily-field-label">Work Completed</div>
                            <div class="daily-field-value">${escapeHtml(update.work_completed)}</div>
                        </div>` : ''}
                    ${update.ongoing_projects ? `
                        <div class="daily-field">
                            <div class="daily-field-label">Ongoing Projects</div>
                            <div class="daily-field-value">${escapeHtml(update.ongoing_projects)}</div>
                        </div>` : ''}
                    ${update.pending_items ? `
                        <div class="daily-field daily-field-pending">
                            <div class="daily-field-label">⏳ Pending</div>
                            <div class="daily-field-value">${escapeHtml(update.pending_items)}</div>
                            ${update.target_completion ? `<div style="font-size:10.5px;color:#B45309;margin-top:2px;">Target: ${update.target_completion}</div>` : ''}
                        </div>` : ''}
                    ${isToday ? `
                        <button class="btn-edit-daily admin-btn edit" data-outlet="${escapeHtml(outlet)}"
                            style="width:100%;margin-top:8px;font-size:11px;padding:4px 0;">Edit Update</button>
                    ` : ''}
                </div>`;
        } else {
            return `
                <div class="daily-card daily-card-missing">
                    <div class="daily-card-header">
                        <div class="daily-card-outlet">${escapeHtml(outlet)}</div>
                        <span class="badge bs-pending" style="font-size:10px;">Not submitted</span>
                    </div>
                    <div style="font-size:12px;color:#9CA3AF;margin:8px 0 10px;">
                        No update has been submitted for this outlet ${isToday ? 'today' : 'on this date'}.
                    </div>
                    ${isToday ? `
                        <button class="btn-submit-outlet-daily btn-accept"
                            data-outlet="${escapeHtml(outlet)}"
                            style="width:100%;font-size:12px;">+ Submit Update</button>
                    ` : ''}
                </div>`;
        }
    }).join('');
}

// ─── MODAL ────────────────────────────────────────────────────────────────────

export async function openDailyUpdateModal(outlet = null) {
    const user   = getCurrentUserProfile();
    const modal  = document.getElementById('daily-update-modal');
    const form   = document.getElementById('daily-update-form');
    const title  = document.getElementById('daily-update-modal-title');
    if (!modal || !form) return;

    form.reset();

    // Populate outlet select
    const outletSel = form.querySelector('[name="outlet"]');
    if (outletSel) {
        populateOutletSelect(outletSel, { includeOther: false });
        if (outlet) outletSel.value = outlet;
    }

    // Auto-fill engineer name for technicians
    if (user?.role === 'technician' && user.full_name) {
        const engEl = form.querySelector('[name="engineer_name"]');
        if (engEl) engEl.value = user.full_name;
    }

    // Check if update already exists for this outlet today
    const existing = updatesCache.find(u => u.outlet === outlet);
    if (title) title.textContent = existing ? 'Edit Daily Update' : 'Submit Daily Update';

    if (existing) {
        // Pre-fill with existing values for editing
        form.querySelector('[name="engineer_name"]').value  = existing.engineer_name   || '';
        form.querySelector('[name="issues_found"]').value   = existing.issues_found    || '';
        form.querySelector('[name="work_completed"]').value = existing.work_completed   || '';
        form.querySelector('[name="ongoing_projects"]').value = existing.ongoing_projects || '';
        form.querySelector('[name="pending_items"]').value  = existing.pending_items   || '';
        form.querySelector('[name="target_completion"]').value = existing.target_completion || '';
        form.dataset.existingId = existing.id;
    } else {
        delete form.dataset.existingId;

        // Carry forward pending items from yesterday
        if (outlet) {
            const pendingYesterday = await fetchYesterdayPending(outlet);
            if (pendingYesterday) {
                const pendingEl = form.querySelector('[name="pending_items"]');
                if (pendingEl) {
                    pendingEl.value = pendingYesterday;
                    pendingEl.style.borderColor = '#F59E0B';
                    const hint = form.querySelector('.pending-carryover-hint');
                    if (hint) hint.style.display = 'block';
                }
            }
        }
    }

    modal.style.display = 'flex';
}

function closeDailyUpdateModal() {
    const modal = document.getElementById('daily-update-modal');
    if (modal) modal.style.display = 'none';
    const form = document.getElementById('daily-update-form');
    if (form) delete form.dataset.existingId;
}

async function handleDailyUpdateSubmit(e) {
    e.preventDefault();
    const user      = getCurrentUserProfile();
    const formData  = new FormData(e.target);
    const d         = Object.fromEntries(formData.entries());
    const submitBtn = e.target.querySelector('[type="submit"]');
    const existingId = parseInt(e.target.dataset.existingId, 10) || null;

    if (!d.outlet || !d.engineer_name) {
        toast('Outlet and engineer name are required.', 'err');
        return;
    }

    if (submitBtn) submitBtn.disabled = true;

    const record = {
        date:             selectedDate,
        outlet:           d.outlet,
        engineer_name:    d.engineer_name,
        issues_found:     d.issues_found     || null,
        work_completed:   d.work_completed   || null,
        ongoing_projects: d.ongoing_projects || null,
        pending_items:    d.pending_items    || null,
        target_completion: d.target_completion || null,
        created_by:       user.full_name,
        user_id:          user.id,
    };

    try {
        if (existingId) {
            const { error } = await supabase.from('daily_updates').update(record).eq('id', existingId);
            if (error) { toast(`Error: ${error.message}`, 'err'); return; }
            toast(`✓ Daily update for ${record.outlet} updated`, 'ok');
        } else {
            const { error } = await supabase.from('daily_updates').insert(record);
            if (error) {
                if (error.code === '23505') {
                    toast('Update already exists for this outlet today. Edit the existing update.', 'err');
                } else {
                    toast(`Error: ${error.message}`, 'err');
                }
                return;
            }
            toast(`✓ Daily update for ${record.outlet} submitted`, 'ok');
            addAuditLog(`Daily update submitted for ${record.outlet} by ${user.full_name}.`, 'create');
        }

        closeDailyUpdateModal();
        const fresh = await fetchDailyUpdates(selectedDate);
        renderDailyUpdatesGrid(fresh);
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

// ─── EVENT LISTENERS ──────────────────────────────────────────────────────────

export function initDailyUpdatesEventListeners() {
    const submitBtn  = document.getElementById('btn-submit-daily-update');
    const modal      = document.getElementById('daily-update-modal');
    const form       = document.getElementById('daily-update-form');
    const cancelBtn  = document.getElementById('btn-cancel-daily-update');
    const dateInput  = document.getElementById('daily-update-date');
    const grid       = document.getElementById('daily-updates-grid');

    // Set today's date on the date picker
    if (dateInput) {
        dateInput.value = selectedDate;
        dateInput.addEventListener('change', async () => {
            selectedDate = dateInput.value;
            const fresh = await fetchDailyUpdates(selectedDate);
            renderDailyUpdatesGrid(fresh);
        });
    }

    if (submitBtn) submitBtn.addEventListener('click', () => openDailyUpdateModal());
    if (cancelBtn) cancelBtn.addEventListener('click', closeDailyUpdateModal);
    if (modal)     modal.addEventListener('click', e => { if (e.target === modal) closeDailyUpdateModal(); });
    if (form)      form.addEventListener('submit', handleDailyUpdateSubmit);

    // Card button delegation
    if (grid) {
        grid.addEventListener('click', e => {
            const outlet = e.target.dataset.outlet;
            if (!outlet) return;
            if (e.target.matches('.btn-submit-outlet-daily')) openDailyUpdateModal(outlet);
            if (e.target.matches('.btn-edit-daily'))          openDailyUpdateModal(outlet);
        });
    }
}
