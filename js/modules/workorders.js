// js/workorders.js — Phase 5: pagination (5.6) added on top of Phase 3 version

import {
    sendWhatsAppNotification, formatNewWoMessage,
    formatAcceptedWoMessage, formatCompletedWoMessage
} from '../shared/notifications.js'
import { supabase }                    from '../utils/supabase.js';
import { getCurrentUserProfile }       from '../shared/auth.js';
import { addAuditLog }                 from '../shared/audit.js';
import {
    toast, showModal, closeModal, showImageLightbox,
    showTableLoading, emptyTableRow
} from '../core/ui.js';
import { formatDateShort, formatIDR, formatTargetDate, escapeHtml } from '../utils/utils.js';
import { FONNTE_TARGET_WO }            from '../utils/config.js';
import { openCommentsModal }           from '../core/comments.js';
import { getOutlets }                  from '../utils/outlets.js';

/**
 * Phase 1 fixes + Phase 2 + Phase 3 features, all retained.
 * Phase 5 (5.6): WO table pagination — 25 rows initial, Load More button.
 */

// ─── STATE ────────────────────────────────────────────────────────────────────
let activeWorkOrders  = [];
let editingWOId       = null;
let pendingAction     = null;
let isSubmittingWo    = false;
let selectedPhotoFile = null;

// 3.1: Filter state
const filterState = { search: '', outlet: '', status: '', priority: '' };

// 5.6: Pagination
const PAGE_SIZE   = 25;
let displayedCount = PAGE_SIZE;

// ─── DOM ──────────────────────────────────────────────────────────────────────
const woTbody       = document.getElementById('wo-tbody');
const woForm        = document.getElementById('wo-form');
const formTitle     = document.getElementById('form-panel-title');
const nextIdLabel   = document.getElementById('next-id-lbl');
const cancelEditBtn = document.getElementById('btn-cancel-edit');
const submitBtnText = document.getElementById('submit-text');
const submitBtnIcon = document.getElementById('submit-icon');

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function getPriorityClass(p) {
    return { Low:'bp-low', Medium:'bp-medium', High:'bp-high', Emergency:'bp-emergency' }[p] || 'bp-low';
}
function getStatusClass(s) {
    return { 'Pending':'bs-pending','In Progress':'bs-ip','Waiting for Parts':'bs-wfp','Completed':'bs-done' }[s] || 'bs-pending';
}
function isOverdue(wo) {
    if (wo.status === 'Completed' || !wo.target_date) return false;
    const t = new Date(); t.setHours(23,59,59,999);
    return t > new Date(wo.target_date + 'T23:59:59');
}
async function getNextWOId() {
    const { data, error } = await supabase.from('work_orders')
        .select('id').order('created_at',{ascending:false}).limit(1);
    if (error || !data?.length) return 'WO-0001';
    return `WO-${String(parseInt(data[0].id.replace('WO-',''),10)+1).padStart(4,'0')}`;
}
export function getActiveWorkOrders() { return activeWorkOrders; }

// ─── FILTERS (3.1) ────────────────────────────────────────────────────────────
function applyFilters(wos) {
    return wos.filter(wo => {
        if (filterState.outlet   && wo.outlet   !== filterState.outlet)   return false;
        if (filterState.status   && wo.status   !== filterState.status)   return false;
        if (filterState.priority && wo.priority !== filterState.priority) return false;
        if (filterState.search) {
            const q = filterState.search.toLowerCase();
            const h = [wo.id, wo.outlet, wo.description, wo.created_by, wo.accepted_by,
                       wo.assets?.asset_code, wo.assets?.model, wo.asset_other, wo.type]
                .filter(Boolean).join(' ').toLowerCase();
            if (!h.includes(q)) return false;
        }
        return true;
    });
}

