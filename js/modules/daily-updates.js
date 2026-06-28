// daily.js — Daily Engineering Update Module
// NGI Engineering Command Center

import { supabase }                    from './supabase.js';
import { showToast, updateIcons }      from './ui.js';
import { logAudit }                    from './audit.js';
import { uploadPhoto }                 from './utils.js';

// ── DOM refs ─────────────────────────────────────────────────
const dailyGrid      = document.getElementById('daily-grid');
const dailyDateLabel = document.getElementById('daily-date-label');
const btnDailyPrev   = document.getElementById('btn-daily-prev');
const btnDailyNext   = document.getElementById('btn-daily-next');
const btnAddDaily    = document.getElementById('btn-add-daily');

// Form elements
const dailyFormWrap  = document.getElementById('daily-form-wrap');   // collapsible wrapper
const dailyForm      = document.getElementById('daily-form');
const dfOutlet       = document.getElementById('df-outlet');
const dfDate         = document.getElementById('df-date');
const dfProgress     = document.getElementById('df-progress');
const dfIssues       = document.getElementById('df-issues');
const dfTomorrow     = document.getElementById('df-tomorrow');
const dfStatus       = document.getElementById('df-status');
const dfBtnCamera    = document.getElementById('df-btn-camera');
const dfBtnGallery   = document.getElementById('df-btn-gallery');
const dfInpCamera    = document.getElementById('df-inp-camera');
const dfInpGallery   = document.getElementById('df-inp-gallery');
const dfPreview      = document.getElementById('df-preview');
const dfThumb        = document.getElementById('df-thumb');
const btnCancelDaily = document.getElementById('btn-cancel-daily');

// ── State ─────────────────────────────────────────────────────
let currentDate   = new Date();
let dailyPhotoFile = null;
let editingId     = null;

