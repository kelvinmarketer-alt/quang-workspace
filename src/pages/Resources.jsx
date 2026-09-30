import { useMemo, useRef, useState } from "react";
import { Plus, X, Trash2, Pencil, Copy, Check, Search, ExternalLink, FolderKanban, Link2, Sparkles, ImagePlus, Loader2, KeyRound, Eye, EyeOff, Settings as SettingsIcon } from "lucide-react";
import { Card, Badge } from "../components/ui.jsx";
import Combobox from "../components/Combobox.jsx";
import { useData } from "../lib/store.jsx";
import { aiReadResources, imageToDataUrl } from "../lib/ai.js";
import { RES_TYPES, RES_TYPE_KEYS, detectResType, guessTitle, hostOf } from "../lib/resources.js";

const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";
const TONE_GRAD = {
  emerald: "from-emerald-500 to-teal-500", sky: "from-sky-500 to-cyan-500", amber: "from-amber-500 to-orange-500",
  indigo: "from-indigo-500 to-violet-500", violet: "from-violet-500 to-fuchsia-500", teal: "from-teal-500 to-emerald-500",
  slate: "from-slate-500 to-slate-600", rose: "from-rose-500 to-pink-500", pink: "from-pink-500 to-rose-500",
};

const openUrl = (url) => { try { window.open(url, "_blank", "noopener,noreferrer"); } catch {} };
async function copy(text) {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch {}
  try {
    const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); document.body.removeChild(ta); return ok;
  } catch { return false; }
}

// 1 ô: nhãn + giá trị (ẩn nếu bí mật) + hiện + copy
function CredLine({ label, value, secret }) {
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);
  const doCopy = async () => { if (await copy(value)) { setDone(true); setTimeout(() => setDone(false), 1200); } };
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-16 shrink-0 text-[11px] font-semibold text-slate-400">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-slate-700">{secret && !show ? "•".repeat(Math.min((value || "").length, 12)) : value}</span>
      {secret && <button onClick={() => setShow((v) => !v)} className="shrink-0 rounded p-1 text-slate-400 hover:text-slate-600">{show ? <EyeOff size={13} /> : <Eye size={13} />}</button>}
      <button onClick={doCopy} className={`shrink-0 rounded p-1 ${done ? "text-emerald-600" : "text-slate-400 hover:text-indigo-600"}`}>{done ? <Check size={13} /> : <Copy size={13} />}</button>
    </div>
  );
}