function updateFilterCount(total, filtered) {
    const el = document.getElementById('filter-count');
    if (!el) return;
    el.textContent = total === filtered
        ? `${total} ticket${total !== 1 ? 's' : ''}`
        : `${filtered} of ${total} tickets`;
    el.style.color = total !== filtered ? 'var(--ng-green)' : '#6B7280';
}

// ─── PHOTO UPLOAD (2.1) ───────────────────────────────────────────────────────
function clearPhotoState() {
    selectedPhotoFile = null;
    const prev = document.getElementById('form-prev');
    const thumb = document.getElementById('form-thumb');
    if (prev)  prev.style.display = 'none';
    if (thumb) thumb.src = '';
    ['inp-camera','inp-gallery'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

async function uploadWoPhoto(file, woId) {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const { error } = await supabase.storage.from('wo-photos')
        .upload(`${woId}/${Date.now()}.${ext}`, file, { cacheControl:'3600', upsert:false });
    if (error) { toast('Photo upload failed — WO saved without photo.','err'); return null; }
    const { data } = supabase.storage.from('wo-photos').getPublicUrl(`${woId}/${Date.now()}.${ext}`);
    return data.publicUrl;
}

function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('Only image files are allowed.','err'); e.target.value=''; return; }
    if (file.size > 5*1024*1024) { toast('Image must be under 5 MB.','err'); e.target.value=''; return; }
    selectedPhotoFile = file;
    const reader = new FileReader();
    reader.onload = ev => {
        const thumb = document.getElementById('form-thumb');
        const prev  = document.getElementById('form-prev');
        if (thumb) thumb.src = ev.target.result;
        if (prev)  prev.style.display = 'flex';
    };
    reader.readAsDataURL(file);
}

// ─── PM COMPLETION (2.2) ──────────────────────────────────────────────────────
function advanceNextDate(d, freq) {
    const dt = new Date(d + 'T00:00:00Z');
    const m = { Daily:1, Weekly:7 };
    if (freq === 'Daily')       dt.setUTCDate(dt.getUTCDate()+1);
    else if (freq === 'Weekly') dt.setUTCDate(dt.getUTCDate()+7);
    else if (freq === 'Monthly')     dt.setUTCMonth(dt.getUTCMonth()+1);
    else if (freq === 'Quarterly')   dt.setUTCMonth(dt.getUTCMonth()+3);
    else if (freq === 'Semi Annual') dt.setUTCMonth(dt.getUTCMonth()+6);
    else if (freq === 'Annual')      dt.setUTCFullYear(dt.getUTCFullYear()+1);
    else dt.setUTCMonth(dt.getUTCMonth()+1);
    return dt.toISOString().split('T')[0];
}

