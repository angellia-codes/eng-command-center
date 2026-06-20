// js/purchase.js

import { supabase } from '../utils/supabase.js';
import { getCurrentUserProfile } from '../shared/auth.js';
import { addAuditLog } from '../shared/audit.js';
import { toast } from '../core/ui.js';
import { sendWhatsAppNotification, formatNewPrMessage } from '../shared/notifications.js';
import { FONNTE_TARGET_PR } from '../shared/config.js';

// ✅ FIX 1: Lazy getter — resolved at call time, not module load
function getForm() { return document.getElementById('pr-form'); }

// ✅ FIX 3: In-flight guard — prevents double-submit
let isSubmitting = false;

async function handlePRFormSubmit(e) {
    e.preventDefault();

    if (isSubmitting) return;
    isSubmitting = true;

    const submitBtn = e.submitter || getForm()?.querySelector('[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
        const user = getCurrentUserProfile();
        if (!user) {
            toast('Session expired. Please log in again.', 'err');
            return;
        }

        const formData = new FormData(getForm());
        const prData = Object.fromEntries(formData.entries());

        const qty           = Number(prData.qty);
        const estimatedCost = parseFloat(prData.estimated_cost);

        if (!prData.outlet || !prData.item_name) {
            toast('Please fill in all required PR fields.', 'err');
            return;
        }
        if (!Number.isFinite(qty) || qty <= 0) {
            toast('Quantity must be a number greater than 0.', 'err');
            return;
        }
        if (!Number.isFinite(estimatedCost) || estimatedCost < 0) {
            toast('Estimated cost must be a valid number.', 'err');
            return;
        }

        const record = {
            outlet:         prData.outlet,
            item_name:      prData.item_name,
            qty:            qty,
            unit:           prData.unit || null,
            estimated_cost: estimatedCost,
            // FIX 1.7: The form field name attribute is "justification" (not "notes").
            // prData.notes was always undefined — the justification text was never saved.
            notes:          prData.justification || null,
            created_by:     user.full_name,
            user_id:        user.id,
        };

        const { data, error } = await supabase
            .from('purchase_requests')
            .insert(record)
            .select()
            .single();

        if (error) {
            toast(`Error creating PR: ${error.message}`, 'err');
            return;
        }

        try {
            await addAuditLog(
                `PR Created: ${data.qty} ${data.unit || ''} of ${data.item_name} for ${data.outlet} by ${user.full_name}.`,
                'purchase'
            );
        } catch (auditErr) {
            console.error('Audit log failed for PR submission:', auditErr);
        }

        try {
            await sendWhatsAppNotification(formatNewPrMessage(data), FONNTE_TARGET_PR);
        } catch (waErr) {
            console.error('WhatsApp notification failed:', waErr);
            toast('PR saved, but WhatsApp notification failed.', 'err');
        }

        toast(`✓ PR for ${data.item_name} submitted`, 'ok');
        getForm()?.reset();

    } catch (err) {
        console.error('Unexpected error in PR submission:', err);
        toast('An unexpected error occurred. Please try again.', 'err');
    } finally {
        isSubmitting = false;
        if (submitBtn) submitBtn.disabled = false;
    }
}

export function initPurchaseEventListeners() {
    const form = getForm();
    if (!form) {
        console.warn('[purchase.js] #pr-form not found — skipping listener init.');
        return;
    }
    form.addEventListener('submit', handlePRFormSubmit);
}