// 1 dòng tài nguyên
export function ResRow({ r, subLabel, canW, onEdit, onDelete }) {
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState(false);
  const t = RES_TYPES[r.type] || RES_TYPES.web;
  const hasCred = !!(r.username || r.password);
  const doCopy = async (e) => { e.stopPropagation(); if (await copy(r.url)) { setDone(true); setTimeout(() => setDone(false), 1200); } };
  return (
    <div className="rounded-xl border border-slate-100 hover:border-indigo-200">
      <div className="group flex items-center gap-3 p-2.5">
        <button onClick={() => openUrl(r.url)} className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${TONE_GRAD[t.tone] || TONE_GRAD.slate} text-white`} title="Mở link">
          <t.icon size={16} />
        </button>
        <button onClick={() => openUrl(r.url)} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-1.5"><span className="truncate text-sm font-bold text-slate-800">{r.title || t.label}</span>{hasCred && <KeyRound size={12} className="shrink-0 text-amber-500" />}</div>
          <div className="truncate text-[11px] text-slate-400">{subLabel ? subLabel + " · " : ""}{hostOf(r.url) || r.url}</div>
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          {hasCred && <button onClick={() => setOpen((v) => !v)} className={`rounded-lg p-1.5 ${open ? "text-amber-600" : "text-slate-400 hover:bg-white hover:text-amber-600"}`} title="Tài khoản / mật khẩu"><KeyRound size={14} /></button>}
          <button onClick={() => openUrl(r.url)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-indigo-600" title="Mở"><ExternalLink size={14} /></button>
          <button onClick={doCopy} className={`rounded-lg p-1.5 ${done ? "text-emerald-600" : "text-slate-400 hover:bg-white hover:text-indigo-600"}`} title="Copy link">{done ? <Check size={14} /> : <Copy size={14} />}</button>
          {canW && onEdit && <button onClick={() => onEdit(r)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-indigo-600" title="Sửa"><Pencil size={14} /></button>}
          {canW && onDelete && <button onClick={() => { if (confirm("Xoá tài nguyên này?")) onDelete(r.id); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-rose-600" title="Xoá"><Trash2 size={14} /></button>}
        </div>
      </div>
      {open && hasCred && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-1.5">
          {r.username && <CredLine label="Tài khoản" value={r.username} secret={false} />}
          {r.password && <CredLine label="Mật khẩu" value={r.password} secret={true} />}
          {r.note && <CredLine label="Ghi chú" value={r.note} secret={false} />}
        </div>
      )}
    </div>
  );
}

// Modal thêm/sửa 1 tài nguyên
export function ResModal({ initial, customers, projects, onClose, onSave }) {
  const [f, setF] = useState({ url: "", title: "", type: "web", customerId: "", projectId: "", note: "", ...initial });
  const [typeTouched, setTypeTouched] = useState(!!initial?.id);
  const onUrl = (v) => setF((p) => ({ ...p, url: v, type: typeTouched ? p.type : detectResType(v) }));
  const projOptions = projects.filter((p) => !f.customerId || p.customerId === f.customerId).map((p) => ({ value: p.id, label: p.name, sub: p.customerName }));
  const save = () => {
    const url = (f.url || "").trim(); if (!url) return;
    onSave({ ...f, url, title: (f.title || "").trim() || guessTitle(url) });
    onClose();
  };
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">{initial?.id ? "Sửa tài nguyên" : "Thêm tài nguyên"}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Link *</span><input value={f.url} onChange={(e) => onUrl(e.target.value)} autoFocus className={inputCls} placeholder="Dán link Drive / Figma / Sheet…" /></label>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Tên gọi</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputCls} placeholder={f.url ? guessTitle(f.url) : "Tự đặt theo link nếu bỏ trống"} /></label>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Loại</span>
            <select value={f.type} onChange={(e) => { setTypeTouched(true); setF({ ...f, type: e.target.value }); }} className={inputCls}>
              {RES_TYPE_KEYS.map((k) => <option key={k} value={k}>{RES_TYPES[k].label}</option>)}
            </select>
          </label>
          <div className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Khách</span>
            <Combobox options={customers.map((c) => ({ value: c.id, label: c.name, sub: c.phone }))} value={f.customerId} onChange={(v) => setF({ ...f, customerId: v, projectId: "" })} placeholder="Chung / chọn khách" emptyText="Chưa có khách" />
          </div>
        </div>
        <div className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Dự án (JOB)</span>
          <Combobox options={projOptions} value={f.projectId} onChange={(v) => { const p = projects.find((x) => x.id === v); setF((s) => ({ ...s, projectId: v, customerId: p?.customerId || s.customerId })); }} placeholder="Không gắn / chọn dự án" emptyText="Khách này chưa có dự án" />
        </div>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Tài khoản</span><input value={f.username || ""} onChange={(e) => setF({ ...f, username: e.target.value })} className={inputCls} placeholder="Đăng nhập (nếu có)" autoComplete="off" /></label>
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Mật khẩu</span><input value={f.password || ""} onChange={(e) => setF({ ...f, password: e.target.value })} className={inputCls} placeholder="Mật khẩu (nếu có)" autoComplete="off" /></label>
        </div>
        <label className="mb-4 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Ghi chú</span><input value={f.note || ""} onChange={(e) => setF({ ...f, note: e.target.value })} className={inputCls} /></label>
        <button onClick={save} className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg">Lưu</button>
      </div>
    </div>
  );
}

// Modal thêm HÀNG LOẠT: dán nhiều link, mỗi dòng 1 link (hỗ trợ "Tên | link"), gắn chung 1 job
export function ResBatchModal({ customers, projects, preset = {}, onClose, onSave }) {
  const [text, setText] = useState("");
  const [customerId, setCustomerId] = useState(preset.customerId || "");
  const [projectId, setProjectId] = useState(preset.projectId || "");
  const parsed = useMemo(() => {
    return text.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
      let title = "", url = line;
      const m = line.split("|"); if (m.length >= 2) { title = m[0].trim(); url = m.slice(1).join("|").trim(); }
      return { title: title || guessTitle(url), url, type: detectResType(url) };
    }).filter((r) => r.url);
  }, [text]);
  const projOptions = projects.filter((p) => !customerId || p.customerId === customerId).map((p) => ({ value: p.id, label: p.name, sub: p.customerName }));
  const save = () => { if (parsed.length) { onSave(parsed.map((r) => ({ ...r, customerId, projectId }))); onClose(); } };
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <h3 className="text-lg font-extrabold">Thêm hàng loạt</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {!preset.projectId && (
            <div className="grid grid-cols-2 gap-3">
              <div><div className="mb-1 text-sm font-semibold text-slate-600">Khách (áp cho tất cả)</div>
                <Combobox options={customers.map((c) => ({ value: c.id, label: c.name, sub: c.phone }))} value={customerId} onChange={(v) => { setCustomerId(v); setProjectId(""); }} placeholder="Chung / chọn khách" emptyText="Chưa có khách" />
              </div>
              <div><div className="mb-1 text-sm font-semibold text-slate-600">Dự án (áp cho tất cả)</div>
                <Combobox options={projOptions} value={projectId} onChange={(v) => { const p = projects.find((x) => x.id === v); setProjectId(v); if (p) setCustomerId(p.customerId); }} placeholder="Không gắn / chọn dự án" emptyText="Chưa có dự án" />
              </div>
            </div>
          )}
          <label className="block text-sm">
            <span className="mb-1 block font-semibold text-slate-600">Dán link — mỗi dòng 1 link</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} className={`${inputCls} font-mono text-[12px]`} placeholder={"https://drive.google.com/...\nBrief Figma | https://figma.com/...\nhttps://docs.google.com/spreadsheets/..."} />
            <span className="mt-1 block text-[11px] text-slate-400">Mẹo: gõ <b>Tên | link</b> để đặt tên; bỏ trống tên sẽ tự đặt theo link.</span>
          </label>
          {parsed.length > 0 && (
            <div className="rounded-xl bg-slate-50 p-2">
              <div className="mb-1 px-1 text-[11px] font-bold uppercase text-slate-400">Xem trước ({parsed.length})</div>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {parsed.map((r, i) => { const t = RES_TYPES[r.type] || RES_TYPES.web; return (
                  <div key={i} className="flex items-center gap-2 px-1 text-[12px]"><t.icon size={13} className="shrink-0 text-slate-400" /><span className="truncate font-semibold text-slate-700">{r.title}</span><span className="ml-auto shrink-0 text-slate-400">{hostOf(r.url)}</span></div>
                ); })}
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-slate-100 p-4">
          <button onClick={save} disabled={!parsed.length} className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg disabled:opacity-40">Lưu tất cả ({parsed.length})</button>
        </div>
      </div>
    </div>
  );
}

// Modal AI: đọc ẢNH (chụp màn hình link/tài nguyên) → tự bóc + điền + thêm
export function ResAiModal({ customers, projects, preset = {}, onClose, onAdd }) {
  const { settings } = useData();
  const hasKey = !!(settings.openaiKey || "").trim();
  const fileRef = useRef(null);
  const [img, setImg] = useState(null);
  const [note, setNote] = useState("");
  const [customerId, setCustomerId] = useState(preset.customerId || "");
  const [projectId, setProjectId] = useState(preset.projectId || "");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [items, setItems] = useState(null); // [{title,url,type}]
  const projOptions = projects.filter((p) => !customerId || p.customerId === customerId).map((p) => ({ value: p.id, label: p.name, sub: p.customerName }));
  const pick = async (e) => { const f = e.target.files?.[0]; if (!f) return; try { setImg(await imageToDataUrl(f, 1600, 0.85)); } catch { setErr("Không đọc được ảnh."); } e.target.value = ""; };
  const analyze = async () => {
    setErr(""); setItems(null); setLoading(true);
    try {
      const r = await aiReadResources({ imageDataUrl: img, text: note, apiKey: settings.openaiKey, model: settings.openaiModel });
      const list = (r.resources || []).map((x) => ({ ...x, type: RES_TYPES[x.type] ? x.type : detectResType(x.url), title: x.title || guessTitle(x.url) }));
      if (!list.length) setErr("AI không tìm thấy link nào trong ảnh. Thử ảnh rõ hơn hoặc thêm ghi chú.");
      setItems(list);
    } catch (e) { setErr(e.message || "Lỗi không xác định"); }
    setLoading(false);
  };
  const setItem = (i, patch) => setItems((it) => it.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const removeItem = (i) => setItems((it) => it.filter((_, j) => j !== i));
  const add = () => { if (items && items.length) { onAdd(items.map((r) => ({ ...r, customerId, projectId }))); onClose(); } };
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <h3 className="flex items-center gap-2 text-lg font-extrabold"><Sparkles size={18} className="text-indigo-500" /> Thêm bằng AI (đọc ảnh)</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {!hasKey && <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-700"><SettingsIcon size={15} className="shrink-0" /> Chưa có API key OpenAI — vào <b>Cài đặt</b> để nhập trước.</div>}
          {!preset.projectId && (
            <div className="grid grid-cols-2 gap-3">
              <div><div className="mb-1 text-sm font-semibold text-slate-600">Khách (áp cho tất cả)</div>
                <Combobox options={customers.map((c) => ({ value: c.id, label: c.name, sub: c.phone }))} value={customerId} onChange={(v) => { setCustomerId(v); setProjectId(""); }} placeholder="Chung / chọn khách" emptyText="Chưa có khách" />
              </div>
              <div><div className="mb-1 text-sm font-semibold text-slate-600">Dự án (áp cho tất cả)</div>
                <Combobox options={projOptions} value={projectId} onChange={(v) => { const p = projects.find((x) => x.id === v); setProjectId(v); if (p) setCustomerId(p.customerId); }} placeholder="Không gắn / chọn dự án" emptyText="Chưa có dự án" />
              </div>
            </div>
          )}
          <button onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-6 text-sm font-bold text-slate-500 hover:border-indigo-300 hover:bg-indigo-50/40">
            <ImagePlus size={18} /> {img ? "Đổi ảnh khác" : "Chọn ảnh (chụp màn hình chứa các link)"}
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={pick} className="hidden" />
          {img && (
            <div className="relative inline-block">
              <img src={img} alt="preview" className="max-h-44 rounded-xl border border-slate-200" />
              <button onClick={() => setImg(null)} className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-rose-500 text-white"><X size={14} /></button>
            </div>
          )}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={`${inputCls}`} placeholder="Ghi chú cho AI (tuỳ chọn): vd 'toàn bộ tài liệu dự án web Cao JBL'…" />
          <button onClick={analyze} disabled={loading || !hasKey || !img} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg disabled:opacity-40">
            {loading ? <><Loader2 size={16} className="animate-spin" /> Đang đọc ảnh…</> : <><Sparkles size={16} /> Đọc ảnh bằng AI</>}
          </button>
          {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600">{err}</div>}
          {items && items.length > 0 && (
            <div className="rounded-xl border border-slate-100 p-2">
              <div className="mb-1 px-1 text-[11px] font-bold uppercase text-slate-400">AI bóc được ({items.length}) — sửa/bỏ trước khi thêm</div>
              <div className="max-h-56 space-y-1.5 overflow-y-auto">
                {items.map((r, i) => { const t = RES_TYPES[r.type] || RES_TYPES.web; return (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-100 p-2">
                    <t.icon size={15} className="shrink-0 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <input value={r.title} onChange={(e) => setItem(i, { title: e.target.value })} className="w-full bg-transparent text-sm font-semibold text-slate-700 outline-none" />
                      <div className="truncate text-[11px] text-slate-400">{hostOf(r.url) || r.url}</div>
                    </div>
                    <button onClick={() => removeItem(i)} className="shrink-0 rounded-lg p-1 text-slate-300 hover:text-rose-600"><Trash2 size={14} /></button>
                  </div>
                ); })}
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-slate-100 p-4">
          <button onClick={add} disabled={!items || !items.length} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-40"><Check size={16} /> Thêm {items?.length || 0} vào app</button>
        </div>
      </div>
    </div>
  );
}

// Mục nhúng trong Dự án (ProjectDrawer)
export function ProjectResources({ projectId, customerId, customerName = "" }) {
  const { resources = [], addResource, addResources, deleteResource, updateResource, canEdit, customerList = [], projects = [] } = useData();
  const canW = canEdit ? canEdit("customers") : true;
  const list = useMemo(() => (resources || []).filter((r) => r.projectId === projectId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), [resources, projectId]);
  const [url, setUrl] = useState("");
  const [batch, setBatch] = useState(false);
  const [ai, setAi] = useState(false);
  const [edit, setEdit] = useState(null);
  const quickAdd = () => { const u = url.trim(); if (!u) return; addResource({ url: u, type: detectResType(u), title: guessTitle(u), projectId, customerId }); setUrl(""); };
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-bold text-slate-600"><FolderKanban size={15} /> Tài liệu & Tài nguyên ({list.length})</div>
        {canW && (
          <div className="flex items-center gap-1.5">
            <button onClick={() => setAi(true)} className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-indigo-500 to-sky-500 px-2.5 py-1 text-xs font-bold text-white"><Sparkles size={13} /> AI</button>
            <button onClick={() => setBatch(true)} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-indigo-100 hover:text-indigo-600"><Plus size={13} /> Hàng loạt</button>
          </div>
        )}
      </div>
      {canW && (
        <div className="mb-2 flex gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
            <Link2 size={15} className="shrink-0 text-slate-400" />
            <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") quickAdd(); }} placeholder="Dán link Drive / Figma / Sheet… rồi Enter" className="w-full text-sm outline-none" />
          </div>
          <button onClick={quickAdd} className="rounded-xl bg-indigo-500 px-3 py-2 text-sm font-bold text-white hover:bg-indigo-600">Thêm</button>
        </div>
      )}
      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-4 text-center text-xs text-slate-400">Chưa có tài liệu. Dán link vào ô trên để lưu vào job này.</div>
      ) : (
        <div className="space-y-1.5">
          {list.map((r) => <ResRow key={r.id} r={r} canW={canW} onEdit={setEdit} onDelete={deleteResource} />)}
        </div>
      )}
      {batch && <ResBatchModal customers={customerList} projects={projects} preset={{ projectId, customerId }} onClose={() => setBatch(false)} onSave={addResources} />}
      {ai && <ResAiModal customers={customerList} projects={projects} preset={{ projectId, customerId }} onClose={() => setAi(false)} onAdd={addResources} />}
      {edit && <ResModal initial={edit} customers={customerList} projects={projects} onClose={() => setEdit(null)} onSave={(data) => updateResource(edit.id, data)} />}
    </div>
  );
}

export default function Resources() {
  const { resources = [], customerList = [], projects = [], addResource, addResources, updateResource, deleteResource, canEdit } = useData();
  const canW = canEdit ? canEdit("customers") : true;
  const [q, setQ] = useState("");
  const [typeF, setTypeF] = useState("all");
  const [custF, setCustF] = useState("all");
  const [modal, setModal] = useState(null);
  const [batch, setBatch] = useState(false);
  const [ai, setAi] = useState(false);

  const projName = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p.name])), [projects]);
  const custName = useMemo(() => Object.fromEntries(customerList.map((c) => [c.id, c.name])), [customerList]);

  const typeCounts = useMemo(() => {
    const c = { all: resources.length };
    for (const r of resources) c[r.type] = (c[r.type] || 0) + 1;
    return c;
  }, [resources]);
  const typesPresent = RES_TYPE_KEYS.filter((k) => typeCounts[k]);

  const list = useMemo(() => {
    const lq = q.trim().toLowerCase();
    return resources
      .filter((r) => (typeF === "all" || r.type === typeF) && (custF === "all" || r.customerId === custF)
        && (!lq || (r.title + r.url + (custName[r.customerId] || "") + (projName[r.projectId] || "")).toLowerCase().includes(lq)))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [resources, q, typeF, custF, custName, projName]);

  const subLabel = (r) => [custName[r.customerId], projName[r.projectId]].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-900 p-4 text-white shadow-xl sm:p-5">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-indigo-200"><FolderKanban size={14} /> Tài nguyên & Tài liệu</div>
        <div className="mt-1 text-3xl font-extrabold">{resources.length}</div>
        <div className="mt-0.5 text-xs text-indigo-100/80">link tài liệu online của mọi dự án · bấm để mở / copy</div>
      </div>

      {/* Bộ lọc loại */}
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => setTypeF("all")} className={`rounded-lg px-3 py-1.5 text-[12px] font-bold ${typeF === "all" ? "bg-indigo-500 text-white" : "bg-white text-slate-500 hover:bg-slate-100"}`}>Tất cả {typeCounts.all || 0}</button>
        {typesPresent.map((k) => (
          <button key={k} onClick={() => setTypeF(k)} className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-bold ${typeF === k ? "bg-indigo-500 text-white" : "bg-white text-slate-500 hover:bg-slate-100"}`}>{RES_TYPES[k].label} {typeCounts[k]}</button>
        ))}
      </div>

      {/* Tìm + lọc khách + thêm */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[160px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <Search size={16} className="shrink-0 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tên / link / khách / dự án…" className="w-full text-sm outline-none" />
        </div>
        <select value={custF} onChange={(e) => setCustF(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
          <option value="all">Tất cả khách</option>
          {customerList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {canW && (
          <div className="flex w-full gap-2 sm:w-auto">
            <button onClick={() => setAi(true)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-600 hover:bg-indigo-100 sm:flex-none"><Sparkles size={15} /> AI</button>
            <button onClick={() => setModal({})} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 sm:flex-none"><Plus size={15} /> Thêm</button>
            <button onClick={() => setBatch(true)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-3 py-2 text-sm font-bold text-white shadow-lg sm:flex-none"><Plus size={15} /> Hàng loạt</button>
          </div>
        )}
      </div>

      {/* Danh sách */}
      {list.length === 0 ? (
        <Card><div className="py-12 text-center"><FolderKanban size={28} className="mx-auto text-slate-300" /><div className="mt-2 text-sm font-bold text-slate-600">{resources.length === 0 ? "Chưa có tài nguyên" : "Không tìm thấy"}</div><div className="mt-1 text-xs text-slate-400">Gom link Drive/Figma/Sheet/Canva… về đây để quản lý tập trung.</div></div></Card>
      ) : (
        <Card className="!p-3">
          <div className="space-y-1.5">
            {list.map((r) => <ResRow key={r.id} r={r} subLabel={subLabel(r)} canW={canW} onEdit={setModal} onDelete={deleteResource} />)}
          </div>
        </Card>
      )}

      {modal && <ResModal initial={modal} customers={customerList} projects={projects} onClose={() => setModal(null)} onSave={(data) => (modal.id ? updateResource(modal.id, data) : addResource(data))} />}
      {batch && <ResBatchModal customers={customerList} projects={projects} onClose={() => setBatch(false)} onSave={addResources} />}
      {ai && <ResAiModal customers={customerList} projects={projects} onClose={() => setAi(false)} onAdd={addResources} />}
    </div>
  );
}
