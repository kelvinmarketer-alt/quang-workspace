import { useMemo, useRef, useState } from "react";
import { Plus, X, Trash2, Pencil, Copy, Check, Search, ExternalLink, FolderKanban, Link2, Sparkles, ImagePlus, Loader2, KeyRound, Eye, EyeOff, ChevronDown, Users, ListPlus, Settings as SettingsIcon } from "lucide-react";
import { Card, Badge } from "../components/ui.jsx";
import Combobox from "../components/Combobox.jsx";
import { useData } from "../lib/store.jsx";
import { aiReadResources, imageToDataUrl } from "../lib/ai.js";
import { usePasteImages } from "../lib/paste.js";
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

// 1 ô: nhãn + giá trị (ẩn nếu bí mật) + hiện + nút Copy có chữ
function CredLine({ label, value, secret }) {
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);
  const doCopy = async () => { if (await copy(value)) { setDone(true); setTimeout(() => setDone(false), 1400); } };
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-16 shrink-0 text-[11px] font-semibold text-slate-400">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-slate-700">{secret && !show ? "•".repeat(Math.min((value || "").length, 12)) : value}</span>
      {secret && <button onClick={() => setShow((v) => !v)} className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700" title={show ? "Ẩn" : "Hiện"}>{show ? <EyeOff size={14} /> : <Eye size={14} />}</button>}
      <button onClick={doCopy} className={`flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold ${done ? "border-emerald-200 bg-emerald-50 text-emerald-600" : "border-slate-200 bg-white text-indigo-600 hover:bg-indigo-50"}`}>{done ? <Check size={12} /> : <Copy size={12} />}{done ? "Đã copy" : "Copy"}</button>
    </div>
  );
}

// Nút copy gộp tài khoản + mật khẩu (+ tên + link) để gửi nhanh
function CopyAllCred({ r }) {
  const [done, setDone] = useState(false);
  const text = [r.title, r.username ? `Tài khoản: ${r.username}` : "", r.password ? `Mật khẩu: ${r.password}` : "", r.url ? `Link: ${r.url}` : "", r.note ? `Ghi chú: ${r.note}` : ""].filter(Boolean).join("\n");
  const doCopy = async () => { if (await copy(text)) { setDone(true); setTimeout(() => setDone(false), 1600); } };
  return (
    <button onClick={doCopy} className={`mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-bold ${done ? "bg-emerald-500 text-white" : "bg-slate-800 text-white hover:bg-slate-700"}`}>
      {done ? <Check size={13} /> : <Copy size={13} />} {done ? "Đã copy" : "Copy tài khoản + mật khẩu + link"}
    </button>
  );
}

