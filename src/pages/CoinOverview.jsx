// Tab "Tổng quan" của module Coin (chỉ chủ): mở ra là nắm hết — tài sản, bot thật, demo, cảnh báo giá, tiến độ lệnh tháng này.
import { useEffect, useMemo, useState } from "react";
import { Coins, Radio, Bot, BellRing, ChevronRight, TrendingUp, TrendingDown, Target, Loader2 } from "lucide-react";
import { Card, Badge } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { supabase } from "../lib/supabase.js";
import { fmtUsd, fmtUsdSigned, fmtNum, fmtPct, fmtPx, formatVND } from "../lib/format.js";
import { useBinance, useUsdVnd, depositInfo, fetchTickers, STABLES, demoResult, monthOf, monthLabel, MONTH_TARGET, weakStreams, demoCacheGet } from "../lib/coinShared.js";
import { cfgOf, statsOf, TFS, finalize } from "../lib/paperBot.js";

const APP_RULES_HASH = typeof __RULES_HASH__ !== "undefined" ? __RULES_HASH__ : null; // eslint-disable-line no-undef
const tone = (v) => (v == null || !isFinite(v) ? "text-slate-800" : v >= 0 ? "text-emerald-600" : "text-rose-600");
const sPct = (v) => (v == null || !isFinite(v) ? "" : `${v >= 0 ? "+" : ""}${fmtPct(v, 1)}`);
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "vừa xong" : m < 60 ? `${m} phút trước` : m < 1440 ? `${Math.round(m / 60)} giờ trước` : `${Math.round(m / 1440)} ngày trước`; };
const dm = (t) => { const d = new Date(t); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

function MonthBar({ n, label }) {
  const pct = Math.min(100, (n / MONTH_TARGET) * 100), ok = n >= MONTH_TARGET;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11.5px]"><span className="font-semibold text-slate-500">{label}</span><span className={`font-extrabold tabular-nums ${ok ? "text-emerald-600" : "text-slate-700"}`}>{n}/{MONTH_TARGET} lệnh</span></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${ok ? "bg-emerald-500" : "bg-amber-400"}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
const Row = ({ k, v, t }) => <div className="flex items-baseline justify-between gap-2 py-1 text-[12.5px]"><span className="text-slate-500">{k}</span><span className={`text-right font-bold tabular-nums ${t || "text-slate-800"}`}>{v}</span></div>;
const Head = ({ icon: I, title, badge, onOpen }) => (
  <div className="mb-2 flex items-center gap-2">
    <I size={16} className="shrink-0 text-indigo-500" /><span className="text-[13.5px] font-extrabold text-slate-800">{title}</span>{badge}
    <button onClick={onOpen} className="ml-auto flex shrink-0 items-center gap-0.5 rounded-lg px-1.5 py-1 text-[12px] font-bold text-indigo-600 hover:bg-indigo-50">Xem <ChevronRight size={14} /></button>
  </div>
);

export default function CoinOverview({ active, go }) {
  const { settings = {}, isOwner } = useData();
  const { bn, err } = useBinance(isOwner, active);
  const session = settings.paperBot || null;
  const [px, setPx] = useState({}), [rows, setRows] = useState(null), [demo, setDemo] = useState(null), [demoErr, setDemoErr] = useState("");
  const month = monthOf(Date.now());

  // Giá + biến động 24h cho coin trong ví (30 giây/lần khi đang xem)
  const assets = (bn?.balances || []).map((b) => b.asset).join(",");
  useEffect(() => {
    if (!active || !assets) return undefined;
    const load = () => fetchTickers(assets.split(",")).then((m) => { if (Object.keys(m).length) setPx((p) => ({ ...p, ...m })); });
    load(); const t = setInterval(() => { if (!document.hidden) load(); }, 30000); return () => clearInterval(t);
  }, [active, assets]);
  // Bot thật (bảng qws_live_bot) — 30 giây/lần
  useEffect(() => {
    if (!active || !isOwner) return undefined;
    const load = () => supabase.from("qws_live_bot").select("id,data").then(({ data }) => { if (data) setRows(Object.fromEntries(data.map((r) => [r.id, r.data]))); });
    load(); const t = setInterval(() => { if (!document.hidden) load(); }, 30000); return () => clearInterval(t);
  }, [active, isOwner]);
  // Demo: chạy lại phiên trong Web Worker (nhớ 5 phút, dùng chung)
  useEffect(() => {
    if (!active || !session) return undefined;
    let off = false;
    demoCacheGet(session).then((c) => { if (c && !off) setDemo((d) => d || finalize(c, null)); }); // hiện ngay kết quả lần trước
    const load = () => demoResult(session).then((f) => { if (!off) { setDemo(f); setDemoErr(""); } }, (e) => { if (!off) setDemoErr(e.message || String(e)); });
    load(); const t = setInterval(() => { if (!document.hidden) load(); }, 300000);
    return () => { off = true; clearInterval(t); };
  }, [active, session]);

  // Tài sản
  const assetSum = useMemo(() => {
    if (!bn) return null;
    let val = 0, d24 = 0, missing = 0;
    for (const b of bn.balances || []) {
      const a = String(b.asset || "").toUpperCase(), qty = b.totalQty != null ? Number(b.totalQty) || 0 : (Number(b.qty) || 0) + (Number(b.earnQty) || 0);
      const p = STABLES.has(a) ? 1 : px[a]?.price;
      if (p == null) { missing++; continue; }
      const v = qty * p; val += v;
      if (!STABLES.has(a) && px[a]?.chg != null) d24 += v - v / (1 + px[a].chg / 100);
    }
    const fut = bn.futures ? (Number(bn.futures.wallet) || 0) + (Number(bn.futures.unrealized) || 0) : 0;
    return { total: val + fut, d24, missing, fut };
  }, [bn, px]);
  const vnd = useUsdVnd();
  const dep = depositInfo(settings, bn);
  const vsDep = assetSum && !assetSum.missing && dep.depVnd > 0 ? (assetSum.total * vnd - dep.depVnd) / vnd : null;

  // Bot thật
  const st = rows?.status || null, cmd = rows?.command || null;
  const live = useMemo(() => (rows?.history?.trades || []).filter((t) => t && t.setup !== "TEST" && (!t.mode || t.mode === st?.mode)), [rows, st?.mode]);
  const liveMonth = live.filter((t) => t.exitAt && monthOf(t.exitAt) === month);
  const online = st && Date.now() - st.at < 180000;
  const synced = st && APP_RULES_HASH && st.rulesHash === APP_RULES_HASH && (!session || !st.learnFrom || Math.abs(st.learnFrom - session.startAt) < 60000);
  const nPos = Object.keys(st?.positions || {}).length, nAct = Object.keys(st?.active || {}).length;
  const lastLive = live.slice().sort((a, b) => (b.exitAt || 0) - (a.exitAt || 0))[0];

  // Demo
  const cfg = session ? cfgOf(session) : null;
  const dTrades = demo ? demo.portfolio.trades.filter((t) => t.status === "done" || t.status === "open") : [];
  const dDone = dTrades.filter((t) => t.status === "done");
  const dStats = demo ? statsOf(dDone) : null;
  const dMonth = dTrades.filter((t) => monthOf(t.entryAt) === month);
  const dOpen = dTrades.filter((t) => t.status === "open");
  const dEq = demo ? demo.portfolio.equity + (demo.portfolio.unrealized || 0) : null;
  const dLast = dTrades.slice().sort((a, b) => b.entryAt - a.entryAt)[0];

  // Cảnh báo giá
  const alerts = (cmd?.priceAlerts || []).filter((a) => a && !a.firedAt);

  if (!isOwner) return null;
  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Tài sản */}
      <div className="overflow-hidden rounded-none bg-gradient-to-br from-slate-900 to-amber-900/80 p-4 text-white shadow-xl sm:rounded-2xl sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-amber-200"><Coins size={14} /> Tổng tài sản Binance</div>
            {!assetSum || assetSum.missing ? (
              <div className="mt-2 space-y-2"><div className="h-8 w-44 animate-pulse rounded-lg bg-white/15" /><div className="text-[11px] text-amber-100/60">{err && !bn ? err : "Đang tải ví Binance…"}</div></div>
            ) : (
              <>
                <div className="mt-1 text-3xl font-extrabold tabular-nums sm:text-4xl">{fmtUsd(assetSum.total)}</div>
                <div className="mt-0.5 text-xs text-amber-100/80">≈ {formatVND(assetSum.total * vnd)}</div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-bold tabular-nums">
                  {vsDep != null && <span className={`flex items-center gap-1 ${vsDep >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{vsDep >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}{fmtUsdSigned(vsDep)} ({sPct((vsDep * vnd / dep.depVnd) * 100)}) <span className="font-semibold text-amber-100/60">so với đã nạp</span></span>}
                  <span className={assetSum.d24 >= 0 ? "text-emerald-300" : "text-rose-300"}>{fmtUsdSigned(assetSum.d24)} <span className="font-semibold text-amber-100/60">24h</span></span>
                </div>
              </>
            )}
          </div>
          <button onClick={() => go("invest")} className="flex shrink-0 items-center gap-1 rounded-xl border border-white/30 px-3 py-2 text-xs font-bold hover:bg-white/10">Chi tiết <ChevronRight size={14} /></button>
        </div>
      </div>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        {/* Bot thật */}
        <Card className="!p-3 sm:!p-4">
          <Head icon={Radio} title="Bot thật" onOpen={() => go("live")} badge={st ? <Badge tone={st.mode === "live" ? "rose" : "sky"}>{st.mode === "live" ? "TIỀN THẬT" : "TESTNET"}</Badge> : null} />
          {!rows ? <div className="flex items-center gap-2 py-6 text-[12px] text-slate-400"><Loader2 size={14} className="animate-spin" /> Đang tải…</div> : !st ? <div className="py-6 text-[12px] text-slate-400">Bot chưa báo trạng thái.</div> : (
            <>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {online ? <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Đang chạy</span>
                  : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">Mất liên lạc · {ago(st.at)}</span>}
                {(cmd?.stop || st.stopped) && <Badge tone="rose">ĐANG DỪNG</Badge>}
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${synced ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{synced ? "✓ Đồng bộ Demo" : "⏳ Đang đồng bộ"}</span>
              </div>
              <Row k="Lệnh chờ / vị thế" v={`${nAct - nPos > 0 ? nAct - nPos : 0} / ${nPos}`} />
              <Row k="Lãi/lỗ hôm nay" v={st.lastScan?.pnl == null ? "—" : fmtUsdSigned(st.lastScan.pnl)} t={tone(st.lastScan?.pnl)} />
              <Row k="Lệnh gần nhất" v={lastLive ? <>{lastLive.coin} {TFS[lastLive.tf]?.label} <span className={tone(lastLive.pnl)}>{fmtUsdSigned(lastLive.pnl)}</span> · {dm(lastLive.exitAt)}</> : "chưa có"} />
              <div className="mt-2"><MonthBar n={liveMonth.length} label={`${monthLabel(month)} · lệnh đã đóng`} /></div>
            </>
          )}
        </Card>

        {/* Demo */}
        <Card className="!p-3 sm:!p-4">
          <Head icon={Bot} title="Demo tự động" onOpen={() => go("bot")} badge={cfg ? <Badge tone="slate">luật v{cfg.cfgVer}</Badge> : null} />
          {!session ? <div className="py-6 text-[12px] text-slate-400">Chưa có phiên Demo.</div> : !demo ? <div className="flex items-center gap-2 py-6 text-[12px] text-slate-400">{demoErr ? <span className="text-rose-600">{demoErr}</span> : <><Loader2 size={14} className="animate-spin" /> Đang chạy lại phiên Demo…</>}</div> : (
            <>
              <Row k="Vốn" v={<>{fmtUsd(dEq)} <span className={tone(dEq - cfg.capital)}>({sPct(((dEq - cfg.capital) / cfg.capital) * 100)})</span></>} />
              <Row k="Tỉ lệ thắng · R TB" v={dStats?.n ? `${fmtNum(dStats.winRate, 1, 1)}% · ${dStats.avgR >= 0 ? "+" : ""}${fmtNum(dStats.avgR, 2, 2)}R` : "—"} />
              <Row k={dOpen.length ? "Đang mở" : "Lệnh gần nhất"} v={dOpen.length ? `${dOpen.length} lệnh` : dLast ? `${dLast.coin} ${TFS[dLast.tf]?.label} · ${dm(dLast.entryAt)}` : "chưa có"} />
              <div className="mt-2"><MonthBar n={dMonth.length} label={`${monthLabel(month)} · lệnh vào`} /></div>
              {(() => { const w = weakStreams(demo.portfolio?.trades, cfg); if (!w.tfs.length && !w.pairs.length) return null; return (
                <button onClick={() => go("bot")} className="mt-2 w-full rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-left text-[11.5px] leading-snug text-amber-800">
                  ⚠ 30 ngày qua đang âm: {[...w.tfs.map((x) => `${TFS[x.tf]?.label} (${x.n} lệnh, ${fmtNum(x.avgR, 2, 2)}R)`), ...w.pairs.slice(0, 3).map((x) => `${x.coin} ${TFS[x.tf]?.label} ${fmtNum(x.avgR, 2, 2)}R`)].join(" · ")} — xem Demo → Thống kê
                </button>
              ); })()}
            </>
          )}
        </Card>

        {/* Cảnh báo giá */}
        <Card className="!p-3 sm:!p-4">
          <Head icon={BellRing} title="Cảnh báo giá" onOpen={() => go("market")} badge={<Badge tone={alerts.length ? "amber" : "slate"}>{alerts.length} đang chờ</Badge>} />
          {alerts.length ? <div className="divide-y divide-slate-100">{alerts.slice(0, 4).map((a, i) => (
            <div key={a.id || i} className="flex items-baseline justify-between gap-2 py-1 text-[12.5px]"><span className="truncate font-bold text-slate-700">{String(a.symbol || "").replace(/USDT$/, "")} <span className="font-semibold text-slate-400">{a.market === "spot" ? "Spot" : "Futures"}</span></span><span className="shrink-0 tabular-nums text-slate-600">{a.op === "<=" || a.op === "≤" || a.op === "<" ? "≤" : "≥"} {fmtPx(a.price)}</span></div>
          ))}{alerts.length > 4 && <div className="py-1 text-[11.5px] text-slate-400">+{alerts.length - 4} cảnh báo khác</div>}</div>
            : <div className="py-3 text-[12px] leading-snug text-slate-400">Chưa đặt cảnh báo nào. Vào <b>Thị trường</b> để đặt mức giá muốn được báo về điện thoại (máy chủ kiểm tra 5 phút/lần).</div>}
          <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11.5px] text-slate-500"><Target size={13} className="shrink-0 text-indigo-500" /> Mục tiêu: tối thiểu {MONTH_TARGET} lệnh/tháng cho cả Demo và bot.</div>
        </Card>
      </div>
      {/* Tuần này (từ 0h thứ Hai, giờ VN) — giống báo cáo tuần bot gửi tối Chủ nhật, xem được bất cứ lúc nào */}
      {(() => {
        const vnNow = new Date(Date.now() + 7 * 3600000), dow = (vnNow.getUTCDay() + 6) % 7; // 0 = thứ Hai
        const wk = Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate() - dow) - 7 * 3600000;
        const dW = dTrades.filter((t) => t.entryAt >= wk), dWs = statsOf(dW.filter((t) => t.status === "done")), dPnl = dW.reduce((x, t) => x + (t.pnl || 0), 0);
        const lW = live.filter((t) => t.exitAt && t.exitAt >= wk), lPnl = lW.reduce((x, t) => x + (Number(t.pnl) || 0), 0);
        const weak = demo && cfg ? weakStreams(demo.portfolio.trades, cfg) : { tfs: [], pairs: [] };
        const chg = (Array.isArray(settings.paperBotLog) ? settings.paperBotLog : []).filter((x) => x.at >= wk);
        const rr = (v) => (v == null || !isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${fmtNum(v, 2, 2)}R`);
        return (
          <Card className="!p-3 sm:!p-4">
            <div className="mb-2 flex items-center gap-2"><Target size={16} className="text-indigo-500" /><span className="text-[13.5px] font-extrabold text-slate-800">Tuần này</span><span className="text-[11.5px] text-slate-400">từ thứ Hai {dm(wk).slice(0, 5)}</span></div>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-[11px] font-bold uppercase text-slate-400">Demo</div><div className={`text-[16px] font-extrabold tabular-nums ${tone(dPnl)}`}>{fmtUsdSigned(dPnl)}</div><div className="text-[11.5px] text-slate-500">{dW.length} lệnh · thắng {dWs.n ? `${fmtNum(dWs.winRate, 0, 0)}%` : "—"} · {rr(dWs.avgR)}</div></div>
              <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-[11px] font-bold uppercase text-slate-400">Bot thật ({st?.mode === "live" ? "tiền thật" : "testnet"})</div><div className={`text-[16px] font-extrabold tabular-nums ${tone(lPnl)}`}>{fmtUsdSigned(lPnl)}</div><div className="text-[11.5px] text-slate-500">{lW.length} lệnh đóng · {lW.filter((t) => Number(t.pnl) > 0).length} thắng</div></div>
              <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-[11px] font-bold uppercase text-slate-400">Đang yếu 30 ngày</div>
                {weak.tfs.length || weak.pairs.length ? <div className="text-[12px] leading-snug text-amber-700">{[...weak.tfs.map((x) => `khung ${TFS[x.tf]?.label} ${rr(x.avgR)}`), ...weak.pairs.slice(0, 3).map((x) => `${x.coin} ${TFS[x.tf]?.label} ${rr(x.avgR)}`)].join(" · ")}</div> : <div className="text-[12px] text-emerald-700">Không cặp nào âm</div>}
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2"><div className="text-[11px] font-bold uppercase text-slate-400">Đổi luật tuần này</div>
                {chg.length ? chg.slice(0, 3).map((x, i) => { const A = dTrades.filter((t) => t.status === "done" && t.entryAt >= x.at), a = A.length ? A.reduce((q, t) => q + t.r, 0) / A.length : null; return <div key={i} className="truncate text-[12px] text-slate-600" title={x.reason || ""}>{String(x.what || "").slice(0, 38)} → {A.length ? `${A.length} lệnh ${rr(a)}` : "chưa có lệnh"}</div>; }) : <div className="text-[12px] text-slate-400">Không đổi gì</div>}
              </div>
            </div>
          </Card>
        );
      })()}
      <div className="px-3 text-center text-[11px] text-slate-400 sm:px-0">Không phải tư vấn đầu tư. Kết quả Demo là chạy lại trên dữ liệu thật, không đảm bảo tương lai.</div>
    </div>
  );
}