async function advancePmSchedule(scheduleId) {
    const { data: s } = await supabase.from('maintenance_schedule').select('*').eq('id',scheduleId).single();
    if (!s) return;
    await supabase.from('maintenance_schedule')
        .update({ next_date: advanceNextDate(s.next_date, s.frequency), status:'Pending' })
        .eq('id', scheduleId);
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function renderWORow(wo) {
    const user = getCurrentUserProfile();
    const canModify = ['admin','manager','technician'].includes(user?.role);

    const asset = wo.assets;
    const assetLabel = asset
        ? `${escapeHtml(asset.asset_code||'N/A')}: ${escapeHtml(asset.model||asset.category)}`
        : escapeHtml(wo.asset_other||'Non-Registered');

    const rawDesc = wo.description || '';
    const description = escapeHtml(rawDesc.length > 95 ? rawDesc.slice(0,95)+'…' : rawDesc);
    const typeLabel = wo.type ? `<div style="font-size:10px;color:#9CA3AF;margin-top:2px;">${escapeHtml(wo.type)}</div>` : '';

    let actionsHTML = '';
    if (canModify) {
        if (wo.status === 'Pending') {
            actionsHTML = `<button class="btn-accept" data-id="${escapeHtml(wo.id)}">Accept Ticket</button>`;
        } else if (wo.status === 'In Progress' || wo.status === 'Waiting for Parts') {
            actionsHTML = `
                <select class="status-sel" data-id="${escapeHtml(wo.id)}">
                    <option ${wo.status==='In Progress'?'selected':''}>In Progress</option>
                    <option ${wo.status==='Waiting for Parts'?'selected':''}>Waiting for Parts</option>
                </select>
                <button class="btn-done" data-id="${escapeHtml(wo.id)}">✓ Mark Done</button>`;
        } else {
            actionsHTML = `<span style="font-size:11px;color:#065F46;font-weight:700;">✓ Resolved</span>`;
        }
    } else {
        actionsHTML = `<span style="font-size:11px;color:#6B7280;font-style:italic;">View Only</span>`;
    }

    const notesBtn  = `<button class="btn-notes" data-id="${escapeHtml(wo.id)}">💬 Notes</button>`;
    const adminHTML = user?.role === 'admin' ? `
        <div style="display:flex;gap:5px;margin-top:6px;">
            <button data-action="edit"   data-id="${escapeHtml(wo.id)}" class="admin-btn edit">Edit</button>
            <button data-action="delete" data-id="${escapeHtml(wo.id)}" class="admin-btn delete">Delete</button>
        </div>` : '';

    return `
        <tr class="${wo.priority==='Emergency'?'row-em':''}">
            <td>
                <div class="wo-id">${escapeHtml(wo.id)}</div>
                <div style="font-size:11.5px;font-weight:600;color:#374151;line-height:1.3;margin-top:1px;">${escapeHtml(wo.outlet)}</div>
                ${isOverdue(wo)?'<span class="badge b-overdue" style="margin-top:3px;display:inline-block;">OVERDUE</span>':''}
            </td>
            <td>
                <div style="font-size:11.5px;color:#374151;margin-bottom:4px;">${assetLabel}</div>
                <span class="badge ${getPriorityClass(wo.priority)}">${escapeHtml(wo.priority)}</span>${typeLabel}
            </td>
            <td>
                <div style="font-size:12px;color:#374151;line-height:1.4;">${description}</div>
                <div style="font-size:10.5px;color:#9CA3AF;margin-top:4px;">By: ${escapeHtml(wo.created_by)}</div>
            </td>
            <td>
                <div style="font-size:11px;line-height:1.75;color:#6B7280;">
                    <div><b style="color:#374151;">Created</b>&nbsp;${formatDateShort(wo.created_at)}</div>
                    ${wo.accepted_at
                        ? `<div><b style="color:#374151;">Accepted</b>&nbsp;${formatDateShort(wo.accepted_at)}<br><span style="font-size:10px;color:#9CA3AF;">${escapeHtml(wo.accepted_by)}</span></div>`
                        : '<div style="color:#D1D5DB;">Awaiting</div>'}
                    ${wo.completed_at
                        ? `<div><b style="color:#065F46;">Done</b>&nbsp;${formatDateShort(wo.completed_at)}<br><span style="font-size:10px;color:#9CA3AF;">${escapeHtml(wo.completed_by)}</span></div>` : ''}
                </div>
            </td>
            <td>
                <div style="font-size:12px;font-weight:700;color:#374151;white-space:nowrap;">${formatIDR(wo.cost)}</div>
                <div style="font-size:10.5px;color:#9CA3AF;margin-top:2px;">Target: ${formatTargetDate(wo.target_date)}</div>
            </td>
            <td>${wo.image_url
                ?`<img src="${escapeHtml(wo.image_url)}" class="img-thumb" data-id="${escapeHtml(wo.id)}" alt="Photo">`
                :'<span style="color:#D1D5DB;font-size:20px;">—</span>'}</td>
            <td>
                <div style="margin-bottom:5px;"><span class="badge ${getStatusClass(wo.status)}">${escapeHtml(wo.status)}</span></div>
                <div style="display:flex;flex-direction:column;gap:4px;">${actionsHTML}${notesBtn}</div>
                ${adminHTML}
            </td>
        </tr>`;
}

/**
 * 5.6: Renders WO table with pagination (25 rows + Load More).
 */
export function renderWorkOrdersTable() {
    const priorityOrder = { Emergency:0, High:1, Medium:2, Low:3 };
    const sorted = [...activeWorkOrders].sort((a,b) => {
        const aD=a.status==='Completed', bD=b.status==='Completed';
        if (aD!==bD) return aD?1:-1;
        if (a.priority!==b.priority) return (priorityOrder[a.priority]??9)-(priorityOrder[b.priority]??9);
        return new Date(b.created_at)-new Date(a.created_at);
    });

    const filtered  = applyFilters(sorted);
    const toShow    = filtered.slice(0, displayedCount);
    const remaining = filtered.length - toShow.length;

    updateFilterCount(sorted.length, filtered.length);

    if (filtered.length === 0) {
        const msg = sorted.length === 0
            ? 'No work orders yet. Create one to get started!'
            : 'No work orders match the current filters.';
        woTbody.innerHTML = emptyTableRow(msg, 7);
    } else {
        woTbody.innerHTML = toShow.map(renderWORow).join('');
    }

    // Load More button
    const loadMoreEl = document.getElementById('wo-load-more');
    if (loadMoreEl) {
        if (remaining > 0) {
            const next = Math.min(remaining, PAGE_SIZE);
            loadMoreEl.innerHTML = `
                <button class="btn-load-more" id="btn-wo-load-more">
                    Load ${next} more
                    <span class="load-more-count">${remaining} remaining</span>
                </button>`;
            document.getElementById('btn-wo-load-more')?.addEventListener('click', () => {
                displayedCount += PAGE_SIZE;
                renderWorkOrdersTable();
            });
        } else {
            loadMoreEl.innerHTML = '';
        }
    }
}

// ─── DATA ─────────────────────────────────────────────────────────────────────
export async function fetchWorkOrders() {
    showTableLoading(woTbody, 7, 'Loading work orders…');
    const { data, error } = await supabase
        .from('work_orders').select(`*, assets (*)`).order('created_at',{ascending:false});
    if (error) { console.error('Error fetching WOs:', error); toast('Failed to load work orders','err'); return []; }
    activeWorkOrders = data;
    return data;
}

// ─── FORM SUBMIT ──────────────────────────────────────────────────────────────
async function handleFormSubmit(e) {
    e.preventDefault();
    if (isSubmittingWo) return;
    isSubmittingWo = true;
    const submitBtn = woForm.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
        const user   = getCurrentUserProfile();
        const woData = Object.fromEntries(new FormData(woForm).entries());

        if (!woData.asset_id && !woData.asset_other) {
            toast('Please select a registered asset or describe the task.','err');
            return;
        }

        const record = {
            outlet: woData.outlet, type: woData.type || 'Corrective',
            asset_id: woData.asset_id ? parseInt(woData.asset_id,10) : null,
            asset_other: woData.asset_other || null,
            priority: woData.priority, created_by: woData.created_by,
            description: woData.description,
            schedule_id: woData.schedule_id ? parseInt(woData.schedule_id,10) : null,
            user_id: user.id,
        };

        if (editingWOId) {
            const { error } = await supabase.from('work_orders').update(record).eq('id',editingWOId);
            if (error) { toast(`Error updating ${editingWOId}: ${error.message}`,'err'); return; }
            toast(`✓ ${editingWOId} updated`,'ok');
            addAuditLog(`${editingWOId} — updated by ${user.full_name}.`,'status');
            cancelEdit();
        } else {
            record.id = await getNextWOId();
            record.status = 'Pending';
            if (selectedPhotoFile) {
                if (submitBtn) submitBtn.textContent = 'Uploading…';
                const url = await uploadWoPhoto(selectedPhotoFile, record.id);
                if (url) record.image_url = url;
            }
            const { error } = await supabase.from('work_orders').insert(record);
            if (error) { toast(`Error creating ticket: ${error.message}`,'err'); return; }
            toast(`✓ ${record.id} submitted`,'ok');
            addAuditLog(`${record.id} · ${record.outlet} — Created by ${record.created_by}. Priority: ${record.priority}.`,'create');
            sendWhatsAppNotification(formatNewWoMessage(record), FONNTE_TARGET_WO);
            woForm.reset();
            clearPhotoState();
            updateNextIdLabel();
        }
    } finally {
        isSubmittingWo = false;
        if (submitBtn) { submitBtn.disabled=false; submitBtn.textContent=editingWOId?'Update Work Order':'Submit Work Order'; }
    }
}

