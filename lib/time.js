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

// ─── Shared date utilities (work in both Node.js and browser) ─────────────────

function _pad2(n) { return String(n).padStart(2, "0"); }

export function isoFromDate(d) {
  return `${d.getFullYear()}-${_pad2(d.getMonth() + 1)}-${_pad2(d.getDate())}`;
}

export function dateFromISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDaysToISO(iso, n) {
  const d = dateFromISO(iso);
  d.setDate(d.getDate() + n);
  return isoFromDate(d);
}

export function getChicagoWeekdayIndex(isoDate) {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
  }).format(new Date(`${isoDate}T00:00:00`));
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[short] ?? 0;
}

export function getChicagoWeekdayLabel(isoDate) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
  }).format(new Date(`${isoDate}T00:00:00`));
}
