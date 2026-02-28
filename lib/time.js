/** Advance a YYYY-MM string by n months and return the first day as YYYY-MM-DD. */
export function nextMonthStart(yyyyMM, n = 1) {
  const [y, m] = yyyyMM.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-01`;
}

export function getChicagoTodayISO() {
  // en-CA yields YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function isValidISODateString(iso) {
  return typeof iso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(iso);
}