async function updateWorkOrderStatus(woId, newStatus) {
    const wo = activeWorkOrders.find(w=>w.id===woId);
    if (!wo || wo.status===newStatus) return;
    const { error } = await supabase.from('work_orders').update({status:newStatus}).eq('id',woId);
    if (error) { toast(`Error updating status for ${woId}`,'err'); renderWorkOrdersTable(); }
    else addAuditLog(`${woId} · ${wo.outlet} — Status → "${newStatus}".`,'status');
}

// ─── FORM MANAGEMENT ──────────────────────────────────────────────────────────
export function populateWoForm(data) {
    cancelEdit();
    const woAssetSelect = document.getElementById('f-asset-select');
    const scheduleInput = woForm.querySelector('#wo-schedule-id');
    if (data.asset_id && woAssetSelect) woAssetSelect.value = data.asset_id;
    if (data.description) woForm.querySelector('#f-desc').value      = data.description;
    if (data.outlet)      woForm.querySelector('#f-outlet').value    = data.outlet;
    if (data.priority)    woForm.querySelector('#f-priority').value  = data.priority;
    if (data.type)        { const t=woForm.querySelector('#f-type'); if(t) t.value=data.type; }
    if (scheduleInput)    scheduleInput.value = data.schedule_id || '';
}

function startEdit(woId) {
    const wo = activeWorkOrders.find(w=>w.id===woId);
    if (!wo) return;
    editingWOId = woId;
    const sel = document.getElementById('f-asset-select');
    if (sel) sel.value = wo.asset_id || '';
    woForm.querySelector('#f-outlet').value      = wo.outlet      || '';
    woForm.querySelector('#f-asset-other').value = wo.asset_other || '';
    woForm.querySelector('#f-priority').value    = wo.priority    || '';
    woForm.querySelector('#f-by').value          = wo.created_by  || '';
    woForm.querySelector('#f-desc').value        = wo.description || '';
    const tf = woForm.querySelector('#f-type');
    if (tf) tf.value = wo.type || 'Corrective';
    formTitle.textContent='Editing Work Order'; nextIdLabel.textContent=editingWOId;
    cancelEditBtn.style.display='flex'; submitBtnText.textContent='Update Work Order';
    submitBtnIcon.setAttribute('data-lucide','save'); window.lucide.createIcons();
    window.scrollTo({top:0,behavior:'smooth'});
}

