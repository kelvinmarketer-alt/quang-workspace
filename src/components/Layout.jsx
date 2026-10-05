import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, ShoppingBag, CalendarDays, ListChecks,
  LineChart, Menu, X, Bell, BellRing, Search, Settings as SettingsIcon, FolderKanban, Calculator, PiggyBank, CloudOff, RefreshCw, Coins, KeyRound, FolderOpen, Megaphone, Building2, ExternalLink, Pin, PinOff,
} from "lucide-react";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import CommandPalette, { KBD_HINT } from "./CommandPalette.jsx";
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
  { to: "/", label: "Tổng quan", icon: LayoutDashboard, end: true, feat: "dashboard", group: "biz" },
  { to: "/khach-hang", label: "Khách & Dự án", icon: Users, feat: "customers", group: "biz" },
  { to: "/ke-toan", label: "Kế toán & Chi phí", icon: Calculator, feat: "ketoan", group: "fin" },
  // Quỹ / Dòng tiền: ẩn khỏi menu theo yêu cầu (giữ route /quy + dữ liệu để bật lại khi cần)
  { to: "/cong-viec", label: "Công việc & Lịch", icon: ListChecks, feat: "tasks", group: "me" },
  { to: "/coin", label: "Đầu tư Coin", icon: Coins, feat: "coin", group: "fin" },
  { to: "/quang-cao", label: "Quảng cáo", icon: Megaphone, feat: "ads", group: "biz" },
  { to: "/tai-nguyen", label: "Tài nguyên", icon: FolderOpen, feat: "customers", group: "biz" },
  { to: "/tai-khoan", label: "Tài khoản & Thẻ", icon: KeyRound, ownerOnly: true, group: "me" },
  { href: OFFICE_URL, label: "Văn phòng AI", icon: Building2, office: true, group: "sys" },
  { to: "/cai-dat", label: "Cài đặt", icon: SettingsIcon, group: "sys" },
];
// Nhóm menu (thứ tự hiển thị). Thứ tự mục TRONG nhóm theo `order` (key = to|href); mục không có group → "Khác".
const NAV_GROUPS = [
  { id: "biz", label: "Kinh doanh", order: ["/", "/khach-hang", "/tai-nguyen", "/quang-cao"] },
  { id: "fin", label: "Tài chính", order: ["/ke-toan", "/coin"] },
  { id: "me", label: "Cá nhân", order: ["/cong-viec", "/tai-khoan"] },
  { id: "sys", label: "Hệ thống", order: [OFFICE_URL, "/cai-dat"] },
];
const navKey = (n) => n.to || n.href;

// Mục menu được phép thấy (quyền thành viên / chỉ chủ / văn phòng AI) — dùng chung cho sidebar + ô tìm kiếm
function useNavItems() {
  const { perms, isOwner } = useData();
  const officeOk = useOfficeAccess(isOwner);
  return useMemo(
    () => NAV.filter((n) => (!n.feat || (perms || []).includes(n.feat)) && (!n.ownerOnly || isOwner) && (!n.office || officeOk)),
    [perms, isOwner, officeOk]
  );
}

