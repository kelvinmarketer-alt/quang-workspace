import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Play, Square, RefreshCw, Loader2, Settings2, Info, ShieldAlert, ChevronDown, Radio, Brain, Bell, Activity } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, BarChart, Bar, Cell, Legend } from "recharts";
import { Card, Badge } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { ask } from "../components/ConfirmDialog.jsx";
import { runSession, finalize, statsOf, cfgOf, MIN_RR, SETUPS, TFS, SYMBOLS, LEVELS } from "../lib/paperBot.js";

// Tab "Demo tự động": bot giao dịch GIẢ LẬP Futures theo bộ kiến thức — chạy từ ngày bắt đầu tới nay và tiếp tục theo
// từng nến mới cho tới khi chủ bấm Dừng. Phiên lưu ở settings.paperBot; kết quả tính lại từ nến Binance (luật cố định
// nên mở app lúc nào cũng ra đúng kết quả như bot chạy liên tục 24/7).
// Realtime: WebSocket Binance Futures (nến đang chạy) → lệnh mở nhảy lãi/lỗ từng giây, chạm SL/TP đóng ngay; nến đóng → bot xét tín hiệu mới.
// Tự tối ưu: walk-forward (paperBot.js) — chạy song song "Luật gốc" để so sánh.
const usd = (v, d = 2) => (v == null || !isFinite(v) ? "—" : (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (v) => (v == null || !isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);
const rr = (v) => (v == null || !isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}R`);
const f2 = (v) => (v == null || !isFinite(v) ? "—" : v.toFixed(2));
const px = (v) => (v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: v >= 1000 ? 1 : v >= 10 ? 2 : 4 }));
const dt = (t) => { const d = new Date(t); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const hm = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`; };
const ago = (t) => { const d = (Date.now() - t) / 86400000; return d >= 1 ? `${Math.floor(d)} ngày ${Math.floor((d % 1) * 24)} giờ` : `${Math.floor(d * 24)} giờ`; };
const tone = (v) => (v == null ? "text-slate-900" : v >= 0 ? "text-emerald-600" : "text-rose-600");
const setupName = (k) => SETUPS[k]?.label.split(" (")[0] || k;
const side = (s) => <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-extrabold text-white ${s === 1 ? "bg-emerald-500" : "bg-rose-500"}`}>{s === 1 ? "LONG" : "SHORT"}</span>;

function Num({ label, v, sub, tone: t = "text-slate-900" }) {
  return <div className="bg-white px-3 py-2.5"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div><div className={`text-lg font-extrabold tabular-nums ${t}`}>{v}</div>{sub && <div className="text-[11px] text-slate-400">{sub}</div>}</div>;
}
const Title = ({ icon: I, children, right }) => <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{I && <I size={13} className="text-indigo-500" />}{children}{right && <span className="ml-auto normal-case tracking-normal">{right}</span>}</div>;

function StatTable({ title, rows }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{title}</div>
      <table className="w-full text-[12px]">
        <thead><tr className="border-b border-slate-100 text-left text-[10px] uppercase text-slate-400"><th className="py-1.5 pr-2" /><th className="py-1.5 pr-2 text-right">Lệnh</th><th className="py-1.5 pr-2 text-right">Thắng</th><th className="py-1.5 pr-2 text-right">R TB</th><th className="py-1.5 pr-2 text-right">PF</th><th className="py-1.5 text-right">Tổng R</th></tr></thead>
        <tbody>{rows.filter(([, s]) => s.n).map(([name, s]) => (
          <tr key={name} className="border-b border-slate-50">
            <td className="py-1.5 pr-2 font-bold text-slate-700">{name}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums">{s.n}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums">{s.winRate?.toFixed(0)}%</td>
            <td className={`py-1.5 pr-2 text-right font-bold tabular-nums ${tone(s.avgR)}`}>{rr(s.avgR)}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">{s.pf === Infinity ? "∞" : f2(s.pf)}</td>
            <td className={`py-1.5 text-right tabular-nums ${tone(s.totalR)}`}>{s.totalR.toFixed(1)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function SetupForm({ initial, onStart, onCancel }) {
  const [days, setDays] = useState(90);
  const [c, setC] = useState(() => cfgOf({ cfg: initial }));
  const tog = (k, v) => setC((o) => ({ ...o, [k]: o[k].includes(v) ? o[k].filter((x) => x !== v) : [...o[k], v] }));
  const chip = (on) => `rounded-lg px-3 py-1.5 text-[12px] font-bold ${on ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`;
  const field = (k, label, step = 1, suffix = "", min) => (
    <label className="block text-[12px]"><span className="mb-1 block font-semibold text-slate-500">{label}</span>
      <div className="flex items-center gap-1"><input type="number" step={step} min={min} value={c[k]} onChange={(e) => setC({ ...c, [k]: Number(e.target.value) })} onBlur={() => { if (min != null && c[k] > 0 && c[k] < min) setC((o) => ({ ...o, [k]: min })); }} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />{suffix && <span className="text-slate-400">{suffix}</span>}</div>
    </label>
  );
  const ok = c.coins.length && c.tfs.length && c.setups.length && c.capital > 0 && c.riskPct > 0;
  return (
    <Card className="!p-4">
      <div className="mb-3 flex items-center gap-2 text-[15px] font-extrabold text-slate-800"><Settings2 size={17} className="text-indigo-500" /> Cấu hình phiên demo</div>
      <div className="space-y-3">
        <div><div className="mb-1 text-[12px] font-semibold text-slate-500">Chạy lại từ quá khứ</div><div className="flex flex-wrap gap-1.5">{[30, 60, 90].map((d) => <button key={d} onClick={() => setDays(d)} className={chip(days === d)}>{d} ngày trước</button>)}</div></div>
        <div><div className="mb-1 text-[12px] font-semibold text-slate-500">Cặp (Binance Futures)</div><div className="flex flex-wrap gap-1.5">{Object.keys(SYMBOLS).map((k) => <button key={k} onClick={() => tog("coins", k)} className={chip(c.coins.includes(k))}>{k}USDT</button>)}</div></div>
        <div><div className="mb-1 text-[12px] font-semibold text-slate-500">Khung giờ</div><div className="flex flex-wrap gap-1.5">{["5m", "15m"].map((k) => <button key={k} onClick={() => tog("tfs", k)} className={chip(c.tfs.includes(k))}>{TFS[k].label}</button>)}</div></div>
        <div><div className="mb-1 text-[12px] font-semibold text-slate-500">Setup theo bộ kiến thức</div>
          <div className="space-y-1">{Object.entries(SETUPS).map(([k, s]) => (
            <button key={k} onClick={() => tog("setups", k)} className={`block w-full rounded-lg border px-3 py-2 text-left ${c.setups.includes(k) ? "border-indigo-300 bg-indigo-50/60" : "border-slate-200 opacity-60"}`}>
              <div className="text-[12.5px] font-bold text-slate-800">{c.setups.includes(k) ? "☑" : "☐"} {s.label}</div><div className="text-[11px] leading-snug text-slate-500">{s.desc}</div>
            </button>
          ))}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {field("capital", "Vốn ảo", 100, "$")}{field("riskPct", "Rủi ro / lệnh", 0.25, "%")}{field("maxOpen", "Tối đa lệnh mở")}{field("maxLev", "Đòn bẩy tối đa", 1, "x")}
          {field("dailyStopPct", "Dừng ngày khi lỗ", 0.5, "%")}{field("rr", `Chốt lời gốc (R:R ≥ ${MIN_RR})`, 0.5, "R", MIN_RR)}{field("beAtR", "Dời hoà vốn ở (0=tắt)", 0.5, "R")}{field("feePct", "Phí mỗi chiều", 0.01, "%")}
          {field("maxFeeR", "Bỏ lệnh khi phí > (0=tắt)", 0.05, "R")}
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
          <div className="text-[13px] font-extrabold text-emerald-800">Chỉ vào LỆNH CHỜ (limit) — đúng điểm đẹp mới vào, không thì bỏ</div>
          <div className="mt-1 text-[11.5px] leading-snug text-emerald-900/70">Đặt lệnh chờ ở giá đóng nến tín hiệu (phí maker 0,02%, không trượt). Chỉ khớp khi giá <b>xuyên qua</b> mức đặt trong số nến chờ; hết hạn không khớp → huỷ. Trước khi đặt còn kiểm tra: <b>không đuổi giá</b> (giá vào không xa EMA50 quá N ATR) và <b>SL ngoài vùng nhiễu</b> (≥ N ATR). Kiểm tra 180 ngày: tỉ lệ thắng 35% → 44%, R TB −0,12 → +0,13.</div>
          <div className="mt-2 text-[12px] font-semibold text-emerald-900">Vùng Key Volume (bộ kiến thức: chỉ vào TẠI vùng có lý do)</div>
          <div className="mt-1 flex flex-wrap gap-1.5">{[[1, "Nến volume lớn nhất 100 nến (khuyên dùng)"], [3, "Top 3 nến volume"], [0, "Tắt"]].map(([k, l]) => <button key={k} onClick={() => setC({ ...c, keyVolume: k })} className={chip(c.keyVolume === k)}>{l}</button>)}</div>
          <div className="mt-1 text-[11px] text-emerald-900/60">Giá vào phải nằm trong vùng nến Key Volume (nến volume ≥ 2,5× TB20 lớn nhất 100 nến). 3 tháng gần nhất: thắng 39% → 47%, vốn 921$ → 1.183$, sụt vốn 22% → 6%.</div>
          <div className="mt-2 text-[12px] font-semibold text-emerald-900">Xác nhận theo bộ kiến thức (VSA · Price Action · đa khung)</div>
          {[["sigVol", "Nến tín hiệu phải có volume > TB20 (VSA: có lực xác nhận)"], ["noEngulf", "Không vào ngay sau nến engulfing lớn (tránh đuổi giá sau nến mạnh)"], ["d1Bias", "Chỉ vào thuận xu hướng D1 (ít lệnh hơn, thắng cao hơn)"]].map(([k, l]) => <label key={k} className="mt-1 flex items-center gap-2 text-[12px] font-semibold text-emerald-900"><input type="checkbox" checked={!!c[k]} onChange={(e) => setC({ ...c, [k]: e.target.checked })} /> {l}</label>)}
          <div className="mt-1 text-[11px] text-emerald-900/60">3 tháng gần nhất (M5+M15, Key Volume): thắng 50% → 57%, R TB +0,28 → +0,54; bật thêm D1: thắng 64% nhưng chỉ ~22 lệnh/3 tháng.</div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{field("maxExtAtr", "Không đuổi: xa EMA50 ≤ (0=tắt)", 0.5, "ATR")}{field("minSlAtr", "SL tối thiểu (0=tắt)", 0.5, "ATR")}{field("fillBars", "Chờ khớp tối đa", 1, "nến")}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{field("partialAtR", `Chốt 50% ở (0=tắt, ≥ ${MIN_RR})`, 0.5, "R", MIN_RR)}</div>
        <label className="flex items-center gap-2 text-[12.5px] font-semibold text-slate-700"><input type="checkbox" checked={c.htfFilter} onChange={(e) => setC({ ...c, htfFilter: e.target.checked })} /> Chỉ đánh thuận xu hướng khung lớn — khung lớn CHỈ dùng xác định bias: M5 theo H1, M15 theo H4 (EMA200)</label>
        <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3">
          <label className="flex items-center gap-2 text-[13px] font-extrabold text-violet-800"><input type="checkbox" checked={c.adaptive} onChange={(e) => setC({ ...c, adaptive: e.target.checked })} /><Brain size={15} /> Tự tối ưu dần (walk-forward)</label>
          <div className="mt-1 text-[11.5px] leading-snug text-violet-900/70">Mỗi tín hiệu được thử song song 6 cấu hình (R:R 1.5/2/3 × có/không dời hoà vốn). Khi có tín hiệu mới, bot chỉ nhìn các lệnh <b>đã đóng trước đó</b> (không nhìn trước tương lai) → chọn cấu hình kỳ vọng cao nhất, kỳ vọng thấp hơn ngưỡng thì <b>bỏ tín hiệu</b>. Thiếu mẫu ở cặp+khung+setup thì học từ nhóm rộng hơn. Luôn chạy kèm “Luật gốc” để so sánh.</div>
          {c.adaptive && <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{field("warmupDays", "Học trước ngày bắt đầu", 5, "ngày")}{field("lookback", "Xét N lệnh gần nhất", 5)}{field("minSample", "Cần tối thiểu", 1, "mẫu")}{field("minExp", "Vào khi điểm ≥", 0.05, "R")}{field("confK", "Độ thận trọng (0=tắt)", 0.25, "× sai số")}</div>}
          {c.adaptive && <label className="mt-2 flex items-center gap-2 text-[12px] font-semibold text-violet-900"><input type="checkbox" checked={c.tfGate} onChange={(e) => setC({ ...c, tfGate: e.target.checked })} /> Nghỉ cả khung giờ khi khung đó đang lỗ (kỳ vọng gần đây âm)</label>}
          {c.adaptive && <label className="mt-1 flex items-center gap-2 text-[12px] font-semibold text-violet-900"><input type="checkbox" checked={c.learnLoss} onChange={(e) => setC({ ...c, learnLoss: e.target.checked })} /> Rút kinh nghiệm sau mỗi lệnh thua (tự kiểm chứng: bài học chỉ áp dụng khi chứng minh được là giúp)</label>}
        </div>
        <div className="rounded-lg bg-slate-50 p-2.5 text-[11.5px] leading-snug text-slate-500">
          <b className="text-slate-700">Đề xuất cho vốn 1.000$:</b> rủi ro <b>1%/lệnh</b> (≈10$), tối đa <b>3 lệnh</b> cùng lúc, đòn bẩy ≤ <b>20x</b>, dừng ngày khi lỗ <b>3%</b>, bỏ lệnh khi phí &gt; <b>0,35R</b> (SL quá sát), vào bằng <b>lệnh chờ</b>, không dời hoà vốn (dữ liệu cho thấy dời hoà vốn làm giảm lợi nhuận). Chạy lại 3 tháng gần nhất; bộ tối ưu + bài học từ lệnh thua TỰ KIỂM CHỨNG — chỉ được chặn lệnh khi chứng minh được là giúp. <b>R:R tối thiểu 1:{String(MIN_RR).replace(".", ",")}</b> — bộ tối ưu chỉ chọn trong R:R 1,5 / 2 / 3. Khối lượng tự tính = tiền rủi ro ÷ khoảng cách SL.
        </div>
        <div className="flex gap-2">
          {onCancel && <button onClick={onCancel} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600">Huỷ</button>}
          <button disabled={!ok} onClick={() => onStart({ startAt: Date.now() - days * 86400000, cfg: c, createdAt: Date.now() })} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-2.5 text-sm font-bold text-white disabled:opacity-40"><Play size={15} /> Bắt đầu chạy demo</button>
        </div>
      </div>
    </Card>
  );
}

// WebSocket Binance Futures: nến đang chạy của mọi cặp × khung. Gom cập nhật 1 lần/giây; nến đóng → onClose().
function useLive(active, coins, tfs, onClose) {
  const live = useRef({}), shown = useRef({}), dirty = useRef(false), cb = useRef(onClose);
  const [ver, setVer] = useState(0), [status, setStatus] = useState("off");
  cb.current = onClose;
  const ck = coins.join(), tk = tfs.join();
  useEffect(() => {
    if (!active) { setStatus("off"); return undefined; }
    let ws = null, stop = false, retry = 0, timer = null;
    const sym2coin = Object.fromEntries(coins.map((c) => [SYMBOLS[c], c]));
    const streams = coins.flatMap((c) => tfs.map((tf) => `${SYMBOLS[c].toLowerCase()}@kline_${tf}`)).join("/");
    const connect = () => {
      setStatus(retry ? "reconnect" : "connecting");
      ws = new WebSocket(`wss://fstream.binance.com/market/stream?streams=${streams}`);
      ws.onopen = () => { retry = 0; setStatus("live"); };
      ws.onmessage = (m) => {
        try {
          const k = JSON.parse(m.data)?.data?.k; if (!k) return;
          const coin = sym2coin[k.s]; if (!coin) return;
          live.current[`${coin}|${k.i}`] = { t: k.t, h: +k.h, l: +k.l, c: +k.c };
          live.current[`px|${coin}`] = +k.c;
          dirty.current = true;
          if (k.x) cb.current?.();
        } catch { /* bỏ qua gói lỗi */ }
      };
      ws.onclose = () => { if (stop) return; setStatus("reconnect"); timer = setTimeout(connect, Math.min(30000, 2000 * 2 ** retry++)); };
      ws.onerror = () => { try { ws.close(); } catch { /* bỏ qua */ } };
    };
    connect();
    const tick = setInterval(() => {
      if (!dirty.current) return;
      dirty.current = false;
      for (const c of coins) { const p = live.current[`px|${c}`]; if (p == null) continue; const o = shown.current[c]; shown.current[c] = { c: p, dir: o && p !== o.c ? (p > o.c ? 1 : -1) : o?.dir || 0, at: o && p !== o.c ? Date.now() : o?.at || 0 }; }
      setVer((v) => v + 1);
    }, 1000);
    const vis = () => { if (!document.hidden && ws && ws.readyState > 1) { clearTimeout(timer); retry = 0; connect(); } };
    document.addEventListener("visibilitychange", vis);
    return () => { stop = true; clearTimeout(timer); clearInterval(tick); document.removeEventListener("visibilitychange", vis); try { ws?.close(); } catch { /* bỏ qua */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ck, tk]);
  return { live, shown, ver, status };
}

export default function CoinBot() {
  const { settings = {}, setSettings, isOwner } = useData();
  const session = settings.paperBot || null;
  const [raw, setRaw] = useState(null);
  const [rawOld, setRawOld] = useState(null); // bản cũ: cùng phiên nhưng chưa có luật vào đẹp — để so sánh
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [config, setConfig] = useState(false);
  const [filter, setFilter] = useState("all");
  const [showN, setShowN] = useState(40);
  const [view, setView] = useState("auto");
  const [optAll, setOptAll] = useState(false);
  const [toast, setToast] = useState(null);
  const running = useRef(false), lastRun = useRef(0), hits = useRef(new Map()), prevSt = useRef(null), debounce = useRef(null);
  const cfg = cfgOf(session);
  const active = !!session && !session.stoppedAt && isOwner;

  const sessRef = useRef(session); sessRef.current = session;
  const again = useRef(false);
  const run = async () => {
    if (!sessRef.current) return;
    if (running.current) { again.current = true; return; } // phiên đổi giữa chừng → chạy lại sau khi xong
    running.current = true; setErr("");
    const ss = sessRef.current, same = () => sessRef.current?.createdAt === ss.createdAt && sessRef.current?.stoppedAt === ss.stoppedAt;
    try {
      const r = await runSession(ss, (m) => setBusy(m));
      if (same()) { setRaw(r); lastRun.current = Date.now(); }
      const c0 = cfgOf(ss);
      const o = c0.maxExtAtr > 0 || c0.minSlAtr > 0 || c0.keyVolume > 0 ? await runSession({ ...ss, cfg: { ...c0, maxExtAtr: 0, minSlAtr: 0, keyVolume: 0, sigVol: false, noEngulf: false, d1Bias: false } }) : null;
      if (same()) setRawOld(o);
    }
    catch (e) { setErr(e.message || String(e)); }
    running.current = false; setBusy("");
    if (again.current || !same()) { again.current = false; run(); }
  };
  const { live, shown, ver, status } = useLive(active, cfg.coins, cfg.tfs, () => { clearTimeout(debounce.current); debounce.current = setTimeout(run, 2500); });

  // Nâng phiên đang chạy lên v4 theo yêu cầu (20/10): chạy lại 3 tháng gần nhất, bỏ H4 (kiểm tra: bỏ H4 tốt hơn nhẹ)
  useEffect(() => {
    if (!isOwner || !session || session.stoppedAt || (session.cfg?.cfgVer || 1) >= 4) return;
    const c = cfgOf(session), tfs = c.tfs.filter((x) => x !== "4h");
    setSettings({ paperBot: { ...session, startAt: Date.now() - 90 * 86400000, createdAt: Date.now(), cfg: { ...c, tfs: tfs.length ? tfs : c.tfs } } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.createdAt]);
  useEffect(() => { setRaw(null); setRawOld(null); hits.current = new Map(); prevSt.current = null; if (session) run(); /* eslint-disable-next-line */ }, [session?.createdAt, session?.stoppedAt]);
  // Dự phòng khi mất WebSocket: mỗi phút xét nến mới (đang có realtime thì 5 phút/lần)
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => { if (!document.hidden && Date.now() - lastRun.current > (status === "live" ? 300000 : 55000)) run(); }, 60000);
    return () => clearInterval(t); /* eslint-disable-next-line */
  }, [active, status, session?.createdAt]);
  useEffect(() => () => clearTimeout(debounce.current), []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const res = useMemo(() => finalize(raw, active ? live.current : null, hits.current), [raw, ver, active]);
  const isBase = view === "base" || !cfg.adaptive;
  const P = res ? (isBase ? res.basePortfolio : res.portfolio) : null;
  const list = useMemo(() => (res ? (isBase ? res.baseTrades : res.trades) : []), [res, isBase]);

  // Phát hiện mở/đóng lệnh mới (danh mục chính) → thông báo nổi
  useEffect(() => {
    if (!res) return;
    const rows = res.portfolio.trades.filter((t) => t.status !== "skip"), cur = new Map(rows.map((t) => [t.id, t.status]));
    if (prevSt.current) {
      const evs = [];
      for (const t of rows) {
        const was = prevSt.current.get(t.id);
        if (!was && t.status === "open") evs.push({ text: `Mở ${t.side === 1 ? "LONG" : "SHORT"} ${t.coin} ${TFS[t.tf].label} @ ${px(t.entry)} · SL ${px(t.curSl)} · TP ${px(t.tp)}`, ok: true });
        if (was === "open" && t.status === "done") evs.push({ text: `Đóng ${t.coin} ${TFS[t.tf].label} · ${t.reason} ${rr(t.r)} (${usd(t.pnl)})`, ok: t.r >= 0 });
      }
      if (evs.length) { setToast({ ...evs[evs.length - 1], more: evs.length - 1, at: Date.now() }); try { navigator.vibrate?.(60); } catch { /* bỏ qua */ } }
    }
    prevSt.current = cur;
  }, [res]);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 9000); return () => clearTimeout(t); }, [toast]);

  const all = useMemo(() => statsOf(list), [list]);
  const sAuto = useMemo(() => (res ? statsOf(res.trades) : null), [res]), sBase = useMemo(() => (res ? statsOf(res.baseTrades) : null), [res]), sRej = useMemo(() => (res ? statsOf(res.rejected) : null), [res]);
  const by = (key, vals, label = (x) => x) => vals.map((v) => [label(v), statsOf(list.filter((t) => t[key] === v))]);
  const curveA = useMemo(() => (res ? res.portfolio.curve.map((p) => ({ t: p.t, eq: Math.round(p.eq * 100) / 100 })) : []), [res]);
  const curveB = useMemo(() => (res ? res.basePortfolio.curve.map((p) => ({ t: p.t, eq: Math.round(p.eq * 100) / 100 })) : []), [res]);
  const taken = useMemo(() => {
    if (!P) return [];
    const src = filter === "reject" ? res.rejected.map((t) => ({ ...t, status: "reject" })) : P.trades;
    return src.filter((t) => (filter === "all" ? t.status !== "skip" : filter === "open" ? t.status === "open" : filter === "skip" ? t.status === "skip" : filter === "reject" ? true : t.status === "done" && (filter === "win" ? t.r > 0.05 : t.r < -0.05))).sort((a, b) => b.entryAt - a.entryAt);
  }, [P, res, filter]);
  const feed = useMemo(() => {
    if (!P) return [];
    const ev = [];
    for (const t of P.trades) { if (t.status === "skip") continue; ev.push({ t: t.entryAt, kind: "open", tr: t }); if (t.exitAt) ev.push({ t: t.exitAt, kind: "close", tr: t }); }
    return ev.sort((a, b) => b.t - a.t).slice(0, 12);
  }, [P]);

  if (!isOwner) return <Card><div className="text-sm text-slate-500">Chỉ chủ workspace dùng được Demo tự động.</div></Card>;
  if (!session || config) return <SetupForm initial={session?.cfg} onStart={(s) => { setSettings({ paperBot: s }); setConfig(false); }} onCancel={session ? () => setConfig(false) : null} />;

  const stop = async () => { if (await ask("Dừng phiên demo?\nBot ngừng mở lệnh mới; lệnh đang mở được tính lãi/lỗ theo giá lúc dừng. Kết quả giữ lại để xem, bấm “Phiên mới” để chạy lại.", { ok: "Dừng phiên", danger: true })) setSettings({ paperBot: { ...session, stoppedAt: Date.now() } }); };
  const eqNow = P ? P.equity + P.unrealized : null, pnl = eqNow != null ? eqNow - cfg.capital : null;
  const open = P ? P.trades.filter((t) => t.status === "open") : [];
  const done = P ? P.trades.filter((t) => t.status === "done") : [];
  const expUsd = done.length ? done.reduce((s, t) => s + t.pnl, 0) / done.length : null;
  const longS = statsOf(list.filter((t) => t.side === 1)), shortS = statsOf(list.filter((t) => t.side === -1));
  const net = P ? P.equity - cfg.capital : 0, recovery = P && P.maxDDUsd > 0 ? net / P.maxDDUsd : null;
  const st = { live: ["bg-emerald-500 animate-pulse", "Realtime"], connecting: ["bg-amber-400", "Đang nối giá…"], reconnect: ["bg-amber-500 animate-pulse", "Mất kết nối, đang nối lại…"], off: ["bg-slate-300", "Không realtime"] }[status];
  const optOn = res?.optState.filter((o) => o.take && o.level >= 0).length || 0, optOff = res?.optState.filter((o) => !o.take).length || 0;

  return (
    <div className="space-y-3">
      <Card className="!p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Bot size={18} className="text-emerald-500" />
          <span className="text-[14px] font-extrabold text-slate-800">Bot demo · Futures</span>
          {session.stoppedAt ? <Badge tone="slate">Đã dừng</Badge> : <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Đang chạy</span>}
          {cfg.adaptive && <span className="flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700"><Brain size={11} /> Tự tối ưu</span>}
          <div className="ml-auto flex gap-1.5">
            <button onClick={run} disabled={!!busy} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-bold text-slate-600 disabled:opacity-50"><RefreshCw size={13} className={busy ? "animate-spin" : ""} /> Cập nhật</button>
            {session.stoppedAt ? <button onClick={() => setConfig(true)} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-bold text-white"><Play size={13} /> Phiên mới</button>
              : <button onClick={stop} className="flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1.5 text-[12px] font-bold text-white"><Square size={12} /> Dừng</button>}
          </div>
        </div>
        <div className="mt-1 text-[11.5px] text-slate-500">
          Từ <b>{dt(session.startAt)}</b>{session.stoppedAt ? <> đến <b>{dt(session.stoppedAt)}</b></> : <> · đã chạy {ago(session.startAt)}</>} · {cfg.coins.map((x) => x + "USDT").join(", ")} · {cfg.tfs.map((x) => TFS[x].label).join(" ")} · rủi ro {cfg.riskPct}%/lệnh · tối đa {cfg.maxOpen} lệnh{cfg.htfFilter ? " · thuận khung lớn" : ""}{cfg.maxFeeR > 0 ? ` · bỏ lệnh phí > ${cfg.maxFeeR}R` : ""} · vào lệnh chờ{cfg.maxExtAtr > 0 ? ` · không đuổi >${cfg.maxExtAtr} ATR` : ""}{cfg.minSlAtr > 0 ? ` · SL ≥${cfg.minSlAtr} ATR` : ""}{cfg.keyVolume > 0 ? ` · tại Key Volume${cfg.keyVolume > 1 ? ` top ${cfg.keyVolume}` : ""}` : ""}{cfg.sigVol ? " · nến tín hiệu vol > TB20" : ""}{cfg.noEngulf ? " · không đuổi sau engulfing" : ""} · bias {cfg.tfs.map((x) => `${TFS[x].label}→${TFS[TFS[x].htf].label}`).join(", ")}{cfg.d1Bias ? " + D1" : ""} · R:R ≥ 1:{String(MIN_RR).replace(".", ",")}{cfg.adaptive ? ` · tối ưu ${cfg.lookback} lệnh/thận trọng ${cfg.confK}${cfg.tfGate ? "/nghỉ khung lỗ" : ""}` : ""}
          {busy && <span className="ml-1 inline-flex items-center gap-1 text-indigo-600"><Loader2 size={11} className="animate-spin" />{busy}</span>}
          {res && !busy && <span className="text-slate-400"> · bot xét nến lúc {dt(res.at)}</span>}
        </div>
        {active && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-2">
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><span className={`h-2 w-2 rounded-full ${st[0]}`} /><Radio size={12} /> {st[1]}</span>
            {cfg.coins.map((c) => { const s = shown.current[c], fresh = s && Date.now() - s.at < 1500; return (
              <span key={c} className={`rounded-md px-1.5 py-0.5 text-[12.5px] font-extrabold tabular-nums transition-colors duration-500 ${fresh ? (s.dir > 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700") : "text-slate-800"}`}>
                <span className="mr-1 text-[10.5px] font-bold text-slate-400">{c}</span>{s ? px(s.c) : "…"}{s?.dir ? <span className={s.dir > 0 ? "text-emerald-500" : "text-rose-500"}>{s.dir > 0 ? " ▲" : " ▼"}</span> : null}
              </span>
            ); })}
          </div>
        )}
        {toast && <div className={`mt-2 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] font-bold ${toast.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}><Bell size={14} className="shrink-0" /> {toast.text}{toast.more ? <span className="font-normal opacity-70"> (+{toast.more} sự kiện)</span> : null}<span className="ml-auto text-[11px] font-normal opacity-60">{hm(toast.at)}</span></div>}
        {err && <div className="mt-2 rounded-lg bg-rose-50 p-2 text-[12px] text-rose-600">{err}</div>}
      </Card>

      {!res ? <Card><div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400"><Loader2 size={16} className="animate-spin" /> {busy || "Đang chạy lại dữ liệu…"}</div></Card> : (<>
        {cfg.adaptive && (
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {[["auto", "Bot tự tối ưu", Brain], ["base", "Luật gốc (cố định)", Bot]].map(([k, l, I]) => <button key={k} onClick={() => { setView(k); setShowN(40); if (k === "base" && filter === "reject") setFilter("all"); }} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12.5px] font-bold ${view === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}><I size={14} /> {l}</button>)}
          </div>
        )}

        <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4 xl:grid-cols-8">
          <Num label="Vốn hiện tại" v={usd(eqNow)} sub={`vốn đầu ${usd(cfg.capital, 0)}${open.length ? ` · ${open.length} lệnh mở` : ""}`} />
          <Num label="Lãi / lỗ" v={usd(pnl)} sub={`${pct((pnl / cfg.capital) * 100)}${P.unrealized ? ` · tạm tính ${usd(P.unrealized)}` : ""}`} tone={tone(pnl)} />
          <Num label="Tỉ lệ thắng" v={all.winRate != null ? `${all.winRate.toFixed(1)}%` : "—"} sub={`${all.wins} thắng · ${all.losses} thua · ${all.bes} hoà`} />
          <Num label="Lệnh đã đóng" v={all.n} sub={`${P.trades.filter((t) => t.status === "skip").length} bị danh mục bỏ`} />
          <Num label="R TB / lệnh" v={rr(all.avgR)} sub="kỳ vọng, đã trừ phí" tone={tone(all.avgR)} />
          <Num label="Profit factor" v={all.pf == null ? "—" : all.pf === Infinity ? "∞" : all.pf.toFixed(2)} sub=">1 là có lãi" tone={all.pf >= 1 ? "text-emerald-600" : "text-rose-600"} />
          <Num label="Sụt vốn lớn nhất" v={`${P.maxDD.toFixed(1)}%`} sub={usd(-P.maxDDUsd)} tone={P.maxDD > 20 ? "text-rose-600" : "text-slate-900"} />
          <Num label="Chuỗi thua dài nhất" v={all.worstStreak} sub={`thắng liền nhiều nhất ${all.bestStreak}`} />
          <Num label="Kỳ vọng / lệnh ($)" v={usd(expUsd)} sub="lãi/lỗ TB mỗi lệnh" tone={tone(expUsd)} />
          <Num label="Thắng TB / Thua TB" v={<>{rr(all.avgWin)} <span className="text-slate-300">/</span> <span className="text-rose-600">{rr(all.avgLoss)}</span></>} sub={`payoff ${f2(all.payoff)} · lớn nhất ${rr(all.maxWin)}`} />
          <Num label="SQN (chất lượng hệ)" v={f2(all.sqn)} sub="<1.6 kém · 2–3 tốt" tone={all.sqn >= 1.6 ? "text-emerald-600" : all.sqn != null ? "text-rose-600" : undefined} />
          <Num label="Phí đã trả" v={usd(P.fees)} sub={`TB ${f2(all.feeR)}R / lệnh`} />
          <Num label="Recovery factor" v={f2(recovery)} sub="lãi ròng ÷ sụt vốn, >2 tốt" tone={tone(recovery)} />
          <Num label="Giữ lệnh TB" v={all.holdH == null ? "—" : all.holdH >= 24 ? `${(all.holdH / 24).toFixed(1)} ngày` : `${all.holdH.toFixed(1)} giờ`} sub={Object.entries(all.reasons).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"} />
          <Num label="Long / Short" v={<><span className={tone(longS.avgR)}>{longS.winRate?.toFixed(0) ?? "—"}%</span> <span className="text-slate-300">/</span> <span className={tone(shortS.avgR)}>{shortS.winRate?.toFixed(0) ?? "—"}%</span></>} sub={`${longS.n} long ${rr(longS.avgR)} · ${shortS.n} short ${rr(shortS.avgR)}`} />
          <Num label="Lệnh thua từng lời" v={rr(all.mfeLoss)} sub={`TB trước khi quay đầu · lệnh thắng từng âm ${rr(all.maeWin == null ? null : -all.maeWin)}`} />
        </div>

        <div className="grid gap-3 xl:grid-cols-3">
          <Card className="!p-3 xl:col-span-2">
            <Title right={<span className="text-[11px] text-slate-400">vốn đầu {usd(cfg.capital, 0)}</span>}>Đường vốn{active ? " · nhảy theo giá realtime" : ""}</Title>
            <div className="h-60">
              <ResponsiveContainer>
                <LineChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(t) => dt(t).slice(0, 5)} tick={{ fontSize: 10 }} minTickGap={30} allowDuplicatedCategory={false} />
                  <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} width={50} />
                  <Tooltip formatter={(v) => usd(v)} labelFormatter={(t) => dt(t)} />
                  <ReferenceLine y={cfg.capital} stroke="#94a3b8" strokeDasharray="4 4" />
                  {cfg.adaptive && <Legend wrapperStyle={{ fontSize: 11 }} />}
                  {cfg.adaptive && <Line data={curveB} dataKey="eq" name="Luật gốc" stroke="#94a3b8" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
                  <Line data={cfg.adaptive ? curveA : curveB} dataKey="eq" name={cfg.adaptive ? "Tự tối ưu" : "Vốn"} stroke={cfg.adaptive ? "#8b5cf6" : pnl >= 0 ? "#10b981" : "#f43f5e"} strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {P.days.length > 1 && (<>
              <div className="mt-2 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Lãi/lỗ theo ngày · {P.days.filter((d) => d.v > 0).length}/{P.days.length} ngày lãi</div>
              <div className="h-24">
                <ResponsiveContainer>
                  <BarChart data={P.days}>
                    <XAxis dataKey="d" tickFormatter={(d) => d.slice(8, 10) + "/" + d.slice(5, 7)} tick={{ fontSize: 9 }} minTickGap={20} />
                    <Tooltip formatter={(v) => usd(v)} />
                    <ReferenceLine y={0} stroke="#cbd5e1" />
                    <Bar dataKey="v" name="Lãi/lỗ" isAnimationActive={false}>{P.days.map((d) => <Cell key={d.d} fill={d.v >= 0 ? "#10b981" : "#f43f5e"} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>)}
          </Card>
          <Card className="!p-3">
            <Title icon={Activity}>Hoạt động gần đây</Title>
            <div className="space-y-1">{feed.length ? feed.map((e, i) => { const t = e.tr, fresh = Date.now() - e.t < 15 * 60000; return (
              <div key={i} className={`flex items-center gap-2 rounded-md px-1.5 py-1 text-[12px] ${fresh ? "bg-amber-50" : ""}`}>
                <span className="w-[74px] shrink-0 tabular-nums text-[11px] text-slate-400">{dt(e.t)}</span>
                {e.kind === "open" ? <span className="min-w-0 truncate">{side(t.side)} <b>{t.coin} {TFS[t.tf].label}</b> <span className="text-slate-500">@ {px(t.entry)}</span></span>
                  : <span className="min-w-0 truncate"><span className="font-bold text-slate-600">Đóng</span> <b>{t.coin} {TFS[t.tf].label}</b> <span className="text-slate-500">{t.reason}</span></span>}
                {e.kind === "close" && <span className={`ml-auto shrink-0 font-extrabold tabular-nums ${tone(t.pnl)}`}>{usd(t.pnl)}</span>}
              </div>
            ); }) : <div className="text-[12px] text-slate-400">Chưa có lệnh.</div>}</div>
          </Card>
        </div>

        {open.length > 0 && (
          <Card className="!p-3">
            <Title right={active && status === "live" ? <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />giá realtime</span> : null}>Lệnh đang mở ({open.length})</Title>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{open.map((t) => {
              const pos = Math.min(1, Math.max(0, (t.last - t.curSl) / (t.tp - t.curSl))), toTp = ((t.tp - t.last) / t.last) * 100 * t.side, toSl = ((t.last - t.curSl) / t.last) * 100 * t.side;
              return (
                <div key={t.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5 text-[12px]">
                  <div className="flex items-center gap-2">{side(t.side)}<b>{t.coin} {TFS[t.tf].label}</b><span className="truncate text-slate-400">{setupName(t.setup)}</span><span className={`ml-auto text-[14px] font-extrabold tabular-nums ${tone(t.pnl)}`}>{usd(t.pnl)}</span></div>
                  <div className="mt-1 flex justify-between tabular-nums text-slate-500"><span>Vào {px(t.entry)}</span><span className="font-bold text-slate-800">Giá {px(t.last)}</span><span className={`font-bold ${tone(t.uR)}`}>{rr(t.uR)}</span></div>
                  <div className="relative mt-1.5 h-1.5 rounded-full bg-gradient-to-r from-rose-300 via-slate-200 to-emerald-300"><span className="absolute -top-1 h-3.5 w-1 -translate-x-1/2 rounded bg-slate-800 transition-all duration-700" style={{ left: `${pos * 100}%` }} /></div>
                  <div className="mt-1 flex justify-between text-[11px] tabular-nums"><span className="text-rose-500">SL {px(t.curSl)}{t.be ? " (hoà vốn)" : ""} · còn {toSl.toFixed(2)}%</span><span className="text-emerald-600">TP {px(t.tp)} · còn {toTp.toFixed(2)}%</span></div>
                  <div className="mt-1 text-[11px] text-slate-400">Mở {dt(t.entryAt)} · vị thế {usd(t.notional, 0)} ({t.lev.toFixed(1)}x vốn) · rủi ro {usd(t.riskUsd)}{t.score ? ` · ${t.score.variant}` : ""}</div>
                </div>
              );
            })}</div>
          </Card>
        )}

        {res.pending?.length > 0 && active && (
          <Card className="!p-3">
            <Title>Lệnh chờ đang đặt ({res.pending.length}) · khớp khi giá xuyên qua, hết hạn thì huỷ</Title>
            <div className="space-y-1">{res.pending.map((p) => { const cur = live.current[`px|${p.coin}`], d = cur ? ((cur - p.lim) / p.lim) * 100 * p.side : null; return (
              <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg bg-amber-50/70 px-2.5 py-1.5 text-[12px]">
                {side(p.side)}<b>{p.coin} {TFS[p.tf].label}</b><span className="text-slate-500">{setupName(p.setup)}</span>
                <span className="tabular-nums">Chờ ở <b>{px(p.lim)}</b> · SL {px(p.sl)}</span>
                {d != null && <span className="tabular-nums text-slate-500">giá {px(cur)} · còn cách {Math.max(0, d).toFixed(2)}%</span>}
                <span className="ml-auto text-[11px] text-slate-400">huỷ lúc {dt(p.until)}</span>
              </div>
            ); })}</div>
          </Card>
        )}

        {rawOld && (() => {
          const o = finalize(rawOld, null), so = statsOf(o.baseTrades), sb = statsOf(res.baseTrades), sa = statsOf(res.trades);
          const cols = [["Bot (luật mới + tối ưu)", sa, res.portfolio, "text-violet-700"], ["Luật mới (cố định)", sb, res.basePortfolio, "text-emerald-700"], ["Bản cũ (chưa lọc vào đẹp)", so, o.basePortfolio, "text-slate-500"]].filter((c, i) => i || cfg.adaptive);
          return (
            <Card className="!p-3">
              <Title icon={Activity}>Luật vào đẹp có hiệu quả không? (cùng phiên, cùng dữ liệu)</Title>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-[12px]">
                  <thead><tr className="border-b border-slate-100 text-left text-[10px] uppercase text-slate-400"><th className="py-1.5 pr-2" />{cols.map(([l, , , c]) => <th key={l} className={`py-1.5 pr-2 text-right ${c}`}>{l}</th>)}</tr></thead>
                  <tbody>{[
                    ["Lệnh đã đóng", (s) => s.n], ["Tỉ lệ thắng", (s) => (s.winRate == null ? "—" : `${s.winRate.toFixed(1)}%`)], ["R TB / lệnh", (s) => rr(s.avgR)], ["Profit factor", (s) => (s.pf === Infinity ? "∞" : f2(s.pf))],
                    ["Vốn", (s, P) => usd(P.equity + P.unrealized, 0)], ["Sụt vốn lớn nhất", (s, P) => `${P.maxDD.toFixed(1)}%`],
                  ].map(([l, f]) => <tr key={l} className="border-b border-slate-50"><td className="py-1.5 pr-2 font-bold text-slate-600">{l}</td>{cols.map(([k, s, P, c]) => <td key={k} className={`py-1.5 pr-2 text-right font-bold tabular-nums ${c}`}>{f(s, P)}</td>)}</tr>)}</tbody>
                </table>
              </div>
              <div className="mt-1.5 text-[11px] text-slate-400">Bản cũ = cùng tín hiệu, cùng lệnh chờ nhưng không kiểm tra đuổi giá / SL sát / Key Volume / volume nến tín hiệu / engulfing. {Object.entries(res.skipped).filter(([k]) => /đuổi|sát|không về|volume|engulf|D1/i.test(k)).map(([k, v]) => `${v} tín hiệu bị bỏ vì ${k}`).join(" · ")}</div>
            </Card>
          );
        })()}

        {cfg.adaptive && cfg.learnLoss && (
          <Card className="!p-3">
            <Title icon={Brain}>Rút kinh nghiệm từ lệnh thua</Title>
            {(() => {
              const m = res.metaNow || {}, line = (x, name) => !x ? null : x.mb == null
                ? <div className="text-[12px] text-slate-500">• {name}: <b>đang thu thập</b> ({x.b || 0} tín hiệu bị chặn, cần ≥ {cfg.lessonMin} để kiểm chứng)</div>
                : <div className={`text-[12px] ${x.ok ? "text-emerald-700" : "text-amber-700"}`}>• {name}: <b>{x.ok ? "ĐANG ÁP DỤNG" : "CHỈ QUAN SÁT"}</b> — tín hiệu bị chặn TB <b>{rr(x.mb)}</b> so với tín hiệu được vào <b>{rr(x.mk)}</b> ({x.b} lệnh gần nhất){x.ok ? " → chặn đúng, giúp giảm lỗ." : " → chặn chưa đúng (lệnh bị chặn lại tốt hơn), nên chưa dùng để chặn."}</div>;
              return <div className="space-y-1 rounded-lg bg-slate-50 p-2.5">{line(m.lesson, "Bài học từ lệnh thua")}{line(m.opt, "Bộ tối ưu (tắt ô / nghỉ khung)")}
                <div className="text-[11px] text-slate-400">Mỗi lệnh thua, hệ thống xem đặc điểm của lệnh (ADX, biến động, khoảng cách EMA50, độ rộng SL, phiên, hướng, độ dốc EMA50, thân nến…). Đặc điểm nào {cfg.lessonN} lệnh gần nhất thua rõ (≤ −0,2R) thành bài học. Bài học chỉ được dùng để chặn khi chính nó chứng minh được là đúng.</div></div>;
            })()}
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Bài học hiện có ({res.lessonsActive.length})</div>
                {res.lessonsActive.length ? <div className="space-y-0.5">{res.lessonsActive.map((l) => <div key={l.k} className="flex items-center gap-2 text-[12px]"><span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{l.label}</span><span className="shrink-0 tabular-nums text-slate-400">{l.n} lệnh · thắng {l.win?.toFixed(0)}%</span><span className={`shrink-0 font-bold tabular-nums ${tone(l.exp)}`}>{rr(l.exp)}</span></div>)}</div> : <div className="text-[12px] text-slate-400">Chưa có đặc điểm nào thua rõ rệt.</div>}
              </div>
              <div>
                <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Nhật ký học ({res.lessons.length})</div>
                <div className="max-h-44 space-y-0.5 overflow-y-auto">{[...res.lessons].reverse().slice(0, 40).map((l, i) => (
                  <div key={i} className="text-[11.5px] leading-snug"><span className="tabular-nums text-slate-400">{dt(l.t)}</span> <b className={l.on ? "text-rose-700" : "text-emerald-700"}>{l.on ? "Học" : "Gỡ"}</b> {l.label} <span className="text-slate-400">({l.n} lệnh, {rr(l.exp)}){l.from ? ` · từ lệnh thua ${l.from}` : ""}</span></div>
                ))}</div>
              </div>
            </div>
          </Card>
        )}

        <Card className="!p-3">
          <Title icon={Activity}>So sánh khung giờ — khung nào hiệu quả nhất</Title>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12px]">
              <thead><tr className="border-b border-slate-100 text-left text-[10px] uppercase text-slate-400">
                <th className="py-1.5 pr-2">Khung</th><th className="py-1.5 pr-2 text-right">Lệnh (gốc)</th><th className="py-1.5 pr-2 text-right">Thắng</th><th className="py-1.5 pr-2 text-right">R TB</th><th className="py-1.5 pr-2 text-right">PF</th><th className="py-1.5 pr-2 text-right">Phí TB</th><th className="py-1.5 pr-2 text-right">Lãi/lỗ gốc</th>{cfg.adaptive && <><th className="py-1.5 pr-2 text-right text-violet-600">Tự tối ưu</th><th className="py-1.5">Bot hiện tại</th></>}
              </tr></thead>
              <tbody>{(() => {
                const rows = cfg.tfs.map((tf) => ({ tf, b: statsOf(res.baseTrades.filter((t) => t.tf === tf)), a: statsOf(res.trades.filter((t) => t.tf === tf)), usdB: res.basePortfolio.trades.filter((t) => t.tf === tf && t.status !== "skip").reduce((x, t) => x + t.pnl, 0), usdA: res.portfolio.trades.filter((t) => t.tf === tf && t.status !== "skip").reduce((x, t) => x + t.pnl, 0), st: res.tfState?.find((x) => x.tf === tf) }));
                const best = rows.filter((r) => r.b.n >= 10).sort((x, y) => y.b.avgR - x.b.avgR)[0]?.tf;
                return rows.map(({ tf, b, a, usdB, usdA, st }) => (
                  <tr key={tf} className={`border-b border-slate-50 ${tf === best ? "bg-emerald-50/60" : ""}`}>
                    <td className="py-1.5 pr-2 font-extrabold text-slate-800">{TFS[tf].label}{tf === best ? " 🏆" : ""}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{b.n}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{b.winRate == null ? "—" : `${b.winRate.toFixed(0)}%`}</td>
                    <td className={`py-1.5 pr-2 text-right font-bold tabular-nums ${tone(b.avgR)}`}>{rr(b.avgR)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{b.pf === Infinity ? "∞" : f2(b.pf)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">{f2(b.feeR)}R</td>
                    <td className={`py-1.5 pr-2 text-right font-bold tabular-nums ${tone(usdB)}`}>{usd(usdB, 0)}</td>
                    {cfg.adaptive && <><td className={`py-1.5 pr-2 text-right font-bold tabular-nums ${a.n ? tone(usdA) : "text-slate-400"}`}>{a.n ? <>{usd(usdA, 0)} <span className="font-normal text-slate-400">· {a.n} lệnh</span></> : "không vào"}</td>
                      <td className="py-1.5 text-[11px]">{st?.pause ? <span className="font-bold text-rose-600">Tạm nghỉ (khung đang {rr(st.exp)})</span> : st?.exp != null ? <span className="font-bold text-emerald-700">Đang đánh ({rr(st.exp)})</span> : <span className="text-slate-400">đang học</span>}</td></>}
                  </tr>
                ));
              })()}</tbody>
            </table>
          </div>
          <div className="mt-1.5 text-[11px] leading-snug text-slate-400">Lãi/lỗ gốc = mọi tín hiệu của khung theo luật gốc trong danh mục. "Bot hiện tại" = kỳ vọng {cfg.lookback * 3} lệnh gần nhất của cả khung; âm thì bot tự nghỉ khung đó tới khi hồi lại.</div>
        </Card>

        {cfg.adaptive && (
          <div className="grid gap-3 xl:grid-cols-3">
            <Card className="!p-3">
              <Title icon={Brain}>Tự tối ưu so với Luật gốc</Title>
              <table className="w-full text-[12px]">
                <thead><tr className="border-b border-slate-100 text-left text-[10px] uppercase text-slate-400"><th className="py-1.5 pr-2" /><th className="py-1.5 pr-2 text-right text-violet-600">Tự tối ưu</th><th className="py-1.5 pr-2 text-right">Luật gốc</th><th className="py-1.5 text-right">Bị loại*</th></tr></thead>
                <tbody>{[
                  ["Lệnh", (s) => s.n], ["Tỉ lệ thắng", (s) => (s.winRate == null ? "—" : `${s.winRate.toFixed(0)}%`)], ["R TB", (s) => rr(s.avgR), true], ["Profit factor", (s) => (s.pf === Infinity ? "∞" : f2(s.pf))], ["Tổng R", (s) => s.totalR.toFixed(1), true],
                ].map(([l, f, col]) => (
                  <tr key={l} className="border-b border-slate-50">
                    <td className="py-1.5 pr-2 font-bold text-slate-600">{l}</td>
                    {[sAuto, sBase, sRej].map((s, i) => <td key={i} className={`py-1.5 pr-2 text-right font-bold tabular-nums ${col ? tone(s.avgR) : i === 0 ? "text-violet-700" : "text-slate-700"}`}>{f(s)}</td>)}
                  </tr>
                ))}
                  <tr className="border-b border-slate-50"><td className="py-1.5 pr-2 font-bold text-slate-600">Vốn / sụt vốn</td><td className="py-1.5 pr-2 text-right tabular-nums text-violet-700">{usd(res.portfolio.equity + res.portfolio.unrealized, 0)} / {res.portfolio.maxDD.toFixed(0)}%</td><td className="py-1.5 pr-2 text-right tabular-nums">{usd(res.basePortfolio.equity + res.basePortfolio.unrealized, 0)} / {res.basePortfolio.maxDD.toFixed(0)}%</td><td /></tr>
                </tbody>
              </table>
              <div className="mt-2 space-y-1 text-[11.5px] leading-snug text-slate-500">
                <div>* Bị loại = tín hiệu bộ tối ưu bỏ qua, tính <b>nếu vẫn vào</b> theo luật gốc.</div>
                {sRej.n >= 10 && sAuto.n >= 10 && <div className={`font-bold ${sRej.avgR < sAuto.avgR ? "text-emerald-700" : "text-rose-700"}`}>{sRej.avgR < sAuto.avgR ? `✓ Bộ tối ưu loại đúng: tín hiệu bị bỏ TB ${rr(sRej.avgR)} < lệnh được vào ${rr(sAuto.avgR)}.` : `✗ Bộ tối ưu đang loại nhầm: tín hiệu bị bỏ TB ${rr(sRej.avgR)} ≥ lệnh được vào ${rr(sAuto.avgR)} — đang bám nhiễu, cần thêm dữ liệu.`}</div>}
                <div>Học thêm {res.learned} tín hiệu trong {cfg.warmupDays} ngày trước ngày bắt đầu · hiện bật {optOn} ô, tắt {optOff} ô.</div>
              </div>
            </Card>
            <Card className="!p-3 xl:col-span-2">
              <Title icon={Brain} right={<button onClick={() => setOptAll((v) => !v)} className="text-[11px] font-bold text-indigo-600">{optAll ? "Thu gọn" : `Xem tất cả (${res.optState.length})`}</button>}>Bộ tối ưu đang quyết định</Title>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-[12px]">
                  <thead><tr className="border-b border-slate-100 text-left text-[10px] uppercase text-slate-400"><th className="py-1.5 pr-2">Cặp · khung · setup</th><th className="py-1.5 pr-2">Trạng thái</th><th className="py-1.5 pr-2">Cấu hình chọn</th><th className="py-1.5 pr-2 text-right">Kỳ vọng</th><th className="py-1.5 pr-2 text-right">Thắng</th><th className="py-1.5 pr-2 text-right">Mẫu</th><th className="py-1.5">Học từ</th></tr></thead>
                  <tbody>{(optAll ? res.optState : res.optState.slice(0, 10)).map((o) => (
                    <tr key={o.cell} className="border-b border-slate-50">
                      <td className="py-1.5 pr-2"><b>{o.coin}</b> {TFS[o.tf].label} <span className="text-slate-500">{setupName(o.setup)}</span></td>
                      <td className="py-1.5 pr-2">{o.level < 0 ? <Badge tone="slate">Đang học</Badge> : o.take ? <Badge tone="emerald">Bật</Badge> : <Badge tone="rose">Tắt</Badge>}</td>
                      <td className="py-1.5 pr-2 text-slate-600">{o.level < 0 ? "gốc" : o.variant}</td>
                      <td className={`py-1.5 pr-2 text-right font-bold tabular-nums ${tone(o.exp)}`}>{o.exp == null ? "—" : rr(o.exp)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{o.win == null ? "—" : `${o.win.toFixed(0)}%`}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{o.n}</td>
                      <td className="py-1.5 text-[11px] text-slate-400">{o.level < 0 ? `cần ≥ ${cfg.minSample} lệnh` : LEVELS[o.level]}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {res.optLog.length > 0 && (<>
                <div className="mt-3 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Nhật ký tối ưu ({res.optLog.length} lần điều chỉnh)</div>
                <div className="mt-1 max-h-48 space-y-0.5 overflow-y-auto">{[...res.optLog].reverse().slice(0, 40).map((e, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-x-2 text-[11.5px]">
                    <span className="tabular-nums text-slate-400">{dt(e.t)}</span>
                    <b>{e.coin} {TFS[e.tf].label} {setupName(e.setup)}</b>
                    {e.take ? <span className="font-bold text-emerald-700">{e.prevOn === false ? "Bật lại" : e.first ? "Bật" : "Đổi"} → {e.level < 0 ? "luật gốc (chưa đủ mẫu)" : e.variant}</span> : <span className="font-bold text-rose-700">Tắt</span>}
                    {e.exp != null && <span className="text-slate-400">kỳ vọng {rr(e.exp)} / {e.n} lệnh · {LEVELS[e.level]}</span>}
                  </div>
                ))}</div>
              </>)}
            </Card>
          </div>
        )}

        <Card className="!p-3">
          <Title icon={Info}>Nhận xét tự động · {isBase ? "luật gốc" : "bot tự tối ưu"}</Title>
          <div className="grid gap-x-6 gap-y-1.5 text-[12px] leading-snug text-slate-600 md:grid-cols-2">
            {all.n < 100 && <div>• Mới {all.n} lệnh đã đóng — cần ≥ 100 lệnh để tỉ lệ thắng đáng tin.</div>}
            <div>• Hoà vốn ở R:R 2 cần thắng ≥ <b>33%</b>, R:R 3 cần ≥ <b>25%</b>; hiện {all.winRate?.toFixed(0) ?? "—"}% với payoff {f2(all.payoff)}.</div>
            <div>• Phí + trượt giá ăn TB <b>{f2(all.feeR)}R</b>/lệnh{all.feeR > 0.2 ? " — lớn (SL sát ở khung nhỏ), nên ưu tiên H1/H4." : "."}</div>
            {all.mfeLoss != null && <div>• Lệnh thua từng lời TB <b>{rr(all.mfeLoss)}</b> trước khi quay đầu{all.mfeLoss >= 0.8 ? " — nhiều lệnh đã gần đúng hướng, chốt sớm/dời hoà vốn sớm có thể cứu." : " — phần lớn sai hướng ngay từ đầu, cần lọc điểm vào chặt hơn."}</div>}
            {(() => { const segs = [...by("tf", cfg.tfs, (x) => TFS[x].label), ...by("setup", cfg.setups, setupName), ...by("coin", cfg.coins)].filter(([, s]) => s.n >= 10).sort((a, b) => b[1].avgR - a[1].avgR); return segs.length ? <><div>• Tốt nhất: <b className="text-emerald-700">{segs[0][0]}</b> ({rr(segs[0][1].avgR)}/lệnh, {segs[0][1].n} lệnh)</div><div>• Kém nhất: <b className="text-rose-700">{segs[segs.length - 1][0]}</b> ({rr(segs[segs.length - 1][1].avgR)}/lệnh)</div></> : null; })()}
            {Object.keys(res.skipped).length > 0 && <div className="text-slate-400">• Luật bỏ qua: {Object.entries(res.skipped).map(([k, v]) => `${v} tín hiệu ${k.toLowerCase()}`).join(", ")}.</div>}
          </div>
        </Card>

        <Card className="!p-3">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatTable title="Theo setup" rows={by("setup", cfg.setups, setupName)} />
            <StatTable title="Theo cặp" rows={by("coin", cfg.coins)} />
            <StatTable title="Theo khung giờ" rows={by("tf", cfg.tfs, (x) => TFS[x].label)} />
            <StatTable title="Theo hướng" rows={[["Long", longS], ["Short", shortS]]} />
          </div>
        </Card>

        <Card className="!p-3">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Nhật ký lệnh</span>
            {[["all", "Đã vào"], ["win", "Thắng"], ["loss", "Thua"], ["open", "Đang mở"], ["skip", "Bị bỏ (danh mục)"], ...(cfg.adaptive && !isBase ? [["reject", "Bị tối ưu loại"]] : [])].map(([k, l]) => <button key={k} onClick={() => { setFilter(k); setShowN(40); }} className={`rounded-md px-2 py-1 text-[11px] font-bold ${filter === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`}>{l}</button>)}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-[12px]">
              <thead><tr className="border-b border-slate-100 text-left text-[10px] uppercase tracking-wide text-slate-400">
                <th className="py-1.5 pr-2">Vào lúc</th><th className="py-1.5 pr-2">Cặp</th><th className="py-1.5 pr-2">Setup</th><th className="py-1.5 pr-2 text-right">Vào</th><th className="py-1.5 pr-2 text-right">SL</th><th className="py-1.5 pr-2 text-right">TP</th><th className="py-1.5 pr-2">Kết thúc</th><th className="py-1.5 pr-2 text-right">R</th><th className="py-1.5 pr-2 text-right">Lãi/lỗ</th><th className="py-1.5">Rút kinh nghiệm / tối ưu</th>
              </tr></thead>
              <tbody>{taken.slice(0, showN).map((t) => (
                <tr key={t.id} className={`border-b border-slate-50 ${t.liveExit ? "bg-amber-50/60" : ""}`}>
                  <td className="py-1.5 pr-2 tabular-nums text-slate-500">{dt(t.entryAt)}</td>
                  <td className="py-1.5 pr-2"><span className={`mr-1 font-extrabold ${t.side === 1 ? "text-emerald-600" : "text-rose-600"}`}>{t.side === 1 ? "▲" : "▼"}</span><b>{t.coin}</b> <span className="text-slate-400">{TFS[t.tf].label}</span></td>
                  <td className="py-1.5 pr-2 text-slate-600" title={t.note}>{setupName(t.setup)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{px(t.entry)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-rose-500">{px(t.sl)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-emerald-600">{px(t.tp)}</td>
                  <td className="py-1.5 pr-2 text-slate-500">{t.status === "skip" ? <span className="text-slate-400">bỏ: {t.why}</span> : t.status === "reject" ? <span className="text-slate-400">loại · nếu vào: {t.reason}</span> : <>{t.reason}{t.liveExit ? <span className="font-bold text-amber-600"> · realtime</span> : ""}{t.exitAt ? <span className="text-slate-400"> · {dt(t.exitAt)}</span> : ""}</>}</td>
                  <td className={`py-1.5 pr-2 text-right font-bold tabular-nums ${t.status === "reject" ? "text-slate-400" : tone(t.r ?? t.uR)}`}>{rr(t.r ?? t.uR)}</td>
                  <td className={`py-1.5 pr-2 text-right font-bold tabular-nums ${tone(t.pnl)}`}>{t.status === "skip" || t.status === "reject" ? "—" : usd(t.pnl)}</td>
                  <td className="max-w-[320px] py-1.5 text-[11px] leading-snug text-slate-400">{t.lesson ? <span className="text-rose-700/80">{t.lesson}</span> : t.score ? (t.score.level < 0 ? "chưa đủ mẫu" : <><span className={tone(t.score.exp)}>{rr(t.score.exp)}</span>/{t.score.n} · {t.score.variant}</>) : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {taken.length > showN && <button onClick={() => setShowN((n) => n + 100)} className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-slate-50 py-2 text-[12px] font-bold text-slate-500"><ChevronDown size={14} /> Xem thêm ({taken.length - showN})</button>}
        </Card>

        <div className="flex items-start gap-2 px-3 text-[11px] leading-snug text-slate-400 sm:px-0">
          <ShieldAlert size={13} className="mt-0.5 shrink-0" />
          <span>Lệnh ẢO trên dữ liệu thật Binance Futures — không đặt lệnh thật, khoá Binance vẫn chỉ đọc. Luật: chỉ nến đã đóng mới ra tín hiệu, chỉ vào lệnh chờ ở giá đóng nến tín hiệu (khớp khi giá xuyên qua, hết hạn thì huỷ), không đuổi giá, SL ngoài vùng nhiễu, SL &amp; TP cùng chạm 1 nến tính THUA, bỏ lệnh SL &gt; 4 ATR hoặc SL quá sát, có phí + trượt giá. Lệnh mở theo giá realtime: chạm SL/TP là đóng ngay. Bộ tự tối ưu chỉ học từ lệnh đã đóng trước thời điểm quyết định. Kết quả quá khứ không đảm bảo tương lai — chỉ để kiểm tra phương pháp, không phải tư vấn đầu tư.</span>
        </div>
      </>)}
    </div>
  );
}
