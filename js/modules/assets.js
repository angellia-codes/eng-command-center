// js/assets.js

import { supabase } from '../utils/supabase.js';
import { toast } from '../core/ui.js';
import { addAuditLog } from '../shared/audit.js';
import { escapeHtml } from '../utils/utils.js';
import { hasPermission } from '../shared/auth.js';
import { getCurrentUserProfile } from '../shared/auth.js';
import { populateOutletSelect } from '../utils/outlets.js';

/**
 * @file Manages Asset Registry data and UI.
 *
 * Phase 2 additions:
 *   2.4 — renderAssetList() populates the previously-empty #asset-list-container
 *   2.5 — openAssetModal() supports edit mode; decommissionAsset() added
 *   2.7 — hasPermission guard on create/edit/decommission
 */

const assetModal    = document.getElementById('asset-modal');
const assetForm     = document.getElementById('asset-form');
const woAssetSelect = document.getElementById('f-asset-select');

let assetCache      = [];
let isSubmitting    = false;
let editingAssetId  = null; // 2.5: null = create mode, number = edit mode

// ─── FETCH / CACHE ────────────────────────────────────────────────────────────

export async function fetchAssets() {
    const { data, error } = await supabase
        .from('assets')
        .select('*')
        .order('outlet')
        .order('asset_code');

    if (error) {
        console.error('Error fetching assets:', error);
        toast('Failed to load assets', 'err');
        assetCache = [];
        return [];
    }
    assetCache = data;
    return data;
}

export function getAssets() { return assetCache; }

// ─── RENDER ───────────────────────────────────────────────────────────────────

/**
 * Populates the WO form asset dropdown.
 * Uses safe DOM methods — no innerHTML interpolation.
 */
export function renderAssetOptions(assets) {
    if (!woAssetSelect) return;
    woAssetSelect.innerHTML = '';

    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = 'Select a registered asset...';
    woAssetSelect.appendChild(ph);

    assets.forEach(asset => {
        const opt = document.createElement('option');
        opt.value = asset.id;
        opt.textContent = `${asset.asset_code || 'N/A'} — ${asset.model || asset.category} (${asset.outlet})`;
        woAssetSelect.appendChild(opt);
    });
}

/**
 * 2.4: Renders the asset registry list into #asset-list-container.
 * Previously this panel was permanently empty.
 */
export function renderAssetList(assets) {
    const container = document.getElementById('asset-list-container');
    if (!container) return;

    if (!assets || assets.length === 0) {
        container.innerHTML = '<div class="empty-state">No assets registered yet.</div>';
        return;
    }

    const user = getCurrentUserProfile();
    const canEdit = user && hasPermission(user, 'manage_assets');

    const statusClass = {
        'Operational':    'bs-done',
        'Under Repair':   'bs-ip',
        'In Maintenance': 'bs-wfp',
        'Decommissioned': 'bs-pending',
    };

    container.innerHTML = assets.map(asset => `
        <div class="asset-item">
            <div class="asset-item-info">
                <div class="asset-item-name">
                    ${escapeHtml(asset.asset_code || 'N/A')}: ${escapeHtml(asset.model || asset.category || 'Unknown')}
                </div>
                <div class="asset-item-details">
                    ${escapeHtml(asset.outlet)} · ${escapeHtml(asset.category || '—')}
                    ${asset.brand ? `· ${escapeHtml(asset.brand)}` : ''}
                </div>
            </div>
            <div class="asset-item-actions">
                <span class="badge ${statusClass[asset.status] || 'bs-pending'}">${escapeHtml(asset.status || 'Unknown')}</span>
                ${canEdit ? `<button class="admin-btn edit btn-edit-asset" data-id="${asset.id}">Edit</button>` : ''}
            </div>
        </div>
    `).join('');
}

// ─── MODAL ────────────────────────────────────────────────────────────────────

/**
 * 2.5: Opens asset modal in create OR edit mode.
 * @param {number|null} assetId  Pass asset ID to open in edit mode.
 */
export async function openAssetModal(assetId = null) {
    if (!assetModal || !assetForm) {
        console.warn('[assets] Modal or form element not found.');
        return;
    }

    // 2.7: Permission check
    const user = getCurrentUserProfile();
    if (!hasPermission(user, 'manage_assets')) {
        toast('You do not have permission to manage assets.', 'err');
        return;
    }

    assetForm.reset();
    editingAssetId = assetId;

    const title        = document.getElementById('asset-modal-title');
    const decommBtn    = document.getElementById('btn-decommission-asset');
    const submitBtn    = assetForm.querySelector('[type="submit"]');

    // Populate outlet select from outlets.js (always fresh)
    populateOutletSelect(assetForm.querySelector('select[name="outlet"]'));

    if (assetId) {
        // Edit mode
        if (title)     title.textContent   = 'Edit Asset';
        if (submitBtn) submitBtn.textContent = 'Update Asset';

        const asset = assetCache.find(a => a.id === assetId);
        if (asset) {
            assetForm.querySelector('input[name="asset_code"]').value     = asset.asset_code     || '';
            assetForm.querySelector('select[name="status"]').value        = asset.status         || 'Operational';
            assetForm.querySelector('select[name="outlet"]').value        = asset.outlet         || '';
            assetForm.querySelector('select[name="category"]').value      = asset.category       || '';
            assetForm.querySelector('input[name="brand"]').value          = asset.brand          || '';
            assetForm.querySelector('input[name="model"]').value          = asset.model          || '';
            assetForm.querySelector('input[name="serial_number"]').value  = asset.serial_number  || '';
            assetForm.querySelector('input[name="installation_date"]').value = asset.installation_date || '';

            // Show decommission button only for non-decommissioned assets
            if (decommBtn) {
                decommBtn.style.display = asset.status === 'Decommissioned' ? 'none' : 'inline-flex';
            }
        }
    } else {
        // Create mode
        if (title)     title.textContent   = 'Register New Asset';
        if (submitBtn) submitBtn.textContent = 'Save Asset';
        if (decommBtn) decommBtn.style.display = 'none';
    }

    assetModal.style.display = 'flex';
}