export function cancelEdit() {
    editingWOId = null;
    woForm.reset();
    clearPhotoState();
    formTitle.textContent='Log Work Order'; cancelEditBtn.style.display='none';
    submitBtnText.textContent='Submit Work Order';
    submitBtnIcon.setAttribute('data-lucide','send'); window.lucide.createIcons();
    updateNextIdLabel();
    const user = getCurrentUserProfile();
    if (user) woForm.querySelector('#f-by').value = user.full_name;
}

export async function updateNextIdLabel() {
    if (!editingWOId) nextIdLabel.textContent = await getNextWOId();
}

// ─── MODALS ───────────────────────────────────────────────────────────────────
function openAcceptModal(woId) {
    const wo=activeWorkOrders.find(w=>w.id===woId); if(!wo) return;
    pendingAction={type:'accept',woId};
    const user=getCurrentUserProfile();
    const name=user.role==='technician'?escapeHtml(user.full_name):'';
    showModal('Accept Work Order',`${wo.id} — ${wo.outlet}`,`
        <div class="fgrp"><label class="flbl">Engineer / Technician Name *</label>
            <input type="text" class="fctl" id="m-eng" placeholder="Engineer name..." value="${name}"></div>
        <div class="fcols">
            <div class="fgrp"><label class="flbl">Target Completion Date *</label><input type="date" class="fctl" id="m-target"></div>
            <div class="fgrp"><label class="flbl">Est. Cost (IDR)</label><input type="number" class="fctl" id="m-cost" placeholder="0" min="0"></div>
        </div>
        <div class="info-callout" style="margin-top:10px;">
            <strong>Accepted on:</strong> ${new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'})}
        </div>`);
}

