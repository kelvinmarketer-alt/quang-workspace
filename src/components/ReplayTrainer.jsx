// Tua lại nến + tự trade (27/11): chọn ngày bắt đầu (hoặc ngẫu nhiên), biểu đồ ẩn phần tương lai, bấm "Nến tiếp" / tự chạy;
// đặt lệnh Mua/Bán (thị trường hoặc chờ) kèm cắt lỗ / chốt lời → app tự khớp, tính R, lãi lỗ, tỉ lệ thắng, sụt vốn; lưu phiên lên cloud.
// Coin: nến Binance (tải thêm tự động khi gần hết). Forex: chỉ ~400 nến gần nhất mà cầu nối MT5 gửi lên.
// Lõi tính toán ở lib/replay.js (có kiểm thử). Vẽ được trong lúc tua (dùng chung hình vẽ của mã).
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, StepForward, FastForward, X, Shuffle, Save, Loader2, AlertTriangle, RotateCcw, Crosshair, Trash2 } from "lucide-react";
import { CandleChart, precisionOf, px } from "./CoinCharts.jsx";
import { TF, fetchKlines, ema, atr } from "../lib/ta.js";
import * as R from "../lib/replay.js";
import { fmtNum } from "../lib/format.js";
import { fxDigits } from "../lib/mt5Source.js";

const ls = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* đầy bộ nhớ → bỏ qua */ } } };
const CTX = 150; // số nến hiện sẵn trước điểm bắt đầu (để có bối cảnh + EMA)
const SPEEDS = [[1000, "1×"], [500, "2×"], [250, "4×"], [100, "10×"]];
const sR = (v, d = 2) => (v == null || !isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${fmtNum(v, d, 1)}R`);
const usd = (v) => `${v >= 0 ? "+" : "−"}${fmtNum(Math.abs(v), 2, 2)}$`;
const day = (t) => { const d = new Date((t + 7 * 3600) * 1000), p = (x) => String(x).padStart(2, "0"); return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`; };
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const NONE = [];
const LIVE = {}; // phiên đang tua theo chế độ (coin/forex) — giữ khi khung biểu đồ được dựng lại (vào/thoát toàn màn hình, đóng/mở lại chế độ tua)

export default function ReplayTrainer({ sym, tf, market, fx, draw, tags, onEma, onExit, onSave, saved = NONE, full }) {
  const key = fx ? "qws_replay_fx" : "qws_replay";
  const tfMs = TF[tf].ms;
  const [s, setS0] = useState(() => { const x = LIVE[key]; return x && x.sym === sym && x.tf === tf ? x : null; }); // phiên đang chạy
  const setS = (v) => setS0((old) => { const n = typeof v === "function" ? v(old) : v; LIVE[key] = n; return n; });
  const [form, setForm] = useState(() => ({ date: isoDay(Date.now() - 200 * tfMs), balance: 1000, riskPct: 1, ...ls.get(`${key}_form`, {}) }));
  const [busy, setBusy] = useState(""), [err, setErr] = useState(""), [msg, setMsg] = useState("");
  const [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(500);
  const [tk, setTk] = useState({ side: 1, kind: "market", entry: "", sl: "", tp: "" });
  const sRef = useRef(s); sRef.current = s;
  const [resume, setResume] = useState(() => { const r = ls.get(`${key}_cur`, null); return r && r.sym === sym && r.tf === tf && r.all?.length ? r : null; });

  // Lưu phiên dở trên máy (đổi tab / tải lại trang vẫn tiếp tục được)
  useEffect(() => { if (s) { const t = setTimeout(() => ls.set(`${key}_cur`, s), 400); return () => clearTimeout(t); } return undefined; }, [s, key]);

  const start = async (random) => {
    setErr(""); setMsg(""); setBusy("Đang tải nến…");
    try {
      let all, idx;
      if (fx) {
        all = await fetchKlines(sym, TF[tf].api, 400, { market: "mt5" });
        if (all.length < 80) throw new Error(`MT5 mới có ${all.length} nến ${sym} ${TF[tf].label} — chưa đủ để tua lại`);
        const lo = Math.min(60, all.length - 20), hi = all.length - 20;
        idx = random ? lo + Math.floor(Math.random() * (hi - lo)) : Math.max(lo, Math.min(hi, all.findIndex((c) => c.time * 1000 >= new Date(form.date).getTime())));
        if (idx < 0) idx = lo;
      } else {
        let t0 = new Date(form.date).getTime();
        if (random) t0 = Date.now() - (250 + Math.floor(Math.random() * 1200)) * tfMs;
        if (!(t0 < Date.now() - 20 * tfMs)) throw new Error("Chọn ngày bắt đầu sớm hơn (cần còn nến phía sau để tua)");
        all = await fetchKlines(sym, TF[tf].api, 1500, { market, startTime: t0 - CTX * tfMs });
        if (all.length < 40) throw new Error(`Binance chỉ có ${all.length} nến ${sym} từ ngày này — chọn ngày muộn hơn`);
        idx = all.findIndex((c) => c.time * 1000 >= t0);
        if (idx < 0) idx = all.length - 20;
        idx = Math.max(Math.min(30, all.length - 2), idx);
      }
      const n = R.newSession({ all, idx, sym, tf, market, balance: Number(form.balance) || 1000, riskPct: Math.min(10, Math.max(0.1, Number(form.riskPct) || 1)) });
      setS(n); setPlaying(false); setTk((t) => ({ ...t, entry: "", sl: "", tp: "" }));
      ls.set(`${key}_form`, { balance: form.balance, riskPct: form.riskPct, date: form.date });
    } catch (e) { setErr(e.message || String(e)); }
    setBusy("");
  };

  // Gần hết nến (Coin) → tải thêm 1500 nến tiếp theo
  const loading = useRef(false);
  const more = async (cur) => {
    if (fx || loading.current) return;
    loading.current = true;
    try {
      const last = cur.all[cur.all.length - 1];
      const nx = await fetchKlines(sym, TF[tf].api, 1500, { market: cur.market, startTime: (last.time + 1) * 1000 });
      const add = nx.filter((c) => c.time > last.time);
      if (add.length) setS((x) => (x && x.id === cur.id ? { ...x, all: [...x.all, ...add] } : x));
    } catch { /* thử lại ở bước sau */ }
    loading.current = false;
  };
  const next = (k = 1) => {
    const cur = sRef.current; if (!cur) return;
    let n = cur;
    for (let i = 0; i < k && n.idx < n.all.length - 1; i++) {
      const before = n.trades.length;
      n = R.step(n);
      if (n.trades.length > before) { const t = n.trades[n.trades.length - 1]; setMsg(`${t.reason} ${t.side === 1 ? "lệnh Mua" : "lệnh Bán"}: ${sR(t.r)} (${usd(t.pnl)})`); if (k > 1) break; }
    }
    setS(n);
    if (n.idx >= n.all.length - 5) { if (fx) { if (n.idx >= n.all.length - 1) { setPlaying(false); setMsg("Đã tới nến mới nhất MT5 gửi lên"); } } else more(n); }
  };
  useEffect(() => { if (!playing) return undefined; const t = setInterval(() => next(1), speed); return () => clearInterval(t); }, [playing, speed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // phím: → nến tiếp, Space chạy/dừng
    const onKey = (e) => {
      if (!sRef.current || /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName || "") || e.target?.isContentEditable || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowRight") { e.preventDefault(); setPlaying(false); next(1); }
      else if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const vis = useMemo(() => (s ? s.all.slice(0, s.idx + 1) : NONE), [s?.all, s?.idx]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = vis[vis.length - 1];
  const ema2 = useMemo(() => { const cl = vis.map((c) => c.close); const m = (p) => ema(cl, p).map((v, i) => (v == null ? null : { time: vis[i].time, value: v })).filter(Boolean); return [m(20), m(50)]; }, [vis]);
  const atrNow = useMemo(() => { if (vis.length < 20) return null; const a = atr(vis.slice(-60), 14); return a[a.length - 1]; }, [vis]);
  const prec = fx ? fxDigits(sym) ?? precisionOf(cur?.close) : precisionOf(cur?.close);
  const st = useMemo(() => (s ? R.stats(s.trades, s.balance0) : null), [s?.trades, s?.balance0]); // eslint-disable-line react-hooks/exhaustive-deps
  const op = s ? R.openPnl(s) : null;

  const lines = useMemo(() => {
    if (!s) return NONE;
    const out = [];
    if (s.pos) { const p = s.pos; out.push({ price: p.entry, color: "#8b5cf6", title: `Vào ${p.side === 1 ? "MUA" : "BÁN"}`, style: 0, width: 2 }, { price: p.sl, color: "#e11d48", title: "Cắt lỗ", style: 2 }); if (p.tp) out.push({ price: p.tp, color: "#059669", title: "Chốt lời", style: 2 }); }
    if (s.pending) { const p = s.pending; out.push({ price: p.entry, color: "#8b5cf6", title: `Chờ ${p.side === 1 ? "MUA" : "BÁN"}`, style: 1 }, { price: p.sl, color: "#e11d48", title: "Cắt lỗ (chờ)", style: 3 }); if (p.tp) out.push({ price: p.tp, color: "#059669", title: "Chốt lời (chờ)", style: 3 }); }
    return out;
  }, [s?.pos, s?.pending]); // eslint-disable-line react-hooks/exhaustive-deps
  const marks = useMemo(() => {
    if (!s) return NONE;
    const m = [];
    for (const t of s.trades) {
      m.push({ time: t.openTime, position: t.side === 1 ? "belowBar" : "aboveBar", color: t.side === 1 ? "#10b981" : "#f43f5e", shape: t.side === 1 ? "arrowUp" : "arrowDown", text: t.side === 1 ? "Mua" : "Bán" });
      m.push({ time: t.closeTime, position: t.side === 1 ? "aboveBar" : "belowBar", color: t.pnl > 0 ? "#059669" : "#e11d48", shape: "circle", text: sR(t.r, 1) });
    }
    if (s.pos) m.push({ time: s.pos.openTime, position: s.pos.side === 1 ? "belowBar" : "aboveBar", color: "#8b5cf6", shape: s.pos.side === 1 ? "arrowUp" : "arrowDown", text: "Đang mở" });
    return m;
  }, [s?.trades, s?.pos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Phiếu lệnh: điền sẵn cắt lỗ 1,5 ATR + chốt lời 2R theo phía đang chọn
  const prefill = (side = tk.side, kind = tk.kind) => {
    if (!cur || !atrNow) return;
    const e = kind === "limit" && Number(String(tk.entry).replace(",", ".")) > 0 ? Number(String(tk.entry).replace(",", ".")) : cur.close;
    const sl = e - side * 1.5 * atrNow, tp = e + side * 3 * atrNow, r = (v) => Number(v.toFixed(prec));
    setTk({ side, kind, entry: kind === "limit" ? String(r(e)) : "", sl: String(r(sl)), tp: String(r(tp)) });
  };
  const fromDrawing = () => { // lấy từ hình "Vị thế Mua/Bán" đang chọn trên biểu đồ
    const d = draw?.items?.find((x) => x.id === draw.sel && (x.type === "long" || x.type === "short"));
    if (!d) { setErr("Chọn 1 hình Vị thế Mua/Bán trên biểu đồ trước (công cụ có mũi tên lên / xuống)"); return; }
    const r = (v) => String(Number(v.toFixed(prec)));
    setErr(""); setTk({ side: d.type === "long" ? 1 : -1, kind: "limit", entry: r(d.p1.price), sl: r(d.p2.price), tp: r(d.p3.price) });
  };
  const num = (v) => { const n = Number(String(v).replace(/\s/g, "").replace(",", ".")); return n > 0 ? n : null; };
  const send = () => {
    const r = R.placeOrder(s, { kind: tk.kind, side: tk.side, entry: num(tk.entry), sl: num(tk.sl), tp: num(tk.tp) });
    if (r.err) { setErr(r.err); return; }
    setErr(""); setMsg(tk.kind === "market" ? `Đã vào lệnh ${tk.side === 1 ? "Mua" : "Bán"} ở ${px(r.s.pos.entry)}` : `Đã đặt lệnh chờ ${tk.side === 1 ? "Mua" : "Bán"} ở ${px(r.s.pending.entry)}`);
    setS(r.s); setTk((t) => ({ ...t, entry: "", sl: "", tp: "" })); // phiếu trống cho lệnh sau (giá đã khác)
  };
  const save = () => { if (!s) return; onSave?.(R.summary(s)); setMsg("Đã lưu phiên lên cloud"); };
  const end = () => { setPlaying(false); ls.set(`${key}_cur`, null); setResume(null); setS(null); setMsg(""); setErr(""); };

  const btn = "flex items-center justify-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-bold disabled:opacity-40";
  const inp = "w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 font-mono text-[12.5px] outline-none focus:border-indigo-300";

  // ---- Chưa bắt đầu: chọn ngày, vốn, rủi ro ----
  if (!s) return (
    <div className="mt-2 rounded-xl border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[13px] font-extrabold text-slate-800">Tua lại nến {sym} · {TF[tf].label} — luyện / kiểm tra cách vào lệnh</div>
        <button onClick={onExit} className={`${btn} text-slate-500 hover:bg-slate-100`}><X size={14} /> Đóng</button>
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-slate-500">Biểu đồ dừng ở ngày anh chọn, phần sau bị giấu. Bấm <b>Nến tiếp</b> (phím →) hoặc <b>Chạy</b> (phím Space) để nến hiện dần, tự đặt lệnh Mua/Bán kèm cắt lỗ / chốt lời. App tự khớp lệnh và chấm điểm. {fx ? "Forex chỉ tua được trong ~400 nến gần nhất cầu nối MT5 gửi lên." : "Coin lấy nến Binance, tua tới đâu tải tới đó."}</p>
      <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="text-[11px] font-bold text-slate-500">Ngày bắt đầu<input id="rp-date" type="date" value={form.date} max={isoDay(Date.now())} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inp} /></label>
        <label className="text-[11px] font-bold text-slate-500">Vốn ($)<input id="rp-bal" inputMode="decimal" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} className={inp} /></label>
        <label className="text-[11px] font-bold text-slate-500">Rủi ro mỗi lệnh (%)<input id="rp-risk" inputMode="decimal" value={form.riskPct} onChange={(e) => setForm({ ...form, riskPct: e.target.value })} className={inp} /></label>
        <div className="flex items-end gap-1.5">
          <button onClick={() => start(false)} disabled={!!busy} className={`${btn} flex-1 bg-indigo-600 text-white hover:bg-indigo-700`}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} Bắt đầu</button>
          <button onClick={() => start(true)} disabled={!!busy} title="Ngày ngẫu nhiên — không biết trước diễn biến, luyện khách quan hơn" className={`${btn} border border-slate-200 text-slate-600 hover:bg-slate-50`}><Shuffle size={14} /></button>
        </div>
      </div>
      {resume && <button onClick={() => setS(resume)} className={`${btn} mt-2 border border-indigo-200 bg-indigo-50 text-indigo-700`}><RotateCcw size={13} /> Tiếp tục phiên dở ({day(resume.all[resume.idx].time)} · {resume.trades.length} lệnh)</button>}
      {err && <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[12px] font-semibold text-rose-600"><AlertTriangle size={13} /> {err}</div>}
      {saved.length > 0 && <SavedList saved={saved} />}
    </div>
  );

  // ---- Đang tua ----
  const pend = s.pending, pos = s.pos, atEnd = s.idx >= s.all.length - 1;
  return (
    <div className={full ? "mt-2 flex flex-col lg:min-h-0 lg:flex-1" : "mt-2"}>
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/60 px-2 py-1.5">
        <span className="text-[11.5px] font-extrabold text-indigo-700">TUA LẠI</span>
        <span className="font-mono text-[11.5px] font-bold tabular-nums text-slate-600">{day(cur.time)}</span>
        <span className="text-[11px] text-slate-400">· nến {s.idx - s.start}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <button onClick={() => { setPlaying(false); next(1); }} disabled={atEnd && fx} title="Nến tiếp (phím →)" className={`${btn} bg-white text-slate-700 shadow-sm`}><StepForward size={14} /> Nến tiếp</button>
          <button onClick={() => { setPlaying(false); next(10); }} disabled={atEnd && fx} title="Tua 10 nến (dừng khi có lệnh đóng)" className={`${btn} bg-white text-slate-700 shadow-sm`}><FastForward size={14} /> 10</button>
          <button onClick={() => setPlaying((p) => !p)} disabled={atEnd && fx} title="Tự chạy / dừng (Space)" className={`${btn} ${playing ? "bg-amber-500 text-white" : "bg-indigo-600 text-white"}`}>{playing ? <Pause size={14} /> : <Play size={14} />}{playing ? "Dừng" : "Chạy"}</button>
          <div className="flex rounded-lg bg-white p-0.5 shadow-sm">{SPEEDS.map(([ms, l]) => <button key={ms} onClick={() => setSpeed(ms)} aria-pressed={speed === ms} className={`rounded-md px-1.5 py-1 text-[11px] font-extrabold ${speed === ms ? "bg-indigo-100 text-indigo-700" : "text-slate-500"}`}>{l}</button>)}</div>
          <button onClick={save} disabled={!s.trades.length} title="Lưu kết quả phiên lên cloud" className={`${btn} bg-white text-slate-700 shadow-sm`}><Save size={14} /></button>
          <button onClick={end} title="Kết thúc phiên (chọn ngày khác)" className={`${btn} bg-white text-slate-500 shadow-sm hover:text-rose-600`}><RotateCcw size={14} /></button>
          <button onClick={() => { setPlaying(false); onExit(); }} title="Thoát chế độ tua (phiên dở vẫn được giữ trên máy)" className={`${btn} bg-white text-slate-500 shadow-sm`}><X size={14} /></button>
        </div>
      </div>

      <div className={full ? "mt-2 grid gap-2 lg:min-h-0 lg:flex-1 lg:grid-cols-[1fr_300px]" : "mt-2 grid gap-2 lg:grid-cols-[1fr_300px]"}>
        <div className={full ? "relative lg:flex lg:min-h-0 lg:flex-col" : "relative"}>
          <CandleChart onEma={onEma} candles={vis} e20={ema2[0]} e50={ema2[1]} events={NONE} marks={marks} lines={lines} precision={prec} fitKey={`rp-${s.id}`} tags={tags} draw={draw} follow
            className={full ? "h-[calc(100dvh-330px)] min-h-[300px] w-full lg:h-full lg:min-h-[300px]" : "h-[380px] w-full sm:h-[520px]"} wrapClass={full ? "relative w-full lg:min-h-0 lg:flex-1" : undefined} />
          {msg && <div role="status" className="pointer-events-none absolute left-1/2 top-2 z-20 -translate-x-1/2 rounded-lg bg-slate-900/85 px-2.5 py-1 text-[11.5px] font-bold text-white shadow">{msg}</div>}
        </div>

        {/* Phiếu lệnh + kết quả */}
        <div className="space-y-2 lg:overflow-y-auto">
          <div className="rounded-xl border border-slate-200 p-2.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Số dư</span>
              <span className="font-mono text-[15px] font-extrabold tabular-nums text-slate-800">{fmtNum(s.balance, 2, 2)}$</span>
            </div>
            {pos ? (
              <div className="mt-2 rounded-lg bg-violet-50 p-2 text-[12px]">
                <div className="flex items-center justify-between font-bold"><span className={pos.side === 1 ? "text-emerald-700" : "text-rose-700"}>{pos.side === 1 ? "MUA" : "BÁN"} {px(pos.entry)}</span><span className={op.pnl >= 0 ? "text-emerald-700" : "text-rose-700"}>{sR(op.r)} · {usd(op.pnl)}</span></div>
                <div className="mt-0.5 text-[11px] text-slate-500">Cắt lỗ {px(pos.sl)}{pos.tp ? ` · Chốt lời ${px(pos.tp)}` : ""} · rủi ro {fmtNum(pos.riskUsd, 2, 2)}$</div>
                <StopEdit pos={pos} prec={prec} onMove={(o) => { const r = R.moveStops(s, o); if (r.err) setErr(r.err); else { setErr(""); setS(r.s); } }} />
                <button onClick={() => setS(R.closeNow(s))} className={`${btn} mt-1.5 w-full bg-slate-800 text-white`}>Đóng lệnh ở giá hiện tại</button>
              </div>
            ) : pend ? (
              <div className="mt-2 rounded-lg bg-amber-50 p-2 text-[12px]">
                <div className="font-bold text-amber-800">Chờ {pend.side === 1 ? "MUA" : "BÁN"} ở {px(pend.entry)}</div>
                <div className="text-[11px] text-slate-500">Cắt lỗ {px(pend.sl)}{pend.tp ? ` · Chốt lời ${px(pend.tp)}` : ""}</div>
                <button onClick={() => setS(R.cancelPending(s))} className={`${btn} mt-1.5 w-full border border-amber-300 text-amber-800`}><Trash2 size={13} /> Huỷ lệnh chờ</button>
              </div>
            ) : (
              <div className="mt-2 space-y-1.5">
                <div className="grid grid-cols-2 gap-1">
                  <button onClick={() => prefill(1)} className={`${btn} ${tk.side === 1 ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700"}`}>Mua</button>
                  <button onClick={() => prefill(-1)} className={`${btn} ${tk.side === -1 ? "bg-rose-600 text-white" : "bg-rose-50 text-rose-700"}`}>Bán</button>
                </div>
                <div className="flex rounded-lg bg-slate-100 p-0.5 text-[11.5px] font-bold">
                  {[["market", "Khớp ngay"], ["limit", "Lệnh chờ"]].map(([k, l]) => <button key={k} onClick={() => setTk({ ...tk, kind: k, entry: k === "limit" && !tk.entry && cur ? String(cur.close) : tk.entry })} className={`flex-1 rounded-md py-1 ${tk.kind === k ? "bg-white text-indigo-600 shadow" : "text-slate-500"}`}>{l}</button>)}
                </div>
                {tk.kind === "limit" && <label className="block text-[11px] font-bold text-slate-500">Giá vào<input id="rp-entry" inputMode="decimal" value={tk.entry} onChange={(e) => setTk({ ...tk, entry: e.target.value })} className={inp} /></label>}
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="text-[11px] font-bold text-rose-600">Cắt lỗ<input id="rp-sl" inputMode="decimal" value={tk.sl} onChange={(e) => setTk({ ...tk, sl: e.target.value })} className={inp} /></label>
                  <label className="text-[11px] font-bold text-emerald-600">Chốt lời<input id="rp-tp" inputMode="decimal" value={tk.tp} placeholder="tuỳ chọn" onChange={(e) => setTk({ ...tk, tp: e.target.value })} className={inp} /></label>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => prefill()} disabled={!atrNow} title="Cắt lỗ 1,5 ATR, chốt lời 2R" className={`${btn} flex-1 border border-slate-200 text-slate-600`}>Gợi ý 1,5 ATR · 2R</button>
                  <button onClick={fromDrawing} title="Lấy giá vào / cắt lỗ / chốt lời từ hình Vị thế Mua/Bán đang chọn" className={`${btn} border border-slate-200 text-slate-600`}><Crosshair size={13} /></button>
                </div>
                <button onClick={send} disabled={!num(tk.sl)} className={`${btn} w-full ${tk.side === 1 ? "bg-emerald-600" : "bg-rose-600"} text-white`}>{tk.kind === "market" ? `Vào lệnh ${tk.side === 1 ? "Mua" : "Bán"} ${cur ? px(cur.close) : ""}` : `Đặt lệnh chờ ${tk.side === 1 ? "Mua" : "Bán"}`}</button>
                <div className="text-[10.5px] text-slate-400">Rủi ro {fmtNum(s.riskPct, 1, 0)}% số dư mỗi lệnh ({fmtNum((s.balance * s.riskPct) / 100, 2, 2)}$) · phí {fmtNum(s.feePct, 2, 2)}%/chiều</div>
              </div>
            )}
            {err && <div className="mt-1.5 rounded-lg bg-rose-50 px-2 py-1 text-[11.5px] font-semibold text-rose-600">{err}</div>}
          </div>

          <div className="rounded-xl border border-slate-200 p-2.5">
            <div className="grid grid-cols-3 gap-1.5 text-center">
              {[["Lệnh", st.n], ["Thắng", `${fmtNum(st.winRate, 0)}%`], ["Tổng R", sR(st.sumR, 1)], ["Lãi/lỗ", `${st.pnlPct >= 0 ? "+" : ""}${fmtNum(st.pnlPct, 1, 1)}%`], ["Hệ số LN", st.n ? (isFinite(st.pf) ? fmtNum(st.pf, 2, 2) : "∞") : "—"], ["Sụt vốn", `${fmtNum(st.maxDD, 1, 1)}%`]].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-slate-50 py-1"><div className="text-[10px] font-bold uppercase text-slate-400">{l}</div><div className="font-mono text-[12.5px] font-extrabold tabular-nums text-slate-800">{v}</div></div>
              ))}
            </div>
            {st.curve.length > 1 && <Curve pts={st.curve} />}
            {s.trades.length > 0 && (
              <ul className="mt-1.5 max-h-40 divide-y divide-slate-100 overflow-y-auto text-[11.5px]">
                {[...s.trades].reverse().map((t, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 py-1">
                    <span className={t.side === 1 ? "font-bold text-emerald-700" : "font-bold text-rose-700"}>{t.side === 1 ? "Mua" : "Bán"}</span>
                    <span className="truncate text-slate-500">{px(t.entry)} → {px(t.exit)} · {t.reason}</span>
                    <span className={`font-mono font-bold ${t.pnl > 0 ? "text-emerald-600" : "text-rose-600"}`}>{sR(t.r, 1)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Sửa cắt lỗ / chốt lời lệnh đang mở (vd dời cắt lỗ về hoà vốn)
function StopEdit({ pos, prec, onMove }) {
  const [sl, setSl] = useState(String(pos.sl)), [tp, setTp] = useState(pos.tp ? String(pos.tp) : "");
  useEffect(() => { setSl(String(pos.sl)); setTp(pos.tp ? String(pos.tp) : ""); }, [pos.sl, pos.tp]);
  const n = (v) => { const x = Number(String(v).replace(",", ".")); return x > 0 ? x : null; };
  const inp = "w-full min-w-0 rounded-md border border-slate-200 bg-white px-1.5 py-1 font-mono text-[12px] outline-none";
  return (
    <div className="mt-1.5 grid grid-cols-[1fr_1fr_auto] gap-1">
      <input aria-label="Cắt lỗ mới" value={sl} onChange={(e) => setSl(e.target.value)} className={inp} />
      <input aria-label="Chốt lời mới" value={tp} placeholder="chốt lời" onChange={(e) => setTp(e.target.value)} className={inp} />
      <button onClick={() => onMove({ sl: n(sl), tp: tp.trim() === "" ? null : n(tp) })} className="rounded-md bg-violet-600 px-2 text-[11px] font-bold text-white">Sửa</button>
      <button onClick={() => onMove({ sl: Number(pos.entry.toFixed(prec)), tp: pos.tp })} className="col-span-3 rounded-md border border-violet-200 py-0.5 text-[11px] font-bold text-violet-700">Dời cắt lỗ về hoà vốn</button>
    </div>
  );
}

// Đường vốn nhỏ (SVG)
function Curve({ pts }) {
  const W = 260, H = 56, lo = Math.min(...pts), hi = Math.max(...pts), k = hi - lo || 1;
  const P = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - 4 - ((v - lo) / k) * (H - 8)]);
  const up = pts[pts.length - 1] >= pts[0];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-1.5 h-14 w-full" preserveAspectRatio="none" aria-label="Đường vốn">
      <line x1="0" x2={W} y1={H - 4 - ((pts[0] - lo) / k) * (H - 8)} y2={H - 4 - ((pts[0] - lo) / k) * (H - 8)} stroke="#94a3b8" strokeDasharray="3 3" strokeWidth="1" />
      <polyline points={P.map((p) => p.join(",")).join(" ")} fill="none" stroke={up ? "#10b981" : "#f43f5e"} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// Các phiên đã lưu (cloud)
function SavedList({ saved }) {
  return (
    <div className="mt-3">
      <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Phiên đã lưu</div>
      <div className="mt-1 overflow-x-auto">
        <table className="w-full min-w-[520px] text-[11.5px] tabular-nums">
          <thead><tr className="text-left text-slate-400">{["Mã", "Khung", "Từ", "Lệnh", "Thắng", "Tổng R", "Lãi/lỗ", "Sụt vốn"].map((h) => <th key={h} className="py-1 pr-2 font-bold">{h}</th>)}</tr></thead>
          <tbody>
            {saved.slice(0, 15).map((x) => (
              <tr key={x.id} className="border-t border-slate-100">
                <td className="py-1 pr-2 font-bold text-slate-700">{x.sym}</td><td className="pr-2">{TF[x.tf]?.label || x.tf}</td><td className="pr-2 text-slate-500">{x.from ? day(x.from).slice(0, 10) : "—"}</td>
                <td className="pr-2">{x.n}</td><td className="pr-2">{fmtNum(x.winRate, 0)}%</td>
                <td className={`pr-2 font-bold ${x.sumR >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{sR(x.sumR, 1)}</td>
                <td className={`pr-2 ${x.pnlPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{x.pnlPct >= 0 ? "+" : ""}{fmtNum(x.pnlPct, 1, 1)}%</td><td>{fmtNum(x.maxDD, 1, 1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
