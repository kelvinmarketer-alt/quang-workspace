// 14/11/2026 — Thẻ "Bot demo đánh giá" ở tab Thị trường (sếp: tích hợp phương pháp bot demo làm 1 yếu tố quyết định).
// Đọc trạng thái mã theo đúng 5 tiêu chí SW3 / phương án D (lib/paperBot.js sw3Now) + thành tích bot demo với mã đó.
// Chỉ đọc — không tạo lệnh. Cùng dữ liệu này được gửi kèm cho AI (sw3Brief) để AI đối chiếu.
import { useEffect, useState } from "react";
import { Bot, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Card } from "./ui.jsx";
import { sw3Now } from "../lib/paperBot.js";
import { fmtPx, fmtNum } from "../lib/format.js";

const pad = (n) => String(n).padStart(2, "0");
const dm = (t) => { const d = new Date(t); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
const hm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dirW = (s) => (s === 1 ? "MUA" : "BÁN");
const pctTo = (to, from) => (to && from ? ((to - from) / from) * 100 : null);
const sP = (v) => (v == null || !isFinite(v) ? "" : `${v >= 0 ? "+" : ""}${fmtNum(v, 2)}%`);
const sR = (v) => (v == null || !isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${fmtNum(v, 2, 1)}R`);
const above = (x) => (x === 1 ? "trên" : x === -1 ? "dưới" : "chưa rõ so với");

// Kết luận 1 dòng của bot cho mã: tone · tiêu đề · câu giải thích
export function sw3Verdict(v, price) {
  if (!v || v.err) return null;
  const p = price || v.close, f = v.fresh, r = v.ride;
  if (f && !f.fail) return { tone: f.side === 1 ? "emerald" : "rose", dir: f.side, title: `Có tín hiệu ${dirW(f.side)} (nến H4 đóng ${hm(f.at + 4 * 3600000)})`,
    text: v.lim ? `Đặt lệnh chờ ${dirW(f.side)} ở ${fmtPx(f.entry)}; tới ${hm(f.fallbackAt)} chưa khớp thì vào giá thị trường. Cắt lỗ ${fmtPx(f.sl)}, chốt 1/3 ở ${fmtPx(f.tp1)} rồi dời hoà vốn.` : `Vào lệnh thị trường đầu nến kế. Cắt lỗ ${fmtPx(f.sl)}, chốt 1/3 ở ${fmtPx(f.tp1)}.` };
  if (f && f.fail) return { tone: "amber", dir: 0, title: "Vừa phá vỡ nhưng bị loại", text: `Lý do: ${f.fail}. Bot bỏ qua các cú phá vỡ tiếp theo của nhịp này.` };
  const pre = r && v.startAt && r.at < v.startAt; // nhịp bắt đầu trước khi phiên bot demo chạy → bot không có lệnh này
  if (r && !r.fail && pre) return { tone: "amber", dir: 0, title: `Nhịp ${dirW(r.side)} từ ${dm(r.at)} (trước khi bot chạy) còn chạy`, text: `Bot không có lệnh này và bỏ qua cú phá vỡ mới cho tới khi giá chạm ${fmtPx(r.stop)} (cách ${sP(pctTo(r.stop, p))}).` };
  if (r && !r.fail) return { tone: r.side === 1 ? "emerald" : "rose", dir: r.side, hold: true, title: `Đang trong lệnh ${dirW(r.side)} (tín hiệu ${dm(r.at)})`,
    text: `${r.half ? "Đã chốt 1/3, cắt lỗ đã về hoà vốn rồi dời theo" : "Cắt lỗ dời theo"} ${r.side === 1 ? "đáy" : "đỉnh"} 20 nến H4: ${fmtPx(r.stop)} (cách ${sP(pctTo(r.stop, p))}). Không mở lệnh mới mã này tới khi chạm mức đó.` };
  if (r && r.fail) return { tone: "amber", dir: 0, title: `Nhịp ${dirW(r.side)} cũ (${dm(r.at)}) còn chạy`, text: `Cú phá vỡ đó bị loại vì ${r.fail} nhưng vẫn tính là 1 nhịp. Bot bỏ qua cú phá vỡ mới cho tới khi giá chạm ${fmtPx(r.stop)} (cách ${sP(pctTo(r.stop, p))}).` };
  if (!v.allowed) return { tone: "slate", dir: 0, title: "Đứng ngoài: hai khung lệch nhau", text: `${v.coin} đang ${above(v.h4)} EMA200 H4 nhưng BTC ${above(v.btc)} EMA50 D1. Bot chỉ vào khi cả hai cùng hướng.` };
  const at = v.allowed === 1 ? v.buyAt : v.sellAt;
  return { tone: "indigo", dir: v.allowed, wait: true, title: `Chờ ${dirW(v.allowed)}: H4 đóng ${v.allowed === 1 ? "trên" : "dưới"} ${fmtPx(at)}`, text: `Cách giá hiện tại ${sP(pctTo(at, p))} (≈ ${fmtNum(Math.abs(at - p) / v.atr, 1)} ATR H4), kèm volume ≥ ${fmtNum(v.volNeed, 1)}× TB20. Chưa tới mức đó thì bot không vào.` };
}

// Bản gọn gửi AI (trường "bot" trong dữ liệu)
export function sw3Brief(v, rec, price) {
  if (!v || v.err) return null;
  const vd = sw3Verdict(v, price);
  return {
    method: "SW3 phương án D (bot demo của người dùng, khung H4)",
    verdict: `${vd.title}. ${vd.text}`,
    allowed_direction: v.allowed === 1 ? "chỉ MUA" : v.allowed === -1 ? "chỉ BÁN" : "đứng ngoài",
    coin_vs_ema200_h4: above(v.h4), btc_vs_ema50_d1: above(v.btc),
    buy_trigger_close_above: +v.buyAt.toPrecision(6), sell_trigger_close_below: +v.sellAt.toPrecision(6),
    last_closed_volume_x: +fmtNum(v.volLast, 2).replace(",", "."),
    in_position: v.ride && !v.ride.fail && !(v.startAt && v.ride.at < v.startAt) ? { side: dirW(v.ride.side), since: dm(v.ride.at), trailing_stop: +v.ride.stop.toPrecision(6) } : null,
    fresh_signal: v.fresh ? { side: dirW(v.fresh.side), rejected: v.fresh.fail || null } : null,
    coin_in_bot_list: v.inList,
    demo_record: rec && rec.n ? { closed: rec.done, wins: rec.win, total_R: +rec.sumR.toFixed(2), open: rec.open } : null,
  };
}

const TONES = {
  emerald: "bg-emerald-50 text-emerald-700", rose: "bg-rose-50 text-rose-700", amber: "bg-amber-50 text-amber-800",
  slate: "bg-slate-100 text-slate-700", indigo: "bg-indigo-50 text-indigo-700",
};
function Crit({ ok, t, d }) {
  const Icon = ok === true ? CheckCircle2 : ok === false ? XCircle : Clock;
  return (
    <div className="flex items-start gap-2 py-1.5">
      <Icon size={14} className={`mt-0.5 shrink-0 ${ok === true ? "text-emerald-500" : ok === false ? "text-rose-500" : "text-slate-400"}`} />
      <div className="min-w-0 text-[12px] leading-snug"><b className="text-slate-700">{t}</b> <span className="text-slate-500">{d}</span></div>
    </div>
  );
}

// v: kết quả sw3Now (cha tải để dùng chung cho AI) · rec: thành tích bot demo với mã · price: giá đang chạy
export default function BotView({ v, busy, rec, price }) {
  if (!v && !busy) return null;
  const vd = v && !v.err ? sw3Verdict(v, price) : null, f = v?.fresh, p = price || v?.close;
  return (
    <Card className="!p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400"><Bot size={13} className="text-indigo-500" />Bot demo đánh giá {v?.coin || ""} · luật SW3 phương án D</span>
        {busy && <Loader2 size={13} className="animate-spin text-slate-400" />}
      </div>
      {v?.err && <div className="text-[12px] text-slate-500">{v.err}</div>}
      {vd && (<>
        <div className={`rounded-xl px-3 py-2.5 ${TONES[vd.tone]}`}>
          <div className="text-[13.5px] font-extrabold">{vd.title}</div>
          <div className="mt-0.5 text-[12px] leading-snug opacity-90">{vd.text}</div>
        </div>
        <div className="mt-1.5 divide-y divide-slate-100">
          <Crit ok={f ? true : null} t="Phá đỉnh/đáy 30 nến H4:" d={f ? `nến vừa đóng phá ${f.side === 1 ? "đỉnh" : "đáy"}.` : `MUA khi đóng > ${fmtPx(v.buyAt)} (${sP(pctTo(v.buyAt, p))}) · BÁN khi đóng < ${fmtPx(v.sellAt)} (${sP(pctTo(v.sellAt, p))}). Nến kế đóng lúc ${hm(v.nextClose)}.`} />
          <Crit ok={f ? f.brk >= v.P.brkAtr : null} t="Phá đủ mạnh:" d={f ? `vượt ${fmtNum(f.brk, 2)} ATR (cần ≥ ${fmtNum(v.P.brkAtr, 1)}).` : `đã cộng ${fmtNum(v.P.brkAtr, 1)} ATR vào hai mức trên.`} />
          <Crit ok={f ? f.vx >= v.P.volX : null} t="Volume xác nhận:" d={f ? `${fmtNum(f.vx, 2)}× TB20 (cần ≥ ${fmtNum(v.P.volX, 1)}×).` : `nến vừa đóng ${fmtNum(v.volLast, 2)}× TB20; lúc phá cần ≥ ${fmtNum(v.P.volX, 1)}×.`} />
          <Crit ok={v.allowed !== 0} t="Thuận 2 khung:" d={`${v.coin} ${above(v.h4)} EMA200 H4 (${fmtPx(v.ema200)}) · BTC ${above(v.btc)} EMA50 D1 (${fmtPx(v.btcEma)}) → ${v.allowed === 1 ? "chỉ xét MUA" : v.allowed === -1 ? "chỉ xét BÁN" : "đứng ngoài"}.`} />
          <Crit ok={!v.ride} t="Cú phá vỡ đầu tiên của nhịp:" d={v.ride ? `đang trong nhịp ${dirW(v.ride.side)} từ ${dm(v.ride.at)}, kết thúc khi chạm ${fmtPx(v.ride.stop)}.` : "không có nhịp cũ đang chạy."} />
        </div>
        <div className="mt-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11.5px] leading-snug text-slate-500">
          {!v.inList ? <>Mã này <b>không</b> nằm trong danh sách bot chạy, đây chỉ là đánh giá theo luật.</> : rec && rec.n ? (
            <>Bot demo với {v.coin}: <b className="text-slate-700">{rec.done} lệnh đã đóng</b>, thắng {rec.win}, tổng <b className={rec.sumR >= 0 ? "text-emerald-600" : "text-rose-600"}>{sR(rec.sumR)}</b>{rec.open ? <> · đang mở {rec.open} lệnh{rec.uR != null ? <> ({sR(rec.uR)} tạm tính)</> : null}</> : null}. Rủi ro {fmtNum(v.riskPct, 2)}% vốn/lệnh.</>
          ) : <>Bot demo chưa có lệnh nào với {v.coin}. Rủi ro {fmtNum(v.riskPct, 2)}% vốn/lệnh.</>}
        </div>
      </>)}
    </Card>
  );
}

// Tải trạng thái bot cho 1 mã (crypto), làm mới khi đổi mã và mỗi 5 phút
export function useSw3Now(coin, session, on) {
  const [st, setSt] = useState({ coin: "", v: null, busy: false });
  const sk = session ? `${session.createdAt}|${session.startAt}` : "";
  useEffect(() => {
    if (!on || !coin) return undefined;
    let off = false;
    const go = () => {
      setSt((s) => ({ coin, v: s.coin === coin ? s.v : null, busy: true }));
      sw3Now(coin, session).then((v) => { if (!off) setSt({ coin, v, busy: false }); }, (e) => { if (!off) setSt({ coin, v: { coin, err: /\b400\b/.test(String(e.message || e)) ? `${coin} không có cặp ${coin}USDT trên Binance Futures, nơi bot chạy.` : `Không tải được nến Futures: ${e.message || e}` }, busy: false }); });
    };
    go();
    const t = setInterval(() => { if (!document.hidden) go(); }, 5 * 60000);
    return () => { off = true; clearInterval(t); };
  }, [coin, sk, on]); // eslint-disable-line react-hooks/exhaustive-deps
  return st.coin === coin ? st : { coin, v: null, busy: on };
}
