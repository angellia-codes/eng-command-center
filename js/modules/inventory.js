// js/inventory.js

import { supabase }                     from '../utils/supabase.js';
import { getCurrentUserProfile, hasPermission } from '../shared/auth.js';
import { addAuditLog }                  from '../shared/audit.js';
import { toast, showPanelLoading, emptyStateHTML } from '../core/ui.js';
import { escapeHtml, formatIDR }        from '../utils/utils.js';

/**
 * @file Inventory / Spare Parts module — Phase 5 (5.1).
 *
 * Features: parts list with stock-level alerts, Stock In/Out,
 * movement history per part, add/edit part (managers only).
 */

let partsCache     = [];
let editingPartId  = null;
let activeStockOp  = null; // { partId, type: 'in' | 'out' }

// ─── FETCH ────────────────────────────────────────────────────────────────────

export async function fetchInventory() {
    showPanelLoading(document.getElementById('inventory-tbody-wrap'), 'Loading inventory…');

    const { data, error } = await supabase
        .from('spare_parts')
        .select('*')
        .eq('active', true)
        .order('outlet')
        .order('name');

    if (error) {
        console.error('[inventory] Fetch error:', error);
        toast('Failed to load inventory', 'err');
        return [];
    }
    partsCache = data;
    return data;
}

async function fetchMovements(partId) {
    const { data, error } = await supabase
        .from('stock_movements')
        .select('*')
        .eq('part_id', partId)
        .order('created_at', { ascending: false })
        .limit(30);
    if (error) return [];
    return data;
}

// ─── RENDER ───────────────────────────────────────────────────────────────────

function stockStatus(part) {
    if (part.current_stock === 0)                         return { cls: 'stock-out',  label: 'Out of Stock' };
    if (part.current_stock <= part.min_stock)             return { cls: 'stock-low',  label: 'Low Stock'    };
    return                                                       { cls: 'stock-ok',   label: 'OK'           };
}

