// Tách từ pages/CoinBot.jsx (28/11/2026) — chỉ di chuyển mã, logic giữ nguyên.
import { Activity, ChevronDown, History, Radio } from "lucide-react";
import { Card } from "../ui.jsx";
import { SETUPS, TFS, cfgOf, symOf } from "../../lib/paperBot.js";
import { SW3_TP, sw3Targets } from "../../lib/sw3Targets.js";
import { Term } from "../Term.jsx";
import { ask } from "../ConfirmDialog.jsx";
import { fmtNum, fmtPx, fmtUsd } from "../../lib/format.js";
import { statsMoney } from "../../lib/liveStats.js";
import { supabase } from "../../lib/supabase.js";
import { useEffect, useRef, useState } from "react";
import { viReason } from "../../lib/glossary.js";

// Bot thật có đang theo phiên Demo không (dòng command, chỉ chủ đọc được) → null = không biết / không theo
export function useLiveFollow() {
  const [v, setV] = useState(null);
  useEffect(() => {
    let off = false;
    // Bot mặc định "theo Demo" khi chưa lưu cấu hình riêng → chỉ coi là không theo khi followDemo === false. Chế độ lấy từ trạng thái bot báo về.
    Promise.all([
      supabase.from("qws_live_bot").select("data").eq("id", "command").maybeSingle(),
      supabase.from("qws_live_bot").select("data").eq("id", "status").maybeSingle(),
    ]).then(([cmd, st]) => {
      if (off || cmd.error || !st.data?.data) return;
      const c = cmd.data?.data?.config || {}, mode = c.mode || st.data.data.mode;
      setV(c.followDemo === false ? null : mode === "live" ? "live" : "testnet");
    });
    return () => { off = true; };
  }, []);
  return v;
}
// 01/11: nhãn rõ ràng — sửa Demo khi bot thật đang theo = sửa luôn bot thật
export function FollowNote({ mode, compact }) {
  if (!mode) return null;
  const money = mode === "live";
  return compact
    ? <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${money ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}><Radio size={11} /> Dùng chung với bot {money ? "TIỀN THẬT" : "thật (testnet)"}</span>
    : <div className={`mb-3 rounded-xl px-3 py-2 text-[12px] font-semibold ${money ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200" : "bg-amber-50 text-amber-800 ring-1 ring-amber-200"}`}>Bot {money ? "TIỀN THẬT" : "thật (testnet)"} đang theo phiên Demo: cặp, khung, rủi ro, số lệnh mở, dừng ngày, đòn bẩy đặt ở đây sẽ áp dụng cho bot sau khoảng 5 phút. Muốn bot giữ cấu hình riêng: tab Bot thật → bỏ chọn "theo phiên Demo".</div>;
}

