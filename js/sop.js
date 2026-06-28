// sop.js — Engineering SOP Repository Module
// NGI Engineering Command Center

import { supabase }               from './supabase.js';
import { showToast, updateIcons } from './ui.js';
import { logAudit }               from './audit.js';

// ── DOM refs ──────────────────────────────────────────────────
const sopList        = document.getElementById('sop-list');
const sopSearchInput = document.getElementById('sop-search');
const sopCatFilter   = document.getElementById('sop-cat-filter');
const sopForm        = document.getElementById('sop-form');
const sopFormWrap    = document.getElementById('sop-form-wrap');
const btnAddSop      = document.getElementById('btn-add-sop');
const btnCancelSop   = document.getElementById('btn-cancel-sop');
const sfTitle        = document.getElementById('sf-title');
const sfCategory     = document.getElementById('sf-category');
const sfDescription  = document.getElementById('sf-description');
const sfDriveUrl     = document.getElementById('sf-drive-url');
const sfUpdatedAt    = document.getElementById('sf-updated-at');

const SOP_CATEGORIES = [
  'Electrical', 'Mechanical', 'HVAC / Refrigeration', 'Plumbing',
  'Kitchen Equipment', 'Safety & PPE', 'Civil / Building',
  'General Maintenance', 'Emergency Procedures', 'Other',
];

// ── State ─────────────────────────────────────────────────────
let allSops    = [];
let editingId  = null;

// ── Load & render ─────────────────────────────────────────────
export async function loadSOPs() {
  if (!sopList) return;
  sopList.innerHTML = `
    <div style="padding:20px;text-align:center;color:#9CA3AF;">
      <div class="loading-spinner" style="margin:0 auto 8px;"></div>Loading SOPs…
    </div>`;

  const { data, error } = await supabase
    .from('engineering_sop')
    .select('*')
    .eq('is_active', true)
    .order('category', { ascending: true })
    .order('title',    { ascending: true });

  if (error) {
    sopList.innerHTML = `<div style="padding:20px;color:#DC2626;">Error: ${error.message}</div>`;
    return;
  }

  allSops = data || [];
  renderSOPList(allSops);
}

function renderSOPList(sops) {
  if (!sopList) return;
  if (!sops.length) {
    sopList.innerHTML = `
      <div class="empty-state-full">
        <div class="empty-state-icon"><i data-lucide="file-text" style="width:24px;height:24px;"></i></div>
        <div class="empty-state-title">No SOPs Found</div>
        <div class="empty-state-hint">Add your first SOP by clicking "+ Add SOP" above. Paste the Google Drive link to make it accessible here.</div>
      </div>`;
    updateIcons();
    return;
  }

  // Group by category
  const grouped = sops.reduce((acc, sop) => {
    if (!acc[sop.category]) acc[sop.category] = [];
    acc[sop.category].push(sop);
    return acc;
  }, {});

  sopList.innerHTML = Object.entries(grouped).map(([cat, items]) => `
    <div class="sop-category-group">
      <div class="sop-category-label">${cat}</div>
      ${items.map(renderSOPRow).join('')}
    </div>`).join('');

  updateIcons();
}

function renderSOPRow(sop) {
  const updated = sop.updated_at
    ? new Date(sop.updated_at).toLocaleDateString('en-ID', { day:'numeric', month:'short', year:'numeric' })
    : '—';
  return `
    <div class="sop-row" data-id="${sop.id}">
      <div class="sop-row-main">
        <div class="sop-icon">
          <i data-lucide="file-text" style="width:18px;height:18px;color:var(--ng-green-mid);"></i>
        </div>
        <div class="sop-info">
          <div class="sop-title">${sop.title}</div>
          ${sop.description ? `<div class="sop-desc">${sop.description}</div>` : ''}
        </div>
        <div class="sop-meta">
          <div class="sop-date">Updated ${updated}</div>
        </div>
      </div>
      <div class="sop-actions">
        <button class="btn-accept sop-open-btn" data-url="${encodeURIComponent(sop.drive_url)}" title="Open in Google Drive">
          <i data-lucide="external-link" style="width:13px;height:13px;margin-right:4px;"></i>Open
        </button>
        <button class="btn-icon" data-sop-edit="${sop.id}" title="Edit SOP">
          <i data-lucide="edit-2" style="width:13px;height:13px;"></i>
        </button>
        <button class="btn-icon danger" data-sop-delete="${sop.id}" title="Delete SOP">
          <i data-lucide="trash-2" style="width:13px;height:13px;"></i>
        </button>
      </div>
    </div>`;
}

// ── Filter ────────────────────────────────────────────────────
function filterSOPs() {
  const search = (sopSearchInput?.value || '').toLowerCase();
  const cat    = sopCatFilter?.value || '';
  const filtered = allSops.filter(s =>
    (!search || s.title.toLowerCase().includes(search) || (s.description||'').toLowerCase().includes(search)) &&
    (!cat    || s.category === cat)
  );
  renderSOPList(filtered);
}

// ── Form ──────────────────────────────────────────────────────
function showSOPForm(prefill = {}) {
  if (!sopFormWrap) return;
  sopFormWrap.style.display = 'block';
  sopFormWrap.scrollIntoView({ behavior:'smooth', block:'nearest' });
  if (sfTitle)       sfTitle.value       = prefill.title       || '';
  if (sfCategory)    sfCategory.value    = prefill.category    || '';
  if (sfDescription) sfDescription.value = prefill.description || '';
  if (sfDriveUrl)    sfDriveUrl.value    = prefill.drive_url   || '';
  if (sfUpdatedAt)   sfUpdatedAt.value   = prefill.updated_at  ? prefill.updated_at.substring(0,10) : new Date().toISOString().substring(0,10);
  editingId = prefill.id || null;
}

function hideSOPForm() {
  if (sopFormWrap) sopFormWrap.style.display = 'none';
  if (sopForm)     sopForm.reset();
  editingId = null;
}

async function handleSOPSubmit(e) {
  e.preventDefault();
  const title       = sfTitle?.value?.trim();
  const category    = sfCategory?.value;
  const description = sfDescription?.value?.trim();
  const drive_url   = sfDriveUrl?.value?.trim();
  const updated_at  = sfUpdatedAt?.value || new Date().toISOString();

  if (!title || !category || !drive_url) {
    showToast('Title, category, and Drive URL are required.', 'err');
    return;
  }
  // Basic URL validation
  if (!drive_url.startsWith('https://')) {
    showToast('Drive URL must start with https://', 'err');
    return;
  }

  const btn = sopForm.querySelector('[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    const payload = { title, category, description: description || null, drive_url, updated_at };
    let error;
    if (editingId) {
      ({ error } = await supabase.from('engineering_sop').update(payload).eq('id', editingId));
    } else {
      ({ error } = await supabase.from('engineering_sop').insert(payload));
    }
    if (error) throw error;
    logAudit(editingId ? 'update-sop' : 'create-sop', `SOP: ${title}`);
    showToast(editingId ? 'SOP updated.' : 'SOP added.', 'ok');
    hideSOPForm();
    await loadSOPs();
  } catch (err) {
    showToast('Error: ' + err.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = editingId ? 'Save Changes' : 'Add SOP'; }
  }
}

async function deleteSOP(id) {
  const { error } = await supabase
    .from('engineering_sop').update({ is_active: false }).eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'err'); return; }
  showToast('SOP removed.', 'ok');
  logAudit('delete-sop', `SOP ID: ${id}`);
  await loadSOPs();
}

// ── Populate category dropdowns ───────────────────────────────
function populateCategoryOptions() {
  [sfCategory, sopCatFilter].forEach(el => {
    if (!el) return;
    const placeholder = el === sopCatFilter ? '<option value="">All Categories</option>' : '<option value="">Select category…</option>';
    el.innerHTML = placeholder + SOP_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
  });
}

// ── Event listeners ───────────────────────────────────────────
export function initSOPEventListeners() {
  populateCategoryOptions();

  if (btnAddSop)    btnAddSop.addEventListener('click', () => showSOPForm());
  if (btnCancelSop) btnCancelSop.addEventListener('click', hideSOPForm);
  if (sopForm)      sopForm.addEventListener('submit', handleSOPSubmit);

  if (sopSearchInput) sopSearchInput.addEventListener('input', filterSOPs);
  if (sopCatFilter)   sopCatFilter.addEventListener('change', filterSOPs);

  // Event delegation: open, edit, delete
  if (sopList) {
    sopList.addEventListener('click', async (e) => {
      // Open SOP in Google Drive
      const openBtn = e.target.closest('.sop-open-btn');
      if (openBtn) {
        window.open(decodeURIComponent(openBtn.dataset.url), '_blank', 'noopener,noreferrer');
        return;
      }
      // Edit
      const editBtn = e.target.closest('[data-sop-edit]');
      if (editBtn) {
        const sop = allSops.find(s => s.id === editBtn.dataset.sopEdit);
        if (sop) showSOPForm(sop);
        return;
      }
      // Delete
      const delBtn = e.target.closest('[data-sop-delete]');
      if (delBtn) {
        if (confirm('Remove this SOP from the repository?')) {
          await deleteSOP(delBtn.dataset.sopDelete);
        }
      }
    });
  }
}