export function renderInventoryList(parts) {
    const tbody = document.getElementById('inventory-tbody');
    if (!tbody) return;

    const user     = getCurrentUserProfile();
    const canManage = user && hasPermission(user, 'manage_assets');

    // Low-stock alert banner
    const lowCount = parts.filter(p => p.current_stock <= p.min_stock).length;
    const alertEl  = document.getElementById('inventory-alert');
    if (alertEl) {
        alertEl.style.display = lowCount > 0 ? 'flex' : 'none';
        alertEl.textContent   = `⚠️ ${lowCount} item${lowCount !== 1 ? 's' : ''} at or below minimum stock`;
    }

    if (!parts || parts.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="loading-cell" style="color:#9CA3AF;">
            No parts registered. Click "+ Add Part" to get started.
        </td></tr>`;
        return;
    }

    tbody.innerHTML = parts.map(p => {
        const st = stockStatus(p);
        const stockColor = st.cls === 'stock-out' ? '#EF4444' : st.cls === 'stock-low' ? '#B45309' : '#065F46';

        return `<tr>
            <td><div style="font-family:'JetBrains Mono',monospace;font-size:11px;">${escapeHtml(p.part_code || '—')}</div></td>
            <td>
                <div style="font-weight:600;font-size:12.5px;">${escapeHtml(p.name)}</div>
                ${p.location ? `<div style="font-size:10.5px;color:#9CA3AF;">${escapeHtml(p.location)}</div>` : ''}
            </td>
            <td>${escapeHtml(p.category || '—')}</td>
            <td style="font-size:11.5px;">${escapeHtml(p.outlet || 'General')}</td>
            <td style="text-align:center;font-weight:700;font-size:14px;color:${stockColor};">
                ${p.current_stock}<span style="font-size:10px;font-weight:400;color:#9CA3AF;"> ${escapeHtml(p.unit || 'pcs')}</span>
            </td>
            <td style="text-align:center;color:#6B7280;">${p.min_stock}</td>
            <td><span class="inv-status-badge inv-${st.cls}">${st.label}</span></td>
            <td>
                <div style="display:flex;gap:4px;flex-wrap:wrap;">
                    <button class="admin-btn edit btn-stock-in"  data-id="${p.id}" style="font-size:10.5px;padding:3px 7px;background:#D1FAE5;border-color:#065F46;color:#065F46;">+ In</button>
                    <button class="admin-btn btn-stock-out"      data-id="${p.id}" style="font-size:10.5px;padding:3px 7px;background:#FEE2E2;border-color:#991B1B;color:#991B1B;">− Out</button>
                    <button class="admin-btn btn-part-history"   data-id="${p.id}" style="font-size:10.5px;padding:3px 7px;">📋</button>
                    ${canManage ? `<button class="admin-btn edit btn-edit-part" data-id="${p.id}" style="font-size:10.5px;padding:3px 7px;">Edit</button>` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ─── PART MODAL (add / edit) ──────────────────────────────────────────────────

export function openPartModal(partId = null) {
    const user = getCurrentUserProfile();
    if (!hasPermission(user, 'manage_assets')) {
        toast('You do not have permission to manage inventory.', 'err');
        return;
    }

    editingPartId = partId;
    const modal   = document.getElementById('part-modal');
    const form    = document.getElementById('part-form');
    const title   = document.getElementById('part-modal-title');
    const submit  = form?.querySelector('[type="submit"]');
    if (!modal || !form) return;

    form.reset();

    if (partId) {
        const p = partsCache.find(x => x.id === partId);
        if (p) {
            if (title)  title.textContent    = 'Edit Part';
            if (submit) submit.textContent   = 'Update Part';
            form.querySelector('[name="part_code"]').value  = p.part_code  || '';
            form.querySelector('[name="name"]').value       = p.name       || '';
            form.querySelector('[name="category"]').value  = p.category   || '';
            form.querySelector('[name="unit"]').value       = p.unit       || 'pcs';
            form.querySelector('[name="outlet"]').value    = p.outlet     || '';
            form.querySelector('[name="location"]').value  = p.location   || '';
            form.querySelector('[name="min_stock"]').value = p.min_stock  ?? 0;
            form.querySelector('[name="current_stock"]').value = p.current_stock ?? 0;
            form.querySelector('[name="notes"]').value     = p.notes      || '';
        }
    } else {
        if (title)  title.textContent  = 'Register New Part';
        if (submit) submit.textContent = 'Save Part';
    }

    modal.style.display = 'flex';
}

function closePartModal() {
    const modal = document.getElementById('part-modal');
    if (modal) modal.style.display = 'none';
    editingPartId = null;
}

async function handlePartFormSubmit(e) {
    e.preventDefault();
    const user      = getCurrentUserProfile();
    const formData  = new FormData(e.target);
    const data      = Object.fromEntries(formData.entries());
    const submitBtn = e.target.querySelector('[type="submit"]');

    if (submitBtn) submitBtn.disabled = true;

    const record = {
        part_code:     data.part_code     || null,
        name:          data.name,
        category:      data.category      || null,
        unit:          data.unit          || 'pcs',
        outlet:        data.outlet        || null,
        location:      data.location      || null,
        min_stock:     parseInt(data.min_stock, 10)     || 0,
        current_stock: parseInt(data.current_stock, 10) || 0,
        notes:         data.notes         || null,
    };

    try {
        if (editingPartId) {
            const { error } = await supabase.from('spare_parts').update(record).eq('id', editingPartId);
            if (error) { toast(`Error: ${error.message}`, 'err'); return; }
            toast(`✓ Part updated`, 'ok');
            addAuditLog(`Spare part "${record.name}" updated by ${user.full_name}.`, 'status');
        } else {
            const { error } = await supabase.from('spare_parts').insert(record);
            if (error) { toast(`Error: ${error.message}`, 'err'); return; }
            toast(`✓ Part "${record.name}" registered`, 'ok');
            addAuditLog(`New spare part registered: ${record.name} (${record.part_code || 'no code'}).`, 'create');
        }
        closePartModal();
        const fresh = await fetchInventory();
        renderInventoryList(fresh);
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

// ─── STOCK IN / OUT MODAL ─────────────────────────────────────────────────────

export function openStockModal(partId, type) {
    const part  = partsCache.find(p => p.id === partId);
    if (!part) return;
    activeStockOp = { partId, type };

    const modal    = document.getElementById('stock-modal');
    const titleEl  = document.getElementById('stock-modal-title');
    const subEl    = document.getElementById('stock-modal-sub');
    const maxEl    = document.getElementById('stock-max-hint');
    if (!modal) return;

    if (titleEl) titleEl.textContent = type === 'in' ? 'Stock In' : 'Stock Out';
    if (subEl)   subEl.textContent   = `${part.part_code ? part.part_code + ' — ' : ''}${part.name}`;
    if (maxEl)   maxEl.textContent   = type === 'out'
        ? `Available: ${part.current_stock} ${part.unit || 'pcs'}`
        : `Current stock: ${part.current_stock} ${part.unit || 'pcs'}`;

    const form = document.getElementById('stock-form');
    if (form) form.reset();

    modal.style.display = 'flex';
}

function closeStockModal() {
    const modal = document.getElementById('stock-modal');
    if (modal) modal.style.display = 'none';
    activeStockOp = null;
}

async function handleStockFormSubmit(e) {
    e.preventDefault();
    if (!activeStockOp) return;

    const { partId, type } = activeStockOp;
    const part     = partsCache.find(p => p.id === partId);
    const user     = getCurrentUserProfile();
    const formData = new FormData(e.target);
    const qty      = parseInt(formData.get('qty'), 10);
    const ref      = formData.get('reference') || null;

    if (!qty || qty <= 0) { toast('Quantity must be greater than 0.', 'err'); return; }

    if (type === 'out' && qty > part.current_stock) {
        toast(`Insufficient stock. Available: ${part.current_stock} ${part.unit || 'pcs'}`, 'err');
        return;
    }

    const newStock  = type === 'in' ? part.current_stock + qty : part.current_stock - qty;
    const submitBtn = e.target.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
        // Record movement
        const { error: movErr } = await supabase.from('stock_movements').insert({
            part_id:    partId,
            type,
            qty,
            reference:  ref,
            created_by: user.full_name,
            user_id:    user.id,
        });
        if (movErr) { toast(`Error: ${movErr.message}`, 'err'); return; }

        // Update stock level
        const { error: partErr } = await supabase
            .from('spare_parts').update({ current_stock: newStock }).eq('id', partId);
        if (partErr) { toast(`Error updating stock: ${partErr.message}`, 'err'); return; }

        const label = type === 'in' ? `+${qty}` : `-${qty}`;
        toast(`✓ ${part.name}: ${label} ${part.unit || 'pcs'} (now ${newStock})`, 'ok');
        addAuditLog(`Stock ${type} — ${qty} ${part.unit || 'pcs'} of "${part.name}"${ref ? ` (Ref: ${ref})` : ''} by ${user.full_name}.`, 'status');

        closeStockModal();
        const fresh = await fetchInventory();
        renderInventoryList(fresh);
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

// ─── MOVEMENT HISTORY MODAL ───────────────────────────────────────────────────

async function openHistoryModal(partId) {
    const part   = partsCache.find(p => p.id === partId);
    const modal  = document.getElementById('part-history-modal');
    const titleEl = document.getElementById('history-modal-title');
    const bodyEl  = document.getElementById('history-body');
    if (!modal || !bodyEl) return;

    if (titleEl) titleEl.textContent = `Movement History — ${part?.name || partId}`;
    bodyEl.innerHTML = '<div class="loading-state"><span class="spinner"></span>Loading…</div>';
    modal.style.display = 'flex';

    const movements = await fetchMovements(partId);

    if (movements.length === 0) {
        bodyEl.innerHTML = emptyStateHTML('No movements recorded yet.');
        return;
    }

    bodyEl.innerHTML = `
        <table class="wo-table" style="font-size:11.5px;">
            <thead><tr><th>Date</th><th style="width:60px;text-align:center;">Type</th><th style="width:70px;text-align:center;">Qty</th><th>Reference</th><th>By</th></tr></thead>
            <tbody>${movements.map(m => {
                const isIn  = m.type === 'in';
                const color = isIn ? '#065F46' : '#991B1B';
                const sign  = isIn ? '+' : '−';
                const ts    = new Date(m.created_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
                return `<tr>
                    <td style="font-size:11px;">${ts}</td>
                    <td style="text-align:center;"><span style="color:${color};font-weight:700;text-transform:uppercase;font-size:10px;">${m.type}</span></td>
                    <td style="text-align:center;font-weight:700;color:${color};">${sign}${m.qty}</td>
                    <td style="font-size:11px;color:#6B7280;">${escapeHtml(m.reference || '—')}</td>
                    <td style="font-size:11px;">${escapeHtml(m.created_by)}</td>
                </tr>`;
            }).join('')}</tbody>
        </table>`;
}

function closeHistoryModal() {
    const modal = document.getElementById('part-history-modal');
    if (modal) modal.style.display = 'none';
}

// ─── EVENT LISTENERS ──────────────────────────────────────────────────────────

export function initInventoryEventListeners() {
    const tbody       = document.getElementById('inventory-tbody');
    const addBtn      = document.getElementById('btn-show-add-part');
    const partModal   = document.getElementById('part-modal');
    const partForm    = document.getElementById('part-form');
    const cancelPart  = document.getElementById('btn-cancel-part-modal');
    const stockModal  = document.getElementById('stock-modal');
    const stockForm   = document.getElementById('stock-form');
    const cancelStock = document.getElementById('btn-cancel-stock-modal');
    const histModal   = document.getElementById('part-history-modal');
    const closeHist   = document.getElementById('btn-close-history-modal');

    if (addBtn)      addBtn.addEventListener('click', () => openPartModal());
    if (cancelPart)  cancelPart.addEventListener('click', closePartModal);
    if (cancelStock) cancelStock.addEventListener('click', closeStockModal);
    if (closeHist)   closeHist.addEventListener('click', closeHistoryModal);
    if (partModal)   partModal.addEventListener('click',  e => { if (e.target === partModal)  closePartModal();   });
    if (stockModal)  stockModal.addEventListener('click', e => { if (e.target === stockModal) closeStockModal();  });
    if (histModal)   histModal.addEventListener('click',  e => { if (e.target === histModal)  closeHistoryModal();});
    if (partForm)    partForm.addEventListener('submit', handlePartFormSubmit);
    if (stockForm)   stockForm.addEventListener('submit', handleStockFormSubmit);

    if (tbody) {
        tbody.addEventListener('click', e => {
            const id = parseInt(e.target.dataset.id, 10);
            if (!id) return;
            if (e.target.matches('.btn-stock-in'))    openStockModal(id, 'in');
            if (e.target.matches('.btn-stock-out'))   openStockModal(id, 'out');
            if (e.target.matches('.btn-part-history')) openHistoryModal(id);
            if (e.target.matches('.btn-edit-part'))   openPartModal(id);
        });
    }
}
