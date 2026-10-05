import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, Users, ShoppingBag, FolderOpen, ListChecks, Receipt, CalendarHeart, KeyRound, ExternalLink, CornerDownLeft,
} from "lucide-react";
import { useData } from "../lib/store.jsx";
import { formatVND, fmtDateVI } from "../lib/format.js";
import { normEvent } from "../lib/events.js";

// Bỏ dấu tiếng Việt + đ→d + lowercase để so khớp không phân biệt dấu
export const normVI = (s) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/đ/g, "d");

const MAX_PER_GROUP = 5;
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");
export const KBD_HINT = isMac ? "⌘K" : "Ctrl K";

const VAULT_TYPE = { app: "Ứng dụng", card: "Thẻ", bank: "Thanh toán" };
const REC = { monthly: "hằng tháng", yearly: "hằng năm", once: "1 lần" };
const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "");
const fmtDate = (d) => { try { return d ? fmtDateVI(d) : ""; } catch { return ""; } };

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

// navItems: các mục menu ĐÃ lọc quyền (Layout truyền vào) — {to|href, label, icon}
export default function CommandPalette({ open, setOpen, navItems = [] }) {
  const data = useData();
  const { perms = [], isOwner } = data;
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Phím tắt toàn cục: Ctrl/Cmd+K bật/tắt, "/" mở (khi không gõ trong ô nhập)
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target) && !isTypingTarget(document.activeElement)) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [setOpen]);

  useEffect(() => {
    if (!open) return;
    setQ(""); setSel(0);
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    let prev = "";
    try { prev = document.body.style.overflow; document.body.style.overflow = "hidden"; } catch {}
    return () => { clearTimeout(t); try { document.body.style.overflow = prev; } catch {} };
  }, [open]);

  const groups = useMemo(() => {
    if (!open) return [];
    const tokens = normVI(q).trim().split(/\s+/).filter(Boolean);
    const qDigits = q.replace(/\D/g, "");
    const match = (...fields) => {
      if (!tokens.length) return true;
      const hay = normVI(fields.filter(Boolean).join(" "));
      return tokens.every((t) => hay.includes(t));
    };
    const rank = (arr, titleOf) => {
      if (!tokens.length) return arr;
      const first = tokens[0];
      return arr
        .map((x, i) => ({ x, i, s: normVI(titleOf(x)).startsWith(first) ? 0 : 1 }))
        .sort((a, b) => a.s - b.s || a.i - b.i)
        .map((r) => r.x);
    };
    const take = (arr, titleOf) => rank(arr, titleOf).slice(0, MAX_PER_GROUP);
    const out = [];
    const has = (f) => perms.includes(f);
    const go = (to) => () => nav(to);
    const custName = (id) => (data.customerList || []).find((c) => c.id === id)?.name || "";

    // Trang
    const pages = navItems.filter((n) => match(n.label));
    if (pages.length)
      out.push({ label: "Trang", items: (tokens.length ? take(pages, (n) => n.label) : pages).map((n) => ({
        key: "nav:" + (n.to || n.href), icon: n.icon, title: n.label,
        sub: n.href ? "Mở tab mới" : "",
        ext: !!n.href,
        run: n.href ? () => window.open(n.href, "_blank", "noopener") : go(n.to),
      })) });

    if (!tokens.length) return out;

    if (has("customers")) {
      const custs = (data.customerList || []).filter((c) => match(c.name, c.phone, c.zalo) || (qDigits.length >= 3 && String(c.phone || "").replace(/\D/g, "").includes(qDigits)));
      if (custs.length)
        out.push({ label: "Khách hàng", items: take(custs, (c) => c.name).map((c) => ({
          key: "c:" + c.id, icon: Users, tone: "text-indigo-500", title: c.name || "(chưa đặt tên)", sub: c.phone || "", run: go("/khach-hang"),
        })) });

      const projs = (data.projects || []).filter((p) => match(p.name, p.customerName, p.category));
      if (projs.length)
        out.push({ label: "Dự án", items: take(projs, (p) => p.name).map((p) => {
          const total = (p.installments || []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
          return {
            key: "p:" + p.id, icon: ShoppingBag, tone: "text-sky-500", title: p.name || "(chưa đặt tên)",
            sub: [p.customerName, total ? formatVND(total) : ""].filter(Boolean).join(" · "), run: go("/du-an"),
          };
        }) });
    }
    if (has("resources")) {
      const res = (data.resources || []).filter((r) => match(r.title, r.url, r.username, r.note, custName(r.customerId)));
      if (res.length)
        out.push({ label: "Tài nguyên", items: take(res, (r) => r.title).map((r) => {
          const url = safeUrl(r.url);
          let host = "";
          try { host = url ? new URL(url).hostname.replace(/^www\./, "") : ""; } catch {}
          return {
            key: "r:" + r.id, icon: FolderOpen, tone: "text-amber-500", title: r.title || host || "(không tên)",
            sub: [custName(r.customerId), host].filter(Boolean).join(" · "),
            ext: !!url,
            run: url ? () => window.open(url, "_blank", "noopener") : go("/tai-nguyen"),
            alt: url ? { label: "Xem trong Tài nguyên", run: go("/tai-nguyen") } : null,
          };
        }) });
    }

    if (has("tasks")) {
      const tasks = (data.tasks || []).filter((t) => match(t.title, t.note));
      if (tasks.length)
        out.push({ label: "Công việc", items: take(tasks, (t) => t.title).map((t) => ({
          key: "t:" + t.id, icon: ListChecks, tone: "text-emerald-500", title: t.title || "(không tên)",
          sub: [fmtDate(t.date) + (t.time ? " · " + t.time : ""), t.status === "done" ? "Đã xong" : ""].filter(Boolean).join(" · "),
          run: go("/cong-viec"),
        })) });

      const evs = (data.family || []).filter((f) => match(f.title, f.name, f.note, f.category));
      if (evs.length)
        out.push({ label: "Sự kiện", items: take(evs, (f) => f.title || f.name).map((f) => {
          let sub = "";
          try {
            const e = normEvent(f);
            sub = [e.category, e.day ? `${e.day}${e.month ? "/" + e.month : " hằng tháng"}${e.calendar === "am" ? " âm lịch" : ""}` : ""].filter(Boolean).join(" · ");
          } catch {}
          return { key: "f:" + f.id, icon: CalendarHeart, tone: "text-rose-500", title: f.title || f.name || "(không tên)", sub, run: go("/lich") };
        }) });
    }

    if (has("ketoan")) {
      const exps = (data.expenses || []).filter((x) => match(x.name, x.category, x.note));
      if (exps.length)
        out.push({ label: "Chi phí", items: take(exps, (x) => x.name).map((x) => ({
          key: "e:" + x.id, icon: Receipt, tone: "text-violet-500", title: x.name || "(không tên)",
          sub: [x.category, formatVND(x.amount), REC[x.recurring] || ""].filter(Boolean).join(" · "),
          run: go("/chi-phi"),
        })) });
    }

    // Tài khoản & Thẻ — CHỈ chủ, chỉ hiện TÊN (không bao giờ hiện/so khớp trường bí mật)
    if (isOwner) {
      const vs = (data.vault || []).filter((v) => match(v.title));
      if (vs.length)
        out.push({ label: "Tài khoản", items: take(vs, (v) => v.title).map((v) => ({
          key: "v:" + v.id, icon: KeyRound, tone: "text-slate-500", title: v.title || VAULT_TYPE[v.type] || "(không tên)",
          sub: VAULT_TYPE[v.type] || "", run: go("/tai-khoan"),
        })) });
    }
    return out;
  }, [open, q, navItems, perms, isOwner, data.customerList, data.projects, data.resources, data.tasks, data.family, data.expenses, data.vault, nav]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${sel}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [sel]);

  if (!open) return null;

  const close = () => setOpen(false);
  const pick = (it) => { if (!it) return; close(); it.run(); };

  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => (flat.length ? (s + 1) % flat.length : 0)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => (flat.length ? (s - 1 + flat.length) % flat.length : 0)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(flat[sel]); }
  };

  let idx = -1;
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Tìm kiếm">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onMouseDown={close} />
      <div className="relative mx-4 mt-16 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl sm:mx-auto sm:mt-[12vh] sm:max-w-xl">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Search size={18} className="shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Tìm khách, dự án, tài nguyên, việc, chi phí…"
            className="min-w-0 flex-1 bg-transparent text-base text-slate-800 outline-none placeholder:text-slate-400 sm:text-sm"
            autoComplete="off"
            spellCheck={false}
          />
          <button onClick={close} className="shrink-0 rounded-md border border-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-400 hover:text-slate-600">Esc</button>
        </div>
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
          {flat.length === 0 && <div className="px-3 py-6 text-center text-sm text-slate-400">Không tìm thấy “{q}”.</div>}
          {groups.map((g) => (
            <div key={g.label} className="mb-1">
              <div className="px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">{g.label}</div>
              {g.items.map((it) => {
                idx += 1;
                const i = idx;
                const active = i === sel;
                const Icon = it.icon;
                return (
                  <div
                    key={it.key}
                    data-idx={i}
                    onMouseMove={() => sel !== i && setSel(i)}
                    onClick={() => pick(it)}
                    className={`group flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 ${active ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                  >
                    {Icon && <Icon size={16} className={`shrink-0 ${it.tone || (active ? "text-indigo-600" : "text-slate-400")}`} />}
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-sm font-semibold ${active ? "text-indigo-700" : "text-slate-700"}`}>{it.title}</div>
                      {it.sub && <div className="truncate text-[11px] text-slate-400">{it.sub}</div>}
                    </div>
                    {it.alt && (
                      <button
                        onClick={(e) => { e.stopPropagation(); close(); it.alt.run(); }}
                        className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-400 hover:bg-white hover:text-indigo-600"
                        title={it.alt.label}
                      >
                        {it.alt.label}
                      </button>
                    )}
                    {it.ext && <ExternalLink size={13} className="shrink-0 text-slate-400" />}
                    {active && <CornerDownLeft size={13} className="hidden shrink-0 text-indigo-400 sm:block" />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="hidden items-center gap-3 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400 sm:flex">
          <span><b>↑↓</b> chọn</span><span><b>Enter</b> mở</span><span><b>Esc</b> đóng</span>
          <span className="ml-auto">Không cần gõ dấu</span>
        </div>
      </div>
    </div>
  );
}