// Bot thật đang "theo Demo" → đổi cấu hình phiên Demo là đổi luôn bot (sau ~5 phút). 01/11: liệt kê thay đổi + hỏi trước.
export async function confirmLiveFollow(oldRaw = {}, newRaw = {}) {
  const oldCfg = oldRaw ? cfgOf({ cfg: oldRaw }) : {}, newCfg = cfgOf({ cfg: newRaw || {} }); // so cấu hình THỰC (đã điền mặc định) — tránh hiện "undefined%"
  const r = await supabase.from("qws_live_bot").select("data").eq("id", "command").maybeSingle();
  if (r.error) return true;
  const c = r.data?.data?.config || {}; // chưa lưu cấu hình riêng = bot đang theo Demo (mặc định)
  if (c.followDemo === false) return true;
  const L = [];
  const num = (k, lb, u) => { if (oldCfg[k] != null && Number(oldCfg[k]) !== Number(newCfg[k])) L.push(`${lb}: ${oldCfg[k]}${u} → ${newCfg[k]}${u}`); };
  num("riskPct", "Rủi ro / lệnh", "%"); num("maxOpen", "Tối đa lệnh mở", ""); num("dailyStopPct", "Dừng ngày khi lỗ", "%"); num("maxLev", "Đòn bẩy tối đa", "x");
  const set = (k, lb) => { const a = (oldCfg[k] || []).join("/"), b = (newCfg[k] || []).join("/"); if (a && a !== b) L.push(`${lb}: ${a} → ${b}`); };
  set("coins", "Cặp"); set("tfs", "Khung");
  if ((oldCfg.sw?.entry || "") !== (newCfg.sw?.entry || "")) L.push(`Cách vào lệnh: ${oldCfg.sw?.entry === "lim" ? "lệnh chờ M15" : "thị trường"} → ${newCfg.sw?.entry === "lim" ? "lệnh chờ M15 (phương án D)" : "thị trường"}`);
  if (!L.length) return true;
  const st = c.mode ? null : await supabase.from("qws_live_bot").select("data").eq("id", "status").maybeSingle();
  const live = (c.mode || st?.data?.data?.mode) === "live";
  return ask(`Áp dụng cho cả bot ${live ? "TIỀN THẬT" : "thật (testnet)"}?\nBot đang bật "Rủi ro & giới hạn theo phiên Demo" nên khoảng 5 phút sau sẽ chạy theo:\n${L.map((x) => "• " + x).join("\n")}\nMuốn bot giữ cấu hình riêng: tab Bot thật → bỏ chọn "theo phiên Demo".`, { danger: live, ok: live ? "Áp dụng cho tiền thật" : "Áp dụng" });
}
export const usd = (v, d = 2) => fmtUsd(v, d); // một kiểu tiền chung cho module Coin ("$1.234,56")
export const pct = (v) => (v == null || !isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${fmtNum(v, 1, 1)}%`);
export const rr = (v) => (v == null || !isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${fmtNum(v, 2, 2)}R`);
export const f2 = (v) => (v == null || !isFinite(v) ? "—" : fmtNum(v, 2, 2));
export const px = (v) => fmtPx(v);
export const dt = (t) => { const d = new Date(t); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
export const hm = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`; };
export const ago = (t) => { const d = (Date.now() - t) / 86400000; return d >= 1 ? `${Math.floor(d)} ngày ${Math.floor((d % 1) * 24)} giờ` : `${Math.floor(d * 24)} giờ`; };
export const tone = (v) => (v == null ? "text-slate-900" : v >= 0 ? "text-emerald-600" : "text-rose-600");
export const setupName = (k) => SETUPS[k]?.label.split(" (")[0] || k;
export const tpLbl = (t) => (t?.setup === "SW3" ? "Chốt 1/3" : "Chốt lời"); // SW3 không có TP cố định — mức này chỉ chốt 1/3 vị thế
export const side = (s) => <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-extrabold text-white ${s === 1 ? "bg-emerald-500" : "bg-rose-500"}`}>{s === 1 ? "MUA" : "BÁN"}</span>;

