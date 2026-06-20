// js/reports.js

import { supabase }                    from '../utils/supabase.js';
import { toast, emptyStateHTML }       from '../core/ui.js';
import { formatIDR, formatIDRCompact, escapeHtml } from '../utils/utils.js';
import { renderDashboard } from '../dashboard.js';
import { getActiveWorkOrders }         from '../modules/workorders.js';
import { getOutlets }                  from '../utils/outlets.js';

/**
 * @file Reports & Analytics module — Phase 4.
 *
 * 4.1 — Dedicated collapsible reports section (separate from overview charts)
 * 4.2 — Date range presets + custom from/to applied to all reports
 * 4.3 — PM Compliance report (on-time % per outlet via Supabase RPC)
 * 4.4 — WO Aging report (open tickets grouped by age bracket)
 * 4.5 — MTBF report (avg days between failures per asset)
 * 4.6 — Per-outlet dashboard KPI filter
 * 4.7 — Financial reports (cost by outlet, category, asset, month)
 * 4.8 — PDF export via window.print() with print-specific CSS
 */

// ─── STATE ────────────────────────────────────────────────────────────────────

let dateRange    = { preset: 'all', from: null, to: null };
let activeTab    = 'aging';
let isExpanded   = false;

// Chart.js instances — destroyed before each re-render
let charts = {};

// ─── DATE RANGE ───────────────────────────────────────────────────────────────

function applyPreset(preset) {
    dateRange.preset = preset;
    const now = new Date();

    switch (preset) {
        case '7d':  dateRange.from = new Date(now - 7  * 86400000); dateRange.to = now; break;
        case '30d': dateRange.from = new Date(now - 30 * 86400000); dateRange.to = now; break;
        case '3m':  dateRange.from = new Date(now.getFullYear(), now.getMonth() - 3,  1); dateRange.to = now; break;
        case '6m':  dateRange.from = new Date(now.getFullYear(), now.getMonth() - 6,  1); dateRange.to = now; break;
        case '1y':  dateRange.from = new Date(now.getFullYear(), 0, 1);                   dateRange.to = now; break;
        default:    dateRange.from = null; dateRange.to = null; break;
    }

    // Sync custom date inputs
    const fromEl = document.getElementById('report-date-from');
    const toEl   = document.getElementById('report-date-to');
    if (fromEl) fromEl.value = dateRange.from ? dateRange.from.toISOString().split('T')[0] : '';
    if (toEl)   toEl.value   = dateRange.to   ? dateRange.to.toISOString().split('T')[0]   : '';
}

function getFiltered() {
    return getActiveWorkOrders().filter(wo => {
        const d = new Date(wo.created_at);
        if (dateRange.from && d < dateRange.from) return false;
        if (dateRange.to   && d > dateRange.to)   return false;
        return true;
    });
}

function getDateRangeLabel() {
    const labels = { '7d':'Last 7 Days','30d':'Last 30 Days','3m':'Last 3 Months','6m':'Last 6 Months','1y':'This Year','all':'All Time' };
    return labels[dateRange.preset] || 'Custom Range';
}

// ─── CHART HELPERS ────────────────────────────────────────────────────────────

function destroyAll() {
    Object.values(charts).forEach(c => { try { c.destroy(); } catch (_) {} });
    charts = {};
}

function getCtx(id) {
    const el = document.getElementById(id);
    if (!el) { console.warn(`[reports] Canvas #${id} not found`); return null; }
    return el.getContext('2d');
}

// ─── 4.4 WO AGING REPORT ─────────────────────────────────────────────────────

function calcAging(workOrders) {
    const open = workOrders.filter(wo => wo.status !== 'Completed');
    const now  = Date.now();

    const brackets = [
        { label: '< 1 day',   min: 0,  max: 1,        wos: [] },
        { label: '1 – 3 days',min: 1,  max: 3,        wos: [] },
        { label: '3 – 7 days',min: 3,  max: 7,        wos: [] },
        { label: '1 – 2 wks', min: 7,  max: 14,       wos: [] },
        { label: '> 2 weeks', min: 14, max: Infinity,  wos: [] },
    ];

    open.forEach(wo => {
        const ageDays = (now - new Date(wo.created_at)) / 86400000;
        for (const b of brackets) {
            if (ageDays >= b.min && ageDays < b.max) { b.wos.push({ ...wo, ageDays }); break; }
        }
    });

    return brackets;
}

