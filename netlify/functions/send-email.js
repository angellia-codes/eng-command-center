// netlify/functions/send-email.js

/**
 * Server-side email sender via Resend API — Phase 5 (5.9).
 *
 * Setup:
 *   Netlify Dashboard → Site Settings → Environment Variables
 *   RESEND_API_KEY  = re_xxxxxxxxxxxx          (from resend.com)
 *   FROM_EMAIL      = engineering@yourdomain.com  (must be a verified sender)
 *
 * Endpoint: POST /.netlify/functions/send-email
 * Body:     { to: string | string[], subject: string, html: string }
 */

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_VYrGWkgk_4rmZhpPLzCa8hS6fgCCJoJWS';
    const FROM_EMAIL     = process.env.FROM_EMAIL || 'hr@nourishbali.com';

    if (!RESEND_API_KEY) {
        console.error('[send-email] RESEND_API_KEY not set');
        return { statusCode: 503, body: JSON.stringify({ ok: false, error: 'Email service not configured. Set RESEND_API_KEY.' }) };
    }

    let to, subject, html;
    try {
        ({ to, subject, html } = JSON.parse(event.body || '{}'));
    } catch {
        return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Invalid JSON body' }) };
    }

    if (!to || !subject || !html) {
        return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'Missing to, subject, or html' }) };
    }

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method:  'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type':  'application/json',
            },
            body: JSON.stringify({
                from:    FROM_EMAIL,
                to:      Array.isArray(to) ? to : [to],
                subject,
                html,
            }),
        });

        const result = await response.json();

        if (result.id) {
            return { statusCode: 200, body: JSON.stringify({ ok: true, id: result.id }) };
        } else {
            console.error('[send-email] Resend error:', result);
            return { statusCode: 200, body: JSON.stringify({ ok: false, error: result.message || 'Resend API error' }) };
        }
    } catch (err) {
        console.error('[send-email] Unexpected error:', err);
        return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
    }
};
