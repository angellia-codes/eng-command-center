// js/realtime.js

import { supabase }                          from '../utils/supabase.js';
import { renderDashboard }                   from './dashboard.js';
import { fetchAuditLogs, renderAuditLog }    from '../shared/audit.js';
import { fetchWorkOrders, renderWorkOrdersTable } from '../modules/workorders.js';
import { toast }                             from '../core/ui.js';
import { pushNotification }                  from '../shared/notifications-ui.js'; // 3.6

/**
 * @file Supabase Realtime channel subscriptions.
 *
 * Phase 3 (3.6): Every realtime WO event now also calls pushNotification()
 * so the in-app bell reflects changes without requiring manual refresh.
 */

const activeChannels = [];

function debounce(fn, ms = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}

const handleWoChanges = debounce(async (payload) => {
    console.log('Work order change:', payload.eventType, payload.new?.id);

    // 3.6: Push in-app notification based on event type
    try {
        if (payload.eventType === 'INSERT' && payload.new) {
            pushNotification(
                `New WO ${payload.new.id} created at ${payload.new.outlet}`,
                'info'
            );
        } else if (payload.eventType === 'UPDATE' && payload.new && payload.old) {
            if (payload.new.status !== payload.old.status) {
                pushNotification(
                    `${payload.new.id} → ${payload.new.status}`,
                    payload.new.status === 'Completed' ? 'success' : 'info'
                );
            }
        } else if (payload.eventType === 'DELETE' && payload.old) {
            pushNotification(`${payload.old.id} was deleted`, 'warning');
        }
    } catch (err) {
        console.warn('[realtime] pushNotification error:', err);
    }

    try {
        const workOrders = await fetchWorkOrders();
        renderWorkOrdersTable();
        renderDashboard(workOrders);
        toast('Work orders updated', 'ok');
    } catch (err) {
        console.error('[realtime] Failed to refresh work orders:', err);
        toast('Failed to refresh work orders.', 'err');
    }
}, 300);

const handleAuditChanges = debounce(async () => {
    try {
        const logs = await fetchAuditLogs();
        renderAuditLog(logs);
    } catch (err) {
        console.error('[realtime] Failed to refresh audit log:', err);
    }
}, 300);

function handlePrChanges(payload) {
    if (payload.eventType === 'INSERT') {
        toast('New purchase request received!', 'ok');
        pushNotification(
            `New PR for ${payload.new?.outlet || 'an outlet'}`,
            'info'
        );
    }
}

function makeSubscribeHandler(label, retryFn) {
    return (status, err) => {
        if (status === 'SUBSCRIBED')    console.log(`Realtime connected: ${label}`);
        if (status === 'CHANNEL_ERROR') { console.error(`Realtime error (${label}):`, err); toast(`Realtime error on ${label}. Try refreshing.`, 'err'); }
        if (status === 'TIMED_OUT')     { console.warn(`Realtime timed out: ${label}. Reconnecting…`); retryFn?.(); }
        if (status === 'CLOSED')        console.warn(`Realtime closed: ${label}`);
    };
}

export function initRealtime() {
    activeChannels.forEach(ch => supabase.removeChannel(ch));
    activeChannels.length = 0;

    const woChannel = supabase
        .channel('public:work_orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, handleWoChanges)
        .subscribe(makeSubscribeHandler('Work Orders', initRealtime));

    const auditChannel = supabase
        .channel('public:audit_log')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_log' }, handleAuditChanges)
        .subscribe(makeSubscribeHandler('Audit Log', initRealtime));

    const prChannel = supabase
        .channel('public:purchase_requests')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_requests' }, handlePrChanges)
        .subscribe(makeSubscribeHandler('Purchase Requests', initRealtime));

    activeChannels.push(woChannel, auditChannel, prChannel);
}