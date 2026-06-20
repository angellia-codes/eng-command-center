// js/outlets.js

import { supabase } from './utils/supabase.js';

/**
 * @file Single source of truth for outlet names.
 *
 * Phase 2 (2.9): Replaces five separate hardcoded outlet lists in index.html
 * with one DB-driven source. All <select> elements for outlet are now
 * populated by populateOutletSelect() / populateAllOutletSelects().
 *
 * Fallback: If the outlets table doesn't exist yet (pre-migration), the
 * hardcoded OUTLET_FALLBACK list is used so the app keeps working.
 */

const OUTLET_FALLBACK = [
    'Nourish Ungasan',
    'Nourish Uluwatu',
    'Nourish Berawa',
    'Nourish Central Kitchen',
    'The Bakery Uluwatu',
    'The Bakery Kitchen',
    'Nourish Office',
];

let outletCache = [];

/**
 * Fetches active outlets from the DB, ordered by sort_order.
 * Falls back to OUTLET_FALLBACK if the table doesn't exist yet.
 */
export async function fetchOutlets() {
    const { data, error } = await supabase
        .from('outlets')
        .select('name')
        .eq('active', true)
        .order('sort_order');

    if (error || !data || data.length === 0) {
        console.warn('[outlets] Falling back to hardcoded list:', error?.message);
        outletCache = OUTLET_FALLBACK;
    } else {
        outletCache = data.map(o => o.name);
    }
    return outletCache;
}

export function getOutlets() {
    return outletCache.length > 0 ? outletCache : OUTLET_FALLBACK;
}

/**
 * Populates a <select> element with outlet options using safe DOM methods.
 * @param {HTMLSelectElement|null} selectEl
 * @param {object} opts
 * @param {string}   opts.placeholder
 * @param {boolean}  opts.includeOther
 * @param {string[]} opts.extraOptions  Additional options appended after outlets
 */
export function populateOutletSelect(selectEl, opts = {}) {
    if (!selectEl) return;

    const {
        placeholder  = 'Select outlet...',
        includeOther = true,
        extraOptions = [],
    } = opts;

    selectEl.innerHTML = '';

    const ph = document.createElement('option');
    ph.value = '';
    ph.textContent = placeholder;
    selectEl.appendChild(ph);

    getOutlets().forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        selectEl.appendChild(opt);
    });

    extraOptions.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        selectEl.appendChild(opt);
    });

    if (includeOther) {
        const other = document.createElement('option');
        other.value = 'Other';
        other.textContent = 'Other';
        selectEl.appendChild(other);
    }
}

/**
 * Populates every outlet <select> on the page in one call.
 * Called once after fetchOutlets() resolves in initializeApp().
 */
export function populateAllOutletSelects() {
    populateOutletSelect(document.getElementById('f-outlet'));
    populateOutletSelect(document.getElementById('pr-outlet'), {
        extraOptions: ['Engineering Dept'],
    });
    populateOutletSelect(
        document.querySelector('#asset-form select[name="outlet"]')
    );
}