// 1 dòng tài nguyên
export function ResRow({ r, subLabel, canW, onEdit, onDelete, select, checked, onCheck }) {
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState(false);
  const t = RES_TYPES[r.type] || RES_TYPES.web;
  const hasCred = !!(r.username || r.password);
  const doCopy = async (e) => { e.stopPropagation(); if (await copy(r.url)) { setDone(true); setTimeout(() => setDone(false), 1200); } };
  return (
    <div className={`rounded-xl border ${checked ? "border-indigo-300 bg-indigo-50/40" : "border-slate-100 hover:border-indigo-200"}`}>
      <div className="group flex items-center gap-3 p-2.5">
        {select && (
          <button onClick={() => onCheck && onCheck(r.id)} className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border ${checked ? "border-indigo-500 bg-indigo-500 text-white" : "border-slate-300 text-transparent"}`}>
            <Check size={14} />
          </button>
        )}
        <button onClick={() => (select ? onCheck && onCheck(r.id) : openUrl(r.url))} className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${TONE_GRAD[t.tone] || TONE_GRAD.slate} text-white`} title="Mở link">
          <t.icon size={16} />
        </button>
        <button onClick={() => openUrl(r.url)} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-1.5"><span className="truncate text-sm font-bold text-slate-800">{r.title || t.label}</span>{hasCred && <KeyRound size={12} className="shrink-0 text-amber-500" />}</div>
          <div className="truncate text-[11px] text-slate-400">{subLabel ? subLabel + " · " : ""}{hostOf(r.url) || r.url}</div>
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          {hasCred && <button onClick={() => setOpen((v) => !v)} className={`flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold ${open ? "bg-amber-500 text-white" : "bg-amber-100 text-amber-700 hover:bg-amber-200"}`} title="Xem & copy tài khoản / mật khẩu"><KeyRound size={13} /> TK/MK</button>}
          <button onClick={() => openUrl(r.url)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-indigo-600" title="Mở"><ExternalLink size={14} /></button>
          <button onClick={doCopy} className={`rounded-lg p-1.5 ${done ? "text-emerald-600" : "text-slate-400 hover:bg-white hover:text-indigo-600"}`} title="Copy link">{done ? <Check size={14} /> : <Copy size={14} />}</button>
          {canW && onEdit && <button onClick={() => onEdit(r)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-indigo-600" title="Sửa"><Pencil size={14} /></button>}
          {canW && onDelete && <button onClick={() => { if (confirm("Xoá tài nguyên này?")) onDelete(r.id); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-rose-600" title="Xoá"><Trash2 size={14} /></button>}
        </div>
      </div>
      {open && hasCred && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-2">
          {r.username && <CredLine label="Tài khoản" value={r.username} secret={false} />}
          {r.password && <CredLine label="Mật khẩu" value={r.password} secret={true} />}
          {r.note && <CredLine label="Ghi chú" value={r.note} secret={false} />}
          <CopyAllCred r={r} />
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
  const hasKey = settings.aiReady ?? !!(settings.openaiKey || "").trim();
  const fileRef = useRef(null);
  const [img, setImg] = useState(null);
  const [note, setNote] = useState("");
  const [customerId, setCustomerId] = useState(preset.customerId || "");
  const [projectId, setProjectId] = useState(preset.projectId || "");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [items, setItems] = useState(null); // [{title,url,type}]
  const [drag, setDrag] = useState(false);
  const projOptions = projects.filter((p) => !customerId || p.customerId === customerId).map((p) => ({ value: p.id, label: p.name, sub: p.customerName }));
  const handleFiles = async (files) => { const f = files && files[0]; if (!f || !f.type?.startsWith("image/")) return; try { setImg(await imageToDataUrl(f, 1600, 0.85)); setErr(""); } catch { setErr("Không đọc được ảnh."); } };
  const pick = async (e) => { await handleFiles(e.target.files); e.target.value = ""; };
  usePasteImages(handleFiles);
  const analyze = async () => {
    setErr(""); setItems(null); setLoading(true);
    try {
      const r = await aiReadResources({ imageDataUrl: img, text: note, apiKey: settings.openaiKey, model: "gpt-4o" });
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
          <button
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
            className={`flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed py-6 text-sm font-bold ${drag ? "border-indigo-400 bg-indigo-50" : "border-slate-200 text-slate-500 hover:border-indigo-300 hover:bg-indigo-50/40"}`}>
            <span className="flex items-center gap-2"><ImagePlus size={18} /> {img ? "Đổi ảnh khác" : "Chọn ảnh (chụp màn hình chứa các link)"}</span>
            <span className="text-[11px] font-medium text-slate-400">hoặc <b>dán ảnh (Ctrl/Cmd+V)</b> · kéo-thả ảnh vào đây</span>
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
              <div className="mb-1 px-1 text-[11px] font-bold uppercase text-slate-400">AI bóc được ({items.length}) — sửa trực tiếp rồi thêm</div>
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {items.map((r, i) => { const t = RES_TYPES[r.type] || RES_TYPES.web; const cell = "w-full rounded-lg border border-slate-200 px-2 py-1 text-[13px] outline-none focus:border-indigo-400"; return (
                  <div key={i} className="space-y-1.5 rounded-lg border border-slate-100 bg-slate-50/50 p-2">
                    <div className="flex items-center gap-1.5">
                      <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${TONE_GRAD[t.tone] || TONE_GRAD.slate} text-white`}><t.icon size={13} /></div>
                      <input value={r.title} onChange={(e) => setItem(i, { title: e.target.value })} placeholder="Tên nguồn / hạng mục" className={`${cell} flex-1 font-semibold`} />
                      <select value={r.type} onChange={(e) => setItem(i, { type: e.target.value })} className={`${cell} w-24`}>
                        {RES_TYPE_KEYS.map((k) => <option key={k} value={k}>{RES_TYPES[k].label}</option>)}
                      </select>
                      <button onClick={() => removeItem(i)} className="shrink-0 rounded-lg p-1 text-slate-300 hover:text-rose-600"><Trash2 size={15} /></button>
                    </div>
                    <input value={r.url || ""} onChange={(e) => setItem(i, { url: e.target.value })} placeholder="Link đăng nhập / URL" className={`${cell} font-mono`} />
                    <div className="grid grid-cols-2 gap-1.5">
                      <input value={r.username || ""} onChange={(e) => setItem(i, { username: e.target.value })} placeholder="Tài khoản" className={cell} autoComplete="off" />
                      <input value={r.password || ""} onChange={(e) => setItem(i, { password: e.target.value })} placeholder="Mật khẩu" className={cell} autoComplete="off" />
                    </div>
                    <input value={r.note || ""} onChange={(e) => setItem(i, { note: e.target.value })} placeholder="Ghi chú" className={cell} />
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
      {batch && <ResBatchModal customers={customerList.filter((c) => c.active !== false)} projects={projects} preset={{ projectId, customerId }} onClose={() => setBatch(false)} onSave={addResources} />}
      {ai && <ResAiModal customers={customerList.filter((c) => c.active !== false)} projects={projects} preset={{ projectId, customerId }} onClose={() => setAi(false)} onAdd={addResources} />}
      {edit && <ResModal initial={edit} customers={customerList.filter((c) => c.active !== false)} projects={projects} onClose={() => setEdit(null)} onSave={(data) => updateResource(edit.id, data)} />}
    </div>
  );
}

export default function Resources() {
  const { resources = [], customerList = [], projects = [], addResource, addResources, updateResource, deleteResource, deleteResources, canEdit } = useData();
  const canW = canEdit ? canEdit("customers") : true;
  const [q, setQ] = useState("");
  const [typeF, setTypeF] = useState("all");
  const [custF, setCustF] = useState("all");
  const [modal, setModal] = useState(null);
  const [batch, setBatch] = useState(false);
  const [ai, setAi] = useState(false);
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const [selMode, setSelMode] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const toggleSel = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clearSel = () => setSel(new Set());
  const deleteSelected = () => { if (sel.size && confirm(`Xoá ${sel.size} tài nguyên đã chọn?`)) { deleteResources([...sel]); clearSel(); } };
  const deleteGroup = (g) => { if (confirm(`Xoá TẤT CẢ ${g.items.length} tài nguyên của "${g.name}"?`)) deleteResources(g.items.map((r) => r.id)); };
  const toggleGroupSel = (g) => setSel((s) => { const n = new Set(s); const all = g.items.every((r) => n.has(r.id)); g.items.forEach((r) => (all ? n.delete(r.id) : n.add(r.id))); return n; });

  const activeCustomers = useMemo(() => customerList.filter((c) => c.active !== false), [customerList]);
  const projName = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p.name])), [projects]);
  const custById = useMemo(() => Object.fromEntries(customerList.map((c) => [c.id, c])), [customerList]);
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

  // Nhóm theo khách hàng (accordion)
  const groups = useMemo(() => {
    const map = new Map();
    for (const r of list) { const k = r.customerId || "__none__"; if (!map.has(k)) map.set(k, []); map.get(k).push(r); }
    const arr = [...map.entries()].map(([cid, items]) => ({ cid, name: cid === "__none__" ? "Chung / chưa gắn khách" : (custName[cid] || "Khách khác"), items }));
    arr.sort((a, b) => (a.cid === "__none__" ? 1 : 0) - (b.cid === "__none__" ? 1 : 0) || b.items.length - a.items.length || a.name.localeCompare(b.name));
    return arr;
  }, [list, custName]);
  const filtering = !!(q.trim() || typeF !== "all" || custF !== "all"); // đang lọc → mở hết cho dễ thấy
  const isOpen = (cid) => filtering || openGroups.has(cid);
  const toggleGroup = (cid) => setOpenGroups((s) => { const n = new Set(s); n.has(cid) ? n.delete(cid) : n.add(cid); return n; });

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
          {activeCustomers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {canW && (
          <div className="flex w-full gap-2 sm:w-auto">
            <button onClick={() => setAi(true)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-600 hover:bg-indigo-100 sm:flex-none"><Sparkles size={15} /> AI</button>
            <button onClick={() => setModal({})} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 sm:flex-none"><Plus size={15} /> Thêm</button>
            <button onClick={() => setBatch(true)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-3 py-2 text-sm font-bold text-white shadow-lg sm:flex-none"><Plus size={15} /> Hàng loạt</button>
            <button onClick={() => { setSelMode((v) => !v); clearSel(); }} className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-bold sm:flex-none ${selMode ? "border-rose-300 bg-rose-50 text-rose-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}><Check size={15} /> {selMode ? "Xong" : "Chọn"}</button>
          </div>
        )}
      </div>

      {/* Thanh chọn hàng loạt */}
      {canW && selMode && (
        <div className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2">
          <span className="text-sm font-bold text-indigo-700">Đã chọn {sel.size}</span>
          <button onClick={clearSel} className="ml-auto rounded-lg px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-white">Bỏ chọn</button>
          <button onClick={deleteSelected} disabled={!sel.size} className="flex items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-1.5 text-sm font-bold text-white hover:bg-rose-600 disabled:opacity-40"><Trash2 size={14} /> Xoá đã chọn</button>
        </div>
      )}

      {/* Danh sách — nhóm theo khách (accordion) */}
      {list.length === 0 ? (
        <Card><div className="py-12 text-center"><FolderKanban size={28} className="mx-auto text-slate-300" /><div className="mt-2 text-sm font-bold text-slate-600">{resources.length === 0 ? "Chưa có tài nguyên" : "Không tìm thấy"}</div><div className="mt-1 text-xs text-slate-400">Gom link Drive/Figma/Sheet/Canva… về đây để quản lý tập trung.</div></div></Card>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => {
            const open = isOpen(g.cid);
            const cust = custById[g.cid];
            const initials = (g.name || "?").trim().split(/\s+/).slice(-2).map((w) => w[0]).join("").toUpperCase();
            const allSel = selMode && g.items.every((r) => sel.has(r.id));
            return (
              <Card key={g.cid} className="!p-0 overflow-hidden">
                <div className="flex w-full items-center gap-3 p-3">
                  {selMode && canW && (
                    <button onClick={() => toggleGroupSel(g)} className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border ${allSel ? "border-indigo-500 bg-indigo-500 text-white" : "border-slate-300 text-transparent"}`}><Check size={14} /></button>
                  )}
                  <button onClick={() => toggleGroup(g.cid)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <div className={`grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl text-[13px] font-extrabold ${g.cid === "__none__" ? "bg-slate-200 text-slate-500" : "bg-gradient-to-br from-indigo-500 to-sky-500 text-white"}`}>
                      {cust?.logo ? <img src={cust.logo} alt="" className="h-full w-full object-cover" /> : g.cid === "__none__" ? <Users size={16} /> : initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-extrabold text-slate-800">{g.name}</div>
                      <div className="text-[11px] text-slate-400">{g.items.length} tài nguyên</div>
                    </div>
                    <ChevronDown size={18} className={`shrink-0 text-slate-400 transition ${open ? "rotate-180" : ""}`} />
                  </button>
                  {canW && !selMode && (() => { const pc = g.cid === "__none__" ? "" : g.cid; return (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button onClick={(e) => { e.stopPropagation(); setAi({ customerId: pc }); }} className="rounded-lg p-1.5 text-indigo-500 hover:bg-indigo-50" title={`AI đọc ảnh → thêm vào ${g.name}`}><Sparkles size={16} /></button>
                      <button onClick={(e) => { e.stopPropagation(); setModal({ customerId: pc }); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600" title={`Thêm 1 mục vào ${g.name}`}><Plus size={16} /></button>
                      <button onClick={(e) => { e.stopPropagation(); setBatch({ customerId: pc }); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600" title={`Thêm hàng loạt vào ${g.name}`}><ListPlus size={16} /></button>
                    </div>
                  ); })()}
                  {canW && <button onClick={() => deleteGroup(g)} className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600" title={`Xoá tất cả tài nguyên của ${g.name}`}><Trash2 size={16} /></button>}
                </div>
                {open && (
                  <div className="space-y-1.5 border-t border-slate-100 p-3">
                    {g.items.map((r) => <ResRow key={r.id} r={r} subLabel={projName[r.projectId] || ""} canW={canW} onEdit={setModal} onDelete={deleteResource} select={selMode} checked={sel.has(r.id)} onCheck={toggleSel} />)}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {modal && <ResModal initial={modal} customers={activeCustomers} projects={projects} onClose={() => setModal(null)} onSave={(data) => (modal.id ? updateResource(modal.id, data) : addResource(data))} />}
      {batch && <ResBatchModal customers={activeCustomers} projects={projects} preset={batch === true ? {} : batch} onClose={() => setBatch(false)} onSave={addResources} />}
      {ai && <ResAiModal customers={activeCustomers} projects={projects} preset={ai === true ? {} : ai} onClose={() => setAi(false)} onAdd={addResources} />}
    </div>
  );
}
