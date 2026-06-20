// js/comments.js

import { supabase } from '../utils/supabase.js';
import { getCurrentUserProfile } from '../shared/auth.js';
import { addAuditLog } from '../shared/audit.js';
import { toast } from '../core/ui.js';
import { escapeHtml } from '../utils/utils.js';

/**
 * @file Work Order Comments / Notes module — Phase 3 (3.7).
 *
 * Each WO has a threaded notes panel for technicians and managers to log
 * progress updates. Ctrl+Enter submits. Comments persist in the DB.
 */

let currentWoId = null;

// ─── DATA ─────────────────────────────────────────────────────────────────────

export async function fetchComments(woId) {
    const { data, error } = await supabase
        .from('work_order_comments')
        .select('*')
        .eq('wo_id', woId)
        .order('created_at');

    if (error) {
        console.error('[comments] Fetch error:', error);
        return [];
    }
    return data;
}

export async function addComment(woId, text) {
    const user = getCurrentUserProfile();
    if (!text?.trim() || !user) return null;

    const { data, error } = await supabase
        .from('work_order_comments')
        .insert({
            wo_id:      woId,
            comment:    text.trim(),
            created_by: user.full_name,
            user_id:    user.id,
        })
        .select()
        .single();

    if (error) {
        toast('Error posting note: ' + error.message, 'err');
        return null;
    }
    return data;
}

// ─── RENDER ───────────────────────────────────────────────────────────────────

function formatCommentDate(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-GB', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });
}

function renderCommentsList(comments) {
    const list = document.getElementById('comments-list');
    if (!list) return;

    if (comments.length === 0) {
        list.innerHTML = `
            <div style="padding:24px 20px;text-align:center;color:#9CA3AF;font-size:13px;">
                No notes yet. Add the first one below.
            </div>`;
        return;
    }

    list.innerHTML = comments.map(c => `
        <div class="comment-item">
            <div class="comment-header">
                <span class="comment-author">${escapeHtml(c.created_by)}</span>
                <span class="comment-ts">${formatCommentDate(c.created_at)}</span>
            </div>
            <div class="comment-text">${escapeHtml(c.comment)}</div>
        </div>
    `).join('');

    list.scrollTop = list.scrollHeight;
}

// ─── MODAL ────────────────────────────────────────────────────────────────────

export async function openCommentsModal(woId) {
    currentWoId = woId;
    const modal = document.getElementById('comments-modal');
    const sub   = document.getElementById('comments-modal-sub');
    const list  = document.getElementById('comments-list');
    const input = document.getElementById('comment-input');

    if (!modal) return;

    if (sub)   sub.textContent = woId;
    if (input) input.value     = '';

    // Show loading state while fetching
    if (list) {
        list.innerHTML = `<div style="padding:24px;display:flex;align-items:center;
            justify-content:center;gap:8px;color:#9CA3AF;">
            <span class="spinner"></span> Loading notes…
        </div>`;
    }

    modal.style.display = 'flex';

    const comments = await fetchComments(woId);
    renderCommentsList(comments);

    // Focus the input for immediate typing
    document.getElementById('comment-input')?.focus();
}

function closeCommentsModal() {
    const modal = document.getElementById('comments-modal');
    if (modal) modal.style.display = 'none';
    currentWoId = null;
}

// ─── EVENT LISTENERS ──────────────────────────────────────────────────────────

export function initCommentsEventListeners() {
    const modal    = document.getElementById('comments-modal');
    const closeBtn = document.getElementById('btn-close-comments');
    const postBtn  = document.getElementById('btn-post-comment');
    const input    = document.getElementById('comment-input');

    if (!modal) {
        console.warn('[comments] #comments-modal not found — listeners not attached.');
        return;
    }

    if (closeBtn) closeBtn.addEventListener('click', closeCommentsModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeCommentsModal(); });

    async function submitComment() {
        if (!currentWoId || !input?.value.trim()) return;

        if (postBtn) postBtn.disabled = true;

        const newComment = await addComment(currentWoId, input.value.trim());

        if (postBtn) postBtn.disabled = false;

        if (newComment) {
            input.value = '';
            toast('✓ Note posted', 'ok');
            const fresh = await fetchComments(currentWoId);
            renderCommentsList(fresh);
        }
    }

    if (postBtn) postBtn.addEventListener('click', submitComment);

    // Ctrl/Cmd + Enter to submit
    if (input) {
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submitComment();
            }
        });
    }
}