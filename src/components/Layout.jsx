import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, BarChart3, MoreHorizontal, Users, ShoppingBag, CalendarDays, ListChecks,
  LineChart, Menu, X, Bell, BellRing, Search, Settings as SettingsIcon, FolderKanban, Calculator, PiggyBank, CloudOff, RefreshCw, Coins, KeyRound, FolderOpen, Megaphone, Building2, ExternalLink, Pin, PinOff, Globe, ThumbsUp, Check, ChevronsLeft, ChevronsRight, Moon, Sun,
} from "lucide-react";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import CommandPalette, { KBD_HINT } from "./CommandPalette.jsx";
import { lunarInfo } from "../lib/lunar.js";
import { useData } from "../lib/store.jsx";
import { useTheme } from "../lib/theme.js";
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
  { to: "/bao-cao", label: "Trung tâm báo cáo", icon: BarChart3, ownerOnly: true, group: "biz" },
  { to: "/khach-hang", label: "Khách & Dự án", icon: Users, feat: "customers", group: "biz" },
  { to: "/ke-toan", label: "Kế toán & Chi phí", icon: Calculator, feat: "ketoan", group: "fin" },
  // Quỹ / Dòng tiền: ẩn khỏi menu theo yêu cầu (giữ route /quy + dữ liệu để bật lại khi cần)
  { to: "/cong-viec", label: "Công việc & Lịch", icon: ListChecks, feat: "tasks", group: "me" },
  { to: "/coin", label: "Đầu tư Coin", icon: Coins, feat: "coin", group: "fin" },
  { to: "/quang-cao", label: "Quảng cáo", icon: Megaphone, feat: "ads", group: "biz" },
  { to: "/tai-nguyen", label: "Tài nguyên", icon: FolderOpen, feat: "resources", group: "biz" },
  { to: "/website", label: "Hiệu quả Website", icon: Globe, feat: "web", group: "biz" },
  { to: "/fanpage", label: "Hiệu quả Fanpage", icon: ThumbsUp, feat: "fanpage", group: "biz" },
  { to: "/tai-khoan", label: "Tài khoản & Thẻ", icon: KeyRound, ownerOnly: true, group: "me" },
  { href: OFFICE_URL, label: "Văn phòng AI", icon: Building2, office: true, group: "sys" },
  { to: "/cai-dat", label: "Cài đặt", icon: SettingsIcon, group: "sys" },
];
// Nhóm menu (thứ tự hiển thị). Thứ tự mục TRONG nhóm theo `order` (key = to|href); mục không có group → "Khác".
const NAV_GROUPS = [
  { id: "biz", label: "Kinh doanh", order: ["/", "/bao-cao", "/khach-hang", "/tai-nguyen", "/quang-cao", "/website", "/fanpage"] },
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
const EXTRA_TITLES = { "/bao-cao": "Trung tâm báo cáo", "/chi-phi": "Kế toán & Chi phí", "/lich": "Công việc & Lịch", "/du-an": "Khách & Dự án", "/don-hang": "Khách & Dự án", "/quy": "Quỹ & Dòng tiền", "/quy-thong-ke": "Quỹ & Dòng tiền" };

function Brand({ mini }) {
  return (
    <div className={`flex items-center gap-3 ${mini ? "justify-center" : "px-2"}`}>
      <img src="/logo-mark.png" alt="2BKIN" className="h-10 w-10 rounded-xl bg-white object-contain ring-1 ring-slate-100" />
      <div className={`leading-tight ${mini ? "hidden" : ""}`}>
        <div className="text-[15px] font-extrabold tracking-tight">Quang Workspace</div>
        <div className="text-[11px] font-medium text-slate-400">by 2BKIN</div>
      </div>
    </div>
  );
}

function NavItem({ n, onNavigate, pinned, onTogglePin, mobile, mini, onTip }) {
  const tip = mini ? { onMouseEnter: (e) => onTip?.({ label: n.label, y: e.currentTarget.getBoundingClientRect().top + 20 }), onMouseLeave: () => onTip?.(null), onFocus: (e) => onTip?.({ label: n.label, y: e.currentTarget.getBoundingClientRect().top + 20 }), onBlur: () => onTip?.(null) } : {};
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
        <a href={n.href} target="_blank" rel="noopener" onClick={onNavigate} aria-label={mini ? n.label : undefined} {...tip}
          className={`group flex items-center gap-3 py-2.5 text-sm font-semibold transition ${mini ? "mx-auto h-11 w-11 justify-center rounded-2xl px-0 text-slate-400 hover:bg-white/10 hover:text-white" : "rounded-xl px-3 pr-9 text-slate-500 hover:bg-white hover:text-slate-900"}`}>
          <n.icon size={18} className="shrink-0" />
          {!mini && n.label}
          {!mini && <ExternalLink size={13} className="ml-auto opacity-50" />}
        </a>
      ) : (
        <NavLink
          to={n.to}
          end={n.end}
          onClick={onNavigate}
          aria-label={mini ? n.label : undefined}
          {...tip}
          className={({ isActive }) => mini
            ? `group mx-auto flex h-11 w-11 items-center justify-center rounded-2xl transition ${isActive ? "rail-active bg-indigo-400/25 text-white ring-1 ring-indigo-300/40" : "text-slate-400 hover:bg-white/10 hover:text-white"}`
            : `group flex items-center gap-3 rounded-xl px-3 py-2.5 pr-9 text-sm font-semibold transition ${
              isActive
                ? "nav-active bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow-lg shadow-indigo-500/25"
                : "text-slate-500 hover:bg-white hover:text-slate-900"
            }`
          }
        >
          <n.icon size={18} className="shrink-0" />
          {!mini && n.label}
        </NavLink>
      )}
      {!mini && pinBtn}
    </div>
  );
}

