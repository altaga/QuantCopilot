'use strict';

// ─── STRATEGY PARSER ──────────────────────────────────────────────────────────
// Converts natural language prompts into structured JSON rule objects.
// Runs entirely locally via regex. No external API calls required.

const KNOWN_EXCHANGES = [
    'binance', 'kraken', 'coinbase', 'okx', 'bitfinex',
    'bybit', 'gateio', 'gemini', 'bitstamp', 'kucoin'
];

const PRESETS = {
    conservative: {
        minSpreadPercent:     0.40,
        maxExposureUSD:       250,
        maxDailyLossUSD:     -50,
        maxConsecutiveLosses: 2,
        avoidHighVolatility:  true,
        exchangeBlacklist:    [],
        killSwitch:           false
    },
    'volatility shield': {
        minSpreadPercent:     0.25,
        maxExposureUSD:       500,
        maxDailyLossUSD:     -100,
        maxConsecutiveLosses: 4,
        avoidHighVolatility:  true,
        exchangeBlacklist:    [],
        killSwitch:           false
    },
    aggressive: {
        minSpreadPercent:     0.10,
        maxExposureUSD:       2000,
        maxDailyLossUSD:     -500,
        maxConsecutiveLosses: 10,
        avoidHighVolatility:  false,
        exchangeBlacklist:    [],
        killSwitch:           false
    }
};

function parsePromptToRules(prompt) {
    if (!prompt || typeof prompt !== 'string') return null;

    const text = prompt.toLowerCase().trim();

    // Check for preset matches first
    for (const [name, preset] of Object.entries(PRESETS)) {
        if (text.includes(name)) {
            console.log(`[PARSER] Matched preset: "${name}"`);
            return { ...preset };
        }
    }

    // ─── Rule extraction via regex ────────────────────────────────────────────

    const rules = {};

    // minSpreadPercent — "spread above 0.35%", "net spread > 0.2%", "spread of 0.5%"
    const spreadMatch = text.match(/spread\s*(?:above|>|of|greater\s*than)?\s*(\d+\.?\d*)\s*%/);
    if (spreadMatch) rules.minSpreadPercent = parseFloat(spreadMatch[1]);

    // maxExposureUSD — "cap at $500", "max $1000", "exposure $250", "limit $750"
    const exposureMatch = text.match(/(?:cap|max|exposure|limit)\s*(?:at|of|to)?\s*\$?(\d+)/);
    if (exposureMatch) rules.maxExposureUSD = parseFloat(exposureMatch[1]);

    // maxConsecutiveLosses — "stop after 3 losing trades", "3 consecutive losses"
    const lossTradesMatch = text.match(/stop\s*after\s*(\d+)\s*los/);
    const consecMatch     = text.match(/(\d+)\s*consecutive\s*loss/);
    if (lossTradesMatch)   rules.maxConsecutiveLosses = parseInt(lossTradesMatch[1]);
    else if (consecMatch)  rules.maxConsecutiveLosses = parseInt(consecMatch[1]);

    // maxDailyLossUSD — "max daily loss $100", "daily loss limit $200"
    const dailyLossMatch = text.match(/daily\s*loss\s*(?:limit|of|cap|at)?\s*\$?(\d+)/);
    if (dailyLossMatch) rules.maxDailyLossUSD = -Math.abs(parseFloat(dailyLossMatch[1]));

    // avoidHighVolatility — "avoid volatility", "during high volatility", "skip volatile"
    if (/avoid.*volat|high.*volat|skip.*volat|volat.*avoid/.test(text)) {
        rules.avoidHighVolatility = true;
    }

    // killSwitch — "kill switch", "emergency stop", "stop all", "halt"
    if (/kill\s*switch|emergency\s*stop|stop\s*all|halt\s*trading/.test(text)) {
        rules.killSwitch = true;
    }

    // exchangeBlacklist — "blacklist binance", "don't use kraken", "exclude coinbase"
    const blacklistMatch = text.match(/(?:blacklist|exclude|don't\s*use|avoid\s*exchange|avoid)\s*(.+?)(?:\.|,|and|$)/);
    if (blacklistMatch) {
        const segment = blacklistMatch[1];
        const found = KNOWN_EXCHANGES.filter(ex => segment.includes(ex));
        if (found.length > 0) {
            // Capitalize first letter to match server-side exchange keys
            rules.exchangeBlacklist = found.map(ex => ex.charAt(0).toUpperCase() + ex.slice(1));
        }
    }

    console.log('[PARSER] Extracted rules:', JSON.stringify(rules));
    return Object.keys(rules).length > 0 ? rules : null;
}

module.exports = { parsePromptToRules, PRESETS };
