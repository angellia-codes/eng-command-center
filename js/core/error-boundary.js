// js/error-boundary.js

/**
 * @file Global error boundary — Phase 5 (5.8).
 *
 * Catches uncaught JS errors and unhandled promise rejections.
 * Shows a user-friendly overlay with a reload button instead of
 * leaving the app silently broken.
 *
 * Call initErrorBoundary() once in app.js before any other init.
 */

function getOverlay()  { return document.getElementById('error-overlay'); }
function getMessageEl(){ return document.getElementById('error-overlay-message'); }
function getDetailEl() { return document.getElementById('error-overlay-detail'); }

/**
 * Shows the error overlay with a message and optional technical detail.
 */
function showError(message, detail = '') {
    const overlay   = getOverlay();
    const messageEl = getMessageEl();
    const detailEl  = getDetailEl();
    if (!overlay) return;

    if (messageEl) messageEl.textContent = message;
    if (detailEl)  detailEl.textContent  = detail;

    overlay.style.display = 'flex';
    console.error('[error-boundary]', message, detail);
}

function hideError() {
    const overlay = getOverlay();
    if (overlay) overlay.style.display = 'none';
}

function isDev() {
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function sanitise(err) {
    if (!err) return 'Unknown error';
    if (typeof err === 'string') return err;
    return err.message || String(err);
}

function detailFrom(source, lineno, colno) {
    if (!source) return '';
    const parts = [source.split('/').pop()];
    if (lineno) parts.push(`line ${lineno}`);
    if (colno)  parts.push(`col ${colno}`);
    return parts.join(', ');
}

export function initErrorBoundary() {
    // Global JS error handler
    window.onerror = (message, source, lineno, colno, error) => {
        // Ignore cross-origin script errors (nothing actionable)
        if (message === 'Script error.' && !source) return false;

        const detail = isDev()
            ? `${detailFrom(source, lineno, colno)}\n\n${error?.stack || ''}`
            : detailFrom(source, lineno, colno);

        showError(
            'An unexpected error occurred. The page may not work correctly.',
            detail
        );
        return false; // Let the browser still log it
    };

    // Unhandled promise rejections (async code that throws without try/catch)
    window.onunhandledrejection = (event) => {
        const reason = event.reason;

        // Suppress non-actionable network/auth noise in production
        if (!isDev()) {
            const msg = sanitise(reason);
            if (msg.includes('NetworkError') || msg.includes('fetch')) return;
        }

        showError(
            'A background operation failed unexpectedly.',
            isDev() ? (reason?.stack || sanitise(reason)) : sanitise(reason)
        );
    };

    // Wire up the overlay action buttons
    document.getElementById('btn-error-reload')
        ?.addEventListener('click', () => location.reload());

    document.getElementById('btn-error-dismiss')
        ?.addEventListener('click', hideError);
}
