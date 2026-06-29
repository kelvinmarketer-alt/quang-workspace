import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, ShoppingBag, CalendarDays, ListChecks,
  LineChart, Menu, X, Bell, Search, Settings as SettingsIcon, FolderKanban, Calculator, PiggyBank,
} from "lucide-react";
import { useState, useMemo, useEffect, useRef } from "react";
import { lunarInfo } from "../lib/lunar.js";
import { useData } from "../lib/store.jsx";
import { generateCalendarEvents } from "../lib/events.js";
import { todayISO, fmtDateVI } from "../lib/format.js";

const NAV = [
  { to: "/", label: "Tổng quan", icon: LayoutDashboard, end: true },
  { to: "/khach-hang", label: "Khách hàng", icon: Users },
  { to: "/du-an", label: "Dự án / Đơn hàng", icon: FolderKanban },
  { to: "/ke-toan", label: "Kế toán & Chi phí", icon: Calculator },
  { to: "/quy", label: "Quỹ / Dòng tiền", icon: PiggyBank },
  { to: "/cong-viec", label: "Công việc & Lịch", icon: ListChecks },
  { to: "/cai-dat", label: "Cài đặt", icon: SettingsIcon },
];
// Tiêu đề cho các route phụ (tab con) không nằm trong NAV
const EXTRA_TITLES = { "/chi-phi": "Kế toán & Chi phí", "/lich": "Công việc & Lịch", "/don-hang": "Dự án / Đơn hàng" };

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
  return (
    <nav className="mt-6 flex flex-col gap-1 px-3">
      {NAV.map((n) => (
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

function Notifications() {
  const { tasks, family } = useData();
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
        {items.length > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl">
          <div className="border-b border-slate-50 px-4 py-3 text-sm font-extrabold text-slate-800">Thông báo · 7 ngày tới</div>
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
              <SearchBox />
              <Notifications />
              <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-sky-500 text-sm font-bold text-white">
                Q
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
