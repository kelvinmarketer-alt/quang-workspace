import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Circle,ListChecks, CalendarHeart, HandCoins, Repeat, PiggyBank, ChevronRight, Sun } from "lucide-react";
import { Card, Badge, formatVND, formatShort } from "../ui.jsx";
import { useData } from "../../lib/store.jsx";
import { allInstallments } from "../../lib/selectors.js";
import { upcomingEvents } from "../../lib/events.js";
import { todayISO, fmtDateVI } from "../../lib/format.js";

const DAY = 86400000;
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (iso, k) => isoOf(new Date(new Date(iso + "T00:00:00").getTime() + k * DAY));
const dm = (iso) => { const [, m, d] = (iso || "").split("-"); return d ? `${Number(d)}/${Number(m)}` : ""; };
const n = (v) => Number(v) || 0;
const MAX = 4; // số dòng tối đa mỗi khối

// Kỳ thu KẾ TIẾP của 1 khoản chi định kỳ trong [fromIso, toIso].
// Cùng quy tắc với expenseCharges() trong lib/selectors.js (hàm đó không export): bỏ khoản tắt,
// không tính trước ngày bắt đầu / sau "gia hạn đến" (endDate); monthly neo ngày gốc, yearly neo ngày/tháng gốc.
function nextExpenseCharge(ex, fromIso, toIso) {
  if (ex.active === false || !ex.date) return null;
  const rec = ex.recurring || "monthly";
  if (rec === "once") return null; // chỉ quan tâm khoản ĐỊNH KỲ
  const from = new Date(fromIso + "T00:00:00");
  const to = new Date(toIso + "T23:59:59");
  const start = new Date(ex.date + "T00:00:00");
  const end = ex.endDate ? new Date(ex.endDate + "T23:59:59") : null;
  const ok = (d) => d >= from && d <= to && d >= start && (!end || d <= end);
  if (rec === "yearly") {
    for (let y = from.getFullYear() - 1; y <= to.getFullYear() + 1; y++) {
      const d = new Date(y, start.getMonth(), start.getDate());
      if (ok(d)) return isoOf(d);
    }
    return null;
  }
  let d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (d < from) d = new Date(d.getFullYear(), d.getMonth() + 1, start.getDate());
  return ok(d) ? isoOf(d) : null;
}

// Lịch chuyển quỹ: kỳ thứ k + các kỳ ĐÃ đến hạn chưa xử lý.
// Cùng quy tắc với occAt()/pendingOccs() trong pages/Funds.jsx (không export).
function fundOccAt(sc, k) {
  const base = new Date(sc.startDate + "T00:00:00");
  if (sc.every === "week") return new Date(base.getTime() + k * 7 * DAY);
  if (sc.every === "2week") return new Date(base.getTime() + k * 14 * DAY);
  const m = base.getMonth() + k;
  const y = base.getFullYear() + Math.floor(m / 12), mm = ((m % 12) + 12) % 12;
  const lastDay = new Date(y, mm + 1, 0).getDate();
  return new Date(y, mm, Math.min(base.getDate(), lastDay));
}
function fundPendingOccs(sc, today) {
  if (sc.active === false || !sc.startDate) return [];
  const last = sc.lastDone || "";
  const out = [];
  for (let k = 0; k < 400; k++) {
    const iso = isoOf(fundOccAt(sc, k));
    if (iso > today) break;
    if (iso > last) out.push(iso);
  }
  return out;
}

