import { useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { Receipt, Layers, Tag, Tags, ArrowUp, ArrowDown, PiggyBank, Wallet, Sparkles, Plus, Check, X } from "lucide-react";
import { Card, SectionTitle, formatVND, formatShort } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { fundSpends } from "../lib/selectors.js";
import { fmtDateVI } from "../lib/format.js";
import { FUND_COLORS } from "../data/seed.js";

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const UNCAT = "Chưa phân loại";

const TONE_BG = { indigo: "bg-indigo-500", emerald: "bg-emerald-500", rose: "bg-rose-500", sky: "bg-sky-500", amber: "bg-amber-500", violet: "bg-violet-500", teal: "bg-teal-500", pink: "bg-pink-500", slate: "bg-slate-400" };
const HEX = { indigo: "#6366f1", emerald: "#10b981", rose: "#f43f5e", sky: "#0ea5e9", amber: "#f59e0b", violet: "#8b5cf6", teal: "#14b8a6", pink: "#ec4899", slate: "#94a3b8" };

const PRESETS = [["thisMonth", "Tháng này"], ["lastMonth", "Tháng trước"], ["thisQuarter", "Quý này"], ["thisYear", "Năm nay"], ["lastYear", "Năm trước"], ["custom", "Tùy chọn"]];

function periodFor(preset, cf, ct) {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  switch (preset) {
    case "thisMonth": return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
    case "lastMonth": return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case "thisQuarter": { const q = Math.floor(m / 3); return { from: iso(new Date(y, q * 3, 1)), to: iso(new Date(y, q * 3 + 3, 0)) }; }
    case "thisYear": return { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)) };
    case "lastYear": return { from: iso(new Date(y - 1, 0, 1)), to: iso(new Date(y - 1, 11, 31)) };
    case "custom": return { from: cf, to: ct };
    default: return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
  }
}
function prevPeriod(preset, from, to) {
  const f = new Date(from), t = new Date(to);
  if (preset === "thisMonth" || preset === "lastMonth") return { from: iso(new Date(f.getFullYear(), f.getMonth() - 1, 1)), to: iso(new Date(f.getFullYear(), f.getMonth(), 0)) };
  if (preset === "thisQuarter") return { from: iso(new Date(f.getFullYear(), f.getMonth() - 3, 1)), to: iso(new Date(f.getFullYear(), f.getMonth(), 0)) };
  if (preset === "thisYear" || preset === "lastYear") return { from: iso(new Date(f.getFullYear() - 1, 0, 1)), to: iso(new Date(f.getFullYear() - 1, 11, 31)) };
  const days = Math.round((t - f) / 86400000) + 1;
  const pt = new Date(f.getTime() - 86400000), pf = new Date(pt.getTime() - (days - 1) * 86400000);
  return { from: iso(pf), to: iso(pt) };
}
function periodLabel(preset, from, to) {
  const f = new Date(from);
  if (preset === "thisMonth" || preset === "lastMonth") return `Tháng ${f.getMonth() + 1}/${f.getFullYear()}`;
  if (preset === "thisQuarter") return `Quý ${Math.floor(f.getMonth() / 3) + 1}/${f.getFullYear()}`;
  if (preset === "thisYear" || preset === "lastYear") return `Năm ${f.getFullYear()}`;
  return `${fmtDateVI(from)} – ${fmtDateVI(to)}`;
}

// Chi tăng = xấu (đỏ), chi giảm = tốt (xanh)
function Delta({ cur, prev }) {
  if (!prev) return cur > 0 ? <span className="text-[11px] font-bold text-slate-400">mới</span> : null;
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  if (pct === 0) return <span className="text-[11px] font-bold text-slate-400">≈ kỳ trước</span>;
  const up = pct > 0;
  return <span className={`flex items-center gap-0.5 text-[11px] font-bold ${up ? "text-rose-600" : "text-emerald-600"}`}>{up ? <ArrowUp size={11} /> : <ArrowDown size={11} />}{Math.abs(pct)}%</span>;
}

