export function corsHeaders(env) {
    return {
        'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
    };
}

export function handleOptions(request, env) {
    const origin = request.headers.get('Origin');
    const requestMethod = request.headers.get('Access-Control-Request-Method');
    if (origin && requestMethod) {
        return new Response(null, { status: 204, headers: corsHeaders(env) });
    }
    return new Response(null, { status: 405, headers: { Allow: 'GET, POST, OPTIONS' } });
}
