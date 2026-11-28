// Tách từ pages/CoinMarket.jsx (28/11/2026) — chỉ di chuyển mã, logic giữ nguyên.
import { AlertTriangle, BookOpen, ChevronDown, History } from "lucide-react";
import { Card } from "../ui.jsx";
import { KNOWLEDGE, KNOWLEDGE_SOURCES } from "../../lib/tradeKnowledge.js";
import { MARKETS, TF } from "../../lib/ta.js";
import { cachedGrade, gradeRecord, gradeSummary } from "../../lib/aiGrade.js";
import { dt, pct, sPct, sR } from "./marketUtil.jsx";
import { fmtNum, fmtPct } from "../../lib/format.js";
import { px } from "../CoinCharts.jsx";
import { useEffect, useRef, useState } from "react";

export const NONE = [], NOFLOW = {}; // mảng rỗng cố định (tắt lớp) — tránh vẽ lại biểu đồ mỗi lần render

export const TONE = { slate: "text-slate-700", emerald: "text-emerald-600", rose: "text-rose-600", amber: "text-amber-600", indigo: "text-indigo-600" };

// 1 dòng chỉ báo gọn: nhãn trái · giá trị phải (+ chú thích nhỏ)
export function Row({ label, value, tone = "slate", sub }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-[12px] font-semibold text-slate-500">{label}</span>
      <span className="min-w-0 text-right">
        <span className={`text-[13px] font-extrabold ${TONE[tone]}`}>{value}</span>
        {sub && <span className="block truncate text-[10.5px] text-slate-400">{sub}</span>}
      </span>
    </div>
  );
}
export function Group({ title, children }) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{title}</div>
      <div className="divide-y divide-slate-100">{children}</div>
    </div>
  );
}

// Phiếu lệnh: 4 ô số chính + điều kiện kích hoạt + checklist rút gọn; chi tiết bấm mở
export function TradeTicket({ s, compact }) {
  const [more, setMore] = useState(false);
  const long = s.direction === "long";
  const okN = (s.checklist || []).filter((c) => c.ok).length, allN = (s.checklist || []).length;
  const Cell = ({ label, v, sub, tone }) => (
    <div className="rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-slate-100">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`font-mono text-[14px] font-extrabold ${tone}`}>{px(v)}</div>
      {sub && <div className="text-[10.5px] font-semibold text-slate-400">{sub}</div>}
    </div>
  );
  return (
    <div className={`rounded-xl p-2.5 ${long ? "bg-emerald-50/70" : "bg-rose-50/70"}`}>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-extrabold text-white ${long ? "bg-emerald-500" : "bg-rose-500"}`}>{long ? "LONG" : "SHORT"}</span>
        {s.setup_type && <span className="text-[11px] font-extrabold text-slate-600">{s.setup_type}</span>}
        {s.label && !compact && <span className="text-[11px] text-slate-400">· kịch bản {s.label}</span>}
        {allN > 0 && <span className={`ml-auto rounded-md px-1.5 py-0.5 text-[10.5px] font-extrabold ${okN === allN ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{okN}/{allN} điều kiện</span>}
      </div>
      {(!s.valid || s.tooFar) && (
        <div className="mb-2 flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-800"><AlertTriangle size={12} className="shrink-0" />
          {!s.valid ? "SL/TP sai phía — đừng dùng kịch bản này." : `SL cách entry ${fmtNum(s.slAtr, 1)} ATR (> 4) — theo EA nên huỷ.`}
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        <Cell label="Vào lệnh" v={s.entry} sub={s.entry_zone ? `vùng ${px(s.entry_zone[0])}–${px(s.entry_zone[1])}` : null} tone="text-indigo-600" />
        <Cell label="Cắt lỗ" v={s.stop_loss} sub={`${sPct(pct(s.stop_loss, s.entry))}${s.slAtr ? ` · ${fmtNum(s.slAtr, 1)} ATR` : ""}`} tone="text-rose-600" />
        {s.take_profit.slice(0, 2).map((t, i) => <Cell key={i} label={`Chốt lời ${i + 1}`} v={t} sub={`${sPct(pct(t, s.entry))}${s.rr[i] ? ` · R:R 1:${fmtNum(s.rr[i], 1)}` : ""}`} tone="text-emerald-600" />)}
      </div>
      {s.trigger && <div className="mt-2 text-[12px] leading-snug text-slate-700"><span className="font-extrabold text-indigo-600">Kích hoạt khi: </span>{s.trigger}</div>}
      <button onClick={() => setMore((v) => !v)} className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-indigo-600">
        <ChevronDown size={13} className={`transition ${more ? "rotate-180" : ""}`} /> {more ? "Ẩn chi tiết" : "Checklist · lý do · quản lý lệnh"}
      </button>
      {more && (
        <div className="mt-1.5 space-y-1.5 text-[12px] leading-snug">
          {allN > 0 && <div className="flex flex-wrap gap-1">{s.checklist.map((c, i) => <span key={i} className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${c.ok ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>{c.ok ? "✓" : "✗"} {c.item}</span>)}</div>}
          {s.reason && <div className="text-slate-600"><b className="text-slate-700">Lý do:</b> {s.reason}</div>}
          {s.invalidation && <div className="text-slate-600"><b className="text-slate-700">Huỷ khi:</b> {s.invalidation}</div>}
          {s.management && <div className="text-slate-600"><b className="text-slate-700">Quản lý lệnh:</b> {s.management}</div>}
        </div>
      )}
    </div>
  );
}

// Bộ kiến thức AI đang dùng (tổng hợp từ tài liệu EA + 86 slide VSA trên Drive)
export function KnowledgePanel() {
  const [open, setOpen] = useState(false);
  const [sec, setSec] = useState(null);
  return (
    <div className="mt-3 rounded-xl border border-slate-100">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <BookOpen size={15} className="text-indigo-500" />
        <span className="flex-1 text-[13px] font-extrabold text-slate-700">Bộ kiến thức AI đang dùng · {KNOWLEDGE.reduce((n, k) => n + k.rules.length, 0)} quy tắc</span>
        <ChevronDown size={16} className={`text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-slate-100 p-3">
          <div className="text-[11px] text-slate-400">Nguồn: {KNOWLEDGE_SOURCES.join(" · ")}</div>
          {KNOWLEDGE.map((k) => (
            <div key={k.key} className="rounded-lg bg-slate-50">
              <button onClick={() => setSec(sec === k.key ? null : k.key)} className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[12px] font-bold text-slate-700">
                {k.title} <span className="text-slate-400">{k.rules.length} {sec === k.key ? "▲" : "▼"}</span>
              </button>
              {sec === k.key && <ul className="space-y-1 px-3 pb-2 text-[12px] text-slate-600">{k.rules.map((r, i) => <li key={i} className="list-disc ml-3">{r}</li>)}</ul>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Lịch sử phân tích AI (settings.coinAnalyses — lưu cloud, mọi máy thấy) + tự chấm đúng/sai theo nến sau lúc phân tích.
// Chỉ chấm khi khung này hiện trên màn hình (lười); kết quả giữ trong bộ nhớ (lib/aiGrade.js).
export const OUTCOME = { miss: ["Không khớp", "bg-amber-50 text-amber-700"], tp: ["Chạm TP", "bg-emerald-50 text-emerald-700"], sl: ["Chạm SL", "bg-rose-50 text-rose-700"], open: ["Chưa chạm", "bg-slate-100 text-slate-600"], none: ["Không có kèo", "bg-slate-50 text-slate-400"], error: ["Lỗi tải nến", "bg-amber-50 text-amber-700"] };
export function AiHistory({ recs, active, sym, symKey, onOpen, className = "" }) {
  const box = useRef(null);
  const [seen, setSeen] = useState(false);
  const [grades, setGrades] = useState(() => Object.fromEntries(recs.map((r) => [r.id, cachedGrade(r)]).filter(([, g]) => g)));
  const [only, setOnly] = useState(false);
  const [showN, setShowN] = useState(8);
  useEffect(() => {
    if (seen) return undefined;
    if (typeof IntersectionObserver === "undefined" || !box.current) { setSeen(true); return undefined; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(box.current);
    return () => io.disconnect();
  }, [seen]);
  const sig = recs.map((r) => r.id).join("|");
  useEffect(() => {
    if (!seen || !active || !recs.length) return undefined;
    let off = false;
    const run = () => {
      const queue = [...recs];
      const worker = async () => {
        while (queue.length && !off) {
          const r = queue.shift();
          try { const g = await gradeRecord(r); if (!off) setGrades((o) => (o[r.id] === g ? o : { ...o, [r.id]: g })); }
          catch { if (!off) setGrades((o) => (o[r.id] ? o : { ...o, [r.id]: { outcome: "error" } })); }
        }
      };
      Promise.all([worker(), worker(), worker()]); // 3 yêu cầu song song — nhẹ cho giới hạn Binance
    };
    run();
    const t = setInterval(() => { if (!document.hidden) run(); }, 5 * 60000); // lệnh chưa chạm → chấm lại
    return () => { off = true; clearInterval(t); };
  }, [seen, active, sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = only ? recs.filter((r) => r.symbol === symKey) : recs;
  const sum = gradeSummary(list, grades);
  // 12/11 sếp chốt: lệnh không khớp entry = không vào lệnh → ẩn khỏi danh sách, chỉ ghi số đã ẩn
  const shown = list.filter((r) => grades[r.id]?.outcome !== "miss");
  return (
    <Card className={`!p-3 ${className}`}>
      <div ref={box} className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400"><History size={13} className="text-indigo-500" /> Lịch sử phân tích AI ({shown.length})</div>
        <div className="ml-auto flex rounded-md bg-slate-100 p-0.5 text-[10.5px] font-bold">
          {[[false, "Tất cả"], [true, sym]].map(([k, l]) => <button key={String(k)} onClick={() => { setOnly(k); setShowN(8); }} className={`rounded px-1.5 py-0.5 ${only === k ? "bg-white text-indigo-600 shadow" : "text-slate-500"}`}>{l}</button>)}
        </div>
      </div>
      {list.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
          <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-emerald-700">Đúng {sum.ok}</span>
          <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-rose-700">Sai {sum.bad}</span>
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-600">Chưa rõ {sum.unk}</span>
          
          {sum.winRate != null && <span className="text-slate-600">Tỉ lệ đúng <b className={sum.winRate >= 50 ? "text-emerald-600" : "text-rose-600"}>{fmtPct(sum.winRate, 0)}</b></span>}
          {sum.avgR != null && <span className="text-slate-600">R TB <b className={sum.avgR >= 0 ? "text-emerald-600" : "text-rose-600"}>{sR(sum.avgR)}</b></span>}
          {sum.none > 0 && <span className="font-semibold text-slate-400">· {sum.none} lần không có kèo</span>}
          {sum.miss > 0 && <span className="font-semibold text-slate-400">· đã ẩn {sum.miss} lần không khớp entry</span>}
        </div>
      )}
      {!shown.length ? (
        <div className="mt-2 rounded-lg bg-slate-50 px-3 py-4 text-center text-[12px] text-slate-500">Chưa có lần phân tích nào được lưu{only ? ` cho ${sym}` : ""}. Mỗi lần bấm <b>Phân tích</b>, kết quả gọn (hướng, vào/SL/TP) được lưu lên cloud để chấm đúng/sai.</div>
      ) : (
        <ul className="mt-1.5 divide-y divide-slate-100">
          {shown.slice(0, showN).map((r) => {
            const g = grades[r.id], base = (r.symbol || "").replace(/USDT$/, "");
            const [lab, cls] = !r.side ? OUTCOME.none : g ? OUTCOME[g.outcome] || OUTCOME.open : ["Đang chấm…", "bg-slate-50 text-slate-400"];
            const rTxt = g && (g.outcome === "tp" || g.outcome === "sl") ? ` ${sR(g.r, 1)}` : g?.outcome === "open" && g.filled && g.r != null ? ` · tạm ${sR(g.r, 1)}` : "";
            return (
              <li key={r.id} className="py-2">
                <div className="flex items-center gap-1.5">
                  {r.side && <span className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold text-white ${r.side === "LONG" ? "bg-emerald-500" : "bg-rose-500"}`}>{r.side}</span>}
                  <button onClick={() => onOpen(r)} className="min-w-0 truncate text-[12.5px] font-extrabold text-slate-800 hover:text-indigo-600">{base} {TF[r.tf]?.label || r.tf}</button>
                  <span className={`ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-extrabold ${cls}`}>{lab}{rTxt}{g?.expired ? " (hết 100 nến)" : ""}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-slate-500">
                  <span className="text-slate-400">{MARKETS[r.market]?.label || "Spot"} · {dt(r.at)}</span>
                  {r.side && <span className="font-mono">Vào {px(r.entry)} · SL {px(r.sl)} · TP {px(r.tp)}</span>}
                  {r.side && g && g.outcome === "open" && !g.filled && <span className="font-semibold text-amber-600">chưa khớp entry</span>}
                </div>
                {r.summary && <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-slate-500">{r.summary}</div>}
              </li>
            );
          })}
        </ul>
      )}
      {shown.length > showN && <button onClick={() => setShowN((n) => n + 12)} className="mt-1 w-full rounded-lg bg-slate-50 py-1.5 text-[12px] font-bold text-slate-600 hover:bg-slate-100">Xem thêm {Math.min(12, shown.length - showN)} lần</button>}
      <div className="mt-2 text-[10.5px] leading-snug text-slate-400">Tự chấm theo nến sau lúc phân tích (tối đa 100 nến cùng khung), chỉ tính khi giá đã về điểm vào: khớp rồi chạm TP1 = đúng, khớp rồi chạm SL = sai; giá chạy tới TP/SL trước khi khớp = không vào lệnh → ẩn, không tính; nến khớp lệnh chỉ xét SL, cùng 1 nến chạm cả hai → tính SL. R = (TP1 − vào) ÷ (vào − SL). Lưu 60 lần gần nhất trên cloud, mọi máy đều thấy.</div>
    </Card>
  );
}

// Cảnh báo giá (chỉ chủ): lưu ở Supabase qws_live_bot, dòng 'command' → data.priceAlerts. Máy chủ (Worker Cloudflare qws-monitor) kiểm tra 5 phút/lần và gửi thông báo đẩy.
// Ghi: LUÔN đọc lại dòng command mới nhất rồi ghi gộp {...data, priceAlerts} → không mất khoá/cấu hình/stop của bot thật.
// Kho cảnh báo giá dùng chung (27/11): thẻ "Cảnh báo giá", đường cảnh báo trên biểu đồ, công cụ chuông, ô cảnh báo ở toàn màn hình
// — cùng 1 nguồn command.priceAlerts (máy chủ qws-bot kiểm tra 5 phút/lần rồi gửi thông báo đẩy)
