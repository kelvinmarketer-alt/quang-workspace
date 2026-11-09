import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Folder, FolderPlus, FilePlus2, Upload, Search, X, ChevronRight, ChevronDown, FileText, FileCode2, Trash2, Pencil, Download,
  Loader2, Library as LibraryIcon, Inbox, Link2, Copy, Check, Layers, AlertTriangle, RefreshCw, Tag, Sparkles, Send, MessageSquare, Users, Lightbulb,
} from "lucide-react";
import { Card, Badge } from "../components/ui.jsx";
import { ask, guardClose, markDirty } from "../components/ConfirmDialog.jsx";
import { useData } from "../lib/store.jsx";
import {
  KINDS, FOLDER_COLORS, FOLDER_COLOR_KEYS, MAX_FILE_BYTES, fold, fmtSize, fmtDate, buildTree, flattenTree, folderPath, descendantIds, countDocs,
  frameDoc, tidySnippet, parseTags, filterDocs, sortDocs, extractTitle, toPlain, isMissingTable, prepareFile, downloadDoc,
  libLoad, libGet, libSearch, libAddDoc, libUpdateDoc, libDeleteDoc, libAddFolder, libUpdateFolder, libDeleteFolder,
  libIndex, libAsk, libIdea, renderAnswer, unindexedDocs,
  SHARE_EXPIRY, shareUrl, shareExpired, libShares, libShareCreate, libShareSetExpiry, libShareRevoke,
} from "../lib/library.js";
import { todayISO } from "../lib/format.js";

const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300";
const labelCls = "mb-1 block text-[12px] font-bold text-slate-500";
const KIND_BOX = { html: "bg-sky-50 text-sky-600", md: "bg-violet-50 text-violet-600", txt: "bg-slate-100 text-slate-600" };
const ACCEPT = ".html,.htm,.md,.markdown,.txt,.csv,.json,.log,text/html,text/markdown,text/plain";

// ───────────── Khung nhỏ dùng chung ─────────────
function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4" onInputCapture={markDirty}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={guardClose(onClose)} />
      <div role="dialog" aria-modal="true" aria-label={title} className={`relative max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-5 ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-base font-extrabold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Ô chọn thư mục thụt đầu dòng theo cấp. exclude = các thư mục không được chọn (chính nó + con của nó).
function FolderSelect({ folders, value, onChange, exclude, noneLabel = "Chưa phân loại" }) {
  const flat = useMemo(() => flattenTree(folders).filter((f) => !exclude || !exclude.has(f.id)), [folders, exclude]);
  return (
    <select className={inputCls} value={value || ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{noneLabel}</option>
      {flat.map((f) => <option key={f.id} value={f.id}>{"  ".repeat(f.depth)}{f.depth ? "└ " : ""}{f.name}</option>)}
    </select>
  );
}

// Chọn khách + dự án của khách đó (dự án chỉ hiện khi đã chọn khách). value = { customer_id, project_id }.
function LinkSelects({ value, onChange }) {
  const { customerList = [], projects = [] } = useData() || {};
  const custs = useMemo(() => [...customerList].filter((c) => c.active !== false || c.id === value.customer_id).sort((a, b) => String(a.name).localeCompare(String(b.name), "vi")), [customerList, value.customer_id]);
  const projs = useMemo(() => projects.filter((p) => value.customer_id && p.customerId === value.customer_id), [projects, value.customer_id]);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div><label className={labelCls} htmlFor="link-cust">Thuộc khách <span className="font-medium text-slate-400">(tuỳ chọn)</span></label>
        <select id="link-cust" className={inputCls} value={value.customer_id || ""} onChange={(e) => onChange({ customer_id: e.target.value || null, project_id: null })}>
          <option value="">(không gắn khách)</option>{custs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></div>
      <div><label className={labelCls} htmlFor="link-proj">Dự án</label>
        <select id="link-proj" className={inputCls} value={value.project_id || ""} disabled={!value.customer_id} onChange={(e) => onChange({ ...value, project_id: e.target.value || null })}>
          <option value="">{value.customer_id ? "(cả khách, không riêng dự án)" : "(chọn khách trước)"}</option>{projs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select></div>
    </div>
  );
}

// ───────────── Cây thư mục (máy tính) ─────────────
function TreeNode({ node, depth, selected, onSelect, expanded, toggle, counts, onDropDoc }) {
  const [over, setOver] = useState(false);
  const open = expanded.has(node.id), has = node.children.length > 0;
  const col = FOLDER_COLORS[node.color] || FOLDER_COLORS.indigo;
  return (
    <div>
      <div
        onDragOver={(e) => { if (e.dataTransfer.types.includes("text/qws-doc")) { e.preventDefault(); setOver(true); } }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { const id = e.dataTransfer.getData("text/qws-doc"); setOver(false); if (id) { e.preventDefault(); e.stopPropagation(); onDropDoc(id, node.id); } }}
        className={`flex items-center rounded-xl pr-2 text-[13px] transition ${selected === node.id ? "bg-indigo-50 font-bold text-indigo-700" : "text-slate-600 hover:bg-slate-50"} ${over ? "ring-2 ring-indigo-300" : ""}`}
        style={{ paddingLeft: 4 + depth * 14 }}
      >
        <button type="button" onClick={() => toggle(node.id)} aria-label={open ? "Thu gọn" : "Mở rộng"} className={`grid h-7 w-6 shrink-0 place-items-center text-slate-400 ${has ? "" : "invisible"}`}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <button type="button" onClick={() => onSelect(node.id)} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${col.dot}`} />
          <span className="truncate">{node.name}</span>
        </button>
        <span className="shrink-0 text-[11px] font-semibold text-slate-400">{counts.total.get(node.id) || 0}</span>
      </div>
      {open && node.children.map((c) => (
        <TreeNode key={c.id} node={c} depth={depth + 1} selected={selected} onSelect={onSelect} expanded={expanded} toggle={toggle} counts={counts} onDropDoc={onDropDoc} />
      ))}
    </div>
  );
}

