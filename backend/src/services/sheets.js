import { getGoogleAccessToken } from '../utils/auth.js';

export async function appendTradeToSheet(tradeData, env) {
    const accessToken = await getGoogleAccessToken(env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const sheetId = env.GOOGLE_SHEET_ID;
    const tradeDate = tradeData.trade_date || new Date().toISOString().split('T')[0];
    const row = [
        tradeDate,
        tradeData.symbol || '',
        tradeData.trade_type || '',
        tradeData.strike || '',
        tradeData.expiration || '',
        tradeData.quantity || '',
        tradeData.price_per_share || '',
        tradeData.premium || '',
        tradeData.total || '',
        tradeData.status || '',
        tradeData.notes || ''
    ];
    const response = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Trades!A:K:append?valueInputOption=USER_ENTERED`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ values: [row] })
        }
    );
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Google Sheets API error: ${errorText}`);
    }
    return response.json();
}
