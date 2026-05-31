'use strict';
const WebSocket = require('ws');

const FEE_CONFIG = {
    taker: 0.0025,       // 0.25% (High, but no longer mathematically impossible)
    maker: 0.0010,       // 0.10%
    withdrawalBTC: 0.0005 
};

let chaosMode = 'bad'; // "normal", "lightly_bad", "bad", "terrible"

const ENDPOINTS = [
    { url: 'wss://stream.binance.us:9443/ws/btcusd@bookTicker',   label: 'Binance.US' }
];

function connect(updateMemory, endpointIndex = 0) {
    if (endpointIndex >= ENDPOINTS.length) {
        console.error('❌ [REKTSWAP] All endpoints blocked.');
        return null;
    }

    const { url, label } = ENDPOINTS[endpointIndex];
    const ws = new WebSocket(url);
    let opened = false;
    let fallbackTriggered = false;

    const triggerFallback = () => {
        if (fallbackTriggered) return;
        fallbackTriggered = true;
        ws.terminate();
        console.warn(`⚠️ [REKTSWAP] Connection failed with ${label}. Trying fallback...`);
        setTimeout(() => connect(updateMemory, endpointIndex + 1), 1000);
    };

    ws.on('open', () => {
        opened = true;
        console.log(`⚠️ [REKTSWAP] Conectado vía ${label} (Mock Volatility Exchange Active! Mode: ${chaosMode})`);
    });

    ws.on('message', (data) => {
        try {
            const j = JSON.parse(data);
            if (j.b && j.a && j.B && j.A) {
                let bid = parseFloat(j.b);
                let ask = parseFloat(j.a);
                let bidVol = parseFloat(j.B);
                let askVol = parseFloat(j.A);

                // --- INJECT CHAOS (Based on mode) ---
                let chaosChance = 0;
                let magnitudeBase = 0;
                let magnitudeVar = 0;

                if (chaosMode === 'normal') {
                    chaosChance = 0.05;
                    magnitudeBase = 0.001;  // 0.1% (~$73) - Spread too low for arb
                    magnitudeVar = 0.0005;  
                } else if (chaosMode === 'lightly_bad') {
                    chaosChance = 0.10;
                    magnitudeBase = 0.0055; // 0.55% (~$400) - Barely beats 0.4% fees + slippage. Net profit ~$0.50
                    magnitudeVar = 0.001;
                } else if (chaosMode === 'bad') {
                    chaosChance = 0.15;
                    magnitudeBase = 0.008;  // 0.8% (~$584) - Solid arb. Net profit ~$10
                    magnitudeVar = 0.002;
                } else if (chaosMode === 'terrible') {
                    chaosChance = 0.40;
                    magnitudeBase = 0.015;  // 1.5% (~$1095) - Flash crash. Net profit ~$35
                    magnitudeVar = 0.005;
                }

                if (Math.random() < chaosChance) {
                    const magnitude = magnitudeBase + (Math.random() * magnitudeVar);
                    const roll = Math.random();

                    if (roll < 0.30) {
                        // ── ADVERSE FILL (30%): Slightly wider spread ──
                        // Simulates mediocre liquidity — eats into your margin
                        const adverseSpread = 0.0008 + (Math.random() * 0.0012); // 0.08% to 0.20%
                        bid -= bid * adverseSpread;
                        ask += ask * adverseSpread;
                    } else if (roll < 0.45) {
                        // ── STALE/LAGGING PRICE (15%): Price barely moves ──
                        const drift = 0.0001 + (Math.random() * 0.0002);
                        bid *= (1 - drift);
                        ask *= (1 + drift);
                    } else {
                        // ── NORMAL CHAOS (45%): Standard price swing (profitable direction) ──
                        const direction = Math.random() < 0.5 ? 1 : -1;
                        const swing = 1 + (direction * magnitude);
                        bid *= swing;
                        ask *= swing;

                        // Small liquidity gap
                        bid -= bid * 0.0005;
                        ask += ask * 0.0005;
                    }

                    // Ensure ask > bid to maintain orderbook integrity
                    if (ask < bid) {
                        const temp = ask;
                        ask = bid;
                        bid = temp;
                    }

                    // Throttle liquidity
                    bidVol *= 0.3 + (Math.random() * 0.4);
                    askVol *= 0.3 + (Math.random() * 0.4);
                }
                
                // Pass the chaotic data to the orchestrator!
                updateMemory('RektSwap', bid, bidVol, ask, askVol);
            }
        } catch (_) { return; }
    });

    ws.on('unexpected-response', () => {
        triggerFallback();
    });

    ws.on('error', (err) => {
        if (!opened) {
            console.error(`❌ [REKTSWAP] Connection error in ${label}:`, err.message);
            triggerFallback();
        } else {
            console.error(`❌ [REKTSWAP] Error in ${label}:`, err.message);
        }
    });

    ws.on('close', () => {
        if (!opened) {
            triggerFallback();
        }
    });

    return ws;
}

module.exports = { connect, getFees: () => FEE_CONFIG };