function SpecialRow({ icon: Icon, label, count, active, onClick, onDropDoc }) {
  const [over, setOver] = useState(false);
  return (
    <button
      type="button" onClick={onClick}
      onDragOver={(e) => { if (onDropDoc && e.dataTransfer.types.includes("text/qws-doc")) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { const id = e.dataTransfer.getData("text/qws-doc"); setOver(false); if (id && onDropDoc) { e.preventDefault(); onDropDoc(id); } }}
      className={`flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-[13px] transition ${active ? "bg-indigo-50 font-bold text-indigo-700" : "text-slate-600 hover:bg-slate-50"} ${over ? "ring-2 ring-indigo-300" : ""}`}
    >
      <Icon size={15} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 text-[11px] font-semibold text-slate-400">{count}</span>
    </button>
  );
}

// ───────────── Thẻ tài liệu ─────────────
function DocCard({ d, folderName, customerName, snippet, onOpen, onEdit, onDownload, onDelete, onShare, shared, readOnly }) {
  const k = KINDS[d.kind] || KINDS.txt;
  const Icon = d.kind === "html" ? FileCode2 : FileText;
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  return (
    <div
      role="button" tabIndex={0} draggable={!readOnly}
      onDragStart={(e) => { e.dataTransfer.setData("text/qws-doc", d.id); e.dataTransfer.effectAllowed = "move"; }}
      onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
      className="card flex cursor-pointer flex-col gap-2 p-4 transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${KIND_BOX[d.kind] || KIND_BOX.txt}`}><Icon size={20} /></div>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-[14px] font-extrabold leading-snug text-slate-800">{d.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-slate-400">
            <Badge tone={k.tone}>{k.label}</Badge>
            <span>{fmtSize(d.size_bytes)}</span><span>·</span><span>{fmtDate(d.updated_at || d.created_at)}</span>
            {!d.indexed_at && <span title="Chưa nạp vào hỏi đáp AI — vào tab Hỏi đáp để nạp" className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 font-bold text-amber-600"><Sparkles size={10} />chưa nạp AI</span>}
          </div>
        </div>
      </div>
      {snippet ? <p className="line-clamp-3 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] leading-snug text-slate-600">{tidySnippet(snippet)}</p>
        : d.excerpt ? <p className="line-clamp-2 text-[12px] leading-snug text-slate-500">{d.excerpt}</p> : null}
      {(folderName || customerName || (d.tags || []).length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {customerName && <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-600"><Users size={11} />{customerName}</span>}
          {folderName && <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500"><Folder size={11} />{folderName}</span>}
          {(d.tags || []).map((t) => <span key={t} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600"><Tag size={10} />{t}</span>)}
        </div>
      )}
      <div className="mt-auto flex justify-end gap-1 pt-1">
        {!readOnly && <button type="button" onClick={stop(onShare)} title={shared ? "Đang chia sẻ bằng link — bấm để quản lý" : "Chia sẻ bằng link online"} aria-label={`Chia sẻ ${d.title}`} className={`rounded-lg p-1.5 hover:bg-indigo-50 ${shared ? "text-indigo-600" : "text-slate-400 hover:text-indigo-600"}`}><Link2 size={15} /></button>}
        {!readOnly && <button type="button" onClick={stop(onEdit)} title="Sửa thông tin / chuyển thư mục" aria-label={`Sửa ${d.title}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil size={15} /></button>}
        <button type="button" onClick={stop(onDownload)} title="Tải file gốc về máy" aria-label={`Tải ${d.title}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Download size={15} /></button>
        {!readOnly && <button type="button" onClick={stop(onDelete)} title="Xoá tài liệu" aria-label={`Xoá ${d.title}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>}
      </div>
    </div>
  );
}

// ───────────── Khung đọc ─────────────
// File HTML có thể chứa mã chạy → mở trong khung CÁCH LY: có allow-scripts (để biểu đồ trong báo cáo chạy) nhưng
// KHÔNG có allow-same-origin → mã trong file không đọc được đăng nhập / dữ liệu khách / tài chính của app.
function Reader({ id, folders, onClose, onEdit, onDownload, onAsk, onShare, readOnly }) {
  const [doc, setDoc] = useState(null), [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    libGet(id).then((r) => { if (!alive) return; if (r.error || !r.data) setErr(r.error?.message || "Không tìm thấy tài liệu"); else setDoc(r.data); });
    return () => { alive = false; };
  }, [id]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const html = useMemo(() => (doc ? frameDoc(doc.kind, doc.content || "") : ""), [doc]);
  const path = doc?.folder_id ? folderPath(folders, doc.folder_id).map((f) => f.name).join(" › ") : "";
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="Đọc tài liệu">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 bg-white px-3 py-2.5 sm:px-5">
        <button type="button" onClick={onClose} className="flex shrink-0 items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-[13px] font-bold text-slate-700 hover:bg-slate-200"><X size={15} /> Đóng</button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-extrabold text-slate-800">{doc?.title || "Đang mở…"}</div>
          {doc && <div className="truncate text-[11px] text-slate-400">{path || "Chưa phân loại"} · {(KINDS[doc.kind] || KINDS.txt).label} · {fmtSize(doc.size_bytes)}</div>}
        </div>
        {doc && <>
          {!readOnly && <button type="button" onClick={() => onAsk(doc)} className="flex items-center gap-1 rounded-xl bg-indigo-50 px-3 py-2 text-[13px] font-bold text-indigo-700 hover:bg-indigo-100"><Sparkles size={14} /> <span className="hidden sm:inline">Hỏi AI về tài liệu này</span><span className="sm:hidden">Hỏi AI</span></button>}
          {!readOnly && <button type="button" onClick={() => onShare(doc)} className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-[13px] font-bold text-slate-600 hover:bg-slate-50"><Link2 size={14} /> <span className="hidden sm:inline">Chia sẻ</span></button>}
          {!readOnly && <button type="button" onClick={() => onEdit(doc.id)} className="hidden items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-[13px] font-bold text-slate-600 hover:bg-slate-50 sm:flex"><Pencil size={14} /> Sửa</button>}
          <button type="button" onClick={() => onDownload(doc)} className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-[13px] font-bold text-slate-600 hover:bg-slate-50"><Download size={14} /> <span className="hidden sm:inline">Tải về</span></button>
        </>}
      </div>
      {err ? <div className="grid flex-1 place-items-center p-6 text-sm text-rose-600">{err}</div>
        : !doc ? <div className="grid flex-1 place-items-center"><Loader2 className="animate-spin text-indigo-500" /></div>
          : <iframe title={doc.title} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={html} className="min-h-0 w-full flex-1 border-0 bg-white" />}
    </div>
  );
}

// ───────────── Sửa thông tin tài liệu ─────────────
function EditDocModal({ id, folders, onClose, onSaved }) {
  const [doc, setDoc] = useState(null), [err, setErr] = useState(""), [saving, setSaving] = useState(false);
  const [f, setF] = useState({ title: "", folder_id: null, tags: "", note: "", content: "", customer_id: null, project_id: null });
  useEffect(() => {
    let alive = true;
    libGet(id).then((r) => {
      if (!alive) return;
      if (r.error || !r.data) { setErr(r.error?.message || "Không tìm thấy tài liệu"); return; }
      setDoc(r.data);
      setF({ title: r.data.title, folder_id: r.data.folder_id, tags: (r.data.tags || []).join(", "), note: r.data.note || "", content: r.data.content || "", customer_id: r.data.customer_id || null, project_id: r.data.project_id || null });
    });
    return () => { alive = false; };
  }, [id]);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const editable = doc && doc.kind !== "html"; // HTML là báo cáo dựng sẵn — chỉ sửa thông tin, không sửa mã
  const save = async () => {
    const title = f.title.trim();
    if (!title) { setErr("Tên tài liệu không được để trống"); return; }
    setSaving(true); setErr("");
    const patch = { title, folder_id: f.folder_id || null, tags: parseTags(f.tags), note: f.note.trim(), customer_id: f.customer_id || null, project_id: f.customer_id ? f.project_id || null : null };
    if (editable && f.content !== doc.content) {
      if (new Blob([f.content]).size > MAX_FILE_BYTES) { setSaving(false); setErr("Nội dung quá lớn"); return; }
      patch.content = f.content; patch.plain = toPlain(doc.kind, f.content); patch.size_bytes = new Blob([f.content]).size;
    }
    const r = await libUpdateDoc(id, patch);
    setSaving(false);
    if (r.error) { setErr(r.error.message); return; }
    onSaved(r.data); onClose();
  };
  return (
    <Modal title="Sửa tài liệu" onClose={onClose} wide={editable}>
      {!doc && !err ? <div className="grid place-items-center py-10"><Loader2 className="animate-spin text-indigo-500" /></div> : (
        <div className="space-y-3">
          <div><label className={labelCls}>Tên tài liệu</label><input className={inputCls} value={f.title} onChange={(e) => set("title")(e.target.value)} maxLength={200} /></div>
          <div><label className={labelCls}>Thư mục</label><FolderSelect folders={folders} value={f.folder_id} onChange={set("folder_id")} /></div>
          <LinkSelects value={{ customer_id: f.customer_id, project_id: f.project_id }} onChange={(v) => setF((p) => ({ ...p, ...v }))} />
          <div><label className={labelCls}>Nhãn (cách nhau bằng dấu phẩy)</label><input className={inputCls} value={f.tags} onChange={(e) => set("tags")(e.target.value)} placeholder="vd: kế toán, báo cáo tháng, excel" /></div>
          <div><label className={labelCls}>Ghi chú</label><textarea rows={2} className={inputCls} value={f.note} onChange={(e) => set("note")(e.target.value)} placeholder="Tóm tắt 1 dòng: tài liệu này dùng để làm gì?" /></div>
          {editable && <div><label className={labelCls}>Nội dung ({KINDS[doc.kind].label})</label><textarea rows={12} className={`${inputCls} font-mono text-[12px]`} value={f.content} onChange={(e) => set("content")(e.target.value)} /></div>}
          {err && <div className="rounded-xl bg-rose-50 px-3 py-2 text-[13px] text-rose-600">{err}</div>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Huỷ</button>
            <button type="button" disabled={saving || !doc} onClick={save} className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? "Đang lưu…" : "Lưu"}</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ───────────── Tạo ghi chú / dán nội dung ─────────────
function PasteModal({ folders, defaultFolder, defaultCustomer, onClose, onCreated }) {
  const [f, setF] = useState({ title: "", kind: "md", content: "", folder_id: defaultFolder || null, customer_id: defaultCustomer || null, project_id: null });
  const [err, setErr] = useState(""), [saving, setSaving] = useState(false);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    const content = f.content;
    if (!content.trim()) { setErr("Chưa có nội dung"); return; }
    const size = new Blob([content]).size;
    if (size > MAX_FILE_BYTES) { setErr(`Quá lớn (${fmtSize(size)})`); return; }
    setSaving(true); setErr("");
    const r = await libAddDoc({ title: f.title.trim() || extractTitle(f.kind, content, "Ghi chú mới"), kind: f.kind, content, plain: toPlain(f.kind, content), size_bytes: size, source: null, folder_id: f.folder_id || null, customer_id: f.customer_id || null, project_id: f.customer_id ? f.project_id || null : null });
    setSaving(false);
    if (r.error) { setErr(r.error.message); return; }
    onCreated(r.data); onClose();
  };
  return (
    <Modal title="Tạo tài liệu từ nội dung dán" onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={labelCls}>Tên (để trống = tự lấy từ nội dung)</label><input className={inputCls} value={f.title} onChange={(e) => set("title")(e.target.value)} maxLength={200} /></div>
          <div><label className={labelCls}>Loại</label>
            <select className={inputCls} value={f.kind} onChange={(e) => set("kind")(e.target.value)}>
              <option value="md">Markdown (ghi chú có định dạng)</option><option value="txt">Văn bản thường</option><option value="html">HTML (báo cáo)</option>
            </select>
          </div>
        </div>
        <div><label className={labelCls}>Thư mục</label><FolderSelect folders={folders} value={f.folder_id} onChange={set("folder_id")} /></div>
        <LinkSelects value={{ customer_id: f.customer_id, project_id: f.project_id }} onChange={(v) => setF((p) => ({ ...p, ...v }))} />
        <div><label className={labelCls}>Nội dung</label><textarea rows={12} autoFocus className={`${inputCls} font-mono text-[12px]`} value={f.content} onChange={(e) => set("content")(e.target.value)} placeholder="Dán hoặc gõ nội dung vào đây…" /></div>
        {err && <div className="rounded-xl bg-rose-50 px-3 py-2 text-[13px] text-rose-600">{err}</div>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Huỷ</button>
          <button type="button" disabled={saving} onClick={save} className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? "Đang lưu…" : "Tạo tài liệu"}</button>
        </div>
      </div>
    </Modal>
  );
}

// ───────────── Thư mục: tạo / sửa ─────────────
function FolderModal({ mode, folder, parentId, folders, onClose, onSaved }) {
  const [name, setName] = useState(folder?.name || "");
  const [color, setColor] = useState(folder?.color || "indigo");
  const [parent, setParent] = useState(mode === "edit" ? folder?.parent_id || null : parentId || null);
  const [err, setErr] = useState(""), [saving, setSaving] = useState(false);
  const exclude = useMemo(() => (mode === "edit" ? descendantIds(folders, folder.id) : null), [mode, folder, folders]);
  const save = async () => {
    const n = name.trim();
    if (!n) { setErr("Nhập tên thư mục"); return; }
    if (folders.some((x) => x.id !== folder?.id && (x.parent_id || null) === (parent || null) && fold(x.name) === fold(n))) { setErr("Đã có thư mục cùng tên ở đây"); return; }
    setSaving(true); setErr("");
    const r = mode === "edit" ? await libUpdateFolder(folder.id, { name: n, color, parent_id: parent || null }) : await libAddFolder({ name: n, color, parent_id: parent || null });
    setSaving(false);
    if (r.error) { setErr(r.error.message); return; }
    onSaved(r.data); onClose();
  };
  return (
    <Modal title={mode === "edit" ? "Sửa thư mục" : "Thư mục mới"} onClose={onClose}>
      <div className="space-y-3">
        <div><label className={labelCls}>Tên thư mục</label><input autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="vd: Quản lý nhà hàng, SEO, Báo cáo ads…" onKeyDown={(e) => { if (e.key === "Enter") save(); }} /></div>
        <div><label className={labelCls}>Nằm trong</label><FolderSelect folders={folders} value={parent} onChange={setParent} exclude={exclude} noneLabel="(Thư mục gốc)" /></div>
        <div>
          <label className={labelCls}>Màu</label>
          <div className="flex flex-wrap gap-2">
            {FOLDER_COLOR_KEYS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Màu ${c}`} aria-pressed={color === c} className={`h-7 w-7 rounded-full ${FOLDER_COLORS[c].dot} ${color === c ? "ring-2 ring-slate-900 ring-offset-2" : ""}`} />
            ))}
          </div>
        </div>
        {err && <div className="rounded-xl bg-rose-50 px-3 py-2 text-[13px] text-rose-600">{err}</div>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">Huỷ</button>
          <button type="button" disabled={saving} onClick={save} className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? "Đang lưu…" : mode === "edit" ? "Lưu" : "Tạo thư mục"}</button>
        </div>
      </div>
    </Modal>
  );
}

// ───────────── Hỏi đáp AI trên kho ─────────────
const CHAT_KEY = "qws_lib_chat_v1";
const loadChat = () => { try { const v = JSON.parse(localStorage.getItem(CHAT_KEY) || "[]"); return Array.isArray(v) ? v.slice(-30) : []; } catch { return []; } };
const MD_CLS = "text-[14px] leading-relaxed text-slate-700 [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_h1]:text-[15px] [&_h2]:text-[15px] [&_h3]:text-[14px] [&_h1]:font-extrabold [&_h2]:font-extrabold [&_h3]:font-bold [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_a]:text-indigo-600 [&_a]:underline [&_table]:text-[12px] [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_th]:border [&_th]:border-slate-200 [&_th]:px-2";
const SUGGEST = ["Tóm tắt các ý chính trong phạm vi này", "Có tài liệu nào nói về chi phí và cách tiết kiệm không?", "Liệt kê các bước quan trọng cần làm theo tài liệu"];

// ───────────── Chia sẻ tài liệu bằng link online ─────────────
function ShareModal({ doc, share, onClose, onChanged }) {
  const [days, setDays] = useState("never"), [busy, setBusy] = useState(false), [err, setErr] = useState(""), [copied, setCopied] = useState(false);
  const daysOf = (k) => (SHARE_EXPIRY.find(([x]) => x === k) || [])[2] ?? null;
  const expired = shareExpired(share), url = share ? shareUrl(share.token) : "";
  const curKey = share?.expires_at ? "keep" : "never"; // đã đặt hạn: hiện ngày hết hạn, chọn lại để gia hạn
  const fail = (e) => setErr(isMissingTable(e) ? "Chưa cài chia sẻ link: mở Supabase → SQL Editor → chạy file supabase/SETUP-LIBRARY-SHARE.sql một lần rồi thử lại." : e?.message || "Có lỗi, thử lại");
  const create = async () => { setBusy(true); setErr(""); const r = await libShareCreate(doc.id, daysOf(days)); setBusy(false); if (r.error) return fail(r.error); onChanged(r.data); };
  const setExpiry = async (k) => { setBusy(true); setErr(""); const r = await libShareSetExpiry(share.id, daysOf(k)); setBusy(false); if (r.error) return fail(r.error); onChanged(r.data); };
  const revoke = async () => {
    if (!(await ask(`Tắt chia sẻ "${doc.title}"?\nLink hiện tại hết hiệu lực ngay, ai đang giữ link sẽ không mở được nữa. Bật lại sẽ tạo link MỚI.`, { ok: "Tắt chia sẻ", danger: true }))) return;
    setBusy(true); setErr(""); const r = await libShareRevoke(share.id); setBusy(false); if (r.error) return fail(r.error); onChanged(null);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); } catch { const el = document.getElementById("lib-share-url"); el?.select(); try { document.execCommand("copy"); } catch { /* bỏ qua */ } }
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  };
  return (
    <Modal title="Chia sẻ bằng link online" onClose={onClose}>
      <div className="space-y-3 text-[13px]">
        <div className="truncate rounded-xl bg-slate-50 px-3 py-2 font-bold text-slate-700">{doc.title}</div>
        {!share ? <>
          <p className="leading-relaxed text-slate-500">Tạo một link để người khác <b>đọc</b> tài liệu này trên điện thoại hoặc máy tính, <b>không cần đăng nhập</b>. Họ chỉ xem được đúng tài liệu này, không sửa được và không thấy phần còn lại của kho.</p>
          <div>
            <label className={labelCls} htmlFor="lib-share-days">Thời hạn link</label>
            <select id="lib-share-days" className={inputCls} value={days} onChange={(e) => setDays(e.target.value)}>{SHARE_EXPIRY.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </div>
          <button type="button" onClick={create} disabled={busy} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2.5 font-bold text-white disabled:opacity-60">{busy ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />} Tạo link chia sẻ</button>
        </> : <>
          {expired && <div className="rounded-xl bg-amber-50 px-3 py-2 font-semibold text-amber-800">Link đã hết hạn — người nhận không mở được. Chọn lại thời hạn bên dưới để dùng tiếp.</div>}
          <div>
            <label className={labelCls} htmlFor="lib-share-url">Link (ai có link đều đọc được)</label>
            <div className="flex gap-2">
              <input id="lib-share-url" readOnly value={url} onFocus={(e) => e.target.select()} className={`${inputCls} min-w-0 flex-1 font-mono text-[12px]`} />
              <button type="button" onClick={copy} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 font-bold text-white">{copied ? <><Check size={14} /> Đã chép</> : <><Copy size={14} /> Sao chép</>}</button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-500">
            <span>{share.views || 0} lượt mở{share.last_view_at ? ` · gần nhất ${fmtDate(share.last_view_at)}` : ""}</span>
            <span>{share.expires_at ? `${expired ? "Đã hết hạn" : "Hết hạn"} ${fmtDate(share.expires_at)}` : "Không hết hạn"}</span>
          </div>
          <div>
            <label className={labelCls} htmlFor="lib-share-exp">Đổi thời hạn (tính từ hôm nay)</label>
            <select id="lib-share-exp" className={inputCls} value={curKey} disabled={busy} onChange={(e) => e.target.value !== "keep" && setExpiry(e.target.value)}>
              {share.expires_at && <option value="keep">Giữ nguyên ({expired ? "đã hết hạn" : `đến ${fmtDate(share.expires_at)}`})</option>}
              {SHARE_EXPIRY.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-[12px] leading-relaxed text-slate-500">Nếu tài liệu có số điện thoại, tài khoản hoặc số liệu khách thì chỉ gửi link cho đúng người cần. Sửa tài liệu trong kho thì link tự cập nhật nội dung mới.</p>
          <button type="button" onClick={revoke} disabled={busy} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 px-4 py-2.5 font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-60"><Trash2 size={14} /> Tắt chia sẻ (link hết hiệu lực ngay)</button>
        </>}
        {err && <div className="rounded-xl bg-rose-50 px-3 py-2 font-semibold text-rose-600">{err}</div>}
      </div>
    </Modal>
  );
}

function ChatPanel({ docs, folders, customers = [], scope, setScope, onOpenDoc, indexing, onIndex }) {
  const [msgs, setMsgs] = useState(loadChat);
  const [q, setQ] = useState(""), [busy, setBusy] = useState(false), [model, setModel] = useState("gpt-4o-mini");
  const endRef = useRef(null);
  useEffect(() => { try { localStorage.setItem(CHAT_KEY, JSON.stringify(msgs.slice(-30))); } catch { /* chế độ riêng tư */ } }, [msgs]);
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: "end" }); }, [msgs, busy]);

  const info = useMemo(() => {
    if (scope.type === "doc") { const d = docs.find((x) => x.id === scope.id); return { label: d ? `Tài liệu: ${d.title}` : "Tài liệu", docId: scope.id, list: d ? [d] : [] }; }
    if (scope.type === "folder") {
      const ids = descendantIds(folders, scope.id), f = folders.find((x) => x.id === scope.id);
      return { label: f ? `Thư mục: ${f.name}` : "Thư mục", folderIds: [...ids], list: docs.filter((d) => d.folder_id && ids.has(d.folder_id)) };
    }
    if (scope.type === "customer") {
      const list = docs.filter((d) => d.customer_id === scope.id), c = customers.find((x) => x.id === scope.id);
      return { label: c ? `Khách: ${c.name}` : "Khách", docIds: list.map((d) => d.id), list };
    }
    return { label: "Cả kho", list: docs };
  }, [scope, docs, folders, customers]);
  const pendingInScope = unindexedDocs(info.list), pendingAll = unindexedDocs(docs);
  const scopeValue = scope.type === "folder" ? `f:${scope.id}` : scope.type === "doc" ? `d:${scope.id}` : scope.type === "customer" ? `k:${scope.id}` : "all";
  const onScope = (v) => setScope(v === "all" ? { type: "all" } : v.startsWith("f:") ? { type: "folder", id: v.slice(2) } : v.startsWith("k:") ? { type: "customer", id: v.slice(2) } : { type: "doc", id: v.slice(2) });
  const custWithDocs = useMemo(() => customers.filter((c) => docs.some((d) => d.customer_id === c.id)), [customers, docs]);
  const flat = useMemo(() => flattenTree(folders), [folders]);

  const send = async (text) => {
    const question = String(text ?? q).trim();
    if (!question || busy) return;
    const history = msgs.filter((m) => m.role === "user" || m.role === "assistant").slice(-6).map((m) => ({ role: m.role, content: m.content }));
    setMsgs((p) => [...p, { id: `u${Date.now()}`, role: "user", content: question }]);
    setQ(""); setBusy(true);
    const r = await libAsk({ question, history, folderIds: info.folderIds, docId: info.docId, docIds: info.docIds, model });
    setBusy(false);
    setMsgs((p) => [...p, r.error ? { id: `e${Date.now()}`, role: "error", content: r.error }
      : { id: `a${Date.now()}`, role: "assistant", content: r.data.answer || "(Không có câu trả lời)", sources: r.data.sources || [], usage: r.data.usage, scope: info.label }]);
  };
  const clear = async () => { if (await ask("Xoá cuộc trò chuyện này?\nChỉ xoá lịch sử chat trên máy này, tài liệu trong kho không bị ảnh hưởng.", { ok: "Xoá chat", danger: true })) setMsgs([]); };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-56">
          <label htmlFor="chat-scope" className={labelCls}>Hỏi trong phạm vi</label>
          <select id="chat-scope" className={inputCls} value={scopeValue} onChange={(e) => onScope(e.target.value)}>
            <option value="all">Cả kho ({docs.length} tài liệu)</option>
            {flat.map((f) => <option key={f.id} value={`f:${f.id}`}>{"  ".repeat(f.depth)}{f.depth ? "└ " : ""}{f.name}</option>)}
            {custWithDocs.length > 0 && <optgroup label="Theo khách">{custWithDocs.map((c) => <option key={c.id} value={`k:${c.id}`}>Khách: {c.name} ({docs.filter((d) => d.customer_id === c.id).length})</option>)}</optgroup>}
            {scope.type === "doc" && <option value={`d:${scope.id}`}>{info.label}</option>}
          </select>
        </div>
        <div className="w-full sm:w-60">
          <label htmlFor="chat-model" className={labelCls}>Độ chính xác</label>
          <select id="chat-model" className={inputCls} value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="gpt-4o-mini">Nhanh, rẻ (gpt-4o-mini)</option>
            <option value="gpt-4.1">Kỹ hơn, đắt hơn (gpt-4.1)</option>
          </select>
        </div>
        {msgs.length > 0 && <button type="button" onClick={clear} className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-[13px] font-bold text-slate-500 hover:bg-slate-50"><Trash2 size={14} /> Xoá chat</button>}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[12.5px] text-slate-600">
        <Sparkles size={14} className="shrink-0 text-indigo-500" />
        <span className="min-w-0 flex-1">
          Đã nạp <b>{docs.length - pendingAll.length}/{docs.length}</b> tài liệu vào hỏi đáp
          {pendingInScope.length > 0 && pendingInScope.length !== pendingAll.length ? ` · ${pendingInScope.length} chưa nạp trong phạm vi này` : ""}.
          {" "}Tài liệu chưa nạp thì AI không đọc được.
        </span>
        {indexing > 0 ? <span className="flex items-center gap-1.5 font-bold text-indigo-600"><Loader2 size={13} className="animate-spin" /> Đang nạp {indexing}…</span>
          : pendingAll.length > 0 && <button type="button" onClick={() => onIndex(pendingAll.map((d) => d.id))} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-indigo-700">Nạp {pendingAll.length} tài liệu</button>}
      </div>

      <div className="max-h-[56vh] min-h-[220px] space-y-3 overflow-y-auto rounded-xl bg-slate-50/60 p-3" aria-live="polite">
        {msgs.length === 0 && !busy && (
          <div className="grid place-items-center py-6 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-500"><MessageSquare size={22} /></div>
            <div className="mt-2 text-[15px] font-extrabold text-slate-800">Hỏi gì về kho tài liệu của bạn</div>
            <div className="mt-1 max-w-sm text-[12.5px] leading-snug text-slate-500">AI chỉ trả lời dựa trên tài liệu đã nạp, kèm số nguồn bấm vào mở đúng tài liệu. Chọn phạm vi ở trên để hỏi riêng một thư mục.</div>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {SUGGEST.map((s) => <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-600">{s}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m) => m.role === "user" ? (
          <div key={m.id} className="flex justify-end"><div className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-gradient-to-r from-indigo-500 to-sky-500 px-3.5 py-2 text-[14px] text-white">{m.content}</div></div>
        ) : m.role === "error" ? (
          <div key={m.id} className="rounded-2xl bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-600">{m.content}</div>
        ) : (
          <div key={m.id} className="max-w-[94%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 shadow-sm ring-1 ring-slate-100">
            <div className={MD_CLS} onClick={(e) => { const n = e.target.closest?.("[data-src]")?.dataset?.src; const s = (m.sources || []).find((x) => String(x.n) === n); if (s) onOpenDoc(s.doc_id); }} dangerouslySetInnerHTML={{ __html: renderAnswer(m.content, m.sources) }} />
            {(() => {
              // Chỉ hiện các nguồn mà câu trả lời THỰC SỰ trích dẫn ([n]); AI nói "kho chưa có" thì không bày tài liệu gần nghĩa ra gây hiểu nhầm
              const cited = (m.sources || []).filter((s) => m.content.includes(`[${s.n}]`));
              if (cited.length) return (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-slate-100 pt-2">
                  {cited.map((s) => (
                    <button key={s.doc_id} type="button" onClick={() => onOpenDoc(s.doc_id)} title={s.excerpt} className="flex max-w-full items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1 text-left text-[11.5px] font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700">
                      <span className="grid h-4 min-w-4 shrink-0 place-items-center rounded bg-indigo-100 text-[10px] font-bold text-indigo-700">{s.n}</span><span className="truncate">{s.title}</span>
                    </button>
                  ))}
                </div>
              );
              return (m.sources || []).length > 0 ? <div className="mt-2 border-t border-slate-100 pt-2 text-[11.5px] text-slate-400">Không có tài liệu nào trong kho khớp câu hỏi này.</div> : null;
            })()}
            {m.usage?.cost_usd > 0 && <div className="mt-1.5 text-[10.5px] text-slate-400" title="Ước tính theo 25.000 đồng/đô la">{m.scope} · ≈ {Math.max(1, Math.round(m.usage.cost_usd * 25000))} đồng</div>}
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-[13px] text-slate-500"><Loader2 size={15} className="animate-spin text-indigo-500" /> Đang tìm trong kho và soạn câu trả lời…</div>}
        <div ref={endRef} />
      </div>

      <div className="flex items-end gap-2">
        <textarea value={q} rows={2} onChange={(e) => setQ(e.target.value)} aria-label="Câu hỏi"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={`Hỏi về ${info.label.toLowerCase()}… (Enter để gửi, Shift+Enter xuống dòng)`} className={`${inputCls} min-h-[44px] flex-1 resize-none`} maxLength={2000} />
        <button type="button" onClick={() => send()} disabled={busy || !q.trim()} aria-label="Gửi câu hỏi" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 text-white disabled:opacity-40"><Send size={18} /></button>
      </div>
    </Card>
  );
}

// ───────────── Trang chính ─────────────
export default function LibraryPage() {
  const data = useData() || {};
  const readOnly = !!data.ownerId && !data.isOwner; // thành viên được cấp quyền: CHỈ XEM (không tải lên / sửa / xoá / Hỏi đáp AI)
  const [sp, setSp] = useSearchParams();
  const customerList = data.customerList || [];
  const say = (text) => data.setToast && data.setToast({ text });
  const [folders, setFolders] = useState([]), [docs, setDocs] = useState([]);
  const [state, setState] = useState("loading"), [errMsg, setErrMsg] = useState("");
  const [folderId, setFolderId] = useState("all"); // all | none | mã thư mục
  const [query, setQuery] = useState(""), [hits, setHits] = useState(null), [sort, setSort] = useState("new");
  const [reader, setReader] = useState(null), [editing, setEditing] = useState(null);
  const [folderModal, setFolderModal] = useState(null), [pasteOpen, setPasteOpen] = useState(false);
  const [busy, setBusy] = useState(null), [notice, setNotice] = useState(null), [dragOver, setDragOver] = useState(false);
  const [shares, setShares] = useState(() => new Map()), [shareDoc, setShareDoc] = useState(null); // chia sẻ link: mã tài liệu → dòng chia sẻ
  const [expanded, setExpanded] = useState(() => new Set());
  const [customerF, setCustomerF] = useState(() => sp.get("khach") || "all"); // lọc theo khách (mở từ thẻ khách: ?khach=<mã>)
  const [view, setView] = useState("docs"), [scope, setScope] = useState({ type: "all" }), [indexing, setIndexing] = useState(0), [aiErr, setAiErr] = useState("");
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    const r = await libLoad();
    if (r.error) { setState(isMissingTable(r.error) ? "setup" : "error"); setErrMsg(r.error.message || ""); return; }
    setFolders(r.folders); setDocs(r.docs); setState("ok");
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { // chưa cài bảng chia sẻ thì bỏ qua (nút Chia sẻ sẽ báo cách cài khi bấm)
    if (readOnly) return;
    libShares().then((r) => { if (!r.error && r.data) setShares(new Map(r.data.map((x) => [x.doc_id, x]))); });
  }, [readOnly]);

  // Tìm trong NỘI DUNG (máy chủ, bỏ dấu) — chạy sau khi ngừng gõ 0,35 giây
  useEffect(() => {
    const q = query.trim();
    if (fold(q).length < 2) { setHits(null); return undefined; }
    let alive = true;
    const t = setTimeout(async () => {
      const r = await libSearch(q);
      if (alive) setHits(new Map((r.data || []).map((x) => [x.id, x.snippet])));
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [query]);

  // Mở sẵn các thư mục cha của thư mục đang chọn
  useEffect(() => {
    if (folderId && folderId !== "all" && folderId !== "none") {
      setExpanded((prev) => { const n = new Set(prev); folderPath(folders, folderId).forEach((f) => n.add(f.id)); return n; });
    }
  }, [folderId, folders]);

  const tree = useMemo(() => buildTree(folders), [folders]);
  const counts = useMemo(() => countDocs(folders, docs), [folders, docs]);
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const searching = fold(query).trim().length >= 2;
  const visible = useMemo(() => sortDocs(filterDocs(docs, { folderId, folders, query, hits, customerId: customerF }), sort), [docs, folderId, folders, query, hits, sort, customerF]);
  const current = folderById.get(folderId) || null;
  const path = current ? folderPath(folders, current.id) : [];
  const totalBytes = useMemo(() => docs.reduce((s, d) => s + (d.size_bytes || 0), 0), [docs]);
  const realFolder = current ? current.id : null;

  const toggle = (id) => setExpanded((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // Ý HAY HÔM NAY: 1 ý áp dụng được rút từ 1 đoạn tài liệu, cố định theo ngày (cùng ý với thông báo 7h sáng); bấm "Đổi ý khác" để xem ý khác. Nhớ trong ngày để không gọi AI lại mỗi lần mở trang.
  const [idea, setIdea] = useState(null), [ideaBusy, setIdeaBusy] = useState(false), [ideaN, setIdeaN] = useState(0), [ideaTick, setIdeaTick] = useState(0);
  const hasIndexed = !readOnly && docs.some((d) => d.indexed_at);
  useEffect(() => {
    if (state !== "ok" || !hasIndexed) return undefined;
    const day = todayISO(), seed = ideaN ? `${day}#${ideaN}` : day, key = `qws_lib_idea:${seed}`;
    try { const c = JSON.parse(localStorage.getItem(key) || "null"); if (c?.idea) { setIdea(c); return undefined; } } catch { /* bỏ qua */ }
    let alive = true;
    setIdeaBusy(true);
    libIdea(seed).then((r) => {
      if (!alive) return;
      setIdeaBusy(false);
      if (r.data?.idea) { setIdea(r.data); try { localStorage.setItem(key, JSON.stringify(r.data)); } catch { /* bỏ qua */ } }
    });
    return () => { alive = false; };
  }, [state, hasIndexed, ideaN, ideaTick]);
  // Tài liệu nguồn của ý đang hiện đã bị xoá → bỏ ý đó (cả bản nhớ trong ngày) và lấy ý khác từ các tài liệu còn lại. Tìm thử trên app thật: thẻ vẫn hiện "Từ: <tài liệu đã xoá>".
  const ideaGone = !!idea && state === "ok" && !docs.some((d) => d.id === idea.doc_id);
  useEffect(() => {
    if (!ideaGone) return;
    const day = todayISO();
    try { localStorage.removeItem(`qws_lib_idea:${ideaN ? `${day}#${ideaN}` : day}`); } catch { /* bỏ qua */ }
    setIdea(null); setIdeaTick((t) => t + 1);
  }, [ideaGone]); // eslint-disable-line react-hooks/exhaustive-deps
  const custName = useMemo(() => new Map(customerList.map((c) => [c.id, c.name])), [customerList]);
  const custOptions = useMemo(() => { // chỉ khách đang có tài liệu (và khách đang được lọc), xếp theo tên
    const ids = new Set(docs.map((d) => d.customer_id).filter(Boolean));
    if (customerF !== "all" && customerF !== "none") ids.add(customerF);
    return [...ids].map((id) => ({ id, name: custName.get(id) || "(khách đã xoá)" })).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [docs, customerF, custName]);
  // Mở thẳng 1 tài liệu từ link (?doc=<mã>) — dùng ở thẻ khách trong Khách & Dự án
  useEffect(() => {
    const id = sp.get("doc");
    if (id) { setReader(id); const n = new URLSearchParams(sp); n.delete("doc"); setSp(n, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const upsertDoc = (row) => setDocs((p) => [row, ...p.filter((x) => x.id !== row.id)]);

  // Nạp tài liệu vào hỏi đáp AI (cắt đoạn + tạo vector ở máy chủ). Chạy nền sau khi tải lên / sửa nội dung; lỗi hiện ở banner, không chặn việc khác.
  const indexDocs = async (ids) => {
    const list = [...new Set(ids)];
    if (!list.length) return;
    setAiErr(""); setIndexing((n) => n + list.length);
    let ok = 0; const errs = [];
    for (let i = 0; i < list.length; i += 3) {
      const r = await libIndex(list.slice(i, i + 3));
      if (r.error) { errs.push(r.error); break; }
      for (const x of r.data.results || []) {
        if (x.ok) { ok++; setDocs((p) => p.map((d) => (d.id === x.doc_id ? { ...d, indexed_at: new Date().toISOString() } : d))); }
        else errs.push(x.error || "lỗi không rõ");
      }
    }
    setIndexing((n) => Math.max(0, n - list.length));
    if (errs.length) setAiErr(`Chưa nạp được vào hỏi đáp AI: ${[...new Set(errs)].join("; ")}`);
    else if (ok) say(`Đã nạp ${ok} tài liệu vào hỏi đáp AI`);
  };

  const upload = async (fileList, targetFolder) => {
    if (readOnly) return;
    const list = [...fileList];
    if (!list.length) return;
    const folder = targetFolder === undefined ? realFolder : targetFolder;
    const known = [...docs];
    let ok = 0; const skipped = [], failed = [], addedIds = [];
    for (let k = 0; k < list.length; k++) {
      const file = list[k];
      setBusy(`Đang tải ${k + 1}/${list.length}: ${file.name}`);
      try {
        const p = await prepareFile(file, folder);
        if (p.error) { failed.push(`${file.name} — ${p.error}`); continue; }
        if (known.some((d) => d.source === file.name && d.size_bytes === file.size && (d.folder_id || null) === (folder || null))) { skipped.push(file.name); continue; }
        const r = await libAddDoc(customerF !== "all" && customerF !== "none" ? { ...p.row, customer_id: customerF } : p.row); // đang lọc theo 1 khách → tài liệu mới gắn luôn khách đó
        if (r.error) { failed.push(`${file.name} — ${r.error.message}`); continue; }
        ok++; known.push(r.data); upsertDoc(r.data); addedIds.push(r.data.id);
      } catch (e) { failed.push(`${file.name} — ${e?.message || e}`); }
    }
    setBusy(null);
    setNotice({ ok, skipped, failed });
    if (addedIds.length) indexDocs(addedIds);
    if (ok) say(`Đã thêm ${ok} tài liệu`);
  };

  const moveDoc = async (id, to) => {
    const d = docs.find((x) => x.id === id);
    if (!d || (d.folder_id || null) === (to || null)) return;
    const r = await libUpdateDoc(id, { folder_id: to || null });
    if (r.error) { say(`Không chuyển được: ${r.error.message}`); return; }
    upsertDoc(r.data);
    say(`Đã chuyển "${d.title}" sang ${to ? folderById.get(to)?.name || "thư mục" : "Chưa phân loại"}`);
  };

  const removeDoc = async (d) => {
    if (!(await ask(`Xoá tài liệu "${d.title}"?\nXoá xong không khôi phục được. Hãy tải file về máy trước nếu còn cần.`, { ok: "Xoá tài liệu", danger: true }))) return;
    const r = await libDeleteDoc(d.id);
    if (r.error) { say(`Không xoá được: ${r.error.message}`); return; }
    setDocs((p) => p.filter((x) => x.id !== d.id));
    say("Đã xoá tài liệu");
  };

  const removeFolder = async (f) => {
    const sub = descendantIds(folders, f.id);
    const inside = docs.filter((d) => d.folder_id && sub.has(d.folder_id)).length;
    const msg = `Xoá thư mục "${f.name}"?\n${sub.size > 1 ? `Cả ${sub.size - 1} thư mục con cũng bị xoá. ` : ""}${inside ? `${inside} tài liệu bên trong KHÔNG mất — chuyển về "Chưa phân loại".` : "Thư mục đang trống."}`;
    if (!(await ask(msg, { ok: "Xoá thư mục", danger: true }))) return;
    const r = await libDeleteFolder(f.id);
    if (r.error) { say(`Không xoá được: ${r.error.message}`); return; }
    setFolderId("all");
    await load();
    say("Đã xoá thư mục");
  };

  // Kéo file từ máy vào trang để tải lên
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  const dragProps = readOnly ? {} : {
    onDragEnter: (e) => { if (hasFiles(e)) { e.preventDefault(); setDragOver(true); } },
    onDragOver: (e) => { if (hasFiles(e)) e.preventDefault(); },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); },
    onDrop: (e) => { if (hasFiles(e)) { e.preventDefault(); setDragOver(false); upload(e.dataTransfer.files); } },
  };

  const headerBtn = "flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-bold";
  const locLabel = searching ? "Kết quả tìm trong tất cả thư mục" : folderId === "none" ? "Chưa phân loại" : current ? current.name : "Tất cả tài liệu";

  return (
    <div className="bento relative space-y-4 p-3 sm:space-y-5 sm:p-5" {...dragProps}>
      {dragOver && (
        <div className="pointer-events-none fixed inset-3 z-[65] grid place-items-center rounded-3xl border-4 border-dashed border-indigo-400 bg-indigo-50/90">
          <div className="text-center"><Upload className="mx-auto text-indigo-500" size={36} /><div className="mt-2 text-lg font-extrabold text-indigo-700">Thả file để thêm vào kho</div><div className="text-sm text-indigo-500">Vào: {current ? current.name : "Chưa phân loại"}</div></div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-lg shadow-indigo-500/25"><LibraryIcon size={22} /></div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Kho tài liệu</h1>
            <div className="text-[12px] text-slate-400">{state === "ok" ? `${readOnly ? "Chỉ xem · " : ""}${docs.length} tài liệu · ${folders.length} thư mục · ${fmtSize(totalBytes)}` : "Báo cáo và kiến thức học tập của bạn"}</div>
          </div>
          {state === "ok" && !readOnly && (
            <div role="tablist" aria-label="Chế độ" className="inline-flex rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-100 sm:ml-3">
          {[["docs", "Duyệt kho", FileText], ["chat", "Hỏi đáp AI", Sparkles]].map(([k, l, I]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-bold transition ${view === k ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
              <I size={14} /> {l}{k === "chat" && indexing > 0 ? <Loader2 size={12} className="animate-spin" /> : null}
            </button>
          ))}
        </div>
          )}
        </div>
        {state === "ok" && !readOnly && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setFolderModal({ mode: "new", parentId: realFolder })} className={`${headerBtn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}><FolderPlus size={16} /> Thư mục mới</button>
            <button type="button" onClick={() => setPasteOpen(true)} className={`${headerBtn} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}><FilePlus2 size={16} /> Dán nội dung</button>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy} className={`${headerBtn} bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow-lg shadow-indigo-500/25 disabled:opacity-60`}><Upload size={16} /> Tải file lên</button>
            <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden" aria-label="Chọn file tải lên" onChange={(e) => { const fl = [...e.target.files]; e.target.value = ""; upload(fl); }} />
          </div>
        )}
      </div>

      {busy && <div className="flex items-center gap-2 rounded-xl bg-indigo-50 px-4 py-2.5 text-[13px] font-semibold text-indigo-700"><Loader2 size={16} className="animate-spin" /> {busy}</div>}
      {aiErr && (
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /><div className="min-w-0 flex-1">{aiErr}</div>
          <button type="button" onClick={() => setAiErr("")} aria-label="Đóng thông báo" className="shrink-0 rounded-lg p-0.5 text-amber-600 hover:bg-amber-100"><X size={15} /></button>
        </div>
      )}
      {state === "ok" && !readOnly && view === "chat" && (
        <ChatPanel docs={docs} folders={folders} customers={customerList} scope={scope} setScope={setScope} indexing={indexing} onIndex={indexDocs} onOpenDoc={(id) => setReader(id)} />
      )}
      {notice && !busy && (
        <div className="flex items-start gap-3 rounded-xl bg-white p-3.5 text-[13px] shadow-sm ring-1 ring-slate-100">
          <div className="min-w-0 flex-1 space-y-1">
            {notice.ok > 0 && <div className="font-bold text-emerald-600">Đã thêm {notice.ok} tài liệu.</div>}
            {notice.skipped.length > 0 && <div className="text-slate-500">Bỏ qua {notice.skipped.length} file đã có trong thư mục này: {notice.skipped.join(", ")}</div>}
            {notice.failed.map((x) => <div key={x} className="text-rose-600">Không thêm được: {x}</div>)}
            {!notice.ok && !notice.skipped.length && !notice.failed.length && <div className="text-slate-500">Không có file nào được chọn.</div>}
          </div>
          <button type="button" onClick={() => setNotice(null)} aria-label="Đóng thông báo" className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={15} /></button>
        </div>
      )}

      {state === "loading" && <div className="grid place-items-center py-20"><Loader2 className="animate-spin text-indigo-500" /></div>}

      {state === "setup" && (
        <Card>
          <div className="flex gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-50 text-amber-600"><AlertTriangle size={19} /></div>
            <div className="min-w-0 space-y-2 text-[13px] text-slate-600">
              <div className="text-[15px] font-extrabold text-slate-800">Kho tài liệu chưa được cài đặt</div>
              <p>Cần tạo 2 bảng dữ liệu một lần: mở Supabase → SQL Editor → dán toàn bộ file <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[12px]">supabase/SETUP-LIBRARY.sql</code> → bấm Run. File chỉ thêm mới, không đụng dữ liệu cũ.</p>
              <button type="button" onClick={() => { setState("loading"); load(); }} className="mt-1 flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-[13px] font-bold text-white"><RefreshCw size={14} /> Đã chạy xong — thử lại</button>
            </div>
          </div>
        </Card>
      )}
      {state === "error" && (
        <Card><div className="space-y-2 text-[13px]"><div className="font-extrabold text-rose-600">Không tải được kho tài liệu</div><div className="text-slate-500">{errMsg}</div>
          <button type="button" onClick={() => { setState("loading"); load(); }} className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 font-bold text-white"><RefreshCw size={14} /> Thử lại</button></div></Card>
      )}

      {state === "ok" && !readOnly && view === "docs" && hasIndexed && !ideaGone && (idea || ideaBusy) && (
        <div className="card flex items-start gap-3 !p-4" aria-label="Ý hay hôm nay">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-500"><Lightbulb size={20} /></div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Ý hay hôm nay</div>
            {idea ? <>
              <p className="mt-0.5 text-[14.5px] font-semibold leading-snug text-slate-800">{idea.idea}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                {idea.doc_id && <button type="button" onClick={() => setReader(idea.doc_id)} className="max-w-full truncate font-semibold text-indigo-600 hover:underline">Từ: {idea.doc_title}</button>}
                <button type="button" onClick={() => setIdeaN((n) => n + 1)} disabled={ideaBusy} className="flex items-center gap-1 font-semibold text-slate-400 hover:text-slate-700 disabled:opacity-50"><RefreshCw size={12} className={ideaBusy ? "animate-spin" : ""} /> Đổi ý khác</button>
              </div>
            </> : <div className="mt-1.5 h-4 w-3/4 animate-pulse rounded bg-slate-100" />}
          </div>
        </div>
      )}
      {state === "ok" && view === "docs" && (
        <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
          {/* Thư mục: điện thoại = ô chọn, máy tính = cây */}
          <div className="lg:hidden">
            <label className={labelCls} htmlFor="lib-folder-pick">Thư mục</label>
            <select id="lib-folder-pick" className={inputCls} value={folderId} onChange={(e) => setFolderId(e.target.value)}>
              <option value="all">Tất cả tài liệu ({docs.length})</option>
              <option value="none">Chưa phân loại ({counts.none})</option>
              {flattenTree(folders).map((f) => <option key={f.id} value={f.id}>{"  ".repeat(f.depth)}{f.depth ? "└ " : ""}{f.name} ({counts.total.get(f.id) || 0})</option>)}
            </select>
          </div>
          <aside className="hidden lg:block">
            <Card className="!p-2.5 lg:sticky lg:top-4">
              <div className="space-y-0.5">
                <SpecialRow icon={Layers} label="Tất cả tài liệu" count={docs.length} active={folderId === "all" && !searching} onClick={() => { setQuery(""); setFolderId("all"); }} />
                <SpecialRow icon={Inbox} label="Chưa phân loại" count={counts.none} active={folderId === "none" && !searching} onClick={() => { setQuery(""); setFolderId("none"); }} onDropDoc={readOnly ? undefined : (id) => moveDoc(id, null)} />
              </div>
              <div className="my-2 flex items-center justify-between px-2"><span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Thư mục</span>
                {!readOnly && <button type="button" onClick={() => setFolderModal({ mode: "new", parentId: null })} aria-label="Thêm thư mục gốc" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"><FolderPlus size={15} /></button>}</div>
              {tree.length === 0 ? <p className="px-2 pb-2 text-[12px] leading-snug text-slate-400">{readOnly ? "Chưa có thư mục." : "Chưa có thư mục. Bấm nút bên trên để tạo thư mục đầu tiên, vd \"Quản lý nhà hàng\", \"SEO\", \"Báo cáo ads\"."}</p>
                : <div className="space-y-0.5">{tree.map((n) => <TreeNode key={n.id} node={n} depth={0} selected={searching ? null : folderId} onSelect={(id) => { setQuery(""); setFolderId(id); }} expanded={expanded} toggle={toggle} counts={counts} onDropDoc={readOnly ? () => {} : moveDoc} />)}</div>}
            </Card>
          </aside>

          <section className="min-w-0 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm tên, nhãn hoặc nội dung…" aria-label="Tìm tài liệu" className={`${inputCls} pl-9 pr-9`} />
                {query && <button type="button" onClick={() => setQuery("")} aria-label="Xoá ô tìm" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={14} /></button>}
              </div>
              {(custOptions.length > 0 || customerList.length > 0) && (
                <select aria-label="Lọc theo khách" value={customerF} onChange={(e) => setCustomerF(e.target.value)} className={`${inputCls} sm:w-48`}>
                  <option value="all">Mọi khách</option><option value="none">Chưa gắn khách</option>
                  {custOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              <select aria-label="Sắp xếp" value={sort} onChange={(e) => setSort(e.target.value)} className={`${inputCls} sm:w-44`}>
                <option value="new">Mới cập nhật</option><option value="old">Cũ nhất</option><option value="name">Tên A → Z</option><option value="size">Dung lượng lớn</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1 text-[13px] text-slate-500">
                <button type="button" onClick={() => { setQuery(""); setFolderId("all"); }} className="font-semibold hover:text-indigo-600">Kho</button>
                {!searching && path.map((f, i) => (
                  <span key={f.id} className="flex items-center gap-1"><ChevronRight size={13} className="text-slate-300" />
                    <button type="button" onClick={() => setFolderId(f.id)} className={i === path.length - 1 ? "font-extrabold text-slate-800" : "font-semibold hover:text-indigo-600"}>{f.name}</button></span>
                ))}
                {!searching && !current && <span className="flex items-center gap-1"><ChevronRight size={13} className="text-slate-300" /><span className="font-extrabold text-slate-800">{locLabel}</span></span>}
                {searching && <span className="flex items-center gap-1"><ChevronRight size={13} className="text-slate-300" /><span className="font-extrabold text-slate-800">{locLabel}</span></span>}
                <span className="ml-1 text-slate-400">· {visible.length} tài liệu</span>
              </div>
              {current && !searching && !readOnly && (
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => { setScope({ type: "folder", id: current.id }); setView("chat"); }} className="flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-[12px] font-bold text-indigo-700 hover:bg-indigo-100"><Sparkles size={13} /> Hỏi AI trong thư mục</button>
                  <button type="button" onClick={() => setFolderModal({ mode: "new", parentId: current.id })} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-bold text-slate-600 hover:bg-slate-50"><FolderPlus size={13} /> Thư mục con</button>
                  <button type="button" onClick={() => setFolderModal({ mode: "edit", folder: current })} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-bold text-slate-600 hover:bg-slate-50"><Pencil size={13} /> Sửa</button>
                  <button type="button" onClick={() => removeFolder(current)} className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-bold text-rose-600 hover:bg-rose-50"><Trash2 size={13} /> Xoá</button>
                </div>
              )}
            </div>

            {searching && hits === null && <div className="flex items-center gap-2 text-[12px] text-slate-400"><Loader2 size={13} className="animate-spin" /> Đang tìm trong nội dung…</div>}

            {visible.length === 0 ? (
              <Card className="py-10 text-center">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-500"><LibraryIcon size={26} /></div>
                {searching ? (
                  <><div className="mt-3 text-[15px] font-extrabold text-slate-800">Không tìm thấy "{query.trim()}"</div><div className="mt-1 text-[13px] text-slate-500">Thử từ khoá ngắn hơn. Tìm không phân biệt hoa thường và dấu tiếng Việt.</div></>
                ) : docs.length === 0 ? (
                  <><div className="mt-3 text-[15px] font-extrabold text-slate-800">{readOnly ? "Chưa có tài liệu nào dành cho bạn" : "Kho đang trống"}</div>
                    <div className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-slate-500">Tải file báo cáo HTML, ghi chú Markdown hoặc văn bản vào đây — bấm "Tải file lên" hoặc kéo thả file vào trang. Tạo thư mục để nhóm theo từng mảng kiến thức.</div>
                    {!readOnly && <button type="button" onClick={() => fileRef.current?.click()} className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 px-4 py-2.5 text-[13px] font-bold text-white"><Upload size={15} /> Tải file đầu tiên</button>}</>
                ) : (
                  <><div className="mt-3 text-[15px] font-extrabold text-slate-800">Thư mục này chưa có tài liệu</div><div className="mt-1 text-[13px] text-slate-500">Tải file lên, hoặc kéo tài liệu từ thư mục khác sang.</div></>
                )}
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((d) => (
                  <DocCard key={d.id} d={d} snippet={searching ? hits?.get(d.id) : null} customerName={d.customer_id ? custName.get(d.customer_id) || null : null}
                    folderName={folderId === "all" || searching || folderId === "none" ? (d.folder_id ? folderById.get(d.folder_id)?.name : null) : null}
                    readOnly={readOnly} shared={shares.has(d.id) && !shareExpired(shares.get(d.id))} onShare={() => setShareDoc(d)} onOpen={() => setReader(d.id)} onEdit={() => setEditing(d.id)} onDelete={() => removeDoc(d)}
                    onDownload={async () => { const r = await libGet(d.id); if (r.data) downloadDoc(r.data); else say("Không tải được file"); }} />
                ))}
              </div>
            )}
            {!readOnly && <p className="text-center text-[11px] text-slate-400">Kéo thẻ tài liệu thả vào thư mục bên trái để chuyển nhanh (máy tính). Tối đa {fmtSize(MAX_FILE_BYTES)} mỗi file. PDF sẽ hỗ trợ ở bước sau.</p>}
          </section>
        </div>
      )}

      {reader && <Reader onShare={(doc) => setShareDoc(doc)} readOnly={readOnly} id={reader} folders={folders} onClose={() => setReader(null)} onEdit={(id) => { setReader(null); setEditing(id); }} onDownload={downloadDoc} onAsk={(d) => { setReader(null); setScope({ type: "doc", id: d.id }); setView("chat"); }} />}
      {shareDoc && !readOnly && <ShareModal doc={shareDoc} share={shares.get(shareDoc.id) || null} onClose={() => setShareDoc(null)} onChanged={(row) => setShares((p) => { const n = new Map(p); if (row) n.set(shareDoc.id, row); else n.delete(shareDoc.id); return n; })} />}
      {editing && <EditDocModal id={editing} folders={folders} onClose={() => setEditing(null)} onSaved={(row) => { upsertDoc(row); if (!row.indexed_at) indexDocs([row.id]); }} />}
      {pasteOpen && <PasteModal folders={folders} defaultFolder={realFolder} defaultCustomer={customerF !== "all" && customerF !== "none" ? customerF : null} onClose={() => setPasteOpen(false)} onCreated={(r) => { upsertDoc(r); say("Đã tạo tài liệu"); indexDocs([r.id]); }} />}
      {folderModal && (
        <FolderModal mode={folderModal.mode} folder={folderModal.folder} parentId={folderModal.parentId} folders={folders} onClose={() => setFolderModal(null)}
          onSaved={(f) => { setFolders((p) => [...p.filter((x) => x.id !== f.id), f]); if (folderModal.mode === "new") { setFolderId(f.id); setQuery(""); } }} />
      )}
    </div>
  );
}
