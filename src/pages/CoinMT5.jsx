import { useEffect, useMemo, useState } from "react";
import { Cpu, Square, Play, Loader2, Server, ListChecks, BarChart3, GitCompare, ScrollText, ChevronDown, ShieldAlert } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Card } from "../components/ui.jsx";
import { supabase } from "../lib/supabase.js";
import { ask } from "../components/ConfirmDialog.jsx";
import { useData } from "../lib/store.jsx";
import { fmtUsd, fmtUsdSigned, fmtPx, fmtNum } from "../lib/format.js";
import PnlCalendar from "../components/PnlCalendar.jsx";
import { useUsdVnd } from "../lib/coinShared.js";

// 07/11/2026 — Tab "EA MT5" (chỉ chủ): theo dõi EA QWS_Gop chạy trong MT5 trên máy bàn (tài khoản demo IC Markets).
// Cầu nối C:\mt5-research\bridge\mt5_bridge.py ghi bảng Supabase qws_mt5_bot: 'status' (~30 giây), 'history' (lịch sử lệnh + đường vốn).
// App ghi dòng 'command' ({stop}) → cầu nối chuyển cho EA. App KHÔNG giao dịch.
// 21/11/2026: sếp thay QWS_Gop bằng EA Victor V5 nguyên bản (8 mã, 2,72% × hệ số mã, magic 5700–5735). Nhận biết qua status.ea.ea === "Victor V5";
// lệnh Victor có slot = -1, tên "V5 phá đỉnh XAUUSD"…; thống kê theo mã (sym). Lịch sử QWS cũ (slot 0–5) vẫn còn, tách riêng. Không có trường ea → hiển thị QWS_Gop như cũ.
const T = "qws_mt5_bot";
const SLOTS = ["D vàng", "D BTC", "D ETH", "US500 sốc", "Nikkei sốc", "Russell lệch"];
const SYMS = ["XAUUSD", "BTCUSD", "ETHUSD", "US500", "JP225", "US2000"];
const V_SYMS = ["XAUUSD", "XAGUSD", "XTIUSD", "USDJPY", "US500", "USTEC", "JP225", "US2000"];
const V_NAME = { XAUUSD: "Vàng", XAGUSD: "Bạc", XTIUSD: "Dầu", USDJPY: "Yên Nhật", US500: "S&P 500", USTEC: "Nasdaq", JP225: "Nikkei", US2000: "Russell" };
// Kết quả Strategy Tester 01/2018 → 11/2026, vốn 1.000$ (mt5-research/reports/von_1000.html, mục 0)
const BT = { cagr: 25.1, month: 2.03, mdd: 9.4, win: 57.4, perMonth: 6.6, pf: 2.0 };
// Victor luật gốc 2,72%, vốn 1.000$, 2018 → 20/11/2026 — mô phỏng Python (mt5-research/reports/victor_1k.html mục 01, 04, 05)
const BT_V = { mdd: 77.2, low: 297, win: 52, perMonth: 55 };
const isQws = (x) => x.slot >= 0;
const START_BAL = 1000;
const ago = (t) => { if (!t) return "—"; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "vừa xong" : m < 60 ? `${m} phút trước` : m < 2880 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`; };
const dt = (t) => { if (!t) return "—"; const d = new Date(t); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const tone = (v) => (v == null || !isFinite(v) ? "text-slate-900" : v >= 0 ? "text-emerald-600" : "text-rose-600");
const side = (s) => <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-extrabold text-white ${s === 1 ? "bg-emerald-500" : "bg-rose-500"}`}>{s === 1 ? "MUA" : "BÁN"}</span>;
const fmtR = (v) => (v == null || !isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${fmtNum(v, 2)}R`);
const Title = ({ icon: I, children, right }) => <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{I && <I size={13} className="text-indigo-500" />}{children}{right && <span className="ml-auto normal-case tracking-normal">{right}</span>}</div>;
const Num = ({ label, v, sub, t = "text-slate-900" }) => <div className="min-w-0 bg-white px-3 py-2.5"><div className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div><div className={`break-words text-lg font-extrabold leading-snug tabular-nums ${t}`}>{v}</div>{sub && <div className="break-words text-[11px] leading-snug text-slate-400">{sub}</div>}</div>;

async function writeCmd(patch) {
  const cur = await supabase.from(T).select("data").eq("id", "command").maybeSingle();
  if (cur.error) return { error: cur.error };
  const row = { id: "command", data: { ...(cur.data?.data || {}), ...patch, at: Date.now() }, updated_at: new Date().toISOString() };
  return supabase.from(T).upsert(row);
}

const grp = (g) => { const rs = g.map((x) => x.R).filter((r) => r != null && isFinite(r)); return { n: g.length, win: g.length ? (g.filter((x) => x.pnl > 0).length / g.length) * 100 : null, pnl: g.reduce((s, x) => s + (x.pnl || 0), 0), avgR: rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : null }; };
const total = (done) => {
  const n = done.length, wins = done.filter((x) => x.pnl > 0).length;
  const gp = done.filter((x) => x.pnl > 0).reduce((s, x) => s + x.pnl, 0), gl = -done.filter((x) => x.pnl < 0).reduce((s, x) => s + x.pnl, 0);
  return { n, win: n ? (wins / n) * 100 : null, pnl: done.reduce((s, x) => s + (x.pnl || 0), 0), pf: gl > 0 ? gp / gl : null };
};

// vSlots (status.ea.slots của Victor V5) → thống kê theo mã cho lệnh Victor (slot < 0); lịch sử QWS cũ gom vào `old`.
export function mt5Stats(trades = [], vSlots = null) {
  const done = trades.filter((x) => x.closed);
  if (vSlots) {
    const vic = done.filter((x) => !isQws(x));
    const syms = vSlots.length ? vSlots.map((s) => s.sym) : V_SYMS;
    const bySlot = syms.map((sym, k) => ({ k, sym, name: V_NAME[sym] || sym, ...grp(vic.filter((x) => x.sym === sym)) }));
    return { ...total(vic), bySlot, old: total(done.filter(isQws)) };
  }
  const bySlot = SLOTS.map((name, k) => ({ k, name, ...grp(done.filter((x) => x.slot === k)) }));
  return { ...total(done), bySlot };
}

export default function CoinMT5({ active }) {
  const { isOwner } = useData();
  const [st, setSt] = useState(null), [hist, setHist] = useState(null), [cmd, setCmd] = useState(null);
  const [missing, setMissing] = useState(false), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [note, setNote] = useState(""), [showLog, setShowLog] = useState(false), [loaded, setLoaded] = useState(false);
  const load = async () => {
    try {
      const { data, error } = await supabase.from(T).select("id,data,updated_at");
      if (error) { if (/qws_mt5_bot|relation|does not exist|schema cache/i.test(error.message)) setMissing(true); else setErr(error.message); return; }
      setMissing(false); setErr("");
      const row = (id) => (data || []).find((r) => r.id === id)?.data || null;
      setSt(row("status")); setHist(row("history")); setCmd(row("command")); setLoaded(true);
    } catch (e) { setErr(e.message || String(e)); }
  };
  useEffect(() => { if (!active) return undefined; load(); const t = setInterval(() => { if (!document.hidden) load(); }, 20000); return () => clearInterval(t); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!note) return undefined; const t = setTimeout(() => setNote(""), 12000); return () => clearTimeout(t); }, [note]);
  const trades = hist?.trades || [];
  const isV = st?.ea?.ea === "Victor V5";
  const vSlots = isV ? (st.ea.slots || []) : null;
  const vKey = vSlots ? vSlots.map((s) => s.sym).join(",") : "";
  const S = useMemo(() => mt5Stats(trades, vSlots), [trades, vKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const eq = useMemo(() => (hist?.equity || []).map((p) => ({ t: p.t, eq: p.eq, bal: p.bal })), [hist]);
  const vnd = useUsdVnd();
  // 13/11: lịch lãi/lỗ theo ngày đóng lệnh (t_out, ms), tách theo chiến lược — chỉ ĐỌC lịch sử cầu nối gửi lên.
  // 21/11: khoá nguồn "q<slot>" cho QWS cũ, "v:<mã>" cho Victor V5.
  const calItems = useMemo(() => trades.filter((x) => x.closed && x.t_out && x.pnl != null).map((x) => {
    const q = isQws(x);
    return { t: x.t_out < 1e12 ? x.t_out * 1000 : x.t_out, v: +x.pnl, src: q ? `q${x.slot}` : `v:${x.sym}`, label: `${x.side === 1 ? "MUA" : "BÁN"} ${x.sym || (q ? SYMS[x.slot] : "") || ""} · ${q ? `${isV ? "QWS " : ""}${SLOTS[x.slot] || ""}` : x.name || ""}` };
  }), [trades, isV]);
  const calSources = useMemo(() => {
    const vs = [...V_SYMS, ...new Set(trades.filter((x) => !isQws(x) && x.sym && !V_SYMS.includes(x.sym)).map((x) => x.sym))].map((s) => ({ k: `v:${s}`, l: `V5 ${V_NAME[s] || s}` }));
    const qs = SLOTS.map((l, k) => ({ k: `q${k}`, l: isV ? `QWS ${l}` : l }));
    return (isV ? [...vs, ...qs] : [...qs, ...vs]).filter((s) => calItems.some((x) => x.src === s.k));
  }, [calItems, trades, isV]);

  const setStop = async (stop) => {
    const ok = await ask(stop ? "Dừng EA MT5?\nEA huỷ lệnh CHỜ và không mở lệnh mới. Vị thế đang mở vẫn giữ nguyên SL/TP." : "Cho EA MT5 chạy lại?\nEA tiếp tục vào lệnh theo tín hiệu mới.", { ok: stop ? "Dừng EA" : "Chạy lại", danger: stop });
    if (!ok) return;
    setBusy(true);
    const { error } = await writeCmd({ stop });
    setBusy(false);
    if (error) setErr(error.message); else { setNote(stop ? "Đã gửi lệnh Dừng — EA áp dụng trong ~30–60 giây." : "Đã cho EA chạy lại."); load(); }
  };

  if (missing) return (
    <Card className="!p-4">
      <div className="flex items-center gap-2 text-[15px] font-extrabold text-slate-800"><Server size={17} className="text-indigo-500" /> EA MT5 chưa được kết nối</div>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-[12.5px] leading-snug text-slate-600">
        <li>Chạy file <b>supabase/SETUP-MT5-BOT.sql</b> (repo quang-workspace) ở Supabase → SQL Editor để tạo bảng <code>qws_mt5_bot</code>.</li>
        <li>Trên máy bàn: bấm <b>C:\mt5-research\bridge\cai-cau-noi.bat</b> (cầu nối tự chạy mỗi khi đăng nhập Windows).</li>
        <li>MT5 mở sẵn, EA <b>Victor V5</b> (VictorMT5v5_QWS) gắn trên chart, bật Algo Trading. Quay lại đây: trạng thái hiện trong ~30 giây.</li>
      </ol>
    </Card>
  );
  if (!loaded || !st) return <Card><div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400">{err ? <span className="text-rose-600">{err}</span> : loaded ? "Bảng đã có nhưng cầu nối chưa gửi trạng thái — kiểm tra cầu nối trên máy bàn (bridge.log)." : <><Loader2 size={16} className="animate-spin" /> Đang tải…</>}</div></Card>;

  const fresh = st.ts && Date.now() - st.ts < 150000;
  const online = fresh && st.online;
  const a = st.account || {}, ea = st.ea || {};
  const eaFresh = st.eaAgeS != null && st.eaAgeS < 180;
  const peak = ea.peak || a.balance, dd = peak ? (1 - a.balance / peak) * 100 : null;
  const stopped = ea.stop ?? cmd?.stop;
  const spanDays = (g) => (g.length ? Math.max(1, (Date.now() - Math.min(...g.map((x) => x.t_in))) / 864e5) : null);
  const days = spanDays(trades);
  const vTrades = isV ? trades.filter((x) => !isQws(x)) : trades;
  const rateDays = spanDays(vTrades); // số lệnh/tháng chỉ tính EA đang chạy
  const growth = a.balance ? (a.balance / START_BAL - 1) * 100 : null;
  const open = st.positions || [], pend = st.orders || [];
  const brake = isV ? 1 : ea.brake;
  const brakeTxt = brake == null ? "—" : brake >= 1 ? "không phanh" : brake <= 0 ? "DỪNG 30 ngày" : `rủi ro ×${fmtNum(brake, 2)}`;
  const riskBase = ea.riskBase ?? 2.72;

  return (
    <div className="space-y-3">
      <Card className="!p-3 sm:!p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Cpu size={18} className="text-indigo-500" />
          <div className="text-[15px] font-extrabold text-slate-800">{isV ? "EA Victor V5 · MT5" : "EA QWS_Gop · MT5"}</div>
          {isV && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700">{(ea.slots || []).length || 8} mã · {fmtNum(riskBase, 2)}% × hệ số</span>}
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${online ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{online ? `đang chạy · ${ago(st.ts)}` : st.online === false ? (st.reason || "MT5 không chạy") : `mất liên lạc · ${ago(st.ts)}`}</span>
          {a.demo != null && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${a.demo ? "bg-sky-50 text-sky-700" : "bg-amber-100 text-amber-800"}`}>{a.demo ? "DEMO" : "TIỀN THẬT"} · {a.login} · {a.server}</span>}
          {online && st.algo === false && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">Algo Trading đang TẮT</span>}
          {online && !eaFresh && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">EA không báo trạng thái ({st.eaAgeS != null ? `${Math.round(st.eaAgeS / 60)} phút` : "chưa có"}) — EA có thể chưa gắn chart</span>}
          {stopped && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">ĐANG DỪNG từ app</span>}
          {isOwner && <div className="ml-auto flex gap-1.5">
            {stopped
              ? <button disabled={busy} onClick={() => setStop(false)} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-extrabold text-white disabled:opacity-50"><Play size={14} /> Chạy lại</button>
              : <button disabled={busy} onClick={() => setStop(true)} className="flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-[12px] font-extrabold text-white disabled:opacity-50"><Square size={14} /> Dừng EA</button>}
          </div>}
        </div>
        {note && <div className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[12px] font-bold text-emerald-700">{note}</div>}
        {err && <div className="mt-2 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[12px] font-bold text-rose-700">{err}</div>}
        <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-slate-200 sm:grid-cols-4 lg:grid-cols-6">
          <Num label="Số dư" v={fmtUsd(a.balance)} sub={`vốn đầu ${fmtUsd(START_BAL, 0)} · ${growth != null ? `${growth >= 0 ? "+" : ""}${fmtNum(growth, 2)}%` : "—"}`} t={tone(growth)} />
          <Num label="Equity" v={fmtUsd(a.equity)} sub={`lãi/lỗ đang mở ${fmtUsdSigned((a.equity || 0) - (a.balance || 0))}`} t={tone((a.equity || 0) - (a.balance || 0))} />
          <Num label="Sụt từ đỉnh" v={dd != null ? `${fmtNum(dd, 2)}%` : "—"} sub={`đỉnh ${fmtUsd(peak)} · ${isV ? `kiểm thử từng sụt ${fmtNum(BT_V.mdd, 0)}%` : "giới hạn 10%"}`} t={dd >= (isV ? 20 : 6) ? "text-rose-600" : "text-slate-900"} />
          {isV
            ? <Num label="Rủi ro / lệnh" v={`${fmtNum(riskBase, 2)}% × hệ số`} sub="không phanh sụt vốn · không trần lệnh mở" />
            : <Num label="Phanh sụt vốn" v={brakeTxt} sub="6% → ½ · 8% → ¼ · 10% → dừng" t={brake != null && brake < 1 ? "text-amber-600" : "text-slate-900"} />}
          <Num label="Hôm nay" v={fmtUsdSigned(ea.todayPnl)} sub={isV || ea.dailyStop === 0 ? "không dừng theo ngày" : `dừng ngày khi lỗ ${fmtNum(ea.dailyStop ?? 2, 1)}%`} t={tone(ea.todayPnl)} />
          <Num label={isV ? "Lệnh Victor đã đóng" : "Lệnh đã đóng"} v={S.n} sub={S.n ? `thắng ${fmtNum(S.win, 0)}% · PF ${S.pf != null ? fmtNum(S.pf, 2) : "—"}` : "chưa có"} />
        </div>
      </Card>

      <PnlCalendar title="Lịch lãi/lỗ Forex MT5" items={calItems} sources={calSources} rate={vnd} note="Tài khoản demo IC Markets. Tính theo ngày ĐÓNG lệnh (giờ VN). Bấm 1 ngày để xem từng lệnh." />

      <Card className="!p-3 sm:!p-4">
        <Title icon={ListChecks} right={<span className="text-[11px] text-slate-400">{open.length} vị thế · {pend.length} lệnh chờ</span>}>Lệnh đang mở</Title>
        {!open.length && !pend.length ? <div className="py-3 text-center text-[12.5px] text-slate-400">Không có lệnh nào — EA đang chờ tín hiệu (trung bình ~{isV ? BT_V.perMonth : BT.perMonth} lệnh/tháng).</div> : (
          <div className="space-y-1.5">
            {open.map((p) => (
              <div key={p.ticket} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-slate-100 px-2.5 py-1.5 text-[12.5px]">
                {side(p.side)}<b>{p.sym}</b><span className="text-slate-400">{p.name}</span><span className="tabular-nums">{fmtNum(p.vol, 2)} lot @ {fmtPx(p.open)}</span>
                <span className="tabular-nums text-slate-400">SL {fmtPx(p.sl)}{p.tp ? ` · TP ${fmtPx(p.tp)}` : ""}</span>
                <span className={`ml-auto font-extrabold tabular-nums ${tone(p.pnl)}`}>{fmtUsdSigned(p.pnl)}{p.risk ? ` (${fmtR(p.pnl / p.risk)})` : ""}</span>
                <span className="w-full text-[11px] text-slate-400">mở {dt(p.t)} · giá {fmtPx(p.cur)}{p.risk ? ` · rủi ro ${fmtUsd(p.risk)}` : ""}</span>
              </div>
            ))}
            {pend.map((o) => (
              <div key={o.ticket} className="flex flex-wrap items-center gap-x-2 rounded-lg border border-dashed border-slate-200 px-2.5 py-1.5 text-[12.5px]">
                {side(o.side)}<b>{o.sym}</b><span className="text-slate-400">{o.name} · lệnh chờ</span><span className="tabular-nums">{fmtNum(o.vol, 2)} lot @ {fmtPx(o.price)}</span>
                <span className="ml-auto text-[11px] text-slate-400">SL {fmtPx(o.sl)} · đặt {dt(o.t)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="!p-3 sm:!p-4">
        <Title icon={BarChart3}>Đường vốn</Title>
        {eq.length < 2 ? <div className="py-3 text-center text-[12.5px] text-slate-400">Cầu nối lưu số dư mỗi 15 phút — đường vốn hiện khi có đủ điểm.</div> : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={eq} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(t) => dt(t).slice(0, 5)} tick={{ fontSize: 11 }} />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11 }} width={52} tickFormatter={(v) => `$${fmtNum(v, 0)}`} />
                <Tooltip labelFormatter={(t) => dt(t)} formatter={(v, n) => [fmtUsd(v), n === "eq" ? "Equity" : "Số dư"]} />
                <Line type="monotone" dataKey="bal" stroke="#6366f1" strokeWidth={2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="eq" stroke="#94a3b8" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="!p-3 sm:!p-4">
        <Title icon={GitCompare}>{isV ? "Từng mã & so với kiểm thử" : "Từng ngăn & so với kiểm thử"}</Title>
        {isV ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[12.5px]">
              <thead><tr className="text-left text-[10.5px] uppercase text-slate-400"><th className="py-1">Mã</th><th className="text-right">Rủi ro/lệnh</th><th className="text-right">Tối đa</th><th className="text-right">Đang mở</th><th className="text-right">Lệnh</th><th className="text-right">Thắng</th><th className="text-right">R TB</th><th className="text-right">Lãi</th></tr></thead>
              <tbody>
                {S.bySlot.map((s) => {
                  const sl = (ea.slots || []).find((z) => z.sym === s.sym) || {};
                  return (
                    <tr key={s.sym} className="border-t border-slate-100">
                      <td className="py-1.5"><b>{s.sym}</b> <span className="text-[11px] text-slate-400">{s.name}</span></td>
                      <td className="text-right tabular-nums">{sl.risk != null ? `${fmtNum(sl.risk, 2)}%` : "—"}</td>
                      <td className="text-right tabular-nums">{sl.max ?? "—"}</td>
                      <td className={`text-right tabular-nums ${sl.open ? "font-bold text-indigo-600" : ""}`}>{sl.open ?? "—"}</td>
                      <td className="text-right tabular-nums">{s.n}</td><td className="text-right tabular-nums">{s.win != null ? `${fmtNum(s.win, 0)}%` : "—"}</td>
                      <td className={`text-right tabular-nums ${tone(s.avgR)}`}>{fmtR(s.avgR)}</td><td className={`text-right font-bold tabular-nums ${tone(s.pnl)}`}>{s.n ? fmtUsdSigned(s.pnl) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-1 text-[11px] leading-snug text-slate-400">Rủi ro/lệnh = {fmtNum(riskBase, 2)}% số dư × hệ số mã. Tối đa = số lệnh cùng mã được mở cùng lúc.{S.old?.n ? ` Lịch sử QWS_Gop trước 21/11: ${S.old.n} lệnh, ${fmtUsdSigned(S.old.pnl)} — không tính vào bảng này.` : ""}</div>
          </div>
        ) : <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[12.5px]">
            <thead><tr className="text-left text-[10.5px] uppercase text-slate-400"><th className="py-1">Ngăn</th><th>Mã</th><th className="text-right">Rủi ro/lệnh</th><th className="text-right">Lệnh</th><th className="text-right">Thắng</th><th className="text-right">R TB</th><th className="text-right">Lãi</th><th className="text-right">Trạng thái</th></tr></thead>
            <tbody>
              {S.bySlot.map((s) => {
                const sl = (ea.slots || [])[s.k] || {};
                const off = sl.offUntil && sl.offUntil * 1000 > Date.now();
                return (
                  <tr key={s.k} className="border-t border-slate-100">
                    <td className="py-1.5 font-bold">{s.name}</td><td>{SYMS[s.k]}</td>
                    <td className="text-right tabular-nums">{sl.risk != null ? `${fmtNum(sl.risk * (brake ?? 1), 2)}%` : "—"}</td>
                    <td className="text-right tabular-nums">{s.n}</td><td className="text-right tabular-nums">{s.win != null ? `${fmtNum(s.win, 0)}%` : "—"}</td>
                    <td className={`text-right tabular-nums ${tone(s.avgR)}`}>{fmtR(s.avgR)}</td><td className={`text-right font-bold tabular-nums ${tone(s.pnl)}`}>{s.n ? fmtUsdSigned(s.pnl) : "—"}</td>
                    <td className="text-right text-[11px]">{sl.en === false ? <span className="text-slate-400">tắt</span> : off ? <span className="text-amber-600">tạm tắt tới {dt(sl.offUntil * 1000)}</span> : <span className="text-emerald-600">bật</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>}
        <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-slate-200 sm:grid-cols-4">
          {isV
            ? <Num label="Kiểm thử luật gốc 2018–2026" v={`sụt tối đa ${fmtNum(BT_V.mdd, 0)}%`} sub={`1.000$ có lúc còn ${BT_V.low}$ · mô phỏng`} t="text-rose-600" />
            : <Num label="Kiểm thử 2018–2026" v={`+${BT.cagr}%/năm`} sub={`~${fmtNum(BT.month, 1)}%/tháng · sụt tối đa ${fmtNum(BT.mdd, 1)}%`} />}
          <Num label="Thực tế: tăng trưởng" v={growth != null ? `${growth >= 0 ? "+" : ""}${fmtNum(growth, 2)}%` : "—"} sub={days ? `sau ${fmtNum(days, 0)} ngày${isV ? " (cả QWS cũ)" : ""}` : "chưa có lệnh"} t={tone(growth)} />
          <Num label="Thắng" v={S.win != null ? `${fmtNum(S.win, 0)}%` : "—"} sub={`kiểm thử ${fmtNum(isV ? BT_V.win : BT.win, 0)}%`} />
          <Num label="Số lệnh / tháng" v={rateDays ? fmtNum((S.n / rateDays) * 30.4, 1) : "—"} sub={`kiểm thử ~${isV ? BT_V.perMonth : BT.perMonth}`} />
        </div>
        <div className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-snug text-slate-500"><ShieldAlert size={13} className="mt-0.5 shrink-0 text-amber-500" />{isV
          ? "Victor vào lệnh dày (~55 lệnh/tháng) nên vài tuần đã có đủ lệnh để so. Số kiểm thử Victor là mô phỏng Python (chưa chạy Strategy Tester); luật gốc không phanh, không dừng ngày nên sụt vốn có thể rất sâu. Kết quả quá khứ không đảm bảo tương lai."
          : "Cần vài tháng (≥ 30–50 lệnh) mới so được với kiểm thử; vài tuần đầu lệch nhiều là bình thường. Kết quả quá khứ không đảm bảo tương lai."}</div>
      </Card>

      <Card className="!p-3 sm:!p-4">
        <Title icon={ListChecks} right={<span className="text-[11px] text-slate-400">{trades.length} lệnh</span>}>Lịch sử lệnh</Title>
        {!trades.length ? <div className="py-3 text-center text-[12.5px] text-slate-400">Chưa có lệnh nào đóng.</div> : (
          <div className="space-y-1">
            {[...trades].reverse().slice(0, 60).map((x) => (
              <div key={x.id} className="flex flex-wrap items-center gap-x-2 rounded-lg border border-slate-100 px-2.5 py-1.5 text-[12.5px]">
                {side(x.side)}<b>{x.sym}</b><span className="text-slate-400">{x.name}</span><span className="tabular-nums text-slate-500">{fmtNum(x.vol, 2)} lot {fmtPx(x.open)} → {fmtPx(x.exit)}</span>
                <span className={`ml-auto font-extrabold tabular-nums ${tone(x.pnl)}`}>{fmtUsdSigned(x.pnl)} <span className="font-bold">{fmtR(x.R)}</span></span>
                <span className="w-full text-[11px] text-slate-400">{dt(x.t_in)} → {dt(x.t_out)}{x.partial ? " · có chốt 1 phần" : ""}{x.how ? ` · ${x.how}` : ""}{!x.closed ? " · còn mở một phần" : ""}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="!p-3 sm:!p-4">
        <button onClick={() => setShowLog((v) => !v)} className="flex w-full items-center"><Title icon={ScrollText} right={<ChevronDown size={14} className={showLog ? "rotate-180" : ""} />}>Nhật ký EA (40 dòng cuối)</Title></button>
        {showLog && <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-2.5 text-[11px] leading-snug text-slate-100">{(st.log || []).slice().reverse().join("\n") || "—"}</pre>}
        <div className="mt-1 text-[11px] text-slate-400">Cầu nối {st.bridge?.version || "—"} · chạy từ {dt(st.bridge?.startedAt)} · đòn bẩy 1:{a.leverage || "—"} · ký quỹ {a.marginLevel ? `${fmtNum(a.marginLevel, 0)}%` : "—"}</div>
      </Card>
    </div>
  );
}
