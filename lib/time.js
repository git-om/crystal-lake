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
