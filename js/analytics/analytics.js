// js/analytics.js

import { supabase } from '../utils/supabase.js';
import { toast } from '../core/ui.js';

/**
 * @file Manages fetching analytics data and rendering charts.
 */

let monthlyWoChart = null;
let statusChart    = null;
let costChart      = null;

/**
 * Fetches aggregated analytics data from the Supabase RPC.
 * @returns {Promise<object|null>} The analytics data or null on error.
 */
async function fetchAnalyticsData() {
    const { data, error } = await supabase.rpc('get_work_order_analytics');

    if (error) {
        console.error('Error fetching analytics:', error);
        toast('Could not load analytics data.', 'err');
        return null;
    }
    return data;
}

/**
 * FIX 2: Destroys existing Chart.js instances and nulls out references
 * to prevent double-destroy errors on rapid re-renders.
 */
function destroyCharts() {
    if (monthlyWoChart) { monthlyWoChart.destroy(); monthlyWoChart = null; }
    if (statusChart)    { statusChart.destroy();    statusChart    = null; }
    if (costChart)      { costChart.destroy();       costChart      = null; }
}

/**
 * FIX 1: Safe canvas getter — returns the 2D context or null with a logged warning.
 * Prevents null.getContext() crashes when a canvas element is missing from the DOM.
 * @param {string} id - The canvas element ID.
 * @returns {CanvasRenderingContext2D|null}
 */
function getCtx(id) {
    const el = document.getElementById(id);
    if (!el) {
        console.warn(`[analytics] Canvas element #${id} not found in DOM. Skipping chart.`);
        return null;
    }
    return el.getContext('2d');
}

/**
 * Initializes and renders all analytics charts.
 * FIX 3: Call this AFTER showPage(true) in app.js so containers have
 * non-zero dimensions when Chart.js first measures them.
 */
export async function renderAnalytics() {
    const analyticsData = await fetchAnalyticsData();
    if (!analyticsData) return;

    destroyCharts();

    renderMonthlyWoChart(analyticsData.monthly_counts);
    renderStatusChart(analyticsData.status_breakdown);
    renderCostChart(analyticsData.cost_by_outlet);
}

function renderMonthlyWoChart(data) {
    const ctx = getCtx('monthlyWoChart');
    if (!ctx) return; // FIX 1: bail cleanly if canvas is missing

    // FIX 4: Defensive date parsing — handles both "YYYY-MM" and "YYYY-MM-DD"
    // Parses year/month numerically to avoid UTC offset month-rollback entirely.
    const labels = data.map(d => {
        const raw = String(d.month);
        const [yearStr, monthStr] = raw.split('-');
        const year  = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10) - 1; // 0-indexed for Date constructor
        if (isNaN(year) || isNaN(month)) return 'N/A';
        return new Date(year, month, 2)
            .toLocaleString('en-US', { month: 'short', year: '2-digit' });
    });

    const totalData     = data.map(d => d.total);
    const completedData = data.map(d => d.completed);

    monthlyWoChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Created',
                data: totalData,
                backgroundColor: '#A7F3D0',
                borderColor: '#065F46',
                borderWidth: 1
            }, {
                label: 'Completed',
                data: completedData,
                backgroundColor: '#2D5A45',
                borderColor: '#1B3A2D',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } }
        }
    });
}

function renderStatusChart(data) {
    const ctx = getCtx('statusChart');
    if (!ctx) return; // FIX 1: bail cleanly if canvas is missing

    const labels = Object.keys(data);
    const values = Object.values(data);
    const colorMap = {
        'Pending':             '#F3F4F6',
        'In Progress':         '#FEF3C7',
        'Waiting for Parts':   '#FED7AA',
        'Completed':           '#D1FAE5'
    };
    const backgroundColors = labels.map(label => colorMap[label] ?? '#E5E7EB');

    statusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: backgroundColors,
                hoverOffset: 4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderCostChart(data) {
    const ctx = getCtx('costChart');
    if (!ctx) return; // FIX 1: bail cleanly if canvas is missing

    const sortedData = Object.entries(data).sort(([, a], [, b]) => b - a);
    const labels = sortedData.map(([name]) =>
        name.replace('Nourish ', '').replace('The Bakery ', '')
    );
    const values = sortedData.map(([, v]) => v);

    costChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Total Cost (IDR)',
                data: values,
                backgroundColor: '#E8B96A',
                borderColor: '#C8882A',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: { x: { beginAtZero: true } }
        }
    });
}