function renderAgingReport(wos) {
    const brackets = calcAging(wos);
    const counts   = brackets.map(b => b.wos.length);
    const total    = counts.reduce((a, b) => a + b, 0);

    // Summary stat
    const summaryEl = document.getElementById('aging-summary');
    if (summaryEl) {
        summaryEl.innerHTML = `
            <div class="report-stat"><span class="report-stat-val">${total}</span><span class="report-stat-lbl">Open Tickets</span></div>
            <div class="report-stat"><span class="report-stat-val" style="color:#EF4444;">${brackets[4].wos.length}</span><span class="report-stat-lbl">&gt; 2 Weeks Old</span></div>
            <div class="report-stat"><span class="report-stat-val" style="color:#F59E0B;">${brackets[3].wos.length}</span><span class="report-stat-lbl">1 – 2 Weeks Old</span></div>`;
    }

    // Chart
    if (charts.aging) { charts.aging.destroy(); delete charts.aging; }
    const ctx = getCtx('report-aging-chart');
    if (ctx) {
        charts.aging = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: brackets.map(b => b.label),
                datasets: [{
                    label: 'Open Tickets',
                    data: counts,
                    backgroundColor: ['#D1FAE5','#FEF3C7','#FED7AA','#FECACA','#F87171'],
                    borderColor:     ['#065F46','#B45309','#C2410C','#991B1B','#7F1D1D'],
                    borderWidth: 1,
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } },
            }
        });
    }

    // Oldest tickets table
    const oldest = [...brackets[3].wos, ...brackets[4].wos]
        .sort((a,b) => b.ageDays - a.ageDays)
        .slice(0, 8);

    const tableEl = document.getElementById('aging-table');
    if (tableEl) {
        if (oldest.length === 0) {
            tableEl.innerHTML = emptyStateHTML('No tickets older than 1 week.', '✓ All caught up');
        } else {
            tableEl.innerHTML = `
                <table class="wo-table" style="font-size:11.5px;">
                    <thead><tr><th>WO</th><th>Outlet</th><th>Priority</th><th style="width:70px;">Age</th></tr></thead>
                    <tbody>${oldest.map(wo => `
                        <tr>
                            <td><div class="wo-id">${escapeHtml(wo.id)}</div></td>
                            <td>${escapeHtml(wo.outlet)}</td>
                            <td><span class="badge bp-${(wo.priority||'low').toLowerCase()}">${escapeHtml(wo.priority)}</span></td>
                            <td style="font-weight:700;color:#EF4444;">${Math.floor(wo.ageDays)}d</td>
                        </tr>`).join('')}
                    </tbody>
                </table>`;
        }
    }
}

// ─── 4.7 FINANCIAL REPORT ─────────────────────────────────────────────────────

function calcFinancial(workOrders) {
    const paid = workOrders.filter(wo => (parseFloat(wo.cost) || 0) > 0);

    const byOutlet   = {};
    const byCategory = {};
    const byMonth    = {};
    const byAsset    = {};

    paid.forEach(wo => {
        const cost = parseFloat(wo.cost) || 0;

        byOutlet[wo.outlet] = (byOutlet[wo.outlet] || 0) + cost;

        const cat = wo.assets?.category || (wo.asset_other ? 'Non-Registered' : 'Unknown');
        byCategory[cat] = (byCategory[cat] || 0) + cost;

        const month = wo.created_at.slice(0, 7);
        byMonth[month] = (byMonth[month] || 0) + cost;

        if (wo.assets) {
            const key = `${wo.assets.asset_code || 'N/A'}: ${wo.assets.model || wo.assets.category}`;
            byAsset[key] = (byAsset[key] || 0) + cost;
        }
    });

    return { byOutlet, byCategory, byMonth, byAsset, total: paid.reduce((s, w) => s + (parseFloat(w.cost)||0), 0) };
}

