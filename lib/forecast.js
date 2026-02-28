import { getChicagoWeekdayIndex, addDaysToISO } from "@/lib/time";

/**
 * Damped-Trend Seasonal Forecast
 *
 * Algorithm:
 *   1. Multiplicative seasonal factors from server-computed day-of-week averages
 *      (covers ALL historical data, not just recent entries).
 *   2. Exponentially weighted linear regression on the de-seasonalized series
 *      (recent data carries ~20× more weight than the oldest point).
 *   3. Damped-trend projection (φ = 0.95) — prevents ±∞ linear extrapolation.
 *
 * Returns null when there is insufficient data (< 5 entries).
 */
export function dampedSeasonalForecast(allEntries, dowAverages, forecastDays = 14) {
  const n = allEntries.length;
  if (n < 5 || !dowAverages?.length) return null;

  // Global mean from server DOW averages (all-time data)
  const totalCount = dowAverages.reduce((s, d) => s + d.count, 0);
  if (totalCount === 0) return null;
  const globalMean = dowAverages.reduce((s, d) => s + d.avg * d.count, 0) / totalCount;
  if (globalMean === 0) return null;

  // Raw multiplicative seasonal factors per weekday
  const rawFactors = Array.from({ length: 7 }, (_, i) => {
    const d = dowAverages.find((x) => x.dow === i);
    return d && d.count > 0 ? d.avg / globalMean : 1;
  });

  // Normalize so active-day factors average to 1
  const activeIdx = dowAverages.filter((d) => d.count > 0).map((d) => d.dow);
  const factorSum = activeIdx.reduce((s, i) => s + rawFactors[i], 0);
  const norm      = activeIdx.length > 0 ? activeIdx.length / factorSum : 1;
  const dowFactors = rawFactors.map((f, i) => activeIdx.includes(i) ? f * norm : 1);

  // Attach weekday index to each entry and de-seasonalize
  const entries = allEntries.map((e) => ({ ...e, dow: getChicagoWeekdayIndex(e.date) }));
  const deseas  = entries.map(({ sale, dow }) => dowFactors[dow] > 0 ? sale / dowFactors[dow] : sale);

  // Exponentially weighted linear regression
  // Weight decays so the oldest point has ~5% of the weight of the newest
  const lambda = Math.log(20) / Math.max(n - 1, 1);
  let wS = 0, wX = 0, wY = 0, wXX = 0, wXY = 0;
  deseas.forEach((y, i) => {
    const w = Math.exp(lambda * (i - (n - 1)));
    wS += w; wX += w * i; wY += w * y; wXX += w * i * i; wXY += w * y * i;
  });
  const det = wS * wXX - wX * wX;
  if (Math.abs(det) < 1e-10) return null;
  const slope     = (wS * wXY - wX * wY) / det;
  const intercept = (wY - slope * wX) / wS;

  // R² (unweighted, on de-seasonalized series)
  const yMean = deseas.reduce((s, y) => s + y, 0) / n;
  const ssTot = deseas.reduce((s, y) => s + (y - yMean) ** 2, 0);
  const ssRes = deseas.reduce((s, y, i) => s + (y - (slope * i + intercept)) ** 2, 0);
  const r2    = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  // Damped trend: φ + φ² + … + φ^h = φ(1−φ^h)/(1−φ)
  const phi    = 0.95;
  const L_last = slope * (n - 1) + intercept; // de-seasonalized level at last recorded date

  // Chart data: last 14 actuals + trend line + forecastDays predicted points
  const histSlice  = entries.slice(-14);
  const histOffset = n - histSlice.length;

  const combined = histSlice.map((e, i) => {
    const xi    = histOffset + i;
    const trend = +Math.max(0, (slope * xi + intercept) * dowFactors[e.dow]).toFixed(2);
    return { date: e.date, actual: e.sale, trend, predicted: null };
  });

  for (let h = 1; h <= forecastDays; h++) {
    const fDate   = addDaysToISO(entries[n - 1].date, h);
    const dow     = getChicagoWeekdayIndex(fDate);
    const dampedT = slope * phi * (1 - Math.pow(phi, h)) / (1 - phi);
    const pred    = +Math.max(0, (L_last + dampedT) * dowFactors[dow]).toFixed(2);
    combined.push({ date: fDate, actual: null, trend: null, predicted: pred });
  }

  const confidence     = r2 > 0.6 ? "High" : r2 > 0.3 ? "Moderate" : "Low";
  const trendDir       = slope > 50 ? "upward" : slope < -50 ? "downward" : "flat";
  const lastActualDate = histSlice[histSlice.length - 1].date;

  return { combined, r2, confidence, trendDir, lastActualDate, usedPoints: n };
}