function Kpi({ icon: Icon, label, value, prev, compare, sub, money = true, tone = "rose" }) {
  const TONES = { rose: "from-rose-500 to-pink-500 shadow-rose-500/30", indigo: "from-indigo-500 to-violet-500 shadow-indigo-500/30", amber: "from-amber-500 to-orange-500 shadow-amber-500/30", sky: "from-sky-500 to-cyan-500 shadow-sky-500/30" };
  return (
    <div className="card p-3.5 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:text-[12px]">{label}</div>
          <div className="mt-0.5 text-lg font-extrabold leading-tight tracking-tight text-slate-900 sm:mt-1 sm:text-2xl">
            {money ? <><span className="sm:hidden">{formatShort(value)}</span><span className="hidden break-words sm:inline">{formatVND(value)}</span></> : value}
          </div>
          {compare ? <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5"><Delta cur={value} prev={prev} /><span className="text-[11px] text-slate-400">kỳ trước {formatShort(prev)}</span></div>
            : sub ? <div className="mt-0.5 truncate text-[11px] font-medium text-slate-400">{sub}</div> : null}
        </div>
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-white shadow-lg sm:h-11 sm:w-11 ${TONES[tone]}`}><Icon size={16} className="sm:hidden" /><Icon size={20} className="hidden sm:block" /></div>
      </div>
    </div>
  );
}

// Gợi ý danh mục theo từ khoá trong nội dung (chỉ trả về danh mục ĐANG CÓ).
const GUESS = [
  [/viện|bệnh|thuốc|khám|nha khoa|bảo hiểm/i, "Sức Khoẻ"],
  [/trọ|tiền nhà|điện|nước|internet|wifi|đth|điện thoại|nạp|\bsim\b|cước|gửi xe|xăng|grab|taxi|vé xe|đổ xăng/i, "Hoá Đơn"],
  [/biếu|bố mẹ|ông bà|\bnội\b|\bngoại\b|sữa|bỉm|\bcon\b|học|trường|mầm non/i, "Gia Đình"],
  [/ăn|uống|chợ|\bcf\b|cà phê|cafe|nhậu|quán|cơm|phở|mua sắm|quần áo|giày|đồ dùng|\bmáy\b|\bsắm\b|du lịch|resort|\btour\b|khách sạn|vé máy bay/i, "Chi Tiêu"],
];
function guessCat(note, cats) {
  const n = (note || "").toLowerCase();
  for (const [re, name] of GUESS) {
    if (re.test(n) && (cats || []).some((c) => (c.name || "").toLowerCase() === name.toLowerCase())) return name;
  }
  return "";
}

/* ---- Modal gắn danh mục HÀNG LOẠT cho các khoản chi chưa phân loại ---- */
function CategorizeModal({ rows, funds, cats, onAddCat, onSave, onClose }) {
  const [assign, setAssign] = useState({}); // { [txId]: "Tên danh mục" }
  const [bulk, setBulk] = useState("");
  const [newCat, setNewCat] = useState("");
  const fundName = (id) => (funds || []).find((f) => f.id === id)?.name || "Quỹ";
  const fundColor = (id) => (funds || []).find((f) => f.id === id)?.color || "slate";
  const catColor = (name) => (cats || []).find((c) => c.name === name)?.color || "slate";
  const set = (id, v) => setAssign((p) => ({ ...p, [id]: v }));
  const autoGuess = () => setAssign((p) => { const n = { ...p }; for (const r of rows) if (!n[r.id]) { const g = guessCat(r.note, cats); if (g) n[r.id] = g; } return n; });
  const applyBlank = () => { if (!bulk) return; setAssign((p) => { const n = { ...p }; for (const r of rows) if (!n[r.id]) n[r.id] = bulk; return n; }); };
  const addCat = () => { const nm = newCat.trim(); if (nm && !(cats || []).some((c) => (c.name || "").toLowerCase() === nm.toLowerCase())) onAddCat({ name: nm, color: FUND_COLORS[(cats?.length || 0) % FUND_COLORS.length] }); setNewCat(""); };
  const done = Object.values(assign).filter(Boolean).length;
  const save = () => { const map = {}; for (const [id, v] of Object.entries(assign)) if (v) map[id] = v; if (Object.keys(map).length) onSave(map); onClose(); };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-5 pb-4">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-extrabold"><Tags size={18} className="text-indigo-500" /> Gắn danh mục hàng loạt</h3>
            <p className="mt-0.5 text-xs text-slate-400">{rows.length} khoản chưa phân loại · bấm <b>Gợi ý tự động</b> rồi chỉnh lại</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="space-y-2 border-b border-slate-100 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={autoGuess} className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-500 px-3 py-1.5 text-xs font-bold text-white shadow"><Sparkles size={13} /> Gợi ý tự động</button>
            <select value={bulk} onChange={(e) => setBulk(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
              <option value="">— chọn danh mục —</option>
              {(cats || []).map((c) => <option key={c.id || c.name} value={c.name}>{c.name}</option>)}
            </select>
            <button onClick={applyBlank} disabled={!bulk} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">Áp cho dòng trống</button>
          </div>
          <div className="flex items-center gap-1.5">
            <Plus size={13} className="shrink-0 text-slate-400" />
            <input value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCat(); }} placeholder="Thêm danh mục mới…" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
            <button onClick={addCat} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">Thêm</button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="rounded-xl border border-slate-100 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-700">{r.note || "(không ghi chú)"}</span>
                  <span className="shrink-0 text-sm font-extrabold text-rose-600">−{formatShort(r.amount)}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500"><span className={`h-2 w-2 rounded-full ${TONE_BG[fundColor(r.fundId)] || "bg-slate-400"}`} />{fundName(r.fundId)}</span>
                  <span className="text-[11px] text-slate-400">{fmtDateVI(r.date)}</span>
                  <span className="ml-auto flex items-center gap-1.5">
                    {assign[r.id] && <span className={`h-2.5 w-2.5 rounded-full ${TONE_BG[catColor(assign[r.id])] || "bg-slate-400"}`} />}
                    <select value={assign[r.id] || ""} onChange={(e) => set(r.id, e.target.value)} className={`rounded-lg border px-2 py-1 text-xs font-bold ${assign[r.id] ? "border-indigo-200 text-slate-700" : "border-slate-200 text-slate-400"}`}>
                      <option value="">— chưa gắn —</option>
                      {(cats || []).map((c) => <option key={c.id || c.name} value={c.name}>{c.name}</option>)}
                    </select>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 p-4">
          <span className="text-xs font-bold text-slate-500">{done}/{rows.length} đã gắn</span>
          <button onClick={save} disabled={!done} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 disabled:opacity-40"><Check size={16} /> Lưu{done > 0 ? ` ${done}` : ""}</button>
        </div>
      </div>
    </div>
  );
}

export default function FundStats() {
  const { fundTx, funds, spendCats, addSpendCat, categorizeFundTx } = useData();
  const now = new Date();
  const [preset, setPreset] = useState("thisMonth");
  const [cf, setCf] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [ct, setCt] = useState(iso(now));
  const [compare, setCompare] = useState(true);
  const [fundId, setFundId] = useState("all");

  const catColor = (name) => (spendCats || []).find((c) => c.name === name)?.color || "slate";
  const fundName = (id) => (funds || []).find((f) => f.id === id)?.name || "Quỹ";
  const fundColor = (id) => (funds || []).find((f) => f.id === id)?.color || "slate";

  const spends = useMemo(() => fundSpends(fundTx), [fundTx]); // tự cập nhật theo mọi giao dịch chi
  const spendFundIds = useMemo(() => [...new Set(spends.map((t) => t.fundId))], [spends]);
  const uncat = useMemo(() => spends.filter((t) => !t.cat).sort((a, b) => b.amount - a.amount), [spends]);
  const uncatTotal = uncat.reduce((a, t) => a + t.amount, 0);
  const [catOpen, setCatOpen] = useState(false);
  const { from, to } = periodFor(preset, cf, ct);
  const prev = prevPeriod(preset, from, to);
  const matchFund = (t) => fundId === "all" || t.fundId === fundId;

  const inPeriod = useMemo(() => spends.filter((t) => t.date >= from && t.date <= to && matchFund(t)), [spends, from, to, fundId]);
  const prevTotal = useMemo(() => spends.filter((t) => t.date >= prev.from && t.date <= prev.to && matchFund(t)).reduce((a, t) => a + t.amount, 0), [spends, prev.from, prev.to, fundId]);
  const total = inPeriod.reduce((a, t) => a + t.amount, 0);

  const byCat = useMemo(() => {
    const m = new Map();
    for (const t of inPeriod) { const k = t.cat || UNCAT; const o = m.get(k) || { cat: k, amount: 0, count: 0 }; o.amount += t.amount; o.count++; m.set(k, o); }
    return [...m.values()].sort((a, b) => b.amount - a.amount);
  }, [inPeriod]);

  const byFund = useMemo(() => {
    const m = new Map();
    for (const t of inPeriod) {
      const o = m.get(t.fundId) || { fundId: t.fundId, amount: 0, count: 0, cats: new Map() };
      o.amount += t.amount; o.count++;
      const ck = t.cat || UNCAT; o.cats.set(ck, (o.cats.get(ck) || 0) + t.amount);
      m.set(t.fundId, o);
    }
    return [...m.values()].map((o) => ({ ...o, cats: [...o.cats.entries()].map(([cat, amount]) => ({ cat, amount })).sort((a, b) => b.amount - a.amount) })).sort((a, b) => b.amount - a.amount);
  }, [inPeriod]);

  // Biểu đồ theo tháng của năm đang xem (stacked theo 5 danh mục lớn + Khác)
  const year = new Date(from).getFullYear();
  const trend = useMemo(() => {
    const yl = spends.filter((t) => Number(t.date.slice(0, 4)) === year && matchFund(t));
    const catTot = new Map();
    for (const t of yl) { const k = t.cat || UNCAT; catTot.set(k, (catTot.get(k) || 0) + t.amount); }
    const top = [...catTot.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
    const overflow = catTot.size > top.length;
    const months = Array.from({ length: 12 }, (_, i) => ({ name: "T" + (i + 1) }));
    for (const t of yl) {
      const mi = Number(t.date.slice(5, 7)) - 1;
      const k = top.includes(t.cat || UNCAT) ? (t.cat || UNCAT) : "Khác";
      months[mi][k] = (months[mi][k] || 0) + t.amount;
    }
    const keys = [...new Set(overflow ? [...top, "Khác"] : top)];
    return { months, keys, has: yl.length > 0 };
  }, [spends, year, fundId]);

  const catChips = (cats) => (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {cats.map((c) => (
        <span key={c.cat} className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
          <span className={`h-2 w-2 rounded-full ${TONE_BG[catColor(c.cat)] || "bg-slate-400"}`} /> {c.cat} <b className="text-slate-800">{formatShort(c.amount)}</b>
        </span>
      ))}
    </div>
  );

  const noneEver = spends.length === 0;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Bộ lọc kỳ */}
      <Card>
        <div className="flex flex-wrap items-center gap-1.5">
          {PRESETS.map(([v, l]) => (
            <button key={v} onClick={() => setPreset(v)} className={`rounded-xl px-3 py-1.5 text-sm font-bold transition ${preset === v ? "bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{l}</button>
          ))}
          <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-slate-500"><input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="accent-indigo-500" /> So kỳ trước</label>
        </div>
        {preset === "custom" && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <input type="date" value={cf} onChange={(e) => setCf(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2" />
            <span className="text-slate-400">→</span>
            <input type="date" value={ct} onChange={(e) => setCt(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2" />
          </div>
        )}
        <div className="mt-2 text-xs text-slate-400">Kỳ: <b className="text-slate-600">{periodLabel(preset, from, to)}</b> · số liệu tự cập nhật theo mọi khoản chi từ quỹ</div>
        {spendFundIds.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
            <button onClick={() => setFundId("all")} className={`rounded-lg px-2.5 py-1 text-xs font-bold ${fundId === "all" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>Tất cả quỹ</button>
            {(funds || []).filter((f) => spendFundIds.includes(f.id)).map((f) => (
              <button key={f.id} onClick={() => setFundId(f.id)} className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold ${fundId === f.id ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                <span className={`h-2 w-2 rounded-full ${TONE_BG[f.color] || "bg-slate-400"}`} /> {f.name}
              </button>
            ))}
          </div>
        )}
      </Card>

      {uncat.length > 0 && (
        <button onClick={() => setCatOpen(true)} className="flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-3.5 text-left transition hover:from-amber-100">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-400 text-white"><Tags size={18} /></span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-extrabold text-amber-800">{uncat.length} khoản chưa phân loại · {formatShort(uncatTotal)}</div>
            <div className="text-[11px] font-medium text-amber-600">Gắn danh mục hàng loạt (có gợi ý tự động) để báo cáo biết tiền đi đâu</div>
          </div>
          <span className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white">Gắn danh mục</span>
        </button>
      )}

      {noneEver ? (
        <Card><div className="py-12 text-center"><Wallet size={30} className="mx-auto text-slate-300" /><div className="mt-2 text-sm font-bold text-slate-600">Chưa có khoản chi nào từ quỹ</div><div className="mt-1 text-xs text-slate-400">Bấm "Chi" ở một quỹ (hoặc ghi chi từ ảnh) để bắt đầu thống kê.</div></div></Card>
      ) : (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Kpi icon={Receipt} label="Tổng chi kỳ này" value={total} prev={prevTotal} compare={compare} tone="rose" />
            <Kpi icon={Layers} label="Số giao dịch" value={inPeriod.length} money={false} sub={`${byCat.length} danh mục · ${byFund.length} quỹ`} tone="indigo" />
            <Kpi icon={Tag} label="Chi nhiều nhất" value={byCat[0]?.amount || 0} sub={byCat[0]?.cat || "—"} tone="amber" />
          </div>

          {total === 0 ? (
            <Card><div className="py-10 text-center text-sm text-slate-400">Kỳ <b className="text-slate-600">{periodLabel(preset, from, to)}</b> chưa có khoản chi nào{fundId !== "all" ? ` ở quỹ ${fundName(fundId)}` : ""}.</div></Card>
          ) : (
            <>
              {/* Chi theo danh mục */}
              <Card>
                <SectionTitle action={<span className="text-xs font-bold text-slate-400">{periodLabel(preset, from, to)}</span>}>Chi theo danh mục</SectionTitle>
                <div className="space-y-2.5">
                  {byCat.map((c) => {
                    const pct = total ? Math.round((c.amount / total) * 100) : 0;
                    return (
                      <div key={c.cat}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 font-semibold text-slate-700"><span className={`h-2.5 w-2.5 rounded-full ${TONE_BG[catColor(c.cat)] || "bg-slate-400"}`} />{c.cat} <span className="text-[11px] font-medium text-slate-400">· {c.count} lần</span></span>
                          <span className="font-bold text-slate-800">{formatShort(c.amount)} <span className="font-medium text-slate-400">· {pct}%</span></span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${TONE_BG[catColor(c.cat)] || "bg-slate-400"}`} style={{ width: pct + "%" }} /></div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Chi theo quỹ (+ danh mục từng quỹ) */}
              {fundId === "all" && byFund.length > 0 && (
                <Card>
                  <SectionTitle action={<span className="text-xs font-bold text-slate-400">{byFund.length} quỹ</span>}>Chi theo quỹ</SectionTitle>
                  <div className="space-y-2.5">
                    {byFund.map((f) => {
                      const pct = total ? Math.round((f.amount / total) * 100) : 0;
                      return (
                        <div key={f.fundId} className="rounded-xl border border-slate-100 p-3">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-2 text-sm font-extrabold text-slate-800"><span className={`h-3 w-3 rounded-full ${TONE_BG[fundColor(f.fundId)] || "bg-slate-400"}`} />{fundName(f.fundId)} <span className="text-[11px] font-medium text-slate-400">· {f.count} lần · {pct}%</span></span>
                            <span className="text-sm font-extrabold text-rose-600">−{formatShort(f.amount)}</span>
                          </div>
                          {catChips(f.cats)}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {/* Biểu đồ theo tháng */}
              {trend.has && (
                <Card>
                  <SectionTitle action={<span className="text-xs font-bold text-slate-400">stacked theo danh mục</span>}>Chi theo tháng · {year}</SectionTitle>
                  <div className="overflow-x-auto">
                    <div className="h-64 min-w-[600px] sm:min-w-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={trend.months} margin={{ left: -8, right: 8, top: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#eef0f6" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                          <YAxis tickFormatter={formatShort} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={44} />
                          <Tooltip formatter={(v, k) => [formatVND(v), k]} contentStyle={{ borderRadius: 12, border: "1px solid #eef0f6", fontSize: 12 }} cursor={{ fill: "#f8fafc" }} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          {trend.keys.map((k) => <Bar key={k} dataKey={k} stackId="s" fill={HEX[catColor(k)] || HEX.slate} maxBarSize={26} isAnimationActive={false} radius={[0, 0, 0, 0]} />)}
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </Card>
              )}
            </>
          )}
        </>
      )}

      {catOpen && <CategorizeModal rows={uncat} funds={funds} cats={spendCats} onAddCat={addSpendCat} onSave={categorizeFundTx} onClose={() => setCatOpen(false)} />}
    </div>
  );
}
