import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, ShoppingBag, CalendarDays, ListChecks,
  LineChart, Menu, X, Bell, BellRing, Search, Settings as SettingsIcon, FolderKanban, Calculator, PiggyBank, CloudOff, RefreshCw, Coins, KeyRound, FolderOpen, Megaphone, Building2, ExternalLink,
} from "lucide-react";
import { useState, useMemo, useEffect, useRef } from "react";
import { lunarInfo } from "../lib/lunar.js";
import { useData } from "../lib/store.jsx";
import { useAuth } from "../lib/auth.jsx";
import { generateCalendarEvents } from "../lib/events.js";
import { pushSupported, permission, enablePush, isSubscribed } from "../lib/push.js";
import { todayISO, fmtDateVI } from "../lib/format.js";
import { OFFICE_URL, useOfficeNotifications, useOfficeAccess, officeAgo } from "../lib/office.js";

function PushPrompt() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
      if (!pushSupported() || permission() !== "default" || !standalone) return;
      try { if (sessionStorage.getItem("qws_push_prompt_off")) return; } catch {}
      const sub = await isSubscribed().catch(() => false);
      if (alive && !sub) setShow(true);
    })();
    return () => { alive = false; };
  }, [user?.id]);
  if (!show) return null;
  const enable = async () => { setBusy(true); try { await enablePush(user.id); setShow(false); } catch {} setBusy(false); };
  const later = () => { try { sessionStorage.setItem("qws_push_prompt_off", "1"); } catch {} setShow(false); };
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3.5">
      <BellRing size={20} className="shrink-0 text-amber-500" />
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-bold text-amber-800">Bật thông báo nhắc việc & sự kiện?</div>
        <div className="text-[12px] text-amber-700">Nhận nhắc quỹ đến hạn, việc, sự kiện & cập nhật thu/chi kể cả khi đóng app.</div>
      </div>
      <div className="flex shrink-0 gap-2">
        <button onClick={later} className="rounded-xl px-3 py-2 text-sm font-bold text-amber-700 hover:bg-amber-100">Để sau</button>
        <button onClick={enable} disabled={busy} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50">{busy ? "…" : "Bật ngay"}</button>
      </div>
    </div>
  );
}

const NAV = [
  { to: "/", label: "Tổng quan", icon: LayoutDashboard, end: true, feat: "dashboard" },
  { to: "/khach-hang", label: "Khách & Dự án", icon: Users, feat: "customers" },
  { to: "/ke-toan", label: "Kế toán & Chi phí", icon: Calculator, feat: "ketoan" },
  // Quỹ / Dòng tiền: ẩn khỏi menu theo yêu cầu (giữ route /quy + dữ liệu để bật lại khi cần)
  { to: "/cong-viec", label: "Công việc & Lịch", icon: ListChecks, feat: "tasks" },
  { to: "/coin", label: "Đầu tư Coin", icon: Coins, feat: "coin" },
  { to: "/quang-cao", label: "Quảng cáo", icon: Megaphone, feat: "ads" },
  { to: "/tai-nguyen", label: "Tài nguyên", icon: FolderOpen, feat: "customers" },
  { to: "/tai-khoan", label: "Tài khoản & Thẻ", icon: KeyRound, ownerOnly: true },
  { href: OFFICE_URL, label: "Văn phòng AI", icon: Building2, office: true },
  { to: "/cai-dat", label: "Cài đặt", icon: SettingsIcon },
];
// Tiêu đề cho các route phụ (tab con) không nằm trong NAV
const EXTRA_TITLES = { "/chi-phi": "Kế toán & Chi phí", "/lich": "Công việc & Lịch", "/du-an": "Khách & Dự án", "/don-hang": "Khách & Dự án" };

function Brand() {
  return (
    <div className="flex items-center gap-3 px-2">
      <img src="/logo-mark.png" alt="2BKIN" className="h-10 w-10 rounded-xl bg-white object-contain ring-1 ring-slate-100" />
      <div className="leading-tight">
        <div className="text-[15px] font-extrabold tracking-tight">Quang Workspace</div>
        <div className="text-[11px] font-medium text-slate-400">by 2BKIN</div>
      </div>
    </div>
  );
}

