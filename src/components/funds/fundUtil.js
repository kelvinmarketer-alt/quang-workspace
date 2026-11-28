// Tách từ pages/Funds.jsx (28/11/2026) — chỉ di chuyển mã, logic giữ nguyên.


export const TONE_BG = { indigo: "bg-indigo-500", emerald: "bg-emerald-500", rose: "bg-rose-500", sky: "bg-sky-500", amber: "bg-amber-500", violet: "bg-violet-500", teal: "bg-teal-500", pink: "bg-pink-500" };
export const TONE_GRAD = { indigo: "from-indigo-500 to-violet-500", emerald: "from-emerald-500 to-teal-500", rose: "from-rose-500 to-pink-500", sky: "from-sky-500 to-cyan-500", amber: "from-amber-500 to-orange-500", violet: "from-violet-500 to-purple-500", teal: "from-teal-500 to-emerald-500", pink: "from-pink-500 to-rose-500" };
export const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";
export const num = (v) => Number(String(v ?? "").replace(/[^\d]/g, "")) || 0;
export const monthLabel = (iso) => { const [y, m] = (iso || "").split("-"); return m ? `T${Number(m)}/${y}` : ""; };
export const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const EVERY = [["week", "1 tuần"], ["2week", "2 tuần"], ["month", "1 tháng"]];
export const everyLabel = (v) => (EVERY.find(([k]) => k === v) || EVERY[1])[1];
// Kỳ thứ k của lịch (neo theo startDate, KHÔNG cộng dồn để tránh trôi ngày cuối tháng)
export function occAt(sc, k) {
  const base = new Date(sc.startDate + "T00:00:00");
  if (sc.every === "week") return new Date(base.getTime() + k * 7 * 86400000);
  if (sc.every === "2week") return new Date(base.getTime() + k * 14 * 86400000);
  const m = base.getMonth() + k; // 1 tháng: neo theo ngày gốc, kẹp về cuối tháng nếu tràn (giống bot)
  const y = base.getFullYear() + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
  const lastDay = new Date(y, mm + 1, 0).getDate();
  return new Date(y, mm, Math.min(base.getDate(), lastDay));
}
// Các kỳ ĐÃ ĐẾN HẠN (≤ hôm nay) mà chưa xử lý (sau lastDone). Trả mảng ISO tăng dần.
export function pendingOccs(sc, today) {
  if (sc.active === false || !sc.startDate) return [];
  const last = sc.lastDone || "";
  const out = [];
  for (let k = 0; k < 400; k++) {
    const iso = isoOf(occAt(sc, k));
    if (iso > today) break;
    if (iso > last) out.push(iso);
  }
  return out;
}
// Kỳ KẾ TIẾP (> hôm nay) để hiển thị "lần tới"
export function nextOcc(sc, today) {
  if (sc.active === false || !sc.startDate) return null;
  for (let k = 0; k < 400; k++) { const iso = isoOf(occAt(sc, k)); if (iso > today && iso > (sc.lastDone || "")) return iso; }
  return null;
}

export const plainVi = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
export const catTone = (cats, name) => (cats || []).find((c) => c.name === name)?.color || "slate";

/* ---- Bộ chọn danh mục chi (chips) + link sửa ---- */
