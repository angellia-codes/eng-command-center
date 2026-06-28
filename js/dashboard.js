// js/dashboard.js

import { updateIcons } from '../core/ui.js';
import { formatIDR, formatIDRCompact, hoursBetween, escapeHtml } from '../utils/utils.js';

/**
 * @file Manages the rendering of dashboard metrics.
 */

const dashGrid        = document.getElementById('dash-grid');
const activeTicketsEl = document.getElementById('h-active-tickets');
const statusCountsEl  = document.getElementById('status-counts');

/**
 * Calculates all dashboard metrics from the work orders data.
 * FIX 1.9: topSpender outlet name (DB-sourced) is now escaped before being
 *           embedded into the metric card's sub-text HTML.
 */
function calculateMetrics(workOrders) {
    // Response Lag
    const acceptedWOs = workOrders.filter(wo => wo.accepted_at);
    const avgLagHours = acceptedWOs.length > 0
        ? acceptedWOs.reduce((sum, wo) => sum + hoursBetween(wo.created_at, wo.accepted_at), 0) / acceptedWOs.length
        : 0;

    // Repair Velocity
    const completedWOs = workOrders.filter(wo => wo.completed_at && wo.accepted_at);
    const avgVelocityHours = completedWOs.length > 0
        ? completedWOs.reduce((sum, wo) => sum + hoursBetween(wo.accepted_at, wo.completed_at), 0) / completedWOs.length
        : 0;

    // Maintenance Spend
    const totalSpend = workOrders.reduce((sum, wo) => sum + (parseFloat(wo.cost) || 0), 0);
    const spendByOutlet = workOrders.reduce((acc, wo) => {
        if (wo.cost > 0) {
            acc[wo.outlet] = (acc[wo.outlet] || 0) + parseFloat(wo.cost);
        }
        return acc;
    }, {});
    const topSpender = Object.entries(spendByOutlet).sort(([, a], [, b]) => b - a)[0];

    // SLA Adherence
    const completedOnTime = completedWOs.filter(wo => wo.target_date && new Date(wo.completed_at) <= new Date(wo.target_date + 'T23:59:59'));
    const slaPercentage   = completedWOs.length > 0 ? (completedOnTime.length / completedWOs.length) * 100 : 0;
    const overdueWOs      = workOrders.filter(wo => wo.status !== 'Completed' && wo.target_date && new Date() > new Date(wo.target_date + 'T23:59:59'));

    // FIX 1.9: Outlet name comes from the DB — escape it before embedding in HTML
    const topSpenderLabel = topSpender
        ? `Top: ${escapeHtml(topSpender[0].replace('Nourish ', ''))} ${formatIDRCompact(topSpender[1])}`
        : 'No spend recorded';

    return {
        responseLag: {
            value: acceptedWOs.length > 0 ? `${avgLagHours.toFixed(1)}h` : 'N/A',
            sub:   `Avg across ${acceptedWOs.length} ticket${acceptedWOs.length !== 1 ? 's' : ''}`
        },
        repairVelocity: {
            value: completedWOs.length > 0 ? `${avgVelocityHours.toFixed(1)}h` : 'N/A',
            sub:   `Avg over ${completedWOs.length} resolved`
        },
        maintenanceSpend: {
            value: formatIDR(totalSpend),
            sub:   topSpenderLabel   // FIX 1.9: already escaped above
        },
        slaAdherence: {
            value: completedWOs.length > 0 ? `${slaPercentage.toFixed(0)}%` : 'N/A',
            sub:   overdueWOs.length > 0
                ? `${overdueWOs.length} ticket${overdueWOs.length !== 1 ? 's' : ''} currently overdue`
                : 'All active on schedule',
            pct: slaPercentage
        }
    };
}

/**
 * Renders a single metric card.
 * All string parameters here are either hardcoded labels, formatted numbers,
 * or already escaped in calculateMetrics — safe to inject directly.
 */
function createMetricCardHTML(cardClass, icon, iconColor, bgColor, label, subLabel, value, subText, valueColor, isSmallValue = false, slaBar = '') {
    return `
        <div class="metric-card ${cardClass}">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;">
                <div>
                    <div class="metric-lbl" style="color:${iconColor};">${label}</div>
                    <div style="font-size:10px;color:#9CA3AF;margin-top:2px;">${subLabel}</div>
                </div>
                <div class="metric-icon" style="background:${bgColor};">
                    <i data-lucide="${icon}" style="width:16px;height:16px;color:${iconColor};"></i>
                </div>
            </div>
            <div class="metric-val ${isSmallValue ? 'sm' : ''}" style="color:${valueColor};">${value}</div>
            <div class="metric-sub">${subText}</div>
            ${slaBar}
        </div>
    `;
}

/**
 * Renders all dashboard cards and header/status counts.
 */
export function renderDashboard(workOrders) {
    const metrics = calculateMetrics(workOrders);

    const slaBarHTML = metrics.slaAdherence.pct > 0
        ? `<div class="sla-bar-bg"><div class="sla-bar-fill" style="width:${metrics.slaAdherence.pct}%;"></div></div>`
        : '';

    dashGrid.innerHTML =
        createMetricCardHTML('card-lag',   'clock',        '#3B82F6', '#EFF6FF', 'Response Lag',       'Created → Accepted',    metrics.responseLag.value,     metrics.responseLag.sub,     '#1E40AF') +
        createMetricCardHTML('card-vel',   'zap',          '#8B5CF6', '#F5F3FF', 'Repair Velocity',    'Accepted → Completed',  metrics.repairVelocity.value,  metrics.repairVelocity.sub,  '#5B21B6') +
        createMetricCardHTML('card-spend', 'receipt',      '#C8882A', '#FFFBEB', 'Maintenance Spend',  'Cumulative · All outlets', metrics.maintenanceSpend.value, metrics.maintenanceSpend.sub, '#92400E', true) +
        createMetricCardHTML('card-sla',   'shield-check', '#10B981', '#ECFDF5', 'SLA Adherence',      '% Completed on time',   metrics.slaAdherence.value,    metrics.slaAdherence.sub,    '#065F46', false, slaBarHTML);

    // Header active ticket count
    const activeCount = workOrders.filter(wo => wo.status !== 'Completed').length;
    activeTicketsEl.textContent = `${activeCount} Active Ticket${activeCount !== 1 ? 's' : ''}`;

    // Status badge counts
    const counts = workOrders.reduce((acc, wo) => {
        acc[wo.status] = (acc[wo.status] || 0) + 1;
        return acc;
    }, {});

    statusCountsEl.innerHTML = `
        <span class="badge bs-pending">${counts['Pending'] || 0} Pending</span>
        <span class="badge bs-ip">${counts['In Progress'] || 0} In Progress</span>
        <span class="badge bs-wfp">${counts['Waiting for Parts'] || 0} Waiting</span>
        <span class="badge bs-done">${counts['Completed'] || 0} Done</span>
    `;

    updateIcons();
}