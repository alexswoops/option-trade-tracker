export async function extractTradeFromImage(base64Image, mimeType, apiKey) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            messages: [{
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: { type: 'base64', media_type: mimeType, data: base64Image }
                    },
                    {
                        type: 'text',
                        text: `Analyze this screenshot of a stock or option trade. It could be one of these types:

1. STOCK_BUY - header says "Market Buy" or similar. Shows shares and price per share.
2. SELL_CALL - header says "Sell [ticker] Call". Shows contracts and premium.
3. SELL_PUT - header says "Sell [ticker] Put". Shows contracts and premium.
4. CALL_ASSIGNMENT - header says "Call Assignment". Shows "Credit" amount.
5. PUT_ASSIGNMENT - header says "Put Assignment". Shows "Cost" amount.
6. EXPIRED - option expired worthless.

Extract and return ONLY valid JSON (no markdown, no code blocks):
{
"trade_date": "YYYY-MM-DD",
"symbol": "stock ticker",
"trade_type": "STOCK_BUY, SELL_CALL, SELL_PUT, CALL_ASSIGNMENT, PUT_ASSIGNMENT, or EXPIRED",
"strike": numeric strike price from the header (null for stock trades),
"expiration": "YYYY-MM-DD (use the Date field in the details section, null for stock trades)",
"quantity": number of contracts or shares,
"price_per_share": price per share (for STOCK_BUY, CALL_ASSIGNMENT, PUT_ASSIGNMENT) or null for option sells,
"premium": per-contract premium (for SELL_CALL, SELL_PUT) or null for stock/assignment trades,
"total": total dollar amount (see rules below),
"status": "FILLED, ASSIGNED, EXPIRED, or COMPLETED",
"notes": "any additional info"
}

RULES FOR price_per_share vs premium:
- STOCK_BUY: price_per_share = filled price per share. premium = null.
- SELL_CALL: price_per_share = null. premium = per-contract premium from "Est credit" divided by quantity.
- SELL_PUT: price_per_share = null. premium = per-contract premium from "Est credit" divided by quantity.
- CALL_ASSIGNMENT: price_per_share = strike price. premium = null.
- PUT_ASSIGNMENT: price_per_share = strike price. premium = null.
- EXPIRED: both null.

RULES FOR total:
- STOCK_BUY: NEGATIVE number. Use the Filled Notional or top-right dollar amount with a minus sign.
- SELL_CALL: POSITIVE number. Use the "Est credit" value at bottom left.
- SELL_PUT: POSITIVE number. Use the "Est credit" value at bottom left.
- CALL_ASSIGNMENT: POSITIVE number. Use the "Credit" value from the details section.
- PUT_ASSIGNMENT: NEGATIVE number. Use the "Cost" value with a minus sign.
- EXPIRED: 0.

RULES FOR trade_date: Use the smaller non-bold date directly below the main header (e.g. "Dec 5" or "Jan 16"), NOT the expiration date or Date field.

Convert all dates to YYYY-MM-DD. No currency symbols or commas in numbers. Use null for unknown fields.`
                    }
                ]
            }]
        })
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Claude API error ${response.status}: ${errorText}`);
    }
    const result = await response.json();
    const content = result.content[0].text;
    try {
        return JSON.parse(content);
    } catch {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try { return JSON.parse(jsonMatch[0]); } catch { return null; }
        }
        return null;
    }
}
