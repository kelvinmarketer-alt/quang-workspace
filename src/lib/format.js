// Parse "21.762.249 đ" -> 21762249 ; format number -> "21.762.249 đ"
export function parseVND(str) {
  if (typeof str === "number") return str;
  if (!str) return 0;
  const cleaned = String(str).replace(/[^\d-]/g, "");
  if (!cleaned || cleaned === "-") return 0;
  return parseInt(cleaned, 10) || 0;
}

export function formatVND(n) {
  const v = Math.round(Number(n) || 0);
  return v.toLocaleString("vi-VN") + " đ";
}

export function formatShort(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + " tỷ";
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + " tr";
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(0) + "k";
  return String(v);
}

export const MONTHS_VI = [
  "Th 1", "Th 2", "Th 3", "Th 4", "Th 5", "Th 6",
  "Th 7", "Th 8", "Th 9", "Th 10", "Th 11", "Th 12",
];

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fmtDateVI(d) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`;
}

// Parse "9/1", "15/04", "13/1" -> Date trong năm cho trước
export function parsePayDate(str, year) {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const mon = parseInt(m[2], 10);
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
  return new Date(year, mon - 1, day);
}
