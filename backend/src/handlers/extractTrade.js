import { verifyGoogleToken } from '../utils/auth.js';
import { extractTradeFromImage } from '../services/claude.js';
import { appendTradeToSheet } from '../services/sheets.js';
import { corsHeaders } from '../utils/cors.js';

export async function handleExtractTrade(request, env) {
    const headers = { ...corsHeaders(env), 'Content-Type': 'application/json' };

    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401, headers });
    }

    const token = authHeader.split(' ')[1];
    const user = await verifyGoogleToken(token);
    if (!user) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers });
    }
    if (user.email !== env.ALLOWED_USER_EMAIL) {
        return new Response(JSON.stringify({ error: 'Unauthorized user' }), { status: 403, headers });
    }

    let body;
    try { body = await request.json(); } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers });
    }

    const { image, mimeType } = body;
    if (!image) {
        return new Response(JSON.stringify({ error: 'No image provided' }), { status: 400, headers });
    }

    let tradeData;
    try {
        tradeData = await extractTradeFromImage(image, mimeType || 'image/png', env.CLAUDE_API_KEY);
    } catch (error) {
        return new Response(JSON.stringify({ success: false, message: 'Error analyzing image: ' + error.message }), { status: 200, headers });
    }

    if (!tradeData) {
        return new Response(JSON.stringify({ success: false, message: 'Could not extract trade data from image.' }), { status: 200, headers });
    }

    try {
        await appendTradeToSheet(tradeData, env);
    } catch (error) {
        return new Response(JSON.stringify({ success: false, message: 'Extracted but failed to save: ' + error.message, trade: tradeData }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ success: true, trade: tradeData }), { status: 200, headers });
}
