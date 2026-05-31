
import { useEffect, useRef } from 'react';
import { createChart, LineSeries } from 'lightweight-charts';

export function useTradingChart(initialExchange) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const lineSeriesRef = useRef(null);
  const chartDataRef = useRef([]);

  // disparamos el effect al montar o cambiar dependencias
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const formatTime = (time) => {
      if (!time) return "";
      const date = new Date(time);
      if (isNaN(date.getTime())) return "";
      const pad = (num) => num.toString().padStart(2, "0");
      const ms = date.getMilliseconds().toString().padStart(3, "0");
      return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${ms}`;
    };

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 300,
      layout: { background: { color: "#0F0F11" }, textColor: "#FFFFFF" },
      grid: { vertLines: { color: "#1F1F23" }, horzLines: { color: "#1F1F23" } },
      localization: { timeFormatter: formatTime },
      timeScale: { visible: true, tickMarkFormatter: formatTime },
      priceScale: { visible: true },
    });

    const lineSeries = chart.addSeries(LineSeries, { color: "#34d399", lineWidth: 2 });

    lineSeriesRef.current = lineSeries;
    chartRef.current = chart;

    return () => chart.remove();
  }, []);

  const updateChart = (type, time, data, selectedExchange, historyLoadedRef) => {
    // metemos data directo al canvas saltandonos el state de react
    if (type === "history") {
       const exData = data[selectedExchange];
       if (exData && exData.bid && exData.ask) {
          const mid = (parseFloat(exData.bid) + parseFloat(exData.ask)) / 2;
          chartDataRef.current.push({ time, value: mid });
       }
    } else if (type === "live") {
       const exData = data[selectedExchange];
       if (exData && exData.bid && exData.ask) {
          const mid = (parseFloat(exData.bid) + parseFloat(exData.ask)) / 2;
          if (chartDataRef.current.length === 0 || (historyLoadedRef && !historyLoadedRef.current)) {
             chartDataRef.current = [{ time, value: mid }];
             lineSeriesRef.current.setData(chartDataRef.current);
             chartRef.current?.timeScale().fitContent();
             if (historyLoadedRef) historyLoadedRef.current = true;
          } else {
             lineSeriesRef.current.update({ time, value: mid });
          }
       }
    }
  };

  const flushHistory = () => {
    if (!lineSeriesRef.current || chartDataRef.current.length === 0) return;
    const uniquePoints = [];
    const seenTimes = new Set();
    for (let i = chartDataRef.current.length - 1; i >= 0; i--) {
      const p = chartDataRef.current[i];
      if (!seenTimes.has(p.time)) {
        seenTimes.add(p.time);
        uniquePoints.unshift(p);
      }
    }
    chartDataRef.current = uniquePoints;
    lineSeriesRef.current.setData(uniquePoints);
    chartRef.current?.timeScale().fitContent();
  };

  return { chartContainerRef, chartRef, updateChart, flushHistory };
}
