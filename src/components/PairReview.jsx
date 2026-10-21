// Đánh giá từng cặp × khung của bot Demo (21/10): cặp nào đang kéo lỗ để sếp quyết định tắt.
// Số liệu = đúng lệnh Demo (cùng luật bot thật). Tắt cặp = bỏ khỏi danh sách cặp (Demo chạy lại, bot thật áp dụng ~5 phút) — luật rủi ro giữ nguyên.
import { Scale, PowerOff, Power } from "lucide-react";
import { Card } from "./ui.jsx";
import { TFS, statsOf } from "../lib/paperBot.js";
import { fmtNum, fmtUsd } from "../lib/format.js";

const rr = (v) => (v == null || !isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${fmtNum(v, 2, 2)}R`);
const tone = (v) => (v == null ? "text-slate-400" : v >= 0 ? "text-emerald-600" : "text-rose-600");
const MIN_N = 10; // ít hơn 10 lệnh → chưa đủ để kết luận
const verdict = (s) => (s.n < MIN_N ? ["Chưa đủ lệnh", "bg-slate-100 text-slate-500"] : s.avgR >= 0.1 ? ["Giữ", "bg-emerald-50 text-emerald-700"] : s.avgR <= -0.1 ? ["Cân nhắc tắt", "bg-rose-50 text-rose-700"] : ["Theo dõi", "bg-amber-50 text-amber-700"]);

export default function PairReview({ cfg, list, ptrades, canEdit, onRemoveCoin, onToggleStream }) {
  const offSet = new Set(cfg.offStreams || []);
  const since30 = Date.now() - 30 * 86400000;
  const pnlOf = (f) => ptrades.filter((t) => t.status !== "skip" && t.pnl != null && f(t)).reduce((a, t) => a + t.pnl, 0);
  const total = pnlOf(() => true);
  const coins = cfg.coins.map((coin) => {
    const s = statsOf(list.filter((t) => t.coin === coin)), pnl = pnlOf((t) => t.coin === coin);
    const tfs = cfg.tfs.map((tf) => {
      const L = list.filter((t) => t.coin === coin && t.tf === tf);
      return { tf, s: statsOf(L), r30: statsOf(L.filter((t) => t.entryAt >= since30)), pnl: pnlOf((t) => t.coin === coin && t.tf === tf) };
    });
    return { coin, s, pnl, tfs };
  }).sort((a, b) => a.pnl - b.pnl);
  const worst = coins.find((c) => c.s.n >= MIN_N && c.s.avgR <= -0.1);

  return (
    <Card className="!p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Scale size={15} className="text-indigo-500" />
        <span className="text-[13px] font-extrabold text-slate-800">Cặp × khung — nên giữ hay tắt?</span>
        <span className="text-[11px] text-slate-400">xếp từ lỗ nhiều nhất · cần ≥ {MIN_N} lệnh mới kết luận</span>
      </div>
      {worst && (
        <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[12px] text-rose-800">
          <b>{worst.coin}</b> đang kéo lỗ: {worst.s.n} lệnh, thắng {fmtNum(worst.s.winRate, 0, 0)}%, TB {rr(worst.s.avgR)}, {fmtUsd(worst.pnl, 0)}.
          Bỏ cặp này thì tổng lãi Demo ước còn <b>{fmtUsd(total - worst.pnl, 0)}</b> thay vì {fmtUsd(total, 0)} (ước tính — bỏ cặp còn làm đổi thứ tự vào lệnh của các cặp khác).
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-[12px]">
          <thead><tr className="border-b border-slate-100 text-left text-[10px] uppercase text-slate-400">
            <th className="py-1.5 pr-2">Cặp · khung</th><th className="py-1.5 pr-2 text-right">Lệnh</th><th className="py-1.5 pr-2 text-right">Thắng</th><th className="py-1.5 pr-2 text-right">R TB</th><th className="py-1.5 pr-2 text-right">PF</th><th className="py-1.5 pr-2 text-right">Thua liền</th><th className="py-1.5 pr-2 text-right">30 ngày</th><th className="py-1.5 pr-2 text-right">Lãi / lỗ</th><th className="py-1.5 pr-2">Nhận xét</th><th />
          </tr></thead>
          <tbody>
            {coins.map((c) => {
              const [vl, vc] = verdict(c.s);
              return [
                <tr key={c.coin} className="border-t border-slate-100 bg-slate-50/60">
                  <td className="py-1.5 pr-2 font-extrabold text-slate-800">{c.coin}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{c.s.n}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{c.s.winRate == null ? "—" : `${fmtNum(c.s.winRate, 0, 0)}%`}</td>
                  <td className={`py-1.5 pr-2 text-right font-bold tabular-nums ${tone(c.s.avgR)}`}>{rr(c.s.avgR)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{c.s.pf == null ? "—" : c.s.pf === Infinity ? "∞" : fmtNum(c.s.pf, 2, 2)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{c.s.worstStreak ?? "—"}</td>
                  <td className="py-1.5 pr-2" />
                  <td className={`py-1.5 pr-2 text-right font-extrabold tabular-nums ${tone(c.pnl)}`}>{fmtUsd(c.pnl, 0)}</td>
                  <td className="py-1.5 pr-2"><span className={`rounded px-1.5 py-0.5 text-[10.5px] font-bold ${vc}`}>{vl}</span></td>
                  <td className="py-1.5 text-right">{canEdit && cfg.coins.length > 1 && <button onClick={() => onRemoveCoin(c.coin)} title={`Bỏ ${c.coin} khỏi bot (Demo + bot thật)`} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-1.5 py-0.5 text-[10.5px] font-bold text-slate-500 hover:border-rose-300 hover:text-rose-600"><PowerOff size={11} /> Tắt</button>}</td>
                </tr>,
                ...c.tfs.map((x) => {
                  const isOff = offSet.has(`${c.coin}|${x.tf}`);
                  const [tl, tc] = isOff ? ["Đã tắt", "bg-slate-200 text-slate-600"] : verdict(x.s);
                  return (
                    <tr key={c.coin + x.tf} className={`border-t border-slate-50 text-slate-600 ${isOff ? "opacity-60" : ""}`}>
                      <td className="py-1 pl-4 pr-2">{TFS[x.tf].label}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{x.s.n}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{x.s.winRate == null ? "—" : `${fmtNum(x.s.winRate, 0, 0)}%`}</td>
                      <td className={`py-1 pr-2 text-right tabular-nums ${tone(x.s.avgR)}`}>{rr(x.s.avgR)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{x.s.pf == null ? "—" : x.s.pf === Infinity ? "∞" : fmtNum(x.s.pf, 2, 2)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{x.s.worstStreak ?? "—"}</td>
                      <td className={`py-1 pr-2 text-right tabular-nums ${x.r30.n ? tone(x.r30.avgR) : "text-slate-400"}`}>{x.r30.n ? `${x.r30.n} lệnh · ${rr(x.r30.avgR)}` : "—"}</td>
                      <td className={`py-1 pr-2 text-right tabular-nums ${tone(x.pnl)}`}>{fmtUsd(x.pnl, 0)}</td>
                      <td className="py-1 pr-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${tc}`}>{tl}</span></td>
                      <td className="py-1 text-right">{canEdit && onToggleStream && <button onClick={() => onToggleStream(c.coin, x.tf)} title={isOff ? `Bật lại ${c.coin} ${TFS[x.tf].label}` : `Chỉ tắt ${c.coin} ${TFS[x.tf].label} (khung khác vẫn chạy)`} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${isOff ? "border-emerald-200 text-emerald-600 hover:bg-emerald-50" : "border-slate-200 text-slate-400 hover:border-rose-300 hover:text-rose-600"}`}>{isOff ? <><Power size={10} /> Bật lại</> : <><PowerOff size={10} /> Tắt khung</>}</button>}</td>
                    </tr>
                  );
                }),
              ];
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-1.5 text-[11px] leading-snug text-slate-400">Giữ: TB ≥ +0,1R · Theo dõi: −0,1 → +0,1R · Cân nhắc tắt: ≤ −0,1R (đủ {MIN_N} lệnh). "Tắt" = bỏ cả cặp · "Tắt khung" = chỉ tắt 1 khung của cặp đó (Demo chạy lại, bot thật áp dụng ~5 phút). Quá khứ không bảo đảm tương lai; không phải tư vấn đầu tư.</div>
    </Card>
  );
}
