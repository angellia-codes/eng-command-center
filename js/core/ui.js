// js/ui.js

/**
 * @file Manages all UI interactions, DOM updates, and visual feedback.
 *
 * Phase 3 additions (3.2 / 3.5):
 *   showTableLoading()  — spinner row for <tbody> elements
 *   showPanelLoading()  — spinner for card/panel containers
 *   emptyStateHTML()    — consistent empty state markup helper
 */

// ─── DOM REFERENCES ───────────────────────────────────────────────────────────

const DOMElements = {
    pageLogin:      document.getElementById('page-login'),
    pageApp:        document.getElementById('page-app'),
    loginError:     document.getElementById('login-error'),
    modal:          document.getElementById('action-modal'),
    modalTitle:     document.getElementById('m-title'),
    modalSub:       document.getElementById('m-sub'),
    modalBody:      document.getElementById('m-body'),
    imgLightbox:    document.getElementById('img-lb'),
    imgLightboxSrc: document.getElementById('img-lb-src'),
};

// ─── PAGE VISIBILITY ──────────────────────────────────────────────────────────

export function showPage(showApp) {
    DOMElements.pageLogin.style.display = showApp ? 'none' : 'flex';
    DOMElements.pageApp.style.display   = showApp ? 'block' : 'none';
}

export function showLoginError(message) {
    DOMElements.loginError.textContent  = message;
    DOMElements.loginError.style.display = 'block';
}

// ─── HEADER ───────────────────────────────────────────────────────────────────

export function renderHeader(userProfile) {
    const nameEl = document.getElementById('h-user-name');
    const roleEl = document.getElementById('h-user-role');
    const dateEl = document.getElementById('h-date');

    if (nameEl) nameEl.textContent = userProfile.full_name || 'N/A';
    if (roleEl) roleEl.textContent = userProfile.role      || 'N/A';
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-GB', {
        weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
    });
}

// ─── TOAST ────────────────────────────────────────────────────────────────────

export function toast(message, type = 'ok') {
    const existing = document.getElementById('_toast');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.id        = '_toast';
    el.className = `toast t-${type}`;
    el.textContent = message;
    document.body.appendChild(el);

    setTimeout(() => {
        el.style.transition = 'opacity 0.3s';
        el.style.opacity    = '0';
        setTimeout(() => el.remove(), 350);
    }, 3500);
}

// ─── ICONS ────────────────────────────────────────────────────────────────────

export function updateIcons() {
    if (window.lucide?.createIcons) window.lucide.createIcons();
}

// ─── MODAL ────────────────────────────────────────────────────────────────────

export function showModal(title, subtitle, bodyHtml) {
    DOMElements.modalTitle.textContent = title;
    DOMElements.modalSub.textContent   = subtitle;
    DOMElements.modalBody.innerHTML    = bodyHtml;
    DOMElements.modal.style.display    = 'flex';
}

export function closeModal() {
    if (!DOMElements.modal) return;
    DOMElements.modal.style.display    = 'none';
    if (DOMElements.modalTitle) DOMElements.modalTitle.textContent = '';
    if (DOMElements.modalSub)   DOMElements.modalSub.textContent   = '';
    if (DOMElements.modalBody)  DOMElements.modalBody.innerHTML    = '';
}

// ─── LIGHTBOX ─────────────────────────────────────────────────────────────────

export function showImageLightbox(src) {
    if (!DOMElements.imgLightbox || !DOMElements.imgLightboxSrc) return;
    DOMElements.imgLightboxSrc.src       = src;
    DOMElements.imgLightbox.style.display = 'flex';
}

export function hideImageLightbox() {
    if (DOMElements.imgLightbox) DOMElements.imgLightbox.style.display = 'none';
}

// ─── TAB SWITCHER ─────────────────────────────────────────────────────────────

export function switchFormTab(tabName) {
    const isEditing = !!(document.getElementById('wo-id-input')?.value);

    document.getElementById('tab-wo')?.classList.toggle('active', tabName === 'wo');
    document.getElementById('tab-po')?.classList.toggle('active', tabName === 'po');

    const woForm = document.getElementById('wo-form');
    const prForm = document.getElementById('pr-form');
    if (woForm) woForm.style.display = tabName === 'wo' ? 'block' : 'none';
    if (prForm) prForm.style.display = tabName === 'po' ? 'block' : 'none';

    const titleEl  = document.getElementById('form-panel-title');
    const nextIdEl = document.getElementById('next-id-lbl');
    if (tabName === 'wo') {
        if (titleEl)  titleEl.textContent      = isEditing ? 'Editing Work Order' : 'Log Work Order';
        if (nextIdEl) nextIdEl.style.display   = 'block';
    } else {
        if (titleEl)  titleEl.textContent      = 'Request Material / PO';
        if (nextIdEl) nextIdEl.style.display   = 'none';
    }
}

// ─── LOADING STATES (3.2) ─────────────────────────────────────────────────────

/**
 * Replaces a <tbody> with a single spinner row while data loads.
 * @param {HTMLElement|null} tbodyEl
 * @param {number} colSpan   Number of columns in the table.
 * @param {string} message   Optional loading message.
 */
export function showTableLoading(tbodyEl, colSpan = 7, message = 'Loading…') {
    if (!tbodyEl) return;
    tbodyEl.innerHTML = `
        <tr>
            <td colspan="${colSpan}" class="loading-cell">
                <span class="spinner"></span>${message}
            </td>
        </tr>`;
}

/**
 * Replaces a panel container's innerHTML with a spinner while data loads.
 * @param {HTMLElement|null} containerEl
 * @param {string} message
 */
export function showPanelLoading(containerEl, message = 'Loading…') {
    if (!containerEl) return;
    containerEl.innerHTML = `
        <div class="loading-state">
            <span class="spinner"></span>${message}
        </div>`;
}

// ─── EMPTY STATES (3.5) ───────────────────────────────────────────────────────

/**
 * Returns consistent empty-state HTML for any panel or table.
 * @param {string} message      Primary message.
 * @param {string} [hint]       Optional secondary hint text.
 * @returns {string}
 */
export function emptyStateHTML(message, hint = '') {
    return `
        <div class="empty-state">
            ${message}
            ${hint ? `<div class="empty-state-hint">${hint}</div>` : ''}
        </div>`;
}

/**
 * Returns a table empty-state row (for use in <tbody>).
 * @param {string} message
 * @param {number} colSpan
 * @returns {string}
 */
export function emptyTableRow(message, colSpan = 7) {
    return `<tr><td colspan="${colSpan}" class="loading-cell" style="color:#9CA3AF;">${message}</td></tr>`;
}