// Biểu đồ nến của 1 luồng (cặp × khung) + điểm vào/ra của mọi lệnh bot + đường Entry/SL/TP lệnh đang mở / lệnh đang chọn + lệnh chờ.
// Giờ hiển thị theo giờ VN (UTC+7). Nến đang chạy cập nhật realtime từ WebSocket.
export const VN = 7 * 3600, toT = (ms) => Math.floor(ms / 1000) + VN;
// Chi tiết lệnh SW3/D bằng lời thường (sếp 08/11): vì sao vào, vì sao không đặt chốt lời cố định, vì sao đóng / đang chờ gì
export const EXIT_WHY = {
  "Cắt lỗ": "Giá đi ngược hướng lệnh và chạm mức cắt lỗ ban đầu (cách giá vào 2 lần biên độ nến H4) → mất đúng 1R như đã tính trước.",
  "Dời SL theo đáy/đỉnh 20 nến (giảm lỗ)": "Chưa tới mức chốt 1/3, nhưng cắt lỗ đã được dời theo đỉnh/đáy 20 nến H4. Giá quay đầu chạm mức đã dời nên lỗ ít hơn 1R (hoặc hoà).",
  "Chốt 1/3 + hoà vốn": "Đã chốt 1/3 ở +0,75R và dời cắt lỗ về giá vào. Sau đó giá quay về giá vào nên phần còn lại đóng hoà vốn — lệnh vẫn lãi nhờ phần đã chốt.",
  "Chốt 1/3 + dời SL khoá lời": "Đã chốt 1/3, cắt lỗ dời dần theo xu hướng. Giá quay đầu chạm mức cắt lỗ đã khoá lời → đóng phần còn lại có lãi.",
};
export function TradeWhy({ t, lv, wide = false }) {
  if (t.setup !== "SW3" || !t.why3) return t.why3 ? <div className="text-[11.5px] text-slate-500">Tiêu chí lúc vào: {t.why3}</div> : null;
  const m = (re) => (t.why3.match(re) || [])[1];
  const brk = m(/phá vượt ([\d.,-]+) ATR/), vol = m(/volume ([\d.,]+)×/), h4 = m(/(trên|dưới) EMA200 H4/), btc = m(/BTC (trên|dưới|chưa rõ) EMA50 D1/);
  const L = t.side === 1, dir = L ? "MUA" : "BÁN", g = sw3Targets(t.entry, t.side, Math.abs(t.entry - t.sl)), lvl = lv ? (L ? lv.lo : lv.hi) : null;
  const sec = "rounded-lg bg-white/70 px-2.5 py-2 ring-1 ring-slate-100";
  return (
    <div className={`grid gap-2 text-[11.5px] leading-snug text-slate-600 ${wide ? "md:grid-cols-3" : ""}`}>
      <div className={sec}><b className="text-slate-800">1. Vì sao vào lệnh {dir}</b><ul className="mt-1 list-disc space-y-0.5 pl-4">
        <li>Nến H4 đóng {L ? "phá lên trên đỉnh" : "phá xuống dưới đáy"} 30 nến gần nhất{brk ? <>, vượt <b>{brk.replace(".", ",")}</b> lần biên độ nến (cần ≥ 0,3)</> : ""}.</li>
        {vol && <li>Khối lượng nến đó gấp <b>{vol.replace(".", ",")}</b> lần trung bình 20 nến (cần ≥ 1,3) → có tiền thật đẩy giá.</li>}
        {h4 && <li>Giá {h4} đường TB 200 nến H4 → thuận xu hướng lớn của mã.</li>}
        {btc && <li>BTC {btc} đường TB 50 nến ngày → thị trường chung cùng hướng.</li>}
        <li>Là cú phá vỡ đầu tiên của nhịp (không đuổi theo cú thứ 2, 3).</li>
        <li>{t.fill === "lim" ? "Vào bằng lệnh chờ trên M15: giá hồi lại 0,25 biên độ trong 4 giờ nên khớp giá đẹp hơn." : t.fill === "mkt" ? "Giá không hồi trong 4 giờ → vào giá thị trường để không lỡ cú chạy." : "Vào ở giá mở nến kế tiếp."}</li>
      </ul></div>
      <div className={sec}><b className="text-slate-800">2. Vì sao không đặt chốt lời cố định</b><ul className="mt-1 list-disc space-y-0.5 pl-4">
        <li>Chốt 1/3 ở +0,75R ({px(t.tp)}) để có lãi sớm, rồi dời cắt lỗ về hoà vốn → lệnh không còn lỗ.</li>
        <li>2/3 còn lại thả chạy, cắt lỗ dời theo {L ? "đáy" : "đỉnh"} 20 nến H4{lvl != null && isFinite(lvl) ? <> (đang ở <b>{px(lvl)}</b>)</> : ""}. Lợi nhuận của D đến từ số ít lệnh chạy rất xa — đặt chốt lời cố định sẽ cắt mất những lệnh đó.</li>
        {g && <li>Chốt lời kỳ vọng <b>{px(g.avg)}</b> (+1,5R) = mức trung bình phần còn lại đóng ở trong 2.100 lệnh quá khứ; 1/10 lệnh chạy tới <b>{px(g.far)}</b> (+3,8R). Chỉ để tham khảo, không phải lệnh trên sàn.</li>}
      </ul></div>
      <div className={sec}><b className="text-slate-800">3. {t.exitAt ? "Vì sao đóng lệnh" : "Lệnh sẽ đóng khi nào"}</b>
        {t.exitAt ? <p className="mt-1"><b>{viReason(t.reason)}</b> @ {px(t.exit)} · {dt(t.exitAt)}<br />{EXIT_WHY[t.reason] || ""}</p>
          : <ul className="mt-1 list-disc space-y-0.5 pl-4"><li>Giá chạm cắt lỗ <b>{px(t.curSl)}</b>{t.be ? " (đã hoà vốn — không lỗ)" : " → lỗ tối đa 1R"}.</li>{!t.part && <li>Hoặc chạm <b>{px(t.tp)}</b> thì chốt 1/3 trước, phần còn lại chạy tiếp.</li>}<li>Không có giới hạn thời gian — giữ tới khi xu hướng gãy.</li></ul>}
      </div>
    </div>
  );
}
// Thẻ lệnh Demo đang mở. SW3/D: không có TP cố định — chốt 1/3 ở +0,75R, phần còn lại chạy tới khi chạm SL dời theo đỉnh/đáy 20 nến H4
export function OpenCard({ t, lv }) {
  const [why, setWhy] = useState(false);
  const pos = Math.min(1, Math.max(0, (t.last - t.curSl) / (t.tp - t.curSl))), toTp = ((t.tp - t.last) / t.last) * 100 * t.side, toSl = ((t.last - t.curSl) / t.last) * 100 * t.side;
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5 text-[12px]">
      <div className="flex min-w-0 items-center gap-2">{side(t.side)}<b className="shrink-0 whitespace-nowrap">{t.coin} {TFS[t.tf].label}</b><span className="min-w-0 truncate text-slate-400">{setupName(t.setup)}</span><span className={`ml-auto shrink-0 whitespace-nowrap text-[14px] font-extrabold tabular-nums ${tone(t.pnl)}`}>{usd(t.pnl)}</span></div>
      <div className="mt-1 flex items-center gap-2 whitespace-nowrap tabular-nums text-slate-500"><span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-extrabold text-slate-800">Giá {px(t.last)}</span><span className={`font-bold ${tone(t.uR)}`}>{rr(t.uR)}</span><span className="ml-auto">Vào {px(t.entry)}</span></div>
      <div className="relative mt-1.5 h-1.5 rounded-full bg-gradient-to-r from-rose-300 via-slate-200 to-emerald-300"><span className="absolute -top-1 h-3.5 w-1 -translate-x-1/2 rounded bg-slate-800 transition-all duration-700" style={{ left: `${pos * 100}%` }} /></div>
      <div className="mt-1 flex flex-wrap justify-between gap-x-2 text-[11px] tabular-nums"><span className="text-rose-500">Cắt lỗ {px(t.curSl)}{t.be ? " (hoà vốn)" : ""} · còn {fmtNum(toSl, 2, 2)}%</span><span className="text-emerald-600">{tpLbl(t)} {px(t.tp)}{t.setup === "SW3" && t.part ? " ✓ đã chốt" : ` · còn ${fmtNum(toTp, 2, 2)}%`}</span></div>
      {t.setup === "SW3" && (() => { const g = sw3Targets(t.entry, t.side, Math.abs(t.entry - t.sl)); if (!g) return null; const d = (x) => fmtNum(((x - t.last) / t.last) * 100 * t.side, 2, 2); return (
        <div className="mt-1 flex flex-wrap justify-between gap-x-2 text-[11px] tabular-nums"><span className="text-emerald-600"><Term k="tpExp">Chốt lời kỳ vọng</Term> <b>{px(g.avg)}</b> (+{fmtNum(SW3_TP.avgR, 1, 1)}R){(g.avg - t.last) * t.side > 0 ? ` · còn ${d(g.avg)}%` : " ✓ đã vượt"}</span><span className="text-teal-600"><Term k="tpFar" align="right" /> {px(g.far)} (+{fmtNum(SW3_TP.farR, 1, 1)}R){(g.far - t.last) * t.side > 0 ? ` · còn ${d(g.far)}%` : " ✓"}</span></div>
      ); })()}
      {t.setup === "SW3" && (() => { const lvl = lv ? (t.side === 1 ? lv.lo : lv.hi) : null, nb = t.side === 1 ? "đáy" : "đỉnh"; return (
        <div className="mt-1 rounded-lg bg-indigo-50/70 px-2 py-1 text-[11px] leading-snug text-slate-600"><b>{t.part ? "2/3 còn lại" : "Sau khi chốt 1/3"}:</b> không đặt mức chốt lời cố định — giữ tới khi chạm cắt lỗ. Cắt lỗ tự dời theo {nb} 20 nến H4{lvl != null && isFinite(lvl) ? <> (hiện <b className="tabular-nums">{px(lvl)}</b>{(lvl - t.curSl) * t.side > 0 ? "" : ` — chỉ dời khi mốc này ${t.side === 1 ? "lên trên" : "xuống dưới"} ${px(t.curSl)}`})</> : ""}, chỉ dời theo hướng có lợi.</div>
      ); })()}
      <div className="mt-1 flex items-start gap-2 text-[11px] text-slate-400"><span className="min-w-0">Mở {dt(t.entryAt)} · vị thế {usd(t.notional, 0)} ({fmtNum(t.lev, 1, 1)}x vốn) · rủi ro {usd(t.riskUsd)}{t.score ? ` · ${t.score.variant}` : ""}</span>
        <button onClick={() => setWhy((v) => !v)} aria-expanded={why} className="ml-auto flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 font-bold text-indigo-500 hover:bg-indigo-50">Vì sao? <ChevronDown size={12} className={why ? "rotate-180" : ""} /></button></div>
      {why && <div className="mt-1.5"><TradeWhy t={t} lv={lv} /></div>}
    </div>
  );
}
export function Num({ label, v, sub, tone: t = "text-slate-900", className = "" }) {
  return <div className={`bg-white px-3 py-2.5 ${className}`}><div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div><div className={`text-lg font-extrabold tabular-nums ${t}`}>{v}</div>{sub && <div className="text-[11px] text-slate-400">{sub}</div>}</div>;
}
export const Title = ({ icon: I, children, right }) => <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{I && <I size={13} className="text-indigo-500" />}{children}{right && <span className="ml-auto normal-case tracking-normal">{right}</span>}</div>;

