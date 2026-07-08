import { useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { Receipt, Layers, Tag, ArrowUp, ArrowDown, PiggyBank, Wallet } from "lucide-react";
import { Card, SectionTitle, formatVND, formatShort } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { fundSpends } from "../lib/selectors.js";
import { fmtDateVI } from "../lib/format.js";

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

export default function FundStats() {
  const { fundTx, funds, spendCats } = useData();
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
    </div>
  );
}
