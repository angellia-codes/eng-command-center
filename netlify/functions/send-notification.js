console.log('send-notification function loaded');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({
                ok: false,
                error: 'Method not allowed'
            })
        };
    }

    const FONNTE_TOKEN = process.env.FONNTE_TOKEN;
    const DEFAULT_GROUP = process.env.FONNTE_TARGET_GROUP;

    if (!FONNTE_TOKEN) {
        return {
            statusCode: 500,
            body: JSON.stringify({
                ok: false,
                error: 'FONNTE_TOKEN is missing'
            })
        };
    }

    try {
        const body = JSON.parse(event.body || '{}');

        const target = body.target || DEFAULT_GROUP;
        const message = body.message;

        if (!message) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    ok: false,
                    error: 'Message is required'
                })
            };
        }

        const params = new URLSearchParams();
        params.append('target', target);
        params.append('message', message);
        params.append('countryCode', '62');

        const response = await fetch('https://api.fonnte.com/send', {
            method: 'POST',
            headers: {
                Authorization: FONNTE_TOKEN,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
        });

        const result = await response.json();

        console.log('Fonnte response:', result);

        return {
            statusCode: 200,
            body: JSON.stringify({
                ok: result.status === true,
                result
            })
        };

    } catch (err) {
        console.error(err);

        return {
            statusCode: 500,
            body: JSON.stringify({
                ok: false,
                error: err.message
            })
        };
    }
};