function openDoneModal(woId) {
    const wo=activeWorkOrders.find(w=>w.id===woId); if(!wo) return;
    pendingAction={type:'done',woId};
    showModal('Mark Work Order Complete',`${wo.id} — ${wo.outlet}`,`
        <div class="fgrp"><label class="flbl">Actual Cost (IDR)</label>
            <input type="number" class="fctl" id="m-actual-cost" placeholder="0" min="0" value="${wo.cost||''}"></div>
        <div class="info-callout">Confirming will mark this work order as <strong>Completed</strong>.</div>`);
}

function openDeleteModal(woId) {
    const wo=activeWorkOrders.find(w=>w.id===woId); if(!wo) return;
    pendingAction={type:'delete',woId};
    showModal('Delete Work Order',`${wo.id} — ${wo.outlet}`,`
        <div class="info-callout" style="background:#FEF2F2;border-color:#FECACA;color:#991B1B;">
            This action <strong>cannot be undone</strong>. <strong>${escapeHtml(wo.id)}</strong> will be permanently removed.
        </div>`);
}

export async function handleModalConfirm() {
    if (!pendingAction) return;
    const {type,woId}=pendingAction; const user=getCurrentUserProfile();

    if (type==='accept') {
        const eng=document.getElementById('m-eng').value.trim();
        const target=document.getElementById('m-target').value;
        const cost=parseFloat(document.getElementById('m-cost').value)||0;
        if (!eng||!target) { toast('Engineer name and target date are required.','err'); return; }
        const updates={status:'In Progress',accepted_at:new Date().toISOString(),accepted_by:eng,target_date:target,cost};
        const {error}=await supabase.from('work_orders').update(updates).eq('id',woId);
        if (error) { toast('Error accepting ticket.','err'); }
        else {
            toast(`✓ ${woId} accepted by ${eng}`,'ok');
            addAuditLog(`${woId} — Accepted by ${eng}. Target: ${formatTargetDate(target)}.`,'accept');
            const wo=activeWorkOrders.find(w=>w.id===woId);
            sendWhatsAppNotification(formatAcceptedWoMessage({...wo,...updates}),FONNTE_TARGET_WO);
        }
    }
    if (type==='done') {
        const actualCost=parseFloat(document.getElementById('m-actual-cost').value)||0;
        const updates={status:'Completed',completed_at:new Date().toISOString(),completed_by:user.full_name,cost:actualCost};
        const {error}=await supabase.from('work_orders').update(updates).eq('id',woId);
        if (error) { toast('Error completing ticket.','err'); }
        else {
            toast(`✓ ${woId} marked as completed`,'ok');
            addAuditLog(`${woId} — Completed by ${user.full_name}. Cost: ${formatIDR(actualCost)}.`,'complete');
            const wo=activeWorkOrders.find(w=>w.id===woId);
            sendWhatsAppNotification(formatCompletedWoMessage({...wo,...updates}),FONNTE_TARGET_WO);
            if (wo?.schedule_id) await advancePmSchedule(wo.schedule_id);
        }
    }
    if (type==='delete') {
        const {error}=await supabase.from('work_orders').delete().eq('id',woId);
        if (error) { toast(`Error: ${error.message}`,'err'); }
        else { toast(`✓ ${woId} deleted.`,'ok'); addAuditLog(`${woId} — Deleted by ${user.full_name}.`,'delete'); }
    }
    closeModal(); pendingAction=null;
}