function renderFinancialReport(wos) {
    const { byOutlet, byCategory, byMonth, byAsset, total } = calcFinancial(wos);

    const summaryEl = document.getElementById('fin-summary');
    if (summaryEl) {
        const topOutlet = Object.entries(byOutlet).sort((a,b)=>b[1]-a[1])[0];
        summaryEl.innerHTML = `
            <div class="report-stat"><span class="report-stat-val sm">${formatIDRCompact(total)}</span><span class="report-stat-lbl">Total Spend</span></div>
            ${topOutlet ? `<div class="report-stat"><span class="report-stat-val sm" style="color:#C8882A;">${formatIDRCompact(topOutlet[1])}</span><span class="report-stat-lbl">Top: ${escapeHtml(topOutlet[0].replace('Nourish ',''))}</span></div>` : ''}
            <div class="report-stat"><span class="report-stat-val">${Object.keys(byOutlet).length}</span><span class="report-stat-lbl">Outlets with Spend</span></div>`;
    }

    // Cost by outlet chart
    if (charts.finOutlet) { charts.finOutlet.destroy(); delete charts.finOutlet; }
    const ctx1 = getCtx('report-fin-outlet-chart');
    if (ctx1 && Object.keys(byOutlet).length) {
        const sorted = Object.entries(byOutlet).sort((a,b)=>b[1]-a[1]);
        charts.finOutlet = new Chart(ctx1, {
            type: 'bar',
            data: {
                labels: sorted.map(([k]) => k.replace('Nourish ','').replace('The Bakery ','')),
                datasets: [{ label: 'Total Cost (IDR)', data: sorted.map(([,v])=>v), backgroundColor: '#E8B96A', borderColor: '#C8882A', borderWidth: 1 }]
            },
            options: { indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{x:{beginAtZero:true}} }
        });
    }

    // Cost by category doughnut
    if (charts.finCategory) { charts.finCategory.destroy(); delete charts.finCategory; }
    const ctx2 = getCtx('report-fin-category-chart');
    if (ctx2 && Object.keys(byCategory).length) {
        const catColors = ['#A7F3D0','#FDE68A','#FED7AA','#BFDBFE','#DDD6FE','#FCE7F3','#D1FAE5','#F1F5F9'];
        const entries   = Object.entries(byCategory).sort((a,b)=>b[1]-a[1]);
        charts.finCategory = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: entries.map(([k])=>k),
                datasets: [{ data: entries.map(([,v])=>v), backgroundColor: catColors, hoverOffset: 4 }]
            },
            options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'right', labels:{ font:{size:11} } } } }
        });
    }

    // Monthly spend trend
    if (charts.finTrend) { charts.finTrend.destroy(); delete charts.finTrend; }
    const ctx3 = getCtx('report-fin-trend-chart');
    if (ctx3 && Object.keys(byMonth).length) {
        const months = Object.keys(byMonth).sort();
        charts.finTrend = new Chart(ctx3, {
            type: 'line',
            data: {
                labels: months.map(m => { const [y,mo] = m.split('-'); return new Date(+y,+mo-1,1).toLocaleString('en-US',{month:'short',year:'2-digit'}); }),
                datasets: [{ label:'Monthly Spend (IDR)', data: months.map(m=>byMonth[m]), fill:true, backgroundColor:'rgba(200,136,42,0.1)', borderColor:'#C8882A', tension:0.3, pointBackgroundColor:'#C8882A' }]
            },
            options: { responsive:true, maintainAspectRatio:false, scales:{ y:{beginAtZero:true} }, plugins:{legend:{display:false}} }
        });
    }

    // Top assets by cost table
    const topAssets = Object.entries(byAsset).sort((a,b)=>b[1]-a[1]).slice(0,8);
    const assetTableEl = document.getElementById('fin-asset-table');
    if (assetTableEl) {
        if (topAssets.length === 0) {
            assetTableEl.innerHTML = emptyStateHTML('No asset-linked costs in this period.');
        } else {
            assetTableEl.innerHTML = `
                <table class="wo-table" style="font-size:11.5px;">
                    <thead><tr><th>Asset</th><th style="width:120px;text-align:right;">Total Cost</th></tr></thead>
                    <tbody>${topAssets.map(([name, cost]) => `
                        <tr><td>${escapeHtml(name)}</td>
                        <td style="text-align:right;font-weight:700;">${formatIDR(cost)}</td></tr>`).join('')}
                    </tbody>
                </table>`;
        }
    }
}

// ─── 4.3 PM COMPLIANCE REPORT ─────────────────────────────────────────────────

