
function calculateTruePrice(marketData) {
    let totalValue = 0;
    let totalVolume = 0;
    const prices = [];

    // 1. Filtrado inicial y recolección de precios válidos
    const validExchanges = Object.keys(marketData).filter(ex => {
        const d = marketData[ex];
        return d.bid > 0 && d.ask > 0 && d.bidVol > 0 && d.askVol > 0;
    });

    if (validExchanges.length === 0) return null;

    // 2. Calcular la MEDIANA para detectar outliers de forma robusta
    validExchanges.forEach(ex => {
        const d = marketData[ex];
        prices.push((d.bid + d.ask) / 2);
    });
    
    prices.sort((a, b) => a - b);
    let median = 0;
    const half = Math.floor(prices.length / 2);
    if (prices.length % 2) {
        median = prices[half];
    } else {
        median = (prices[half - 1] + prices[half]) / 2.0;
    }

    // 3. Calcular VWAP filtrando outliers (desviación mayor al 5%)
    validExchanges.forEach(ex => {
        const d = marketData[ex];
        const midPrice = (d.bid + d.ask) / 2;
        const volume = (d.bidVol + d.askVol) / 2;

        // Si el precio del exchange se desvía más del 5% de la mediana, es data sucia
        if (Math.abs(midPrice - median) / median < 0.05) {
            totalValue += midPrice * volume;
            totalVolume += volume;
        }
    });

    return totalVolume > 0 ? totalValue / totalVolume : median;
}

// exportamos el modulo para usarlo en el pipeline
module.exports = { calculateTruePrice };