// ─── FILTER INIT (3.1 + 5.6) ─────────────────────────────────────────────────
export function initFilterEventListeners() {
    const searchInput    = document.getElementById('filter-search');
    const outletFilter   = document.getElementById('filter-outlet');
    const statusFilter   = document.getElementById('filter-status');
    const priorityFilter = document.getElementById('filter-priority');
    const clearBtn       = document.getElementById('filter-clear');

    if (outletFilter) {
        getOutlets().forEach(name => {
            const opt=document.createElement('option'); opt.value=name; opt.textContent=name;
            outletFilter.appendChild(opt);
        });
    }

    function resetPage() { displayedCount = PAGE_SIZE; }

    if (searchInput) searchInput.addEventListener('input', ()=>{ filterState.search=searchInput.value; resetPage(); renderWorkOrdersTable(); });
    if (outletFilter) outletFilter.addEventListener('change', ()=>{ filterState.outlet=outletFilter.value; resetPage(); renderWorkOrdersTable(); });
    if (statusFilter) statusFilter.addEventListener('change', ()=>{ filterState.status=statusFilter.value; resetPage(); renderWorkOrdersTable(); });
    if (priorityFilter) priorityFilter.addEventListener('change', ()=>{ filterState.priority=priorityFilter.value; resetPage(); renderWorkOrdersTable(); });
    if (clearBtn) clearBtn.addEventListener('click', ()=>{
        filterState.search=filterState.outlet=filterState.status=filterState.priority='';
        if (searchInput)    searchInput.value='';
        if (outletFilter)   outletFilter.value='';
        if (statusFilter)   statusFilter.value='';
        if (priorityFilter) priorityFilter.value='';
        resetPage(); renderWorkOrdersTable();
    });
}

// ─── EVENT LISTENERS ──────────────────────────────────────────────────────────
export function initWorkOrderEventListeners() {
    woForm.addEventListener('submit', handleFormSubmit);
    cancelEditBtn.addEventListener('click', cancelEdit);

    const btnCamera=document.getElementById('btn-camera'); const inpCamera=document.getElementById('inp-camera');
    const btnGallery=document.getElementById('btn-gallery'); const inpGallery=document.getElementById('inp-gallery');
    if (btnCamera && inpCamera)   btnCamera.addEventListener('click',  ()=>inpCamera.click());
    if (btnGallery && inpGallery) btnGallery.addEventListener('click', ()=>inpGallery.click());
    if (inpCamera)  inpCamera.addEventListener('change',  handleFileSelect);
    if (inpGallery) inpGallery.addEventListener('change', handleFileSelect);

    woTbody.addEventListener('click', e=>{
        const target=e.target; const woId=target.dataset.id;
        if (!woId) return;
        if (target.matches('.btn-accept'))  openAcceptModal(woId);
        if (target.matches('.btn-done'))    openDoneModal(woId);
        if (target.matches('.img-thumb'))   showImageLightbox(target.src);
        if (target.matches('.btn-notes'))   openCommentsModal(woId);
        if (target.matches('.admin-btn')) {
            if (target.dataset.action==='edit')   startEdit(woId);
            if (target.dataset.action==='delete') openDeleteModal(woId);
        }
    });
    woTbody.addEventListener('change', e=>{
        if (e.target.matches('.status-sel')) updateWorkOrderStatus(e.target.dataset.id, e.target.value);
    });
}