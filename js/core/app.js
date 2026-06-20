// js/app.js — Phase 5

import { supabase } from '../utils/supabase.js';
import { checkAuthState, signInWithGoogle, signOut } from './shared/auth.js';
import {
    renderHeader, showPage, toast, closeModal,
    hideImageLightbox, updateIcons, switchFormTab,
    showTableLoading, showPanelLoading
} from './ui.js';
import { renderDashboard } from '../dashboard.js';
import { fetchAuditLogs, renderAuditLog }    from './shared/audit.js';
import {
    fetchWorkOrders,
    renderWorkOrdersTable
} from '../modules/workorders.js';
import { initRealtime }                      from './shared/realtime.js';
import { initPurchaseEventListeners }        from './modules/purchase.js';
import {
    fetchAssets
} from '../modules/assets.js';
import {
    fetchMaintenanceSchedules
} from '../modules/maintenance.js';
import { renderAnalytics }                   from './analytics/analytics.js';
import { exportWorkOrdersToCSV }             from './utils/export.js';
import { initUserManagementEventListeners }  from './modules/users.js';
import { fetchOutlets, populateAllOutletSelects } from './utils/outlets.js';
import {
    fetchEngineeringRequests
} from '../modules/engineering-requests.js';
import { initCommentsEventListeners }        from './core/comments.js';
import { initNotificationBell }              from './shared/notifications-ui.js';
import { initReports, initReportEventListeners } from './analytics/reports.js';
import {
    fetchInventory, renderInventoryList, initInventoryEventListeners  // 5.1
} from './modules/inventory.js';
import {
    fetchVendors, renderVendorList, initVendorEventListeners          // 5.2
} from './modules/vendors.js';
import {
    fetchDailyUpdates, renderDailyUpdatesGrid, initDailyUpdatesEventListeners // 5.3
} from './modules/daily-updates.js';
import { initErrorBoundary }                 from './core/error-boundary.js'; // 5.8

let appInitialized = false;

async function initializeApp(userProfile) {
    if (appInitialized) return;
    console.log('Initializing app for:', userProfile.full_name);

    // 5.8: Error boundary must be first
    initErrorBoundary();

    if (userProfile.role === 'admin') {
        document.getElementById('manage-users-btn').style.display = 'block';
    }

    renderHeader(userProfile);
    cancelEdit();
    initNotificationBell();

    await fetchOutlets();
    populateAllOutletSelects();

    // Loading states for all panels
    showTableLoading(document.getElementById('wo-tbody'),         7, 'Loading work orders…');
    showTableLoading(document.getElementById('er-tbody'),         6, 'Loading requests…');
    showTableLoading(document.getElementById('inventory-tbody'),  8, 'Loading inventory…');
    showTableLoading(document.getElementById('vendors-tbody'),    7, 'Loading vendors…');
    showPanelLoading(document.getElementById('pm-list-container'),    'Loading PM schedule…');
    showPanelLoading(document.getElementById('asset-list-container'), 'Loading assets…');
    showPanelLoading(document.getElementById('daily-updates-grid'),   'Loading daily updates…');

    // Fetch all data in parallel
    const [workOrders, auditLogs, assets, schedules, engineeringRequests,
           inventory, vendors, dailyUpdates] = await Promise.all([
        fetchWorkOrders(),
        fetchAuditLogs(),
        fetchAssets(),
        fetchMaintenanceSchedules(),
        fetchEngineeringRequests(),
        fetchInventory(),      // 5.1
        fetchVendors(),        // 5.2
        fetchDailyUpdates(),   // 5.3
    ]);

    // Render all panels
    renderDashboard(workOrders);
    renderWorkOrdersTable();
    renderAuditLog(auditLogs);
    renderAssetOptions(assets);
    renderAssetList(assets);
    renderMaintenancePanel(schedules);
    renderERList(engineeringRequests);
    renderInventoryList(inventory);       // 5.1
    renderVendorList(vendors);            // 5.2
    renderDailyUpdatesGrid(dailyUpdates); // 5.3

    // Initialise all event listeners
    initWorkOrderEventListeners();
    initFilterEventListeners();
    initPurchaseEventListeners();
    initAssetEventListeners();
    initMaintenanceEventListeners();
    initUserManagementEventListeners();
    initEngineeringRequestsEventListeners();
    initCommentsEventListeners();
    initInventoryEventListeners();        // 5.1
    initVendorEventListeners();           // 5.2
    initDailyUpdatesEventListeners();     // 5.3
    initReports();
    initReportEventListeners();
    initRealtime();

    updateNextIdLabel();
    updateIcons();
    showPage(true);
    await renderAnalytics();

    appInitialized = true;
}

function resetApp() {
    showPage(false);
    appInitialized = false;
    cancelEdit();
    ['wo-tbody','audit-body','er-tbody','inventory-tbody','vendors-tbody'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });
}

function setupGlobalEventListeners() {
    document.getElementById('google-login-btn').addEventListener('click', signInWithGoogle);
    document.getElementById('logout-btn').addEventListener('click', signOut);
    document.getElementById('tab-wo').addEventListener('click', () => switchFormTab('wo'));
    document.getElementById('tab-po').addEventListener('click', () => switchFormTab('po'));
    document.getElementById('m-btn-cancel').addEventListener('click', closeModal);
    document.getElementById('m-btn-confirm').addEventListener('click', handleModalConfirm);
    document.getElementById('action-modal').addEventListener('click', e => {
        if (e.target.id === 'action-modal') closeModal();
    });
    document.getElementById('img-lb').addEventListener('click', hideImageLightbox);
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') { closeModal(); hideImageLightbox(); }
    });
    document.getElementById('btn-export-csv').addEventListener('click', () => {
        exportWorkOrdersToCSV(getActiveWorkOrders());
    });
}

supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (session?.user) {
            const profile = await checkAuthState();
            if (profile) initializeApp(profile);
            else resetApp();
        }
    } else if (event === 'SIGNED_OUT') {
        resetApp();
    }
});

setupGlobalEventListeners();