export function closeAssetModal() {
    if (assetModal) assetModal.style.display = 'none';
    editingAssetId = null;
}

// ─── MUTATIONS ────────────────────────────────────────────────────────────────

/**
 * Handles asset form submit — create or update depending on editingAssetId.
 */
async function handleAssetFormSubmit(e) {
    e.preventDefault();
    if (isSubmitting) return;
    isSubmitting = true;

    const submitBtn = assetForm.querySelector('[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Saving…'; }

    try {
        const formData  = new FormData(assetForm);
        const assetData = Object.fromEntries(formData.entries());

        // Strip empty strings
        Object.keys(assetData).forEach(k => { if (assetData[k] === '') delete assetData[k]; });

        if (editingAssetId) {
            // UPDATE
            const { data, error } = await supabase
                .from('assets').update(assetData).eq('id', editingAssetId).select().single();

            if (error) {
                toast(`Error updating asset: ${error.message}`, 'err');
            } else {
                toast(`✓ Asset ${data.asset_code || data.id} updated`, 'ok');
                addAuditLog(`Asset ${data.asset_code || data.id} updated by ${getCurrentUserProfile().full_name}.`, 'status');
                closeAssetModal();
                const updated = await fetchAssets();
                renderAssetOptions(updated);
                renderAssetList(updated);
            }
        } else {
            // INSERT
            const { data, error } = await supabase
                .from('assets').insert(assetData).select().single();

            if (error) {
                toast(`Error creating asset: ${error.message}`, 'err');
            } else {
                toast(`✓ Asset ${data.asset_code || data.id} registered`, 'ok');
                addAuditLog(
                    `New asset registered: ${data.asset_code || ''} ${data.model || data.category} at ${data.outlet}.`,
                    'create'
                );
                closeAssetModal();
                const updated = await fetchAssets();
                renderAssetOptions(updated);
                renderAssetList(updated);
            }
        }
    } finally {
        isSubmitting = false;
        if (submitBtn) {
            submitBtn.disabled    = false;
            submitBtn.textContent = editingAssetId ? 'Update Asset' : 'Save Asset';
        }
    }
}

/**
 * 2.5: Marks an asset as Decommissioned.
 */
async function decommissionAsset(assetId) {
    const asset = assetCache.find(a => a.id === assetId);
    if (!asset) return;

    const { error } = await supabase
        .from('assets')
        .update({ status: 'Decommissioned' })
        .eq('id', assetId);

    if (error) {
        toast(`Error decommissioning asset: ${error.message}`, 'err');
    } else {
        toast(`✓ ${asset.asset_code || asset.id} marked as Decommissioned`, 'ok');
        addAuditLog(
            `Asset ${asset.asset_code || asset.id} decommissioned by ${getCurrentUserProfile().full_name}.`,
            'delete'
        );
        closeAssetModal();
        const updated = await fetchAssets();
        renderAssetOptions(updated);
        renderAssetList(updated);
    }
}

// ─── EVENT LISTENERS ──────────────────────────────────────────────────────────

export function initAssetEventListeners() {
    const btnShow       = document.getElementById('btn-show-asset-modal');
    const btnCancel     = document.getElementById('btn-cancel-asset-modal');
    const btnDecommission = document.getElementById('btn-decommission-asset');
    const listContainer = document.getElementById('asset-list-container');

    if (btnShow)   btnShow.addEventListener('click', () => openAssetModal());
    if (btnCancel) btnCancel.addEventListener('click', closeAssetModal);

    if (assetModal) {
        assetModal.addEventListener('click', e => {
            if (e.target === assetModal) closeAssetModal();
        });
    }

    if (assetForm) assetForm.addEventListener('submit', handleAssetFormSubmit);

    // 2.5: Decommission button inside modal
    if (btnDecommission) {
        btnDecommission.addEventListener('click', () => {
            if (editingAssetId) decommissionAsset(editingAssetId);
        });
    }

    // 2.4 + 2.5: Edit button delegation on asset list
    if (listContainer) {
        listContainer.addEventListener('click', e => {
            if (e.target.matches('.btn-edit-asset')) {
                const id = parseInt(e.target.dataset.id, 10);
                if (id) openAssetModal(id);
            }
        });
    }
}