export function StatTable({ title, rows }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{title}</div>
      <table className="w-full text-[12px]">
        <thead><tr className="border-b border-slate-100 text-left text-[10px] uppercase text-slate-400"><th className="py-1.5 pr-2" /><th className="py-1.5 pr-2 text-right">Lệnh</th><th className="py-1.5 pr-2 text-right">Thắng</th><th className="py-1.5 pr-2 text-right"><Term k="avgR" align="right">R TB</Term></th><th className="py-1.5 pr-2 text-right"><Term k="pf" align="right">Hệ số lãi</Term></th><th className="py-1.5 text-right">Tổng R</th></tr></thead>
        <tbody>{rows.filter(([, s]) => s.n).map(([name, s]) => (
          <tr key={name} className="border-b border-slate-50">
            <td className="py-1.5 pr-2 font-bold text-slate-700">{name}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums">{s.n}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums">{fmtNum(s.winRate, 0, 0)}%</td>
            <td className={`py-1.5 pr-2 text-right font-bold tabular-nums ${tone(s.avgR)}`}>{rr(s.avgR)}</td>
            <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">{s.pf === Infinity ? "∞" : f2(s.pf)}</td>
            <td className={`py-1.5 text-right tabular-nums ${tone(s.totalR)}`}>{fmtNum(s.totalR, 1, 1)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

// Thêm / sửa / xoá cặp cho bot (Demo + bot thật dùng chung danh sách). Cặp mới phải có trên Binance USDⓈ-M Futures.
export const SUGGEST = ["BTC", "ETH", "XAU", "SOL", "BNB", "XRP", "DOGE", "LINK"];
export const normCoin = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/USDT$/, "");
export async function futuresHas(c) {
  try { const r = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symOf(c)}`, { signal: AbortSignal.timeout(15000) }); if (!r.ok) return false; const j = await r.json(); return Number(j.markPrice) > 0; } catch { return null; }
}
export function useLive(active, coins, tfs, onClose) {
  const live = useRef({}), shown = useRef({}), dirty = useRef(false), cb = useRef(onClose);
  const [ver, setVer] = useState(0), [status, setStatus] = useState("off");
  cb.current = onClose;
  const ck = coins.join(), tk = tfs.join();
  useEffect(() => {
    if (!active) { setStatus("off"); return undefined; }
    let ws = null, stop = false, retry = 0, timer = null;
    const sym2coin = Object.fromEntries(coins.map((c) => [symOf(c), c]));
    const streams = coins.flatMap((c) => tfs.map((tf) => `${symOf(c).toLowerCase()}@kline_${tf}`)).join("/");
    const connect = () => {
      setStatus(retry ? "reconnect" : "connecting");
      ws = new WebSocket(`wss://fstream.binance.com/market/stream?streams=${streams}`);
      ws.onopen = () => { retry = 0; setStatus("live"); };
      ws.onmessage = (m) => {
        try {
          const k = JSON.parse(m.data)?.data?.k; if (!k) return;
          const coin = sym2coin[k.s]; if (!coin) return;
          live.current[`${coin}|${k.i}`] = { t: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c, v: +k.v };
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

// Nhật ký thay đổi luật: lúc đổi (số liệu khi đó) → sau khi đổi (lệnh vào từ lúc đổi, theo luật hiện tại)
// Phễu tín hiệu (24/10): sếp thấy "rất nhiều tín hiệu mà ít vào lệnh" → hiện rõ từ tín hiệu thô tới lệnh, mỗi bộ lọc bỏ bao nhiêu.
// Số liệu = cả phiên Demo (res.skipped đếm chính xác từ ngày bắt đầu, cùng luật bot thật).
export function SignalFunnel({ res, P }) {
  const [open, setOpen] = useState(false);
  const total = (res.streams || []).reduce((a, s) => a + (s.signals || 0), 0);
  const taken = P.trades.filter((t) => t.status !== "skip").length;
  if (!total) return null;
  const days = Math.max(1, (res.until - res.startAt) / 86400000);
  const port = {}; for (const t of P.trades) if (t.status === "skip") port[t.why || "giới hạn vốn"] = (port[t.why || "giới hạn vốn"] || 0) + 1;
  const rows = [...Object.entries(res.skipped || {}), ...Object.entries(port).map(([k, v]) => [`${k} (quản lý vốn)`, v]), ...(res.rejected?.length ? [["bộ tối ưu / bài học loại", res.rejected.length]] : [])].sort((a, b) => b[1] - a[1]);
  const pct = (v) => `${fmtNum((v / total) * 100, 1, 1)}%`;
  return (
    <Card className="!p-3">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 text-left">
        <Activity size={15} className="shrink-0 text-cyan-500" />
        <span className="text-[13px] font-extrabold text-slate-800">Phễu tín hiệu</span>
        <span className="text-[12px] text-slate-500"><b className="text-slate-700">{total.toLocaleString("vi-VN")}</b> tín hiệu thô → <b className="text-emerald-600">{taken}</b> lệnh ({pct(taken)}) · TB {fmtNum(total / days, 0, 0)} tín hiệu → {fmtNum(taken / days, 1, 1)} lệnh / ngày</span>
        <ChevronDown size={15} className={`ml-auto shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="mt-2 space-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[1fr_auto] items-center gap-x-2 text-[12px] sm:grid-cols-[minmax(0,260px)_1fr_auto]">
            <span className="min-w-0 truncate text-slate-600" title={k}>Bỏ: {k}</span>
            <div className="col-span-2 row-start-2 h-1.5 overflow-hidden rounded-full bg-slate-100 sm:col-span-1 sm:row-start-auto"><div className="h-full rounded-full bg-rose-400" style={{ width: `${Math.max(1, (v / total) * 100)}%` }} /></div>
            <span className="tabular-nums text-slate-500 sm:order-last">{v.toLocaleString("vi-VN")} · {pct(v)}</span>
          </div>
        ))}
        <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 text-[12px] font-bold sm:grid-cols-[minmax(0,260px)_1fr_auto]"><span className="text-emerald-700">Vào lệnh</span><div className="col-span-2 row-start-2 h-1.5 overflow-hidden rounded-full bg-slate-100 sm:col-span-1 sm:row-start-auto"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(1, (taken / total) * 100)}%` }} /></div><span className="tabular-nums text-emerald-700 sm:order-last">{taken} · {pct(taken)}</span></div>
        <div className="pt-1 text-[11.5px] leading-snug text-slate-500">"Tín hiệu thô" = mẫu nến khớp 1 trong 4 setup trên mọi cặp × khung (rất nhiều, phần lớn là nhiễu). Bot chỉ vào khi qua <b>đủ mọi bộ lọc</b>. Kiểm thử 3 kỳ × 90 ngày (24/10): bỏ lọc D1 / Key Volume / engulfing / hạ SL tối thiểu đều <b>thêm lệnh nhưng giảm lãi</b>; thêm lọc cấu trúc sóng (BOS/CHoCH, HH-HL) hay setup FTR tại Key Volume cũng không cải thiện. Riêng nới "đuổi giá" 1,5 → 2,5 ATR giảm sụt vốn cả 3 kỳ → đã áp dụng (luật v11). Thử thêm 28/10: bias cấu trúc khung lớn H4/D1/W1, SMC thuần, Elliott sóng 3, Wyckoff (SFP trong vùng tích luỹ), xác nhận Price Action — không phương án nào lãi hơn; bias cấu trúc H4+D1+W1 giảm sụt vốn ~một nửa nhưng lãi và số lệnh cũng giảm ~một nửa. Thử 30/10: nới bài học / thêm coin đều lỗ hơn; giảm rủi ro BREAKOUT + SFP còn 1% lãi hơn 5/6 kỳ, sụt vốn thấp hơn 6/6 → đã áp dụng (luật v12). Quá khứ không bảo đảm tương lai; không phải tư vấn đầu tư.</div>
      </div>}
    </Card>
  );
}

export function RulesLog({ log, list }) {
  const rows0 = Array.isArray(log) ? log : [];
  const [all, setAll] = useState(false);
  // Lọc (22/10): theo nguồn (Demo / Bot thật) + người đổi
  const [src, setSrc] = useState("all"), [who, setWho] = useState("all");
  const people = [...new Set(rows0.map((r) => r.by).filter(Boolean))];
  const rows = rows0.filter((r) => (src === "all" || (src === "bot") === (r.src === "bot")) && (who === "all" || r.by === who));
  const chip = (on) => `rounded-full px-2 py-0.5 text-[11px] font-bold ${on ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`;
  return (
    <Card className="!p-3">
      <Title icon={History}>Nhật ký thay đổi luật ({rows.length}{rows.length !== rows0.length ? `/${rows0.length}` : ""})</Title>
      {rows0.length > 3 && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1">
          {[["all", "Tất cả"], ["demo", "Demo"], ["bot", "Bot thật"]].map(([k, l]) => <button key={k} onClick={() => setSrc(k)} className={chip(src === k)}>{l}</button>)}
          {people.length > 1 && <><span className="mx-1 h-3 w-px bg-slate-200" />{[["all", "Mọi người"], ...people.map((p) => [p, p.split("@")[0]])].map(([k, l]) => <button key={k} onClick={() => setWho(k)} className={chip(who === k)}>{l}</button>)}</>}
        </div>
      )}
      {!rows0.length ? <div className="text-[12px] text-slate-400">Chưa có thay đổi nào được ghi. Từ nay mỗi lần tắt/bật cặp, khung, sửa cặp, tạo phiên mới hay dừng phiên đều được ghi lại ở đây.</div> : (
        <div className="divide-y divide-slate-100">
          {(all ? rows : rows.slice(0, 8)).map((r, i) => {
            const after = statsMoney(list.filter((t) => t.entryAt >= r.at));
            return (
              <div key={r.at + "-" + i} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5 text-[12px]">
                <span className="tabular-nums text-slate-400">{dt(r.at)}</span>
                <span className={`rounded px-1.5 text-[10px] font-bold ${r.src === "bot" ? "bg-rose-50 text-rose-600" : "bg-indigo-50 text-indigo-600"}`}>{r.src === "bot" ? "Bot thật" : "Demo"}</span>
                <b className="text-slate-800">{String(r.what || "").replace(/^Bot thật: /, "")}</b>
                {r.by && <span className="text-[11px] text-slate-400">{r.by.split("@")[0]}</span>}
                {r.reason && <span className="text-[11.5px] italic text-slate-500">“{r.reason}”</span>}
                <span className="ml-auto flex flex-wrap gap-x-3 text-[11.5px] tabular-nums">
                  {r.snap && <span className="text-slate-500">lúc đổi: {r.snap.n} lệnh · {rr(r.snap.avgR)}{r.snap.eq != null ? ` · ${usd(r.snap.eq, 0)}` : ""}</span>}
                  <span className={after.n ? tone(after.avgR) : "text-slate-400"}>sau đó: {after.n ? `${after.n} lệnh · thắng ${fmtNum(after.winRate, 0, 0)}% · ${rr(after.avgR)}` : "chưa có lệnh đóng"}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
      {!!rows0.length && !rows.length && <div className="py-1 text-[12px] text-slate-400">Không có dòng nào khớp bộ lọc.</div>}
      {rows.length > 8 && <button onClick={() => setAll((v) => !v)} className="mt-1 text-[12px] font-bold text-indigo-600">{all ? "Thu gọn" : `Xem cả ${rows.length} dòng`}</button>}
      <div className="mt-1 text-[11px] text-slate-400">"Sau đó" = lệnh vào từ lúc đổi theo luật đang chạy — cần vài tuần mới đủ để đánh giá một thay đổi.</div>
    </Card>
  );
}
