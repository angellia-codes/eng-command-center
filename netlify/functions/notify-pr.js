// netlify/functions/notify-pr.js
// WhatsApp notification for Purchase Requests via Fonnte
// Deploy path: netlify/functions/notify-pr.js

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { pr_number, outlet, item_name, qty, unit, estimated_cost, requested_by, justification } = body;

  if (!pr_number || !outlet || !item_name) {
    return { statusCode: 400, body: 'Missing required fields' };
  }

  const FONNTE_TOKEN   = process.env.FONNTE_TOKEN;
  const NOTIFY_TARGETS = process.env.NOTIFY_TARGETS; // comma-separated phone numbers e.g. "628xxxxxxxxx,628xxxxxxxxx"

  if (!FONNTE_TOKEN || !NOTIFY_TARGETS) {
    console.error('Missing FONNTE_TOKEN or NOTIFY_TARGETS env vars');
    return { statusCode: 500, body: 'Server configuration error' };
  }

  const formatIDR = (v) => v ? 'Rp ' + Number(v).toLocaleString('id-ID') : '-';

  const message = [
    `🔧 *PURCHASE REQUEST — ${pr_number}*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📍 *Outlet:* ${outlet}`,
    `📦 *Item:* ${item_name}`,
    `🔢 *Qty:* ${qty || '-'} ${unit || ''}`,
    `💰 *Est. Cost:* ${formatIDR(estimated_cost)}`,
    `👤 *Requested By:* ${requested_by || '-'}`,
    justification ? `📝 *Notes:* ${justification}` : null,
    `━━━━━━━━━━━━━━━━━━━━`,
    `_NGI Engineering Command Center_`,
  ].filter(Boolean).join('\n');

  const targets = NOTIFY_TARGETS.split(',').map(t => t.trim()).filter(Boolean);

  try {
    const results = await Promise.allSettled(
      targets.map(target =>
        fetch('https://api.fonnte.com/send', {
          method: 'POST',
          headers: {
            'Authorization': FONNTE_TOKEN,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            target,
            message,
            countryCode: '62',
          }),
        }).then(r => r.json())
      )
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    console.log(`PR notification sent to ${successful}/${targets.length} targets`);

    return {
      statusCode: 200,
      body: JSON.stringify({ sent: successful, total: targets.length }),
    };
  } catch (err) {
    console.error('Fonnte error:', err);
    return { statusCode: 500, body: 'Notification failed: ' + err.message };
  }
};