async function renderPmComplianceReport() {
    const contentEl = document.getElementById('compliance-content');
    if (!contentEl) return;

    contentEl.innerHTML = `<div class="loading-state"><span class="spinner"></span>Loading PM compliance data…</div>`;

    const { data, error } = await supabase.rpc('get_pm_compliance', {
        p_from: dateRange.from?.toISOString() ?? null,
        p_to:   dateRange.to?.toISOString()   ?? null,
    });

    if (error || !data) {
        contentEl.innerHTML = emptyStateHTML('Could not load PM compliance data.', 'Ensure the phase4.sql migration has been run.');
        return;
    }

    if (data.length === 0) {
        contentEl.innerHTML = emptyStateHTML('No PM-linked work orders found in this date range.', 'WOs must be generated from PM schedules to appear here.');
        return;
    }

    // Summary
    const avgCompliance = data.reduce((s,r)=>s+(parseFloat(r.compliance_pct)||0),0) / data.length;

    // Table
    const tableHtml = `
        <div class="report-stat-row" style="margin-bottom:16px;">
            <div class="report-stat">
                <span class="report-stat-val" style="color:${avgCompliance>=80?'#065F46':avgCompliance>=60?'#B45309':'#991B1B'};">${avgCompliance.toFixed(0)}%</span>
                <span class="report-stat-lbl">Avg Compliance</span>
            </div>
            <div class="report-stat"><span class="report-stat-val">${data.reduce((s,r)=>s+Number(r.total_pm),0)}</span><span class="report-stat-lbl">Total PM WOs</span></div>
            <div class="report-stat"><span class="report-stat-val">${data.reduce((s,r)=>s+Number(r.on_time),0)}</span><span class="report-stat-lbl">Completed On Time</span></div>
        </div>
        <table class="wo-table" style="font-size:11.5px;">
            <thead><tr><th>Outlet</th><th style="width:80px;text-align:center;">PM WOs</th><th style="width:80px;text-align:center;">Done</th><th style="width:80px;text-align:center;">On Time</th><th style="width:100px;text-align:center;">Compliance</th></tr></thead>
            <tbody>${data.map(r => {
                const pct = parseFloat(r.compliance_pct) || 0;
                const color = pct >= 80 ? '#065F46' : pct >= 60 ? '#B45309' : '#991B1B';
                const bg    = pct >= 80 ? '#D1FAE5' : pct >= 60 ? '#FEF3C7' : '#FEE2E2';
                return `<tr>
                    <td>${escapeHtml(r.outlet)}</td>
                    <td style="text-align:center;">${r.total_pm}</td>
                    <td style="text-align:center;">${r.completed}</td>
                    <td style="text-align:center;">${r.on_time}</td>
                    <td style="text-align:center;">
                        <span style="background:${bg};color:${color};padding:2px 10px;border-radius:12px;font-weight:700;font-size:12px;">${pct.toFixed(0)}%</span>
                    </td>
                </tr>`;
            }).join('')}</tbody>
        </table>`;

    // Bar chart
    if (charts.compliance) { charts.compliance.destroy(); delete charts.compliance; }
    contentEl.innerHTML = `
        <div class="report-two-col">
            <div>${tableHtml}</div>
            <div>
                <div class="report-section-title">Compliance by Outlet</div>
                <div class="chart-container" style="height:280px;"><canvas id="report-compliance-chart"></canvas></div>
            </div>
        </div>`;

    const ctx = getCtx('report-compliance-chart');
    if (ctx) {
        const bgColors = data.map(r => {
            const p = parseFloat(r.compliance_pct) || 0;
            return p >= 80 ? '#D1FAE5' : p >= 60 ? '#FEF3C7' : '#FEE2E2';
        });
        const bdColors = data.map(r => {
            const p = parseFloat(r.compliance_pct) || 0;
            return p >= 80 ? '#065F46' : p >= 60 ? '#B45309' : '#991B1B';
        });
        charts.compliance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.map(r => r.outlet.replace('Nourish ','').replace('The Bakery ','')),
                datasets: [{
                    label: 'Compliance %',
                    data: data.map(r => parseFloat(r.compliance_pct) || 0),
                    backgroundColor: bgColors,
                    borderColor: bdColors,
                    borderWidth: 1,
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } },
                plugins: { legend: { display: false } }
            }
        });
    }
}

// ─── 4.5 MTBF REPORT ──────────────────────────────────────────────────────────

function calcMtbf(workOrders) {
    const byAsset = {};

    workOrders.forEach(wo => {
        if (!wo.asset_id || !wo.assets) return;
        if (!byAsset[wo.asset_id]) byAsset[wo.asset_id] = { asset: wo.assets, dates: [] };
        byAsset[wo.asset_id].dates.push(new Date(wo.created_at));
    });

    return Object.values(byAsset)
        .map(({ asset, dates }) => {
            const sorted = dates.sort((a, b) => a - b);
            let mtbfDays = null;
            if (sorted.length >= 2) {
                let total = 0;
                for (let i = 1; i < sorted.length; i++) total += sorted[i] - sorted[i-1];
                mtbfDays = (total / (sorted.length - 1)) / 86400000;
            }
            return { asset, woCount: sorted.length, mtbfDays, lastWo: sorted[sorted.length - 1] };
        })
        .filter(r => r.woCount >= 1)
        .sort((a, b) => (a.mtbfDays ?? Infinity) - (b.mtbfDays ?? Infinity));
}

function renderMtbfReport(wos) {
    const results  = calcMtbf(wos);
    const contentEl = document.getElementById('mtbf-content');
    if (!contentEl) return;

    const withMtbf = results.filter(r => r.mtbfDays !== null);
    const avgMtbf  = withMtbf.length
        ? withMtbf.reduce((s, r) => s + r.mtbfDays, 0) / withMtbf.length
        : null;

    if (results.length === 0) {
        contentEl.innerHTML = emptyStateHTML('No multi-WO assets found.', 'MTBF requires at least 2 work orders on the same registered asset.');
        return;
    }

    contentEl.innerHTML = `
        <div class="report-stat-row" style="margin-bottom:16px;">
            <div class="report-stat"><span class="report-stat-val">${results.length}</span><span class="report-stat-lbl">Tracked Assets</span></div>
            ${avgMtbf !== null ? `<div class="report-stat"><span class="report-stat-val">${avgMtbf.toFixed(0)}d</span><span class="report-stat-lbl">Avg MTBF</span></div>` : ''}
            <div class="report-stat"><span class="report-stat-val" style="color:#EF4444;">${withMtbf.filter(r=>r.mtbfDays<7).length}</span><span class="report-stat-lbl">MTBF &lt; 7 Days</span></div>
        </div>
        <table class="wo-table" style="font-size:11.5px;">
            <thead>
                <tr>
                    <th>Asset</th><th style="width:120px;">Category</th><th style="width:110px;">Outlet</th>
                    <th style="width:70px;text-align:center;">WO Count</th>
                    <th style="width:100px;text-align:center;">MTBF</th>
                    <th style="width:100px;">Last WO</th>
                </tr>
            </thead>
            <tbody>${results.slice(0, 20).map(r => {
                const mtbfLabel = r.mtbfDays !== null
                    ? (r.mtbfDays < 1 ? '<1 day' : `${Math.round(r.mtbfDays)} days`)
                    : '—';
                const mtbfColor = r.mtbfDays !== null && r.mtbfDays < 7 ? '#EF4444' : r.mtbfDays !== null && r.mtbfDays < 30 ? '#B45309' : '#065F46';
                const lastWoStr = r.lastWo ? r.lastWo.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—';
                return `<tr>
                    <td><div style="font-weight:600;">${escapeHtml(r.asset.asset_code||'N/A')}</div><div style="font-size:10.5px;color:#6B7280;">${escapeHtml(r.asset.model||r.asset.category)}</div></td>
                    <td>${escapeHtml(r.asset.category||'—')}</td>
                    <td>${escapeHtml(r.asset.outlet)}</td>
                    <td style="text-align:center;font-weight:700;">${r.woCount}</td>
                    <td style="text-align:center;font-weight:700;color:${mtbfColor};">${mtbfLabel}</td>
                    <td style="font-size:10.5px;">${lastWoStr}</td>
                </tr>`;
            }).join('')}</tbody>
        </table>
        ${results.length > 20 ? `<div style="font-size:11.5px;color:#9CA3AF;padding:8px 0;">Showing top 20 of ${results.length} assets</div>` : ''}`;
}

// ─── ACTIVE TAB RENDER ────────────────────────────────────────────────────────