function SideNav({ onNavigate, pins = [], onTogglePin, mobile, mini, onTip }) {
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
    <nav className={`mt-5 flex min-h-0 flex-col gap-1 overflow-y-auto pb-2 ${mini ? "px-2.5 no-scrollbar" : "px-3"}`}>
      {sections.map((s, si) => (
        <div key={s.id} className={si ? "mt-3" : ""}>
          {mini ? si > 0 && <div className="mx-3 mb-2 border-t border-white/10" /> : <div className={`mb-1 flex items-center gap-1 px-3 text-[10px] font-bold uppercase tracking-wider ${s.id === "pin" ? "text-indigo-400" : "text-slate-400"}`}>
            {s.id === "pin" && <Pin size={10} />}{s.label}
          </div>}
          <div className="flex flex-col gap-1">
            {s.items.map((n) => (
              <NavItem key={navKey(n)} n={n} onNavigate={onNavigate} pinned={s.id === "pin"} onTogglePin={onTogglePin} mobile={mobile} mini={mini} onTip={onTip} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

// Có bản app mới (vừa deploy) → nút "Tải lại": 5 phút/lần + khi quay lại tab, so file JS chính đang chạy với bản trên máy chủ
function UpdatePill() {
  const [nu, setNu] = useState(false);
  useEffect(() => {
    const mine = document.querySelector('script[src*="/assets/index-"]')?.getAttribute("src")?.split("/assets/")[1];
    if (!mine) return undefined;
    const check = async () => {
      if (document.hidden) return;
      try { const h = await fetch("/?v=" + Date.now(), { cache: "no-store" }).then((r) => r.text()); const cur = h.match(/\/assets\/(index-[^"']+\.js)/)?.[1]; if (cur && cur !== mine) setNu(true); } catch { /* mất mạng */ }
    };
    const t = setInterval(check, 300000); document.addEventListener("visibilitychange", check);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", check); };
  }, []);
  if (!nu) return null;
  return <button onClick={() => location.reload()} title="App vừa được cập nhật — bấm để dùng bản mới" className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2 py-1 text-[11px] font-bold text-white shadow animate-pulse"><RefreshCw size={12} /> <span className="hidden sm:inline">Có bản mới · </span>Tải lại</button>;
}

// Sáng / tối toàn app (lib/theme.js) — nhớ theo máy
function ThemeButton() {
  const [t, setT] = useTheme();
  return (
    <button type="button" onClick={() => setT(t === "dark" ? "light" : "dark")} title={t === "dark" ? "Giao diện sáng" : "Giao diện tối (Pro)"} aria-label="Đổi giao diện sáng / tối"
      className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:text-slate-900">
      {t === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </button>
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

// Trạng thái lưu: Mất mạng / Đang lưu / Chưa đồng bộ / Đã lưu (hiện cả trên điện thoại)
function SyncBadge() {
  const { syncStatus } = useData();
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [savedAt, setSavedAt] = useState(0), prev = useRef(syncStatus);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  useEffect(() => { if (prev.current === "saving" && syncStatus === "idle") setSavedAt(Date.now()); prev.current = syncStatus; }, [syncStatus]);
  useEffect(() => { if (!savedAt) return undefined; const t = setTimeout(() => setSavedAt(0), 2500); return () => clearTimeout(t); }, [savedAt]);
  const pill = "flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold";
  if (!online)
    return <span title="Mất mạng — bản sửa được giữ trong máy, có mạng sẽ tự lưu lên cloud" className={`${pill} bg-slate-800 text-white`}><CloudOff size={12} /> <span className="hidden sm:inline">Mất mạng</span><span className="sm:hidden">Offline</span></span>;
  if (syncStatus === "saving")
    return <span aria-label="Đang lưu" className={`${pill} bg-slate-100 text-slate-500`}><RefreshCw size={12} className="animate-spin" /> <span className="hidden sm:inline">Đang lưu</span></span>;
  if (syncStatus === "error")
    return <span title="Bản sửa chưa lên cloud — app đang tự thử lại" className={`${pill} bg-amber-100 text-amber-700`}><CloudOff size={12} /> <span className="hidden sm:inline">Chưa đồng bộ</span></span>;
  if (savedAt)
    return <span aria-label="Đã lưu" className={`${pill} bg-emerald-50 text-emerald-700`}><Check size={12} /> <span className="hidden sm:inline">Đã lưu</span></span>;
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
      <button onClick={() => setOpen((o) => !o)} aria-label="Thông báo" className="relative rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:text-indigo-600">
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

// 22/10: mở app ở trang khác → máy rảnh 6 giây thì tính sẵn Demo ngầm (1 lần / lần mở app): nến + kết quả được nhớ sẵn,
// vào Coin là có số mới ngay thay vì chờ 2–3 giây tải nến. Chỉ khi có quyền xem Demo và đang có phiên.
function useDemoWarm() {
  const { settings = {}, perms = [], ownerId } = useData();
  const loc = useLocation();
  const done = useRef(false);
  const ok = !!ownerId && !!settings.paperBot && perms.includes("coinDemo");
  useEffect(() => {
    if (!ok || done.current || loc.pathname.startsWith("/coin")) return undefined;
    const t = setTimeout(() => {
      if (done.current || document.hidden) return;
      done.current = true;
      const go = () => import("../lib/coinShared.js").then((m) => m.demoResult(settings.paperBot)).catch(() => {});
      if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 5000 }); else go();
    }, 6000);
    return () => clearTimeout(t);
  }, [ok, loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
}

// Điện thoại / máy tính bảng: thanh 4 mục chính + "Thêm" (mở menu đầy đủ) dưới đáy
const BAR = ["/", "/bao-cao", "/khach-hang", "/coin"];
function BottomBar({ items, onMenu }) {
  const list = BAR.map((k) => items.find((n) => n.to === k)).filter(Boolean).slice(0, 4);
  const short = { "/": "Tổng quan", "/bao-cao": "Báo cáo", "/khach-hang": "Khách", "/coin": "Coin" };
  return (
    <nav aria-label="Menu nhanh" className="no-print fixed inset-x-0 bottom-0 z-30 flex justify-around rounded-t-3xl bg-slate-900 px-2 pt-1.5 lg:hidden" style={{ paddingBottom: "calc(6px + env(safe-area-inset-bottom, 0px))" }}>
      {list.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `flex min-w-[64px] flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-[10.5px] font-semibold ${isActive ? "rail-active bg-indigo-400/25 text-white" : "text-slate-400"}`}>
          <n.icon size={20} />{short[n.to] || n.label}
        </NavLink>
      ))}
      <button onClick={onMenu} className="flex min-w-[64px] flex-col items-center gap-0.5 rounded-2xl px-2 py-1.5 text-[10.5px] font-semibold text-slate-400"><MoreHorizontal size={20} />Thêm</button>
    </nav>
  );
}

export default function Layout({ children }) {
  useDemoWarm();
  const [open, setOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pins, togglePin] = useNavPins();
  // Thu gọn menu trái (máy tính): chỉ còn biểu tượng → nội dung (biểu đồ Coin…) rộng hơn; nhớ theo máy
  // 31/10 (giao diện bento): mặc định thanh icon tối; ai đã chủ động mở rộng ("0") thì giữ
  const [mini, setMiniState] = useState(() => { try { return localStorage.getItem("qws_nav_mini") !== "0"; } catch { return true; } });
  const [tip, setTip] = useState(null);
  const setMini = (v) => { setMiniState(v); try { localStorage.setItem("qws_nav_mini", v ? "1" : "0"); } catch {} };
  const navItems = useNavItems();
  const loc = useLocation();
  const li = lunarInfo(new Date());
  const title = NAV.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to) && n.to !== "/"))?.label
    || EXTRA_TITLES[loc.pathname]
    || (loc.pathname === "/" ? "Tổng quan" : "");

  return (
    <div className="aurora min-h-screen">
      {/* Sidebar desktop */}
      <aside className={`no-print fixed z-30 hidden flex-col transition-[width] duration-200 lg:flex ${mini ? "rail inset-y-3 left-3 w-[68px] rounded-[28px] bg-slate-900 shadow-xl shadow-slate-900/20" : "inset-y-0 left-0 w-64 border-r border-white/60 bg-white/60 backdrop-blur-xl"}`}>
        <div className={`relative ${mini ? "pt-4" : "pt-6"}`}>
          <Brand mini={mini} />
          <button type="button" onClick={() => setMini(!mini)} title={mini ? "Mở rộng menu" : "Thu gọn menu"} aria-label={mini ? "Mở rộng menu" : "Thu gọn menu"}
            className={`absolute z-10 grid h-6 w-6 place-items-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition hover:text-slate-800 ${mini ? "-right-3 top-[26px]" : "right-3 top-[34px]"}`}>
            {mini ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
          </button>
        </div>
        <SideNav pins={pins} onTogglePin={togglePin} mini={mini} onTip={setTip} />
        {mini && tip && <div style={{ top: tip.y }} className="pointer-events-none fixed left-[88px] z-50 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[12px] font-semibold text-white shadow-lg">{tip.label}</div>}
        <div className={`mt-auto p-4 ${mini ? "hidden" : ""}`}>
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
      <div className={`pb-20 transition-[padding] duration-200 lg:pb-0 ${mini ? "lg:pl-[92px]" : "lg:pl-64"}`}>
        <header className="no-print sticky top-0 z-20 border-b border-white/50 bg-white/55 backdrop-blur-xl">
          <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
            <button onClick={() => setOpen(true)} aria-label="Mở menu" className="rounded-lg p-2 text-slate-600 hover:bg-white lg:hidden">
              <Menu size={20} />
            </button>
            <h1 className="text-lg font-extrabold tracking-tight text-slate-900">{title}</h1>
            <div className="ml-auto flex items-center gap-2">
              <UpdatePill />
              <SyncBadge />
              <SearchButton onOpen={() => setPaletteOpen(true)} />
              <ThemeButton />
              <Notifications />
              <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-sky-500 text-sm font-bold text-white">
                Q
              </div>
            </div>
          </div>
        </header>

        <main className="qws-full w-full"><PushPrompt />{children}</main>
      </div>
      <BottomBar items={navItems} onMenu={() => setOpen(true)} />
      <CommandPalette open={paletteOpen} setOpen={setPaletteOpen} navItems={navItems} />
    </div>
  );
}
