import { handleExtractTrade } from './handlers/extractTrade.js';
import { corsHeaders, handleOptions } from './utils/cors.js';

export default {
    async fetch(request, env, ctx) {
        if (request.method === 'OPTIONS') {
            return handleOptions(request, env);
        }
        const url = new URL(request.url);
        try {
            if (url.pathname === '/api/extract-trade' && request.method === 'POST') {
                return await handleExtractTrade(request, env);
            }
            if (url.pathname === '/health') {
                return new Response(JSON.stringify({ status: 'ok' }), {
                    status: 200,
                    headers: { ...corsHeaders(env), 'Content-Type': 'application/json' }
                });
            }
            return new Response(JSON.stringify({ error: 'Not Found' }), {
                status: 404,
                headers: { ...corsHeaders(env), 'Content-Type': 'application/json' }
            });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { ...corsHeaders(env), 'Content-Type': 'application/json' }
            });
        }
    }
};
