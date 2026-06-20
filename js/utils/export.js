// js/export.js

import { toast } from './core/ui.js';

/**
 * @file Manages data export functionality.
 */

/**
 * Converts an array of objects to a CSV string.
 * @param {Array<object>} data - The data to convert.
 * @returns {string} The CSV formatted string.
 */
function convertToCSV(data) {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [headers.join(',')];

    for (const row of data) {
        const values = headers.map(header => {
            let cell = row[header] === null || row[header] === undefined ? '' : String(row[header]);
            cell = cell.replace(/"/g, '""'); // Escape double quotes
            if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
                cell = `"${cell}"`; // Wrap in double quotes if it contains special chars
            }
            return cell;
        });
        csvRows.push(values.join(','));
    }
    return csvRows.join('\n');
}

/**
 * Triggers a browser download for the given CSV string.
 * @param {string} csvString - The CSV data.
 * @param {string} filename - The desired filename for the download.
 */
function downloadCSV(csvString, filename) {
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

/**
 * Exports the current work orders to a CSV file.
 * @param {Array<object>} workOrders - The array of work order objects to export.
 */
export function exportWorkOrdersToCSV(workOrders) {
    if (workOrders.length === 0) {
        toast('No data to export.', 'err');
        return;
    }
    
    // Select and format data for export
    const dataToExport = workOrders.map(wo => ({
        id: wo.id,
        status: wo.status,
        priority: wo.priority,
        outlet: wo.outlet,
        asset_code: wo.assets?.asset_code || 'N/A',
        asset_description: wo.assets?.model || wo.asset_other,
        work_description: wo.description,
        cost: wo.cost,
        created_at: wo.created_at,
        created_by: wo.created_by,
        accepted_at: wo.accepted_at,
        accepted_by: wo.accepted_by,
        target_date: wo.target_date,
        completed_at: wo.completed_at,
        completed_by: wo.completed_by
    }));
    
    const csv = convertToCSV(dataToExport);
    const date = new Date().toISOString().split('T')[0];
    downloadCSV(csv, `Nourish_Work_Orders_${date}.csv`);
}