async function renderActiveTab() {
    const wos = getFiltered();

    // Update date range label
    const rangeLabel = document.getElementById('report-range-label');
    if (rangeLabel) rangeLabel.textContent = getDateRangeLabel();

    switch (activeTab) {
        case 'aging':      renderAgingReport(wos);      break;
        case 'financial':  renderFinancialReport(wos);  break;
        case 'compliance': await renderPmComplianceReport(); break;
        case 'mtbf':       renderMtbfReport(wos);       break;
    }
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

export function initReports() {
    // Reports are rendered on first expand, not on init
}

export async function refreshReports() {
    if (isExpanded) await renderActiveTab();
}

// ─── 4.6 PER-OUTLET DASHBOARD ────────────────────────────────────────────────

function initOutletDashboardFilter() {
    const sel = document.getElementById('dash-outlet-filter');
    if (!sel) return;

    getOutlets().forEach(name => {
        const opt = document.createElement('option');
        opt.value = name; opt.textContent = name;
        sel.appendChild(opt);
    });

    sel.addEventListener('change', () => {
        const all = getActiveWorkOrders();
        const filtered = sel.value ? all.filter(wo => wo.outlet === sel.value) : all;
        renderDashboard(filtered);

        const ctx = document.getElementById('dash-outlet-ctx');
        if (ctx) ctx.textContent = sel.value || 'All Outlets';
    });
}

// ─── 4.8 PDF EXPORT ──────────────────────────────────────────────────────────

function exportPdf() {
    const title = document.getElementById('pdf-report-title');
    const dateEl = document.getElementById('pdf-report-date');
    const rangeEl = document.getElementById('pdf-report-range');

    if (title)  title.textContent  = 'Nourish Group Indonesia — Engineering Report';
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-GB',{ day:'2-digit', month:'long', year:'numeric' });
    if (rangeEl) rangeEl.textContent = `Period: ${getDateRangeLabel()}`;

    document.body.classList.add('print-reports');
    window.print();
    setTimeout(() => document.body.classList.remove('print-reports'), 500);
}

// ─── EVENT LISTENERS ──────────────────────────────────────────────────────────

export function initReportEventListeners() {
    // 4.6: Per-outlet dashboard filter
    initOutletDashboardFilter();

    // Toggle reports section
    const toggleBtn  = document.getElementById('btn-toggle-reports');
    const reportsBody = document.getElementById('reports-body');
    const chevron    = document.getElementById('reports-chevron');

    if (toggleBtn) {
        toggleBtn.addEventListener('click', async () => {
            isExpanded = !isExpanded;
            if (reportsBody) reportsBody.style.display = isExpanded ? 'block' : 'none';
            if (chevron) chevron.style.transform = isExpanded ? 'rotate(180deg)' : '';
            if (isExpanded) await renderActiveTab();
        });
    }

    // Date preset buttons
    document.querySelectorAll('.date-preset-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            document.querySelectorAll('.date-preset-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyPreset(btn.dataset.preset);
            if (isExpanded) await renderActiveTab();
        });
    });

    // Custom date inputs
    const fromEl = document.getElementById('report-date-from');
    const toEl   = document.getElementById('report-date-to');

    function applyCustomRange() {
        document.querySelectorAll('.date-preset-btn').forEach(b => b.classList.remove('active'));
        dateRange.preset = 'custom';
        dateRange.from = fromEl?.value ? new Date(fromEl.value) : null;
        dateRange.to   = toEl?.value   ? new Date(toEl.value + 'T23:59:59') : null;
        const rangeLabel = document.getElementById('report-range-label');
        if (rangeLabel) rangeLabel.textContent = 'Custom Range';
    }

    if (fromEl) fromEl.addEventListener('change', async () => { applyCustomRange(); if (isExpanded) await renderActiveTab(); });
    if (toEl)   toEl.addEventListener('change',   async () => { applyCustomRange(); if (isExpanded) await renderActiveTab(); });

    // Report tab buttons
    document.querySelectorAll('.report-tab-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            document.querySelectorAll('.report-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.report-content').forEach(c => c.style.display = 'none');
            activeTab = btn.dataset.tab;
            const contentEl = document.getElementById(`report-${activeTab}`);
            if (contentEl) contentEl.style.display = 'block';
            destroyAll();
            await renderActiveTab();
        });
    });

    // 4.8: PDF export
    const exportBtn = document.getElementById('btn-export-pdf');
    if (exportBtn) exportBtn.addEventListener('click', exportPdf);
}