function SideNav({ onNavigate }) {
  const { perms, isOwner } = useData();
  const officeOk = useOfficeAccess(isOwner);
  const items = NAV.filter((n) => (!n.feat || (perms || []).includes(n.feat)) && (!n.ownerOnly || isOwner) && (!n.office || officeOk));
  return (
    <nav className="mt-6 flex flex-col gap-1 px-3">
      {items.map((n) => n.href ? (
        <a key={n.href} href={n.href} target="_blank" rel="noopener" onClick={onNavigate}
          className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-white hover:text-slate-900">
          <n.icon size={18} />
          {n.label}
          <ExternalLink size={13} className="ml-auto opacity-50" />
        </a>
      ) : (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
              isActive
                ? "bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow-lg shadow-indigo-500/25"
                : "text-slate-500 hover:bg-white hover:text-slate-900"
            }`
          }
        >
          <n.icon size={18} />
          {n.label}
        </NavLink>
      ))}
    </nav>
  );
}

function SearchBox() {
  const { customerList, projects } = useData();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const results = useMemo(() => {
    if (!q.trim()) return { custs: [], jobs: [] };
    const lq = q.toLowerCase();
    const custs = customerList.filter((c) => c.name.toLowerCase().includes(lq) || (c.phone || "").includes(q)).slice(0, 4);
    const jobs = projects.filter((p) => (p.name + (p.customerName || "")).toLowerCase().includes(lq)).slice(0, 5);
    return { custs, jobs };
  }, [q, customerList, projects]);

  const has = results.custs.length || results.jobs.length;

  return (
    <div ref={ref} className="relative hidden sm:block">
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
        <Search size={16} className="text-slate-400" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Tìm khách / JOB…"
          className="w-44 text-slate-700 outline-none placeholder:text-slate-400"
        />
      </div>
      {open && q.trim() && (
        <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl">
          {!has && <div className="p-4 text-sm text-slate-400">Không tìm thấy.</div>}
          {results.custs.length > 0 && (
            <div className="p-2">
              <div className="px-2 py-1 text-[11px] font-bold uppercase text-slate-400">Khách hàng</div>
              {results.custs.map((c) => (
                <button key={c.id} onClick={() => { nav("/khach-hang"); setOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-50">
                  <Users size={15} className="text-indigo-500" />
                  <span className="flex-1 text-sm font-semibold text-slate-700">{c.name}</span>
                  <span className="text-xs text-slate-400">{c.phone}</span>
                </button>
              ))}
            </div>
          )}
          {results.jobs.length > 0 && (
            <div className="border-t border-slate-50 p-2">
              <div className="px-2 py-1 text-[11px] font-bold uppercase text-slate-400">Dự án</div>
              {results.jobs.map((p) => (
                <button key={p.id} onClick={() => { nav("/du-an"); setOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-slate-50">
                  <ShoppingBag size={15} className="text-sky-500" />
                  <span className="flex-1 truncate text-sm font-semibold text-slate-700">{p.name}</span>
                  <span className="text-xs text-slate-400">{p.customerName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SyncBadge() {
  const { syncStatus } = useData();
  if (syncStatus === "saving")
    return <span className="hidden items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500 sm:flex"><RefreshCw size={12} className="animate-spin" /> Đang lưu</span>;
  if (syncStatus === "error")
    return <span title="Bản sửa chưa lên cloud — app đang tự thử lại" className="flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-700"><CloudOff size={12} /> <span className="hidden sm:inline">Chưa đồng bộ</span></span>;
  return null;
}

const OFFICE_TONE = { xong: "bg-emerald-500", can_duyet: "bg-violet-500", loi: "bg-rose-500", tin_nhan: "bg-sky-500", he_thong: "bg-slate-400" };

function Notifications() {
  const { tasks, family, isOwner } = useData();
  const officeOk = useOfficeAccess(isOwner);
  const office = useOfficeNotifications(officeOk, !!isOwner);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const today = todayISO();

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const items = useMemo(() => {
    const from = new Date();
    const to = new Date(from.getTime() + 7 * 86400000);
    const ev = generateCalendarEvents(from, to, family).filter((e) => e.date >= today && e.type !== "lunar-phase");
    const overdue = tasks.filter((t) => t.date && t.status !== "done" && t.date < today).map((t) => ({ date: t.date, title: "Quá hạn: " + t.title, type: "overdue" }));
    const dueToday = tasks.filter((t) => t.date === today && t.status !== "done").map((t) => ({ date: t.date, title: t.title, type: "task" }));
    return [...overdue, ...dueToday, ...ev].slice(0, 8);
  }, [tasks, family, today]);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:text-indigo-600">
        <Bell size={18} />
        {office.unread > 0 ? <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-violet-600 px-1 text-[10px] font-bold text-white">{office.unread}</span>
          : items.length > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl">
          {officeOk && (
            <div className="border-b border-slate-100">
              <div className="flex items-center gap-2 px-4 py-3">
                <span className="text-sm font-extrabold text-slate-800">🏢 Văn phòng AI</span>
                {office.unread > 0 && <button onClick={() => office.markRead(office.rows.filter((r) => !r.read_at).map((r) => r.id))} className="text-[11px] font-bold text-slate-400 hover:text-indigo-600">Đã đọc hết</button>}
                <a href={OFFICE_URL} target="_blank" rel="noopener" className="ml-auto text-[11px] font-bold text-indigo-600">Mở văn phòng ↗</a>
              </div>
              {office.rows.length === 0 && <div className="px-4 pb-3 text-sm text-slate-400">Chưa có thông báo từ đội AI.</div>}
              <div className="max-h-64 overflow-y-auto">
                {office.rows.slice(0, 8).map((r) => (
                  <a key={r.id} href={r.url || OFFICE_URL} target="_blank" rel="noopener" onClick={() => !r.read_at && office.markRead([r.id])}
                    className={`flex items-start gap-3 border-t border-slate-50 px-4 py-2.5 hover:bg-slate-50 ${r.read_at ? "opacity-60" : ""}`}>
                    <span className={`mt-0.5 h-8 w-1.5 shrink-0 rounded-full ${OFFICE_TONE[r.kind] || "bg-slate-400"}`} />
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-sm ${r.read_at ? "font-medium text-slate-600" : "font-bold text-slate-800"}`}>{r.title}</div>
                      {r.body && <div className="truncate text-[11px] text-slate-400">{r.body}</div>}
                      <div className="text-[10px] text-slate-400">{officeAgo(r.created_at)}</div>
                    </div>
                    {!r.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-violet-500" />}
                  </a>
                ))}
              </div>
            </div>
          )}
          <div className="border-b border-slate-50 px-4 py-3 text-sm font-extrabold text-slate-800">Nhắc nhở · 7 ngày tới</div>
          {items.length === 0 && <div className="p-4 text-sm text-slate-400">Không có nhắc nhở.</div>}
          <div className="max-h-80 overflow-y-auto">
            {items.map((e, i) => {
              const isOver = e.type === "overdue";
              return (
                <div key={i} className="flex items-center gap-3 border-b border-slate-50 px-4 py-2.5">
                  <span className={`h-8 w-1.5 rounded-full ${isOver ? "bg-rose-500" : e.type === "task" ? "bg-emerald-500" : e.type === "lunar-holiday" ? "bg-amber-500" : e.type === "family" ? "bg-rose-500" : "bg-sky-500"}`} />
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-sm font-semibold ${isOver ? "text-rose-600" : "text-slate-700"}`}>{e.title}</div>
                    <div className="text-[11px] text-slate-400">{fmtDateVI(e.date)}{e.date === today ? " · Hôm nay" : ""}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Layout({ children }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const li = lunarInfo(new Date());
  const title = NAV.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to) && n.to !== "/"))?.label
    || EXTRA_TITLES[loc.pathname]
    || (loc.pathname === "/" ? "Tổng quan" : "");

  return (
    <div className="aurora min-h-screen">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/60 bg-white/60 backdrop-blur-xl lg:flex">
        <div className="pt-6">
          <Brand />
        </div>
        <SideNav />
        <div className="mt-auto p-4">
          <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-900 p-4 text-white">
            <div className="text-[11px] font-medium uppercase tracking-wide text-indigo-200">Âm lịch hôm nay</div>
            <div className="mt-1 text-2xl font-extrabold">{li.label}</div>
            <div className="text-[12px] text-indigo-200">
              {li.special ? li.special + " · " : ""}Ngày {li.canChiDay} · {li.canChiYear}
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-white/95 backdrop-blur-xl">
            <div className="flex items-center justify-between pr-3 pt-5">
              <Brand />
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            <SideNav onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-white/50 bg-white/55 backdrop-blur-xl">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-white lg:hidden">
              <Menu size={20} />
            </button>
            <h1 className="text-lg font-extrabold tracking-tight text-slate-900">{title}</h1>
            <div className="ml-auto flex items-center gap-2">
              <SyncBadge />
              <SearchBox />
              <Notifications />
              <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-sky-500 text-sm font-bold text-white">
                Q
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6"><PushPrompt />{children}</main>
      </div>
    </div>
  );
}