// Ghim menu — localStorage "qws_nav_pins" (mảng key to|href)
const PIN_KEY = "qws_nav_pins";
function readPins() {
  try { const v = JSON.parse(localStorage.getItem(PIN_KEY) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
}
function useNavPins() {
  const [pins, setPins] = useState(readPins);
  useEffect(() => {
    const h = (e) => { if (!e || e.key === PIN_KEY) setPins(readPins()); };
    window.addEventListener("storage", h);
    return () => window.removeEventListener("storage", h);
  }, []);
  const toggle = useCallback((key) => {
    setPins((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try { localStorage.setItem(PIN_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  return [pins, toggle];
}
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

function NavItem({ n, onNavigate, pinned, onTogglePin, mobile }) {
  const pinBtn = (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTogglePin(navKey(n)); }}
      title={pinned ? "Bỏ ghim" : "Ghim lên đầu"}
      aria-label={pinned ? "Bỏ ghim " + n.label : "Ghim " + n.label}
      className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 transition ${
        mobile ? "text-slate-300 opacity-70" : "text-slate-400 opacity-0 focus:opacity-100 group-hover/item:opacity-100"
      } ${pinned ? "hover:text-rose-500" : "hover:text-indigo-600"} hover:bg-slate-100/80`}
    >
      {pinned ? <PinOff size={13} /> : <Pin size={13} />}
    </button>
  );
  return (
    <div className="group/item relative">
      {n.href ? (
        <a href={n.href} target="_blank" rel="noopener" onClick={onNavigate}
          className="group flex items-center gap-3 rounded-xl px-3 py-2.5 pr-9 text-sm font-semibold text-slate-500 transition hover:bg-white hover:text-slate-900">
          <n.icon size={18} />
          {n.label}
          <ExternalLink size={13} className="ml-auto opacity-50" />
        </a>
      ) : (
        <NavLink
          to={n.to}
          end={n.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `group flex items-center gap-3 rounded-xl px-3 py-2.5 pr-9 text-sm font-semibold transition ${
              isActive
                ? "bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow-lg shadow-indigo-500/25"
                : "text-slate-500 hover:bg-white hover:text-slate-900"
            }`
          }
        >
          <n.icon size={18} />
          {n.label}
        </NavLink>
      )}
      {pinBtn}
    </div>
  );
}

function SideNav({ onNavigate, pins = [], onTogglePin, mobile }) {
  const items = useNavItems();
  const sections = useMemo(() => {
    const pinnedItems = pins.map((k) => items.find((n) => navKey(n) === k)).filter(Boolean);
    const pinnedSet = new Set(pinnedItems.map(navKey));
    const rest = items.filter((n) => !pinnedSet.has(navKey(n)));
    const out = [];
    if (pinnedItems.length) out.push({ id: "pin", label: "Ghim", items: pinnedItems });
    const known = new Set(NAV_GROUPS.map((g) => g.id));
    for (const g of NAV_GROUPS) {
      const pos = (n) => { const i = g.order.indexOf(navKey(n)); return i < 0 ? 999 : i; };
      const gi = rest.filter((n) => n.group === g.id).sort((a, b) => pos(a) - pos(b));
      if (gi.length) out.push({ id: g.id, label: g.label, items: gi });
    }
    const other = rest.filter((n) => !known.has(n.group));
    if (other.length) out.push({ id: "other", label: "Khác", items: other });
    return out;
  }, [items, pins]);
  return (
    <nav className="mt-5 flex min-h-0 flex-col gap-1 overflow-y-auto px-3 pb-2">
      {sections.map((s, si) => (
        <div key={s.id} className={si ? "mt-3" : ""}>
          <div className={`mb-1 flex items-center gap-1 px-3 text-[10px] font-bold uppercase tracking-wider ${s.id === "pin" ? "text-indigo-400" : "text-slate-400"}`}>
            {s.id === "pin" && <Pin size={10} />}{s.label}
          </div>
          <div className="flex flex-col gap-1">
            {s.items.map((n) => (
              <NavItem key={navKey(n)} n={n} onNavigate={onNavigate} pinned={s.id === "pin"} onTogglePin={onTogglePin} mobile={mobile} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

// Nút giả ô tìm kiếm → mở CommandPalette (Ctrl/Cmd+K, "/")
function SearchButton({ onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Tìm mọi thứ"
      className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-400 transition hover:border-indigo-200 hover:text-slate-600 sm:px-3"
    >
      <Search size={18} className="text-slate-500 sm:hidden" />
      <Search size={16} className="hidden sm:block" />
      <span className="hidden w-32 text-left sm:inline">Tìm mọi thứ…</span>
      <kbd className="hidden rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[10px] font-bold text-slate-400 md:inline">{KBD_HINT}</kbd>
    </button>
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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pins, togglePin] = useNavPins();
  const navItems = useNavItems();
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
        <SideNav pins={pins} onTogglePin={togglePin} />
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
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white/95 backdrop-blur-xl">
            <div className="flex items-center justify-between pr-3 pt-5">
              <Brand />
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
                <X size={20} />
              </button>
            </div>
            <SideNav onNavigate={() => setOpen(false)} pins={pins} onTogglePin={togglePin} mobile />
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
              <SearchButton onOpen={() => setPaletteOpen(true)} />
              <Notifications />
              <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-sky-500 text-sm font-bold text-white">
                Q
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6"><PushPrompt />{children}</main>
      </div>
      <CommandPalette open={paletteOpen} setOpen={setPaletteOpen} navItems={navItems} />
    </div>
  );
}