// ── Date helpers ──────────────────────────────────────────────
function toLocalDateStr(d) {
  return d.toLocaleDateString('en-CA'); // YYYY-MM-DD
}
function formatDisplayDate(d) {
  return d.toLocaleDateString('en-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

// ── Carryover logic ───────────────────────────────────────────
// For each outlet, if yesterday's (or last logged) update is still 'open',
// automatically create a carryover entry for today if none exists.
async function processCarryovers() {
  const today     = toLocalDateStr(new Date());
  const yesterday = toLocalDateStr(new Date(Date.now() - 86400000));

  // Fetch yesterday's open updates
  const { data: openYesterday, error } = await supabase
    .from('daily_engineering_updates')
    .select('*')
    .eq('date', yesterday)
    .eq('status', 'open');

  if (error || !openYesterday?.length) return;

  for (const item of openYesterday) {
    // Check if today already has an entry for this outlet
    const { data: existing } = await supabase
      .from('daily_engineering_updates')
      .select('id')
      .eq('date', today)
      .eq('outlet', item.outlet)
      .maybeSingle();

    if (existing) continue; // already has today's entry

    // Auto-create carryover
    await supabase.from('daily_engineering_updates').insert({
      outlet:           item.outlet,
      date:             today,
      progress_update:  null,
      issues_encountered: null,
      tomorrow_plan:    null,
      status:           'open',
      is_carryover:     true,
      parent_id:        item.id,
      technician:       item.technician,
    });
  }
}

// ── Load & render ─────────────────────────────────────────────
export async function loadDailyUpdates() {
  await processCarryovers();
  await renderDailyGrid();
}

async function renderDailyGrid(date) {
  const d   = date || currentDate;
  const str = toLocalDateStr(d);

  if (dailyDateLabel) dailyDateLabel.textContent = formatDisplayDate(d);

  if (!dailyGrid) return;
  dailyGrid.innerHTML = `
    <div style="grid-column:1/-1;padding:20px;text-align:center;color:#9CA3AF;">
      <div class="loading-spinner" style="margin:0 auto 8px;"></div>
      Loading updates…
    </div>`;

  const { data, error } = await supabase
    .from('daily_engineering_updates')
    .select('*')
    .eq('date', str)
    .order('outlet', { ascending: true });

  if (error) {
    dailyGrid.innerHTML = `<div style="grid-column:1/-1;padding:20px;color:#DC2626;">Error loading updates: ${error.message}</div>`;
    return;
  }

  if (!data || data.length === 0) {
    dailyGrid.innerHTML = `
      <div class="empty-state-full" style="grid-column:1/-1;">
        <div class="empty-state-icon"><i data-lucide="clipboard-list" style="width:24px;height:24px;"></i></div>
        <div class="empty-state-title">No updates for ${formatDisplayDate(d)}</div>
        <div class="empty-state-hint">Click "+ New Update" to log today's engineering activities for each outlet.</div>
      </div>`;
    updateIcons();
    return;
  }

  dailyGrid.innerHTML = data.map(renderDailyCard).join('');
  updateIcons();
}

function renderDailyCard(item) {
  const carryoverBadge = item.is_carryover
    ? `<span class="badge bs-wfp" style="font-size:9.5px;">⟳ Carried Forward</span>` : '';
  const statusBadge = item.status === 'completed'
    ? `<span class="daily-status-done">✓ Completed</span>`
    : `<span class="daily-status-pending">⏳ Open</span>`;
  const photoHTML = item.photo_url
    ? `<div style="margin-top:8px;">
        <img src="${item.photo_url}" class="img-thumb" style="width:60px;height:60px;" 
             onclick="document.getElementById('img-lb').style.display='flex';document.getElementById('img-lb-src').src='${item.photo_url}'">
       </div>` : '';

  return `
    <div class="daily-card">
      <div class="daily-card-head">
        <span class="daily-card-outlet">${item.outlet}</span>
        <span class="daily-card-date">${item.date}</span>
      </div>
      <div class="daily-card-body">
        ${carryoverBadge ? `<div style="margin-bottom:6px;">${carryoverBadge}</div>` : ''}
        <div>
          <div class="daily-field-label">Progress Update</div>
          ${item.progress_update
            ? `<div class="daily-field-value">${item.progress_update}</div>`
            : `<div class="daily-field-empty">Not yet reported</div>`}
        </div>
        <div>
          <div class="daily-field-label">Issues Encountered</div>
          ${item.issues_encountered
            ? `<div class="daily-field-value">${item.issues_encountered}</div>`
            : `<div class="daily-field-empty">None reported</div>`}
        </div>
        <div>
          <div class="daily-field-label">Tomorrow's Plan</div>
          ${item.tomorrow_plan
            ? `<div class="daily-field-value">${item.tomorrow_plan}</div>`
            : `<div class="daily-field-empty">—</div>`}
        </div>
        ${photoHTML}
      </div>
      <div class="daily-card-footer">
        <span class="daily-team">${item.technician || 'Unassigned'}</span>
        <div style="display:flex;align-items:center;gap:8px;">
          ${statusBadge}
          <button class="btn-icon" title="Edit update" data-daily-edit="${item.id}"
                  data-outlet="${item.outlet}" data-date="${item.date}"
                  data-progress="${encodeURIComponent(item.progress_update||'')}"
                  data-issues="${encodeURIComponent(item.issues_encountered||'')}"
                  data-tomorrow="${encodeURIComponent(item.tomorrow_plan||'')}"
                  data-status="${item.status}"
                  data-technician="${item.technician||''}">
            <i data-lucide="edit-2" style="width:13px;height:13px;"></i>
          </button>
          ${item.status === 'open'
            ? `<button class="btn-done" data-daily-complete="${item.id}">Mark Done</button>`
            : ''}
        </div>
      </div>
    </div>`;
}

// ── Dashboard: today's summary for the dashboard KPI area ────
export async function getDailyDashboardSummary() {
  const today = toLocalDateStr(new Date());
  const { data } = await supabase
    .from('daily_engineering_updates')
    .select('outlet, status, is_carryover')
    .eq('date', today);

  if (!data) return { total: 0, completed: 0, carryover: 0 };
  return {
    total:     data.length,
    completed: data.filter(d => d.status === 'completed').length,
    carryover: data.filter(d => d.is_carryover).length,
  };
}

// ── Form: show / hide ─────────────────────────────────────────
function showDailyForm(prefill = {}) {
  if (!dailyFormWrap) return;
  dailyFormWrap.style.display = 'block';
  dailyFormWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Set defaults / prefill
  if (dfDate)     dfDate.value     = prefill.date     || toLocalDateStr(currentDate);
  if (dfOutlet)   dfOutlet.value   = prefill.outlet   || '';
  if (dfProgress) dfProgress.value = prefill.progress || '';
  if (dfIssues)   dfIssues.value   = prefill.issues   || '';
  if (dfTomorrow) dfTomorrow.value = prefill.tomorrow || '';
  if (dfStatus)   dfStatus.value   = prefill.status   || 'open';

  editingId = prefill.id || null;
  dailyPhotoFile = null;
  if (dfPreview) dfPreview.style.display = 'none';
}

function hideDailyForm() {
  if (dailyFormWrap) dailyFormWrap.style.display = 'none';
  if (dailyForm)     dailyForm.reset();
  editingId     = null;
  dailyPhotoFile = null;
  if (dfPreview) dfPreview.style.display = 'none';
}

// ── Form: photo ───────────────────────────────────────────────
function handleDailyPhotoInput(file) {
  if (!file) return;
  dailyPhotoFile = file;
  if (dfThumb) { dfThumb.src = URL.createObjectURL(file); }
  if (dfPreview) dfPreview.style.display = 'block';
}

// ── Form: submit ──────────────────────────────────────────────
async function handleDailySubmit(e) {
  e.preventDefault();
  const outlet   = dfOutlet?.value?.trim();
  const date     = dfDate?.value;
  const progress = dfProgress?.value?.trim();
  const issues   = dfIssues?.value?.trim();
  const tomorrow = dfTomorrow?.value?.trim();
  const status   = dfStatus?.value || 'open';

  if (!outlet || !date) { showToast('Outlet and date are required.', 'err'); return; }

  const btn = dailyForm.querySelector('[type="submit"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  try {
    let photoUrl = null;
    if (dailyPhotoFile) {
      photoUrl = await uploadPhoto(dailyPhotoFile, 'daily-photos');
    }

    const payload = {
      outlet, date, status,
      progress_update:    progress  || null,
      issues_encountered: issues    || null,
      tomorrow_plan:      tomorrow  || null,
      ...(photoUrl ? { photo_url: photoUrl } : {}),
    };

    let error;
    if (editingId) {
      ({ error } = await supabase
        .from('daily_engineering_updates')
        .update(payload)
        .eq('id', editingId));
    } else {
      ({ error } = await supabase
        .from('daily_engineering_updates')
        .insert(payload));
    }

    if (error) throw error;

    logAudit(editingId ? 'update-daily' : 'create-daily', `Daily update for ${outlet} on ${date}`);
    showToast(editingId ? 'Update saved.' : 'Daily update logged.', 'ok');
    hideDailyForm();
    await renderDailyGrid();
  } catch (err) {
    showToast('Error: ' + err.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save Update'; }
  }
}

// ── Mark complete ─────────────────────────────────────────────
async function markComplete(id) {
  const { error } = await supabase
    .from('daily_engineering_updates')
    .update({ status: 'completed' })
    .eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'err'); return; }
  showToast('Marked as completed.', 'ok');
  await renderDailyGrid();
}

// ── Event listeners ───────────────────────────────────────────
export function initDailyEventListeners() {
  if (btnAddDaily) btnAddDaily.addEventListener('click', () => showDailyForm());
  if (btnCancelDaily) btnCancelDaily.addEventListener('click', hideDailyForm);

  if (btnDailyPrev) btnDailyPrev.addEventListener('click', () => {
    currentDate = new Date(currentDate.getTime() - 86400000);
    renderDailyGrid();
  });
  if (btnDailyNext) btnDailyNext.addEventListener('click', () => {
    const nextDay = new Date(currentDate.getTime() + 86400000);
    if (nextDay <= new Date()) { currentDate = nextDay; renderDailyGrid(); }
  });

  if (dailyForm) dailyForm.addEventListener('submit', handleDailySubmit);

  // Photo buttons
  if (dfBtnCamera && dfInpCamera) {
    dfBtnCamera.addEventListener('click', () => dfInpCamera.click());
    dfInpCamera.addEventListener('change', e => handleDailyPhotoInput(e.target.files?.[0]));
  }
  if (dfBtnGallery && dfInpGallery) {
    dfBtnGallery.addEventListener('click', () => dfInpGallery.click());
    dfInpGallery.addEventListener('change', e => handleDailyPhotoInput(e.target.files?.[0]));
  }

  // Event delegation: edit button & mark-done button on daily cards
  if (dailyGrid) {
    dailyGrid.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('[data-daily-edit]');
      if (editBtn) {
        showDailyForm({
          id:       editBtn.dataset.dailyEdit,
          outlet:   editBtn.dataset.outlet,
          date:     editBtn.dataset.date,
          progress: decodeURIComponent(editBtn.dataset.progress),
          issues:   decodeURIComponent(editBtn.dataset.issues),
          tomorrow: decodeURIComponent(editBtn.dataset.tomorrow),
          status:   editBtn.dataset.status,
        });
        return;
      }
      const doneBtn = e.target.closest('[data-daily-complete]');
      if (doneBtn) await markComplete(doneBtn.dataset.dailyComplete);
    });
  }
}