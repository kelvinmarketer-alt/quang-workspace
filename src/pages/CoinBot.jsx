import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Play, Square, RefreshCw, Loader2, Settings2, TrendingUp, TrendingDown, Info, ShieldAlert, ChevronDown } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from "recharts";
import { Card, Badge } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { ask } from "../components/ConfirmDialog.jsx";
import { runSession, statsOf, DEFAULT_CFG, SETUPS, TFS, SYMBOLS } from "../lib/paperBot.js";

// Tab "Demo tự động": bot giao dịch GIẢ LẬP Futures theo bộ kiến thức — chạy từ ngày bắt đầu tới nay và tiếp tục theo
// từng nến mới cho tới khi chủ bấm Dừng. Phiên lưu ở settings.paperBot; kết quả tính lại từ nến Binance (luật cố định
// nên mở app lúc nào cũng ra đúng kết quả như bot chạy liên tục 24/7).
const usd = (v, d = 2) => (v == null || !isFinite(v) ? "—" : (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (v) => (v == null || !isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);
const rr = (v) => (v == null || !isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}R`);
const px = (v) => (v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: v >= 1000 ? 1 : v >= 10 ? 2 : 4 }));
const dt = (t) => { const d = new Date(t); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const ago = (t) => { const d = (Date.now() - t) / 86400000; return d >= 1 ? `${Math.floor(d)} ngày ${Math.floor((d % 1) * 24)} giờ` : `${Math.floor(d * 24)} giờ`; };

function Num({ label, v, sub, tone = "text-slate-900" }) {
  return <div className="bg-white px-3 py-2.5"><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div><div className={`text-lg font-extrabold tabular-nums ${tone}`}>{v}</div>{sub && <div className="text-[11px] text-slate-400">{sub}</div>}</div>;
}

function StatTable({ title, rows }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{title}</div>
      <table className="w-full text-[12px]">
        <thead><tr className="border-b border-slate-100 text-left text-[10px] uppercase text-slate-400"><th className="py-1.5 pr-2" /><th className="py-1.5 pr-2 text-right">Lệnh</th><th className="py-1.5 pr-2 text-right">Thắng</th><th className="py-1.5 pr-2 text-right">R TB</th><th className="py-1.5 text-right">Tổng R</th></tr></thead>
        <tbody>{rows.filter(([, s]) => s.n).map(([name, s]) => (
          <tr key={name} className="border-b border-slate-50">
            <td className="py-1.5 pr-2 font-bold text-slate-700">{name}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums">{s.n}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums">{s.winRate?.toFixed(0)}%</td>
            <td className={`py-1.5 pr-2 text-right font-bold tabular-nums ${s.avgR >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{rr(s.avgR)}</td>
            <td className={`py-1.5 text-right tabular-nums ${s.totalR >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{s.totalR.toFixed(1)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function SetupForm({ initial, onStart, onCancel }) {
  const [days, setDays] = useState(60);
  const [c, setC] = useState({ ...DEFAULT_CFG, ...(initial || {}) });
  const tog = (k, v) => setC((o) => ({ ...o, [k]: o[k].includes(v) ? o[k].filter((x) => x !== v) : [...o[k], v] }));
  const chip = (on) => `rounded-lg px-3 py-1.5 text-[12px] font-bold ${on ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`;
  const field = (k, label, step = 1, suffix = "") => (
    <label className="block text-[12px]"><span className="mb-1 block font-semibold text-slate-500">{label}</span>
      <div className="flex items-center gap-1"><input type="number" step={step} value={c[k]} onChange={(e) => setC({ ...c, [k]: Number(e.target.value) })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />{suffix && <span className="text-slate-400">{suffix}</span>}</div>
    </label>
  );
  const ok = c.coins.length && c.tfs.length && c.setups.length && c.capital > 0 && c.riskPct > 0;
  return (
    <Card className="!p-4">
      <div className="mb-3 flex items-center gap-2 text-[15px] font-extrabold text-slate-800"><Settings2 size={17} className="text-indigo-500" /> Cấu hình phiên demo</div>
      <div className="space-y-3">
        <div><div className="mb-1 text-[12px] font-semibold text-slate-500">Chạy lại từ quá khứ</div><div className="flex flex-wrap gap-1.5">{[30, 45, 60].map((d) => <button key={d} onClick={() => setDays(d)} className={chip(days === d)}>{d} ngày trước</button>)}</div></div>
        <div><div className="mb-1 text-[12px] font-semibold text-slate-500">Cặp (Binance Futures)</div><div className="flex flex-wrap gap-1.5">{Object.keys(SYMBOLS).map((k) => <button key={k} onClick={() => tog("coins", k)} className={chip(c.coins.includes(k))}>{k}USDT</button>)}</div></div>
        <div><div className="mb-1 text-[12px] font-semibold text-slate-500">Khung giờ</div><div className="flex flex-wrap gap-1.5">{["5m", "15m", "1h", "4h"].map((k) => <button key={k} onClick={() => tog("tfs", k)} className={chip(c.tfs.includes(k))}>{TFS[k].label}</button>)}</div></div>
        <div><div className="mb-1 text-[12px] font-semibold text-slate-500">Setup theo bộ kiến thức</div>
          <div className="space-y-1">{Object.entries(SETUPS).map(([k, s]) => (
            <button key={k} onClick={() => tog("setups", k)} className={`block w-full rounded-lg border px-3 py-2 text-left ${c.setups.includes(k) ? "border-indigo-300 bg-indigo-50/60" : "border-slate-200 opacity-60"}`}>
              <div className="text-[12.5px] font-bold text-slate-800">{c.setups.includes(k) ? "☑" : "☐"} {s.label}</div><div className="text-[11px] leading-snug text-slate-500">{s.desc}</div>
            </button>
          ))}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {field("capital", "Vốn ảo", 100, "$")}{field("riskPct", "Rủi ro / lệnh", 0.25, "%")}{field("maxOpen", "Tối đa lệnh mở")}{field("maxLev", "Đòn bẩy tối đa", 1, "x")}
          {field("dailyStopPct", "Dừng ngày khi lỗ", 0.5, "%")}{field("rr", "Chốt lời (R:R)", 0.5, "R")}{field("beAtR", "Dời hoà vốn ở (0=tắt)", 0.5, "R")}{field("feePct", "Phí mỗi chiều", 0.01, "%")}
        </div>
        <label className="flex items-center gap-2 text-[12.5px] font-semibold text-slate-700"><input type="checkbox" checked={c.htfFilter} onChange={(e) => setC({ ...c, htfFilter: e.target.checked })} /> Chỉ đánh thuận xu hướng khung lớn (đa khung — luật cốt lõi)</label>
        <div className="rounded-lg bg-slate-50 p-2.5 text-[11.5px] leading-snug text-slate-500">
          <b className="text-slate-700">Đề xuất cho vốn 1.000$:</b> rủi ro <b>1%/lệnh</b> (≈10$), tối đa <b>3 lệnh</b> cùng lúc, đòn bẩy ≤ <b>20x</b>, dừng ngày khi lỗ <b>3%</b>. Khối lượng tự tính = tiền rủi ro ÷ khoảng cách SL. Phí taker Futures 0,05%/chiều + trượt giá 0,02%.
        </div>
        <div className="flex gap-2">
          {onCancel && <button onClick={onCancel} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600">Huỷ</button>}
          <button disabled={!ok} onClick={() => onStart({ startAt: Date.now() - days * 86400000, cfg: c, createdAt: Date.now() })} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-2.5 text-sm font-bold text-white disabled:opacity-40"><Play size={15} /> Bắt đầu chạy demo</button>
        </div>
      </div>
    </Card>
  );
}

export default function CoinBot() {
  const { settings = {}, setSettings, isOwner } = useData();
  const session = settings.paperBot || null;
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [config, setConfig] = useState(false);
  const [filter, setFilter] = useState("all");
  const [showN, setShowN] = useState(40);
  const running = useRef(false);

  const run = async () => {
    if (!session || running.current) return;
    running.current = true; setErr("");
    try { setRes(await runSession(session, (m) => setBusy(m))); }
    catch (e) { setErr(e.message || String(e)); }
    running.current = false; setBusy("");
  };
  useEffect(() => { setRes(null); if (session) run(); /* eslint-disable-next-line */ }, [session?.createdAt, session?.stoppedAt]);
  // Đang chạy: mỗi phút xét nến mới đóng (dữ liệu đã lưu trong máy, chỉ tải phần mới)
  useEffect(() => {
    if (!session || session.stoppedAt) return;
    const t = setInterval(() => { if (!document.hidden) run(); }, 60000);
    return () => clearInterval(t); /* eslint-disable-next-line */
  }, [session?.createdAt, session?.stoppedAt]);

  const start = (s) => { setSettings({ paperBot: s }); setConfig(false); };
  const stop = async () => { if (await ask("Dừng phiên demo?\nBot ngừng mở lệnh mới; lệnh đang mở được đóng ở giá lúc dừng. Kết quả giữ lại để xem.", { ok: "Dừng phiên", danger: true })) setSettings({ paperBot: { ...session, stoppedAt: Date.now() } }); };

  const P = res?.portfolio;
  const all = useMemo(() => (res ? statsOf(res.trades) : null), [res]);
  const by = (key, vals, label = (x) => x) => (res ? vals.map((v) => [label(v), statsOf(res.trades.filter((t) => t[key] === v))]) : []);
  const curve = useMemo(() => (P ? P.curve.map((p) => ({ t: p.t, eq: Math.round(p.eq * 100) / 100, day: dt(p.t).slice(0, 5) })) : []), [P]);
  const taken = useMemo(() => (P ? [...P.trades].filter((t) => (filter === "all" ? t.status !== "skip" : filter === "open" ? t.status === "open" : filter === "skip" ? t.status === "skip" : t.status === "done" && (filter === "win" ? t.r > 0.05 : t.r < -0.05))).sort((a, b) => b.entryAt - a.entryAt) : []), [P, filter]);
  const feeAvg = res ? (() => { const l = res.trades.filter((t) => t.r != null); return l.length ? l.reduce((s, t) => s + t.feeR, 0) / l.length : 0; })() : 0;

  if (!isOwner) return <Card><div className="text-sm text-slate-500">Chỉ chủ workspace dùng được Demo tự động.</div></Card>;
  if (!session || config) return <SetupForm initial={session?.cfg} onStart={start} onCancel={session ? () => setConfig(false) : null} />;

  const cfg = { ...DEFAULT_CFG, ...session.cfg };
  const eqNow = P ? P.equity + P.unrealized : null, pnl = eqNow != null ? eqNow - cfg.capital : null;
  const open = P ? P.trades.filter((t) => t.status === "open") : [];
  return (
    <div className="space-y-3">
      <Card className="!p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Bot size={18} className="text-emerald-500" />
          <span className="text-[14px] font-extrabold text-slate-800">Bot demo · Futures</span>
          {session.stoppedAt ? <Badge tone="slate">Đã dừng</Badge> : <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Đang chạy</span>}
          <div className="ml-auto flex gap-1.5">
            <button onClick={run} disabled={!!busy} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-bold text-slate-600 disabled:opacity-50"><RefreshCw size={13} className={busy ? "animate-spin" : ""} /> Cập nhật</button>
            {session.stoppedAt ? <button onClick={() => setConfig(true)} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-bold text-white"><Play size={13} /> Phiên mới</button>
              : <button onClick={stop} className="flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1.5 text-[12px] font-bold text-white"><Square size={12} /> Dừng</button>}
          </div>
        </div>
        <div className="mt-1 text-[11.5px] text-slate-500">
          Từ <b>{dt(session.startAt)}</b>{session.stoppedAt ? <> đến <b>{dt(session.stoppedAt)}</b></> : <> · đã chạy {ago(session.startAt)}</>} · {cfg.coins.map((x) => x + "USDT").join(", ")} · {cfg.tfs.map((x) => TFS[x].label).join(" ")} · rủi ro {cfg.riskPct}%/lệnh · tối đa {cfg.maxOpen} lệnh · R:R {cfg.rr}{cfg.htfFilter ? " · thuận khung lớn" : ""}
          {busy && <span className="ml-1 inline-flex items-center gap-1 text-indigo-600"><Loader2 size={11} className="animate-spin" />{busy}</span>}
          {res && !busy && <span className="text-slate-400"> · cập nhật {dt(res.at)}</span>}
        </div>
        {err && <div className="mt-2 rounded-lg bg-rose-50 p-2 text-[12px] text-rose-600">{err}</div>}
      </Card>

      {!res ? <Card><div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400"><Loader2 size={16} className="animate-spin" /> {busy || "Đang chạy lại dữ liệu…"}</div></Card> : (<>
        <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4 xl:grid-cols-8">
          <Num label="Vốn hiện tại" v={usd(eqNow)} sub={`vốn đầu ${usd(cfg.capital, 0)}`} />
          <Num label="Lãi / lỗ" v={usd(pnl)} sub={pct((pnl / cfg.capital) * 100)} tone={pnl >= 0 ? "text-emerald-600" : "text-rose-600"} />
          <Num label="Tỉ lệ thắng (phương pháp)" v={all.winRate != null ? `${all.winRate.toFixed(1)}%` : "—"} sub={`${all.wins} thắng · ${all.losses} thua · ${all.bes} hoà`} />
          <Num label="Tín hiệu đã đóng" v={all.n} sub={`${P.trades.filter((t) => t.status !== "skip").length} lệnh vào vốn · ${all.open} mở`} />
          <Num label="R TB / lệnh" v={rr(all.avgR)} sub="đã trừ phí" tone={all.avgR >= 0 ? "text-emerald-600" : "text-rose-600"} />
          <Num label="Profit factor" v={all.pf == null ? "—" : all.pf === Infinity ? "∞" : all.pf.toFixed(2)} sub=">1 là có lãi" tone={all.pf >= 1 ? "text-emerald-600" : "text-rose-600"} />
          <Num label="Sụt vốn lớn nhất" v={`${P.maxDD.toFixed(1)}%`} tone={P.maxDD > 20 ? "text-rose-600" : "text-slate-900"} />
          <Num label="Chuỗi thua dài nhất" v={all.worstStreak} sub="lệnh liên tiếp" />
        </div>

        <div className="grid gap-3 xl:grid-cols-3">
          <Card className="!p-3 xl:col-span-2">
            <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Đường vốn (danh mục {usd(cfg.capital, 0)})</div>
            <div className="h-56">
              <ResponsiveContainer>
                <LineChart data={curve}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} minTickGap={30} />
                  <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} width={50} />
                  <Tooltip formatter={(v) => usd(v)} labelFormatter={(l, p) => (p?.[0] ? dt(p[0].payload.t) : l)} />
                  <ReferenceLine y={cfg.capital} stroke="#94a3b8" strokeDasharray="4 4" />
                  <Line dataKey="eq" name="Vốn" stroke={pnl >= 0 ? "#10b981" : "#f43f5e"} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card className="!p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-extrabold text-slate-700"><Info size={14} className="text-indigo-500" /> Nhận xét tự động</div>
            <div className="space-y-1.5 text-[12px] leading-snug text-slate-600">
              {all.n < 100 && <div>• Mới {all.n} lệnh đã đóng — cần ≥ 100 lệnh để tỉ lệ thắng đáng tin.</div>}
              <div>• Hoà vốn ở R:R {cfg.rr} cần thắng ≥ <b>{(100 / (1 + cfg.rr)).toFixed(0)}%</b>; hiện {all.winRate?.toFixed(0) ?? "—"}%.</div>
              <div>• Phí + trượt giá ăn TB <b>{feeAvg.toFixed(2)}R</b>/lệnh{feeAvg > 0.2 ? " — quá lớn (SL quá sát ở khung nhỏ), nên ưu tiên khung H1/H4." : "."}</div>
              {(() => { const segs = [...by("tf", cfg.tfs, (x) => TFS[x].label), ...by("setup", cfg.setups, (x) => SETUPS[x].label.split(" (")[0])].filter(([, s]) => s.n >= 10).sort((a, b) => b[1].avgR - a[1].avgR); return segs.length ? <><div>• Tốt nhất: <b className="text-emerald-700">{segs[0][0]}</b> ({rr(segs[0][1].avgR)}/lệnh, {segs[0][1].n} lệnh)</div><div>• Kém nhất: <b className="text-rose-700">{segs[segs.length - 1][0]}</b> ({rr(segs[segs.length - 1][1].avgR)}/lệnh)</div></> : null; })()}
              {Object.keys(res.skipped).length > 0 && <div className="text-slate-400">• Bỏ qua: {Object.entries(res.skipped).map(([k, v]) => `${v} tín hiệu ${k.toLowerCase()}`).join(", ")}.</div>}
            </div>
          </Card>
        </div>

        <Card className="!p-3">
          <div className="grid gap-4 md:grid-cols-3">
            <StatTable title="Theo setup" rows={by("setup", cfg.setups, (x) => SETUPS[x].label.split(" (")[0])} />
            <StatTable title="Theo cặp" rows={by("coin", cfg.coins, (x) => x)} />
            <StatTable title="Theo khung giờ" rows={by("tf", cfg.tfs, (x) => TFS[x].label)} />
          </div>
        </Card>

        {open.length > 0 && (
          <Card className="!p-3">
            <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Lệnh đang mở ({open.length})</div>
            <div className="space-y-1">{open.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[12px]">
                <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-extrabold text-white ${t.side === 1 ? "bg-emerald-500" : "bg-rose-500"}`}>{t.side === 1 ? "LONG" : "SHORT"}</span>
                <b>{t.coin} {TFS[t.tf].label}</b><span className="text-slate-400">{SETUPS[t.setup].label.split(" (")[0]}</span>
                <span>Vào {px(t.entry)} · SL {px(t.sl)} · TP {px(t.tp)} · giá {px(t.last)}</span>
                <span className={`ml-auto font-extrabold ${t.pnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{usd(t.pnl)} ({rr(t.uR)})</span>
              </div>
            ))}</div>
          </Card>
        )}

        <Card className="!p-3">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Nhật ký lệnh</span>
            {[["all", "Đã vào"], ["win", "Thắng"], ["loss", "Thua"], ["open", "Đang mở"], ["skip", "Bị bỏ (danh mục)"]].map(([k, l]) => <button key={k} onClick={() => { setFilter(k); setShowN(40); }} className={`rounded-md px-2 py-1 text-[11px] font-bold ${filter === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`}>{l}</button>)}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[12px]">
              <thead><tr className="border-b border-slate-100 text-left text-[10px] uppercase tracking-wide text-slate-400">
                <th className="py-1.5 pr-2">Vào lúc</th><th className="py-1.5 pr-2">Cặp</th><th className="py-1.5 pr-2">Setup</th><th className="py-1.5 pr-2 text-right">Vào</th><th className="py-1.5 pr-2 text-right">SL</th><th className="py-1.5 pr-2 text-right">TP</th><th className="py-1.5 pr-2">Kết thúc</th><th className="py-1.5 pr-2 text-right">R</th><th className="py-1.5 text-right">Lãi/lỗ</th>
              </tr></thead>
              <tbody>{taken.slice(0, showN).map((t) => (
                <tr key={t.id} className="border-b border-slate-50">
                  <td className="py-1.5 pr-2 tabular-nums text-slate-500">{dt(t.entryAt)}</td>
                  <td className="py-1.5 pr-2"><span className={`mr-1 font-extrabold ${t.side === 1 ? "text-emerald-600" : "text-rose-600"}`}>{t.side === 1 ? "▲" : "▼"}</span><b>{t.coin}</b> <span className="text-slate-400">{TFS[t.tf].label}</span></td>
                  <td className="py-1.5 pr-2 text-slate-600" title={t.note}>{SETUPS[t.setup].label.split(" (")[0]}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{px(t.entry)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-rose-500">{px(t.sl)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-emerald-600">{px(t.tp)}</td>
                  <td className="py-1.5 pr-2 text-slate-500">{t.status === "skip" ? <span className="text-slate-400">bỏ: {t.why}</span> : <>{t.reason}{t.exitAt ? <span className="text-slate-400"> · {dt(t.exitAt)}</span> : ""}</>}</td>
                  <td className={`py-1.5 pr-2 text-right font-bold tabular-nums ${(t.r ?? t.uR) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{rr(t.r ?? t.uR)}</td>
                  <td className={`py-1.5 text-right font-bold tabular-nums ${t.pnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{t.status === "skip" ? "—" : usd(t.pnl)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {taken.length > showN && <button onClick={() => setShowN((n) => n + 100)} className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-slate-50 py-2 text-[12px] font-bold text-slate-500"><ChevronDown size={14} /> Xem thêm ({taken.length - showN})</button>}
        </Card>

        <div className="flex items-start gap-2 px-3 text-[11px] leading-snug text-slate-400 sm:px-0">
          <ShieldAlert size={13} className="mt-0.5 shrink-0" />
          <span>Lệnh ẢO trên dữ liệu thật Binance Futures — không đặt lệnh thật, khoá Binance vẫn chỉ đọc. Luật: chỉ nến đã đóng, vào ở giá mở nến kế tiếp, SL & TP cùng chạm 1 nến tính THUA, bỏ lệnh SL &gt; 4 ATR, có phí + trượt giá. Kết quả quá khứ không đảm bảo tương lai — chỉ để kiểm tra phương pháp, không phải tư vấn đầu tư.</span>
        </div>
      </>)}
    </div>
  );
}
