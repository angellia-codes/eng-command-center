// netlify/functions/send-notification.js

/**
 * Server-side WhatsApp notification proxy.
 *
 * FIX 1.10: The Fonnte API token is read from the Netlify environment variable
 * FONNTE_TOKEN — it never appears in the client-side JavaScript bundle.
 *
 * Setup:
 *   Netlify Dashboard → Site Settings → Environment Variables
 *   Key: FONNTE_TOKEN  |  Value: your_fonnte_api_token
 *
 * This function is invoked by the client via:
 *   POST /.netlify/functions/send-notification
 *   Body: { "target": "<whatsapp_group_id>", "message": "<text>" }
 */
exports.handler = async (event) => {
    // Only allow POST
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ ok: false, error: 'Method not allowed' }),
        };
    }

    // Token must be set in Netlify environment variables
    const FONNTE_TOKEN = process.env.FONNTE_TOKEN;
    if (!FONNTE_TOKEN) {
        console.error('[send-notification] FONNTE_TOKEN environment variable is not set.');
        return {
            statusCode: 503,
            body: JSON.stringify({ ok: false, error: 'Notification service not configured. Set FONNTE_TOKEN in Netlify environment variables.' }),
        };
    }

    let target, message;
    try {
        const body = JSON.parse(event.body || '{}');
        target  = body.target;
        message = body.message;
    } catch {
        return {
            statusCode: 400,
            body: JSON.stringify({ ok: false, error: 'Invalid JSON body' }),
        };
    }

    if (!target || !message) {
        return {
            statusCode: 400,
            body: JSON.stringify({ ok: false, error: 'Both "target" and "message" fields are required' }),
        };
    }

    try {
        // Send to Fonnte using URL-encoded form data (supported by all Node.js versions)
        const params = new URLSearchParams();
        params.append('target',      target);
        params.append('message',     message);
        params.append('countryCode', '62'); // Indonesia

        const response = await fetch('https://api.fonnte.com/send', {
            method:  'POST',
            headers: {
                'Authorization':  FONNTE_TOKEN,
                'Content-Type':   'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        });

        const result = await response.json();

        if (result.status === true) {
            return {
                statusCode: 200,
                body: JSON.stringify({ ok: true }),
            };
        } else {
            console.error('[send-notification] Fonnte API returned an error:', result);
            return {
                statusCode: 200, // Return 200 so client-side error handling runs (not a network error)
                body: JSON.stringify({ ok: false, error: result.reason || 'Fonnte API error' }),
            };
        }
    } catch (err) {
        console.error('[send-notification] Unexpected error:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ ok: false, error: err.message }),
        };
    }
};