function Block({ icon: Icon, tone, title, count, to, linkLabel = "Xem", children, extra = 0 }) {
  const ic = { rose: "bg-rose-50 text-rose-600", amber: "bg-amber-50 text-amber-600", emerald: "bg-emerald-50 text-emerald-600", sky: "bg-sky-50 text-sky-600", indigo: "bg-indigo-50 text-indigo-600", violet: "bg-violet-50 text-violet-600" }[tone];
  return (
    <div className="min-w-0 rounded-2xl border border-slate-100 bg-white p-3">
      <div className="mb-2 flex items-center gap-2">
        <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${ic}`}><Icon size={15} /></div>
        <div className="min-w-0 flex-1 truncate text-sm font-extrabold text-slate-800">{title}</div>
        <Badge tone={tone}>{count}</Badge>
        {to && <Link to={to} className="flex shrink-0 items-center text-xs font-bold text-indigo-600">{linkLabel}<ChevronRight size={14} /></Link>}
      </div>
      <div className="divide-y divide-slate-50">{children}</div>
      {extra > 0 && <Link to={to} className="mt-1 block text-[11px] font-semibold text-slate-400">+{extra} mục nữa…</Link>}
    </div>
  );
}

function Row({ left, title, sub, right, subTone = "text-slate-400" }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      {left}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-slate-800">{title}</div>
        {sub && <div className={`truncate text-[11px] ${subTone}`}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

const EV_TONE = { family: "rose", birthday: "pink", anniversary: "violet", reminder: "slate", holiday: "sky", "lunar-holiday": "amber", "lunar-phase": "indigo" };

export default function TodayPanel() {
  const { tasks, family, projects, expenses, fundSchedules, funds, perms, canEdit, toggleTask } = useData();
  const has = (f) => (perms || []).includes(f);
  const today = todayISO();
  const in7 = addDays(today, 7);

  // 1) VIỆC: quá hạn + hôm nay, chưa xong (cùng quy tắc "overdue" của Tasks.jsx: date < today && status !== done)
  const dueTasks = useMemo(() => (tasks || [])
    .filter((t) => t.status !== "done" && t.date && t.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || "")), [tasks, today]);
  const overdueCount = dueTasks.filter((t) => t.date < today).length;
  const canToggle = typeof toggleTask === "function" && canEdit && canEdit("tasks");

  // 2) SỰ KIỆN: lần xuất hiện kế tiếp trong 7 ngày (âm + dương lịch) — dùng upcomingEvents() của lib/events.js.
  //    Sự kiện người dùng (giỗ, sinh nhật…) lên trước, lễ hệ thống (Mùng 1/Rằm/lễ) sau.
  const events = useMemo(() => upcomingEvents(family || [], new Date(), 7)
    .filter((e) => !e.done && e.daysUntil >= 0 && e.daysUntil <= 7)
    .sort((a, b) => a.daysUntil - b.daysUntil || (a.builtin ? 1 : 0) - (b.builtin ? 1 : 0)), [family, today]);

  // 3) CẦN THU: đợt đã tới ngày (≤ hôm nay) còn công nợ — allInstallments().debt = max(0, amount − collected)
  const receivables = useMemo(() => allInstallments(projects || [])
    .filter((x) => x.date && x.date <= today && n(x.debt) > 0)
    .sort((a, b) => a.date.localeCompare(b.date)), [projects, today]);
  const receivableTotal = receivables.reduce((a, x) => a + n(x.debt), 0);

  // 4) SẮP GIA HẠN: khoản chi định kỳ có kỳ thu kế tiếp hoặc ngày "gia hạn đến" trong 7 ngày tới
  const renewals = useMemo(() => {
    const out = [];
    for (const ex of expenses || []) {
      if (ex.active === false) continue;
      const next = nextExpenseCharge(ex, today, in7);
      const ending = ex.endDate && ex.endDate >= today && ex.endDate <= in7 ? ex.endDate : null;
      if (!next && !ending) continue;
      out.push({ ex, next, ending, sortKey: [next, ending].filter(Boolean).sort()[0] });
    }
    return out.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [expenses, today, in7]);

  // 5) QUỸ: lịch chuyển quỹ định kỳ đã đến hạn mà chưa xử lý (chỉ là lịch chuyển, KHÔNG cộng công nợ chưa thu vào quỹ)
  const fundDue = useMemo(() => (fundSchedules || [])
    .map((sc) => ({ sc, occs: fundPendingOccs(sc, today) }))
    .filter((d) => d.occs.length > 0)
    .sort((a, b) => a.occs[0].localeCompare(b.occs[0])), [fundSchedules, today]);
  const fundName = (id) => (funds || []).find((f) => f.id === id)?.name || "—";

  const showTasks = has("tasks") && dueTasks.length > 0;
  const showEvents = has("tasks") && events.length > 0;
  const showRecv = has("customers") && receivables.length > 0;
  const showRenew = has("ketoan") && renewals.length > 0;
  const showFund = has("ketoan") && fundDue.length > 0;
  const nothing = !showTasks && !showEvents && !showRecv && !showRenew && !showFund;

  const whenLabel = (d) => (d === 0 ? "Hôm nay" : d === 1 ? "Ngày mai" : `${d} ngày nữa`);

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/30"><Sun size={16} /></div>
        <h2 className="flex-1 text-base font-extrabold tracking-tight text-slate-900">Hôm nay</h2>
        <span className="text-[11px] font-semibold text-slate-400">{fmtDateVI(new Date())}</span>
      </div>

      {nothing ? (
        <div className="rounded-2xl bg-emerald-50 py-6 text-center text-sm font-bold text-emerald-700">Hôm nay không có gì gấp 🎉</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {showTasks && (
            <Block icon={ListChecks} tone={overdueCount ? "rose" : "emerald"} title={overdueCount ? `Việc · ${overdueCount} quá hạn` : "Việc hôm nay"} count={dueTasks.length} to="/cong-viec" extra={dueTasks.length - MAX}>
              {dueTasks.slice(0, MAX).map((t) => {
                const late = t.date < today;
                return (
                  <Row key={t.id}
                    left={canToggle
                      ? <button onClick={() => toggleTask(t.id)} aria-label="Đánh dấu xong" className="shrink-0 text-slate-300 hover:text-emerald-500"><Circle size={18} /></button>
                      : <Link to="/cong-viec" className="shrink-0 text-slate-300"><Circle size={18} /></Link>}
                    title={t.title}
                    sub={late ? `Quá hạn · ${fmtDateVI(t.date)}` : `Hôm nay${t.time ? " · " + t.time : ""}`}
                    subTone={late ? "font-bold text-rose-500" : "text-slate-400"}
                  />
                );
              })}
            </Block>
          )}

          {showEvents && (
            <Block icon={CalendarHeart} tone="amber" title="Sự kiện 7 ngày" count={events.length} to="/lich" extra={events.length - MAX}>
              {events.slice(0, MAX).map((e) => (
                <Row key={e.id + e.date}
                  left={<div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-50 text-center leading-none"><div className="text-[13px] font-extrabold text-slate-700">{dm(e.date)}</div></div>}
                  title={e.title}
                  sub={`${e.dow} · ÂL ${e.lunar}${e.years ? ` · ${e.years} năm` : ""}`}
                  right={<Badge tone={e.daysUntil === 0 ? "rose" : EV_TONE[e.kind] || "slate"}>{whenLabel(e.daysUntil)}</Badge>}
                />
              ))}
            </Block>
          )}

          {showRecv && (
            <Block icon={HandCoins} tone="rose" title={`Cần thu · ${formatShort(receivableTotal)}`} count={receivables.length} to="/khach-hang" extra={receivables.length - MAX}>
              {receivables.slice(0, MAX).map((x) => (
                <Row key={x.projectId + x.id}
                  title={x.customerName || "Khách lẻ"}
                  sub={`${x.projectName}${x.label ? " · " + x.label : ""} · ${x.date < today ? "hạn " : ""}${fmtDateVI(x.date)}`}
                  subTone={x.date < today ? "text-rose-400" : "text-slate-400"}
                  right={<div className="shrink-0 text-right text-[13px] font-extrabold text-rose-600">{formatVND(x.debt)}</div>}
                />
              ))}
            </Block>
          )}

          {showRenew && (
            <Block icon={Repeat} tone="violet" title="Sắp gia hạn (7 ngày)" count={renewals.length} to="/chi-phi" extra={renewals.length - MAX}>
              {renewals.slice(0, MAX).map(({ ex, next, ending }) => (
                <Row key={ex.id}
                  title={ex.name || "Chi phí"}
                  sub={[next && `Thu ${next === today ? "hôm nay" : dm(next)}`, ending && `Hết hạn ${dm(ending)}`].filter(Boolean).join(" · ")}
                  subTone={ending ? "text-rose-400" : "text-slate-400"}
                  right={<div className="shrink-0 text-right text-[13px] font-extrabold text-slate-700">{formatShort(ex.amount)}</div>}
                />
              ))}
            </Block>
          )}

          {showFund && (
            <Block icon={PiggyBank} tone="indigo" title="Chuyển quỹ đến hạn" count={fundDue.reduce((a, d) => a + d.occs.length, 0)} to="/quy" extra={fundDue.length - MAX}>
              {fundDue.slice(0, MAX).map(({ sc, occs }) => (
                <Row key={sc.id}
                  title={`${fundName(sc.fromId)} → ${fundName(sc.toId)}`}
                  sub={`Đến hạn ${fmtDateVI(occs[0])}${occs.length > 1 ? ` · +${occs.length - 1} kỳ quá hạn` : ""}`}
                  subTone={occs[0] < today ? "text-rose-400" : "text-slate-400"}
                  right={<div className="shrink-0 text-right text-[13px] font-extrabold text-indigo-600">{formatShort(sc.amount)}</div>}
                />
              ))}
            </Block>
          )}
        </div>
      )}
    </Card>
  );
}
