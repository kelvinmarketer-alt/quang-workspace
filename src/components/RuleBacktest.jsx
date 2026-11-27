// Backtest theo luật tự động (27/11): chọn điều kiện vào lệnh + cắt lỗ / chốt lời, chọn nhiều mã + khung + số nến lịch sử
// → app tải nến, chạy luật (lib/ruleBacktest.js), hiện kết quả: tổng R, tỉ lệ thắng, sụt vốn, theo mã, theo tháng, đường vốn,
// danh sách lệnh + biểu đồ có đánh dấu lệnh. Chỉ để tham khảo: quá khứ không bảo đảm tương lai, chưa tính trượt giá.
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Loader2, Plus, X, AlertTriangle, Check } from "lucide-react";
import { CandleChart, precisionOf, px } from "./CoinCharts.jsx";
import { TF, fetchKlines, ema } from "../lib/ta.js";
import { CONDS, DEF_RULES, runBacktest, aggregate } from "../lib/ruleBacktest.js";
import { fmtNum } from "../lib/format.js";
import { fxDigits } from "../lib/mt5Source.js";

const ls = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* bỏ qua */ } } };
const sR = (v, d = 1) => (v == null || !isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${fmtNum(v, d, d)}R`);
const day = (t) => { const d = new Date((t + 7 * 3600) * 1000), p = (x) => String(x).padStart(2, "0"); return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear()).slice(2)} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`; };
const NONE = [];
// Ô số kiểu Việt (dấu phẩy thập phân): giữ chuỗi đang gõ ("1," vẫn gõ tiếp được), chỉ báo ra số khi hợp lệ
const toTxt = (v) => String(v ?? "").replace(".", ",");
const toNum = (t) => { const n = Number(String(t).trim().replace(",", ".")); return String(t).trim() !== "" && isFinite(n) ? n : null; };
function NumIn({ value, onChange, int, className }) {
  const [t, setT] = useState(() => toTxt(value));
  useEffect(() => { if (toNum(t) !== value) setT(toTxt(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <input inputMode={int ? "numeric" : "decimal"} value={t} onChange={(e) => { const v = e.target.value; setT(v); const n = toNum(v); if (n != null && n >= 0) onChange(n); }} onBlur={() => setT(toTxt(value))} className={className} />;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PRESETS = [
  ["Phá vỡ + xu hướng + khối lượng", { dir: "both", conds: [{ k: "breakout", p: { n: 20 } }, { k: "price_ema", p: { n: 200 } }, { k: "vol", p: { n: 20, k: 1.5 } }], slType: "atr", slAtr: 2, tpR: 2, exitOpp: false, maxBars: 0 }],
  ["EMA 20 cắt EMA 50", { dir: "both", conds: [{ k: "ema_cross", p: { fast: 20, slow: 50 } }], slType: "atr", slAtr: 2, tpR: 0, exitOpp: true, maxBars: 0 }],
  ["RSI quá bán / quá mua + EMA200", { dir: "both", conds: [{ k: "rsi", p: { n: 14, lo: 30, hi: 70 } }, { k: "price_ema", p: { n: 200 } }], slType: "atr", slAtr: 1.5, tpR: 2, exitOpp: false, maxBars: 30 }],
  ["MACD cắt + EMA200", { dir: "both", conds: [{ k: "macd", p: {} }, { k: "price_ema", p: { n: 200 } }], slType: "atr", slAtr: 2, tpR: 2, exitOpp: false, maxBars: 0 }],
];
const PNAME = { fast: "EMA nhanh", slow: "EMA chậm", n: "Số nến", lo: "Mức dưới", hi: "Mức trên", k: "Bội số" };

// Tải N nến gần nhất (Binance trả tối đa 1000 nến/lần → lùi dần theo endTime). Forex: tối đa ~400 nến của cầu nối MT5
async function history(sym, tf, n, market) {
  if (market === "mt5") return fetchKlines(sym, TF[tf].api, Math.min(n, 400), { market });
  let out = [], end = null;
  while (out.length < n) {
    const k = await fetchKlines(sym, TF[tf].api, Math.min(1000, n - out.length), { market, ...(end ? { endTime: end } : {}) });
    if (!k.length) break;
    out = [...k.filter((x) => !out.length || x.time < out[0].time), ...out];
    end = k[0].time * 1000 - 1;
    if (k.length < 50) break;
    await sleep(120); // nhẹ nhàng với Binance
  }
  return out;
}

export default function RuleBacktest({ sym, tf: tf0, market, fx, watch = NONE, tags, onEma, full }) {
  const key = fx ? "qws_rulebt_fx" : "qws_rulebt";
  const saved = ls.get(key, {});
  const [rules, setRules0] = useState(() => ({ ...DEF_RULES, ...(saved.rules || {}) }));
  const [syms, setSyms] = useState(() => (Array.isArray(saved.syms) && saved.syms.length ? saved.syms : [sym]));
  const [tf, setTf] = useState(() => (TF[saved.tf] ? saved.tf : tf0));
  const [bars, setBars] = useState(() => saved.bars || (fx ? 400 : 2000));
  const [risk, setRisk] = useState(() => saved.risk || 1);
  const [busy, setBusy] = useState(""), [err, setErr] = useState("");
  const [res, setRes] = useState(null); // { ag, data: {sym: candles}, by: {sym: trades}, open, rules, tf, at }
  const [view, setView] = useState(null);
  const stop = useRef(false);
  const setRules = (p) => setRules0((r) => ({ ...r, ...p }));
  const persist = () => ls.set(key, { rules, syms, tf, bars, risk });

  const run = async () => {
    if (!rules.conds.length) { setErr("Thêm ít nhất 1 điều kiện vào lệnh"); return; }
    if (!syms.length) { setErr("Chọn ít nhất 1 mã"); return; }
    setErr(""); persist(); stop.current = false;
    const data = {}, by = {}, open = {}, fails = [];
    for (let i = 0; i < syms.length; i++) {
      if (stop.current) break;
      const s = syms[i];
      setBusy(`Đang tải + chạy ${s} (${i + 1}/${syms.length})…`);
      try {
        const n = Number(bars) || 1000;
        let c = await history(s, tf, n, market).catch((e) => { if (!fx && market === "futures") return []; throw e; });
        if (!fx && !c.length && market === "futures") c = await history(s, tf, n, "spot"); // mã không có hợp đồng tương lai → lấy giao ngay
        if (c.length < 250) { fails.push(`${s}: chỉ có ${c.length} nến`); if (c.length < 60) continue; }
        const r = runBacktest(c, rules);
        data[s] = c; by[s] = r.trades; if (r.open) open[s] = r.open;
      } catch (e) { fails.push(`${s}: ${e.message || e}`); }
    }
    setBusy("");
    if (!Object.keys(by).length) { setErr(fails.join(" · ") || "Không tải được nến"); return; }
    const ag = aggregate(by, { balance0: 1000, riskPct: Number(risk) || 1 });
    const from = Math.min(...Object.values(data).map((c) => c[0].time)), to = Math.max(...Object.values(data).map((c) => c[c.length - 1].time));
    setRes({ ag, data, by, open, rules, tf, at: Date.now(), fails, from, to });
    setView(Object.keys(by)[0]);
  };

  const cond = (i, patch) => setRules({ conds: rules.conds.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const btn = "flex items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-bold disabled:opacity-40";
  const inp = "w-full min-w-0 rounded-md border border-slate-200 bg-white px-1.5 py-1 font-mono text-[12px] outline-none focus:border-indigo-300";
  const lab = "text-[10.5px] font-bold text-slate-500";
  const allSyms = useMemo(() => [...new Set([sym, ...watch])], [sym, watch]);

  return (
    <div className="mt-2 space-y-2">
      {/* Luật */}
      <div className="rounded-xl border border-slate-200 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] font-extrabold text-slate-800">Luật vào lệnh</span>
          <span className="text-[11px] text-slate-400">tất cả điều kiện phải đúng ở nến đã đóng → vào giá mở nến sau</span>
          <div className="ml-auto flex flex-wrap gap-1">{PRESETS.map(([n, p]) => <button key={n} onClick={() => setRules0((r) => ({ ...r, ...p }))} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700">{n}</button>)}</div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
          <span className={lab}>Hướng</span>
          <div className="flex rounded-lg bg-slate-100 p-0.5">{[["buy", "Chỉ Mua"], ["sell", "Chỉ Bán"], ["both", "Cả hai"]].map(([k, l]) => <button key={k} onClick={() => setRules({ dir: k })} className={`rounded-md px-2 py-1 text-[11.5px] font-bold ${rules.dir === k ? "bg-white text-indigo-600 shadow" : "text-slate-500"}`}>{l}</button>)}</div>
        </div>
        <ul className="mt-2 space-y-1.5">
          {rules.conds.map((c, i) => (
            <li key={i} className="relative flex flex-wrap items-end gap-1.5 rounded-lg bg-slate-50 p-1.5 pr-8">
              <label className={`${lab} min-w-[200px] flex-1`}>Điều kiện {i + 1}
                <select value={c.k} onChange={(e) => cond(i, { k: e.target.value, p: { ...CONDS[e.target.value].params } })} className={`${inp} font-sans`}>
                  {Object.entries(CONDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </label>
              {Object.keys(CONDS[c.k].params).map((pk) => (
                <label key={pk} className={`${lab} w-20`}>{PNAME[pk] || pk}<NumIn value={c.p[pk]} onChange={(v) => cond(i, { p: { ...c.p, [pk]: v } })} className={inp} /></label>
              ))}
              <span className="w-full pb-0.5 text-[11px] text-slate-500 lg:w-auto lg:pb-1">Mua: {CONDS[c.k].buy(c.p)} · Bán: {CONDS[c.k].sell(c.p)}</span>
              <button onClick={() => setRules({ conds: rules.conds.filter((_, j) => j !== i) })} aria-label="Bỏ điều kiện" className="absolute right-1 top-1 rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><X size={14} /></button>
            </li>
          ))}
        </ul>
        {rules.conds.length < 6 && <button onClick={() => setRules({ conds: [...rules.conds, { k: "price_ema", p: { n: 200 } }] })} className={`${btn} mt-1.5 border border-dashed border-slate-300 text-slate-600`}><Plus size={13} /> Thêm điều kiện</button>}

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <label className={lab}>Cắt lỗ theo
            <select value={rules.slType} onChange={(e) => setRules({ slType: e.target.value })} className={`${inp} font-sans`}><option value="atr">Bội số ATR14</option><option value="pct">% giá vào</option></select>
          </label>
          {rules.slType === "atr"
            ? <label className={lab}>× ATR<NumIn value={rules.slAtr} onChange={(v) => setRules({ slAtr: v })} className={inp} /></label>
            : <label className={lab}>% cắt lỗ<NumIn value={rules.slPct} onChange={(v) => setRules({ slPct: v })} className={inp} /></label>}
          <label className={lab}>Chốt lời (R, 0 = không)<NumIn value={rules.tpR} onChange={(v) => setRules({ tpR: v })} className={inp} /></label>
          <label className={lab}>Giữ tối đa (nến, 0 = không)<NumIn int value={rules.maxBars} onChange={(v) => setRules({ maxBars: Math.max(0, Math.round(v)) })} className={inp} /></label>
          <label className={lab}>Phí mỗi chiều (%)<NumIn value={rules.feePct} onChange={(v) => setRules({ feePct: v })} className={inp} /></label>
          <label className="flex items-end gap-1.5 pb-1 text-[11.5px] font-bold text-slate-600"><input type="checkbox" checked={rules.exitOpp} onChange={(e) => setRules({ exitOpp: e.target.checked })} /> Thoát khi có tín hiệu ngược</label>
        </div>
      </div>

      {/* Dữ liệu */}
      <div className="rounded-xl border border-slate-200 p-3">
        <div className="text-[13px] font-extrabold text-slate-800">Chạy trên</div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {allSyms.map((s) => { const on = syms.includes(s); return (
            <button key={s} onClick={() => setSyms((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s].slice(0, 20)))} aria-pressed={on}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-bold ${on ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-indigo-50"}`}>{on && <Check size={11} />}{s}</button>
          ); })}
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div><div className={lab}>Khung</div><div className="flex rounded-lg bg-slate-100 p-0.5">{Object.keys(TF).map((k) => <button key={k} onClick={() => setTf(k)} className={`rounded-md px-2 py-1 text-[11.5px] font-extrabold ${tf === k ? "bg-white text-amber-600 shadow" : "text-slate-500"}`}>{TF[k].label}</button>)}</div></div>
          <label className={`${lab} w-28`}>Số nến lịch sử
            <select value={bars} onChange={(e) => setBars(Number(e.target.value))} className={`${inp} font-sans`}>{(fx ? [400] : [500, 1000, 2000, 3000, 5000]).map((n) => <option key={n} value={n}>{n.toLocaleString("vi-VN")}</option>)}</select>
          </label>
          <label className={`${lab} w-24`}>Rủi ro/lệnh (%)<NumIn value={Number(risk) || 0} onChange={setRisk} className={inp} /></label>
          <button onClick={run} disabled={!!busy} className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700`}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Chạy backtest</button>
          {busy && <><span className="text-[11.5px] font-semibold text-slate-500">{busy}</span><button onClick={() => { stop.current = true; }} className="text-[11.5px] font-bold text-rose-600">Dừng</button></>}
        </div>
        <div className="mt-1.5 text-[10.5px] text-slate-400">{syms.length} mã · {TF[tf].label} · {Number(bars).toLocaleString("vi-VN")} nến ≈ {Math.round((Number(bars) * TF[tf].ms) / 86400000).toLocaleString("vi-VN")} ngày (mã mới lên sàn có ít hơn){fx ? " · Forex chỉ có ~400 nến gần nhất từ cầu nối MT5" : ""} · vốn giả định 1.000$, rủi ro cố định mỗi lệnh (không lãi kép)</div>
        {err && <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[12px] font-semibold text-rose-600"><AlertTriangle size={13} /> {err}</div>}
      </div>

      {res && <Result res={res} view={view} setView={setView} fx={fx} tags={tags} onEma={onEma} full={full} />}
    </div>
  );
}

function Result({ res, view, setView, fx, tags, onEma }) {
  const { ag } = res;
  const months = Object.entries(ag.month).sort((a, b) => a[0].localeCompare(b[0]));
  const mMax = Math.max(1, ...months.map(([, m]) => Math.abs(m.r)));
  const c = res.data[view] || NONE, ts = res.by[view] || NONE;
  const e = useMemo(() => { const cl = c.map((x) => x.close); const m = (p) => ema(cl, p).map((v, i) => (v == null ? null : { time: c[i].time, value: v })).filter(Boolean); return [m(20), m(50)]; }, [c]);
  const marks = useMemo(() => ts.flatMap((t) => [
    { time: t.entryTime, position: t.side === 1 ? "belowBar" : "aboveBar", color: t.side === 1 ? "#10b981" : "#f43f5e", shape: t.side === 1 ? "arrowUp" : "arrowDown", text: "" },
    { time: t.exitTime, position: t.side === 1 ? "aboveBar" : "belowBar", color: t.r > 0 ? "#059669" : "#e11d48", shape: "circle", text: sR(t.r, 1) },
  ]), [ts]);
  const prec = fx ? fxDigits(view) ?? precisionOf(c[c.length - 1]?.close) : precisionOf(c[c.length - 1]?.close);
  const kpi = [["Số lệnh", ag.n], ["Tỉ lệ thắng", `${fmtNum(ag.winRate, 0)}%`], ["Tổng R", sR(ag.sumR)], ["TB / lệnh", sR(ag.avgR, 2)], ["Hệ số LN", ag.n ? (isFinite(ag.pf) ? fmtNum(ag.pf, 2, 2) : "∞") : "—"], ["Sụt vốn lớn nhất", `${fmtNum(ag.maxDD, 1, 1)}%`], ["Lãi/lỗ (vốn 1.000$)", `${ag.pnlPct >= 0 ? "+" : ""}${fmtNum(ag.pnlPct, 1, 1)}%`], ["Tháng có lãi", `${ag.posMonths}/${ag.months}`]];
  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-slate-200 p-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[13px] font-extrabold text-slate-800">Kết quả</span>
          <span className="text-[11px] text-slate-400">{Object.keys(res.by).length} mã · {TF[res.tf].label} · dữ liệu {day(res.from).slice(0, 8)} → {day(res.to).slice(0, 8)} · chạy lúc {new Date(res.at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {kpi.map(([l, v]) => <div key={l} className="rounded-lg bg-slate-50 px-2 py-1.5"><div className="text-[10px] font-bold uppercase text-slate-400">{l}</div><div className="font-mono text-[14px] font-extrabold tabular-nums text-slate-800">{v}</div></div>)}
        </div>
        {ag.curve.length > 1 && <Equity curve={ag.curve} />}
        {res.fails?.length > 0 && <div className="mt-1.5 text-[11px] text-amber-700">Lưu ý: {res.fails.join(" · ")}</div>}
        <div className="mt-1.5 text-[10.5px] text-slate-400">Chỉ để tham khảo: kết quả quá khứ không bảo đảm tương lai; chưa tính trượt giá và phí giữ lệnh qua đêm (funding / swap).</div>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-slate-200 p-3">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Theo mã · bấm để xem lệnh trên biểu đồ</div>
          <div className="mt-1 overflow-x-auto"><table className="w-full min-w-[280px] text-[12px] tabular-nums">
            <thead><tr className="text-left text-slate-400">{["Mã", "Lệnh", "Thắng", "Tổng R", "TB"].map((h) => <th key={h} className="py-1 pr-2 font-bold">{h}</th>)}</tr></thead>
            <tbody>{Object.entries(ag.sym).sort((a, b) => b[1].sumR - a[1].sumR).map(([s, v]) => (
              <tr key={s} onClick={() => setView(s)} className={`cursor-pointer border-t border-slate-100 ${view === s ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
                <td className="py-1 pr-2 font-bold text-slate-700">{s}{res.open[s] ? <span className="ml-1 text-[10px] font-semibold text-violet-600">đang mở</span> : null}</td><td className="pr-2">{v.n}</td><td className="pr-2">{fmtNum(v.winRate, 0)}%</td>
                <td className={`pr-2 font-bold ${v.sumR >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{sR(v.sumR)}</td><td className={v.avgR >= 0 ? "text-emerald-600" : "text-rose-600"}>{sR(v.avgR, 2)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
        <div className="min-w-0 rounded-xl border border-slate-200 p-3">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Theo tháng (tổng R)</div>
          <ul className="mt-1.5 max-h-64 space-y-0.5 overflow-y-auto text-[11.5px] tabular-nums">
            {months.map(([k, m]) => (
              <li key={k} className="grid grid-cols-[56px_1fr_70px] items-center gap-2">
                <span className="text-slate-500">{k.slice(5)}/{k.slice(2, 4)}</span>
                <div className="relative h-3 rounded bg-slate-100"><div className={`absolute top-0 h-3 rounded ${m.r >= 0 ? "left-1/2 bg-emerald-500" : "right-1/2 bg-rose-500"}`} style={{ width: `${(Math.abs(m.r) / mMax) * 50}%` }} /></div>
                <span className={`text-right font-bold ${m.r >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{sR(m.r)} <span className="font-normal text-slate-400">· {m.n}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {view && c.length > 0 && (
        <div className="rounded-xl border border-slate-200 p-2">
          <div className="px-1 text-[12px] font-extrabold text-slate-700">{view} · {ts.length} lệnh <span className="font-normal text-slate-400">— ▲▼ điểm vào, ● điểm thoát kèm R</span></div>
          <CandleChart onEma={onEma} candles={c} e20={e[0]} e50={e[1]} events={NONE} marks={marks} lines={NONE} precision={prec} fitKey={`bt-${view}-${res.at}`} tags={tags} className="h-[340px] w-full sm:h-[420px]" />
          <div className="mt-1 max-h-56 overflow-auto"><table className="w-full min-w-[560px] text-[11.5px] tabular-nums">
            <thead><tr className="text-left text-slate-400">{["Vào lúc", "Hướng", "Giá vào", "Giá thoát", "Lý do", "Nến", "R"].map((h) => <th key={h} className="py-1 pr-2 font-bold">{h}</th>)}</tr></thead>
            <tbody>{[...ts].reverse().slice(0, 200).map((t, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="py-0.5 pr-2 text-slate-500">{day(t.entryTime)}</td><td className={`pr-2 font-bold ${t.side === 1 ? "text-emerald-700" : "text-rose-700"}`}>{t.side === 1 ? "Mua" : "Bán"}</td>
                <td className="pr-2">{px(t.entry)}</td><td className="pr-2">{px(t.exit)}</td><td className="pr-2 text-slate-500">{t.reason}</td><td className="pr-2">{t.bars}</td>
                <td className={`font-bold ${t.r > 0 ? "text-emerald-600" : "text-rose-600"}`}>{sR(t.r, 2)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}

// Đường vốn theo thời gian (SVG), có mốc ngày đầu / cuối và giá trị cao / thấp
function Equity({ curve }) {
  const W = 600, H = 120, vs = curve.map((p) => p.v), lo = Math.min(...vs), hi = Math.max(...vs), k = hi - lo || 1;
  const t0 = curve[0].t, t1 = curve[curve.length - 1].t, kt = t1 - t0 || 1;
  const P = curve.map((p) => [((p.t - t0) / kt) * W, H - 6 - ((p.v - lo) / k) * (H - 12)]);
  const y0 = H - 6 - ((curve[0].v - lo) / k) * (H - 12), up = vs[vs.length - 1] >= vs[0];
  const d = (t) => { const x = new Date((t + 7 * 3600) * 1000); return `${String(x.getUTCMonth() + 1).padStart(2, "0")}/${x.getUTCFullYear()}`; };
  return (
    <div className="mt-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full" preserveAspectRatio="none" aria-label="Đường vốn">
        <line x1="0" x2={W} y1={y0} y2={y0} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <polygon points={`0,${y0} ${P.map((p) => p.join(",")).join(" ")} ${W},${y0}`} fill={up ? "#10b981" : "#f43f5e"} opacity="0.12" />
        <polyline points={P.map((p) => p.join(",")).join(" ")} fill="none" stroke={up ? "#10b981" : "#f43f5e"} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex flex-wrap justify-between gap-x-3 text-[10.5px] tabular-nums text-slate-400"><span className="whitespace-nowrap">{d(t0)} · {fmtNum(curve[0].v, 0)}$</span><span className="order-last w-full whitespace-nowrap text-center sm:order-none sm:w-auto">cao nhất {fmtNum(hi, 0)}$ · thấp nhất {fmtNum(lo, 0)}$</span><span className="whitespace-nowrap">{d(t1)} · {fmtNum(vs[vs.length - 1], 0)}$</span></div>
    </div>
  );
}
