// Tách từ pages/Ads.jsx (28/11/2026) — chỉ di chuyển mã, logic giữ nguyên.
import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";
import { CsvButton, SortTh, sortRows, useSort } from "../../pages/Web.jsx";
import { GOALS, withGoal } from "../../lib/adsGoals.js";
import { downloadCSV, fmtNum, fmtPct } from "../../lib/format.js";

export const vnd = (v) => (v == null ? "—" : Math.round(v).toLocaleString("vi-VN") + "đ");
export const int = (v) => (v == null ? "—" : Math.round(v).toLocaleString("vi-VN"));
export const pct = (v) => fmtPct(v, 2);
export const dec = (v) => fmtNum(v, 2, 0); // "12" · "1,5" · "2,35"
export const dm = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "");
// Dòng cảnh báo vàng nhỏ + nút Thử lại (thay cho lỗi im lặng)
export const Warn = ({ children, onRetry }) => (
  <div className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11.5px] font-semibold text-amber-700">
    <AlertTriangle size={13} className="shrink-0" /><span className="min-w-0 flex-1">{children}</span>
    {onRetry && <button onClick={onRetry} className="shrink-0 rounded-md bg-amber-500 px-2.5 py-1.5 text-[11px] font-bold text-white">Thử lại</button>}
  </div>
);

// Cột chỉ số theo nhóm. bad = tăng là XẤU (chi phí) → mũi tên đỏ khi tăng.
export const COLS = {
  conv: [
    ["spend", "Chi phí", vnd], ["msgs", "Tin nhắn", int], ["leads", "Lead", int], ["cpr", "Giá/KQ", vnd, "bad"],
    ["cpm", "CPM", vnd, "bad"], ["ctr", "CTR", pct], ["cpc", "CPC", vnd, "bad"], ["impressions", "Hiển thị", int],
  ],
  brand: [
    ["spend", "Chi phí", vnd], ["reach", "Tiếp cận", int], ["impressions", "Hiển thị", int], ["frequency", "Tần suất", dec, "bad"],
    ["cpm", "CPM", vnd, "bad"], ["thruplay", "ThruPlay", int], ["video3s", "Video 3s", int], ["engagement", "Tương tác", int], ["pageLikes", "Theo dõi", int],
  ],
  // Google Ads (mọi TK Google xếp nhóm Chuyển đổi): kết quả = chuyển đổi, Giá/KQ = CPA
  gads: [
    ["spend", "Chi phí", vnd], ["results", "Chuyển đổi", dec], ["cpr", "CPA", vnd, "bad"], ["clicks", "Click", int],
    ["ctr", "CTR", pct], ["cpc", "CPC", vnd, "bad"], ["cpm", "CPM", vnd, "bad"], ["budgetLostIS", "Mất do NS", pct, "bad"],
  ],
};
export const RANK = { ABOVE_AVERAGE: "trên TB", AVERAGE: "TB", BELOW_AVERAGE_35: "dưới TB (top 35% thấp)", BELOW_AVERAGE_20: "dưới TB (top 20% thấp)", BELOW_AVERAGE_10: "dưới TB (top 10% thấp)" };
// Cột chiến dịch/QC Meta theo MỤC TIÊU: kết quả + chi phí/KQ đúng mục tiêu, cột Chi phí/tin nhắn riêng
export const GOAL_COLS = [
  ["spend", "Chi phí", (v) => vnd(v)], ["goalResText", "Kết quả (theo mục tiêu)", (v) => v || "—"], ["goalCost", "Chi phí/KQ", (v) => vnd(v), "bad"],
  ["costMsg", "Chi phí/tin nhắn", (v) => vnd(v), "bad"], ["msgs", "Tin nhắn", (v) => int(v)], ["reach", "Tiếp cận", (v) => int(v)],
  ["ctr", "CTR", (v) => pct(v)], ["cpm", "CPM", (v) => vnd(v), "bad"], ["frequency", "Tần suất", (v) => dec(v), "bad"],
];
export function enrichGoals(a, g) {
  if (a.platform === "google" || a.error) return a;
  const def = a.group === "conv" ? "msg" : "reach";
  const W = (row, goal) => { const x = withGoal(row, goal); const G = GOALS[goal]; return { ...x, goalResText: goal === "reach" ? `${int(x.reach)} người` : `${int(x.goalResults)} ${G.unit}` }; };
  const campaigns = (a.campaigns || []).map((c) => W(c, (g && (g.byId[c.id] || g.byName[c.name])) || def));
  const gByName = Object.fromEntries(campaigns.map((c) => [c.name, c.goal]));
  const dom = (list) => { const m = {}; for (const c of list) m[c.goal] = (m[c.goal] || 0) + (c.spend || 0); return Object.entries(m).sort((x, y) => y[1] - x[1])[0]?.[0] || def; };
  const services = a.services ? a.services.map((s) => W(s, dom(campaigns.filter((c) => c.service === s.name)))) : a.services;
  const msgCamps = campaigns.filter((c) => c.goal === "msg" || c.goal === "lead");
  return {
    ...a, campaigns, services, goalsLoaded: !!g,
    ads: (a.ads || []).map((x) => W(x, gByName[x.campaign] || def)),
    adsets: a.adsets ? a.adsets.map((x) => W(x, gByName[x.campaign] || def)) : a.adsets,
    goalSummary: g ? { spend: msgCamps.reduce((t, c) => t + (c.spend || 0), 0), results: msgCamps.reduce((t, c) => t + (c.msgs || 0) + (c.leads || 0), 0), otherSpend: campaigns.filter((c) => c.goal !== "msg" && c.goal !== "lead").reduce((t, c) => t + (c.spend || 0), 0) } : null,
  };
}
export const colsOf = (a) => (a.platform === "google" ? COLS.gads : COLS[a.group]);

export function Delta({ cur, prev, bad }) {
  if (prev == null || cur == null || !prev) return null;
  const d = ((cur - prev) / Math.abs(prev)) * 100;
  if (!isFinite(d) || Math.abs(d) < 0.5) return <span className="text-[10px] font-bold text-slate-400">0%</span>;
  const up = d > 0, good = bad ? !up : up;
  const Icon = up ? TrendingUp : TrendingDown;
  return <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${good ? "text-emerald-600" : "text-rose-600"}`}><Icon size={11} />{Math.abs(d).toFixed(0)}%</span>;
}

export function Metric({ label, value, delta }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="flex items-baseline gap-1.5"><span className="text-sm font-extrabold text-slate-900">{value}</span>{delta}</div>
    </div>
  );
}

// Giá trị để xếp / xuất CSV theo cột: nhãn đánh giá xếp theo mức (Rất tốt → Đốt tiền), "Kết quả theo mục tiêu" xếp theo số KQ
export const V_RANK = { great: 1, good: 2, ok: 2, warn: 3, fatigue: 3, bad: 4, burn: 5, thin: 6, off: 7 };
export const sortVal = (r, k) => (k === "_v" ? (r._v ? (V_RANK[r._v.key] ?? 8) + (r._v.ratio || 0) / 100 : null) : k === "goalResText" ? (r.goal === "reach" ? r.reach : r.goalResults) : r[k]);
export const csvVal = (r, k) => (k === "_v" ? r._v?.label || "" : r[k]);

export function Table({ rows, cols, nameKey = "name", sub, csvName }) {
  const [st, toggle] = useSort(); // i = -1: cột Tên
  if (!rows?.length) return <div className="py-3 text-center text-xs text-slate-400">Không có dữ liệu trong kỳ</div>;
  const list = st ? sortRows(rows, (r) => (st.i < 0 ? r[nameKey] : sortVal(r, cols[st.i]?.[0])), st.dir) : rows;
  const exportCsv = () => downloadCSV(csvName, [["Tên", ...(sub ? ["Ghi chú"] : []), ...cols.map(([, l]) => l)], ...list.map((r) => [r[nameKey], ...(sub ? [r[sub] || ""] : []), ...cols.map(([k]) => csvVal(r, k))])]);
  return (
    <div>
      {csvName && <div className="-mt-1 mb-0.5 flex justify-end"><CsvButton onClick={exportCsv} /></div>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-xs">
          <thead><tr className="border-b border-slate-100 text-left text-[10px] uppercase tracking-wide text-slate-400">
            <SortTh label="Tên" on={st?.i === -1} dir={st?.dir} onClick={() => toggle(-1, false)} className="py-2 pr-2" />
            {cols.map(([k, l], i) => <SortTh key={k} label={l} on={st?.i === i} dir={st?.dir} onClick={() => toggle(i, true)} className="py-2 pr-2 text-right" />)}
          </tr></thead>
          <tbody>{list.map((r, i) => (
            <tr key={r.id || r.name || i} className="border-b border-slate-50">
              <td className="max-w-[260px] py-2 pr-2"><div className="truncate font-semibold text-slate-700" title={r[nameKey]}>{r[nameKey]}</div>{sub && r[sub] && <div className="truncate text-[10px] text-slate-400">{r[sub]}</div>}</td>
              {cols.map(([k, , f]) => <td key={k} className="py-2 pr-2 text-right tabular-nums text-slate-700">{f(r[k])}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

export const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
export const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* bỏ qua */ } };
