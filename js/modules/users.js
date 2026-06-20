// js/users.js

import { supabase } from '../utils/supabase.js';
import { toast } from '../core/ui.js';

// ✅ FIX 1: Lazy DOM queries — resolved at call time, not module load time
function getModal() { return document.getElementById('users-modal'); }
function getTbody() { return document.getElementById('users-tbody'); }

// ✅ FIX 2: Escape helper — prevents XSS from raw DB values
function escapeHtml(str) {
    if (!str) return 'N/A';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

async function fetchAllUsers() {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('full_name');

    if (error) {
        console.error('Error fetching users:', error);
        toast('Failed to load user list.', 'err');
        return null; // ✅ FIX 3: null signals error vs. [] (legitimate empty list)
    }
    return data;
}

// ✅ FIX 4: Returns boolean so callers know if update succeeded
async function updateUser(userId, updates) {
    const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId);

    if (error) {
        toast(`Failed to update user: ${error.message}`, 'err');
        return false;
    }
    toast('User updated successfully.', 'ok');
    return true;
}

function renderUsersTable(users) {
    const tbody = getTbody();
    if (!tbody) return;

    // ✅ FIX 3: Distinct empty state vs. error state
    if (!users || users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px;">
            ${users === null ? 'Error loading users.' : 'No users found.'}
        </td></tr>`;
        return;
    }

    const roles = ['admin', 'technician', 'manager'];

    tbody.innerHTML = users.map(user => `
        <tr>
            <td>${escapeHtml(user.full_name)}</td>
            <td>${escapeHtml(user.email)}</td>
            <td>${escapeHtml(user.outlet)}</td>
            <td>
                <select class="user-role-select" data-id="${escapeHtml(user.id)}" data-original="${escapeHtml(user.role)}">
                    ${roles.map(role => `
                        <option value="${role}" ${user.role === role ? 'selected' : ''}>
                            ${role.charAt(0).toUpperCase() + role.slice(1)}
                        </option>
                    `).join('')}
                </select>
            </td>
            <td>
                <select class="user-status-select" data-id="${escapeHtml(user.id)}" data-original="${user.active}">
                    <option value="true"  ${user.active === true  ? 'selected' : ''}>Active</option>
                    <option value="false" ${user.active === false ? 'selected' : ''}>Inactive</option>
                </select>
            </td>
        </tr>
    `).join('');
}

export async function openUsersModal() {
    const modal = getModal();
    const tbody = getTbody();
    if (!modal || !tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Loading users...</td></tr>';
    modal.style.display = 'flex';

    const users = await fetchAllUsers();
    renderUsersTable(users);
}

function closeUsersModal() {
    const modal = getModal();
    if (modal) modal.style.display = 'none';
}

export function initUserManagementEventListeners() {
    // ✅ FIX 5: Guard every getElementById before attaching listeners
    const manageBtn = document.getElementById('manage-users-btn');
    const closeBtn  = document.getElementById('btn-close-users-modal');
    const modal     = getModal();
    const tbody     = getTbody();

    if (!manageBtn || !closeBtn || !modal || !tbody) {
        console.warn('[users.js] Required DOM elements not found — skipping listener init.');
        return;
    }

    manageBtn.addEventListener('click', openUsersModal);
    closeBtn.addEventListener('click', closeUsersModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeUsersModal(); });

    // ✅ FIX 6: Await updateUser + if/else if + rollback on failure
    tbody.addEventListener('change', async e => {
        const target = e.target;
        const userId   = target.dataset.id;
        const original = target.dataset.original;
        if (!userId) return;

        let success = false;

        if (target.matches('.user-role-select')) {
            success = await updateUser(userId, { role: target.value });
        } else if (target.matches('.user-status-select')) {
            success = await updateUser(userId, { active: target.value === 'true' });
        }

        // ✅ FIX 4: Rollback select to original value if DB update failed
        if (!success) {
            target.value = original;
        } else {
            target.dataset.original = target.value; // update baseline
        }
    });
}