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

    // 2. Calcular un promedio simple primero para detectar outliers (Filtro de mediana)
    validExchanges.forEach(ex => {
        const d = marketData[ex];
        prices.push((d.bid + d.ask) / 2);
    });
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;

    // 3. Calcular VWAP filtrando outliers (desviación mayor al 2%)
    validExchanges.forEach(ex => {
        const d = marketData[ex];
        const midPrice = (d.bid + d.ask) / 2;
        const volume = (d.bidVol + d.askVol) / 2;

        // Si el precio del exchange se desvía más del 2% del promedio, es data sucia
        if (Math.abs(midPrice - avg) / avg < 0.02) {
            totalValue += midPrice * volume;
            totalVolume += volume;
        }
    });

    return totalVolume > 0 ? totalValue / totalVolume : avg;
}

module.exports = { calculateTruePrice };