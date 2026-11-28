// Tách từ pages/Library.jsx (28/11/2026) — chỉ di chuyển mã, logic giữ nguyên.
import { Badge } from "../ui.jsx";
import { ChevronDown, ChevronRight, Download, FileCode2, FileText, Folder, Link2, Loader2, Pencil, Sparkles, Tag, Trash2, Users, X } from "lucide-react";
import { FOLDER_COLORS, FOLDER_COLOR_KEYS, KINDS, MAX_FILE_BYTES, descendantIds, extractTitle, flattenTree, fmtDate, fmtSize, fold, folderPath, frameDoc, highlightParts, libAddDoc, libAddFolder, libGet, libUpdateDoc, libUpdateFolder, parseTags, tidySnippet, toPlain } from "../../lib/library.js";
import { guardClose, markDirty } from "../ConfirmDialog.jsx";
import { useData } from "../../lib/store.jsx";
import { useEffect, useMemo, useState } from "react";

export const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300";
export const labelCls = "mb-1 block text-[12px] font-bold text-slate-500";
export const KIND_BOX = { html: "bg-sky-50 text-sky-600", md: "bg-violet-50 text-violet-600", txt: "bg-slate-100 text-slate-600" };
export const ACCEPT = ".html,.htm,.md,.markdown,.txt,.csv,.json,.log,text/html,text/markdown,text/plain";

// ───────────── Khung nhỏ dùng chung ─────────────
export function Modal({ title, onClose, children, wide }) {
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
export function FolderSelect({ folders, value, onChange, exclude, noneLabel = "Chưa phân loại" }) {
  const flat = useMemo(() => flattenTree(folders).filter((f) => !exclude || !exclude.has(f.id)), [folders, exclude]);
  return (
    <select className={inputCls} value={value || ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{noneLabel}</option>
      {flat.map((f) => <option key={f.id} value={f.id}>{"  ".repeat(f.depth)}{f.depth ? "└ " : ""}{f.name}</option>)}
    </select>
  );
}

// Chọn khách + dự án của khách đó (dự án chỉ hiện khi đã chọn khách). value = { customer_id, project_id }.
export function LinkSelects({ value, onChange }) {
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
export function TreeNode({ node, depth, selected, onSelect, expanded, toggle, counts, onDropDoc }) {
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

export function SpecialRow({ icon: Icon, label, count, active, onClick, onDropDoc }) {
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

// Tô sáng từ khoá trong chữ (11/11) — React tự escape, không chèn HTML
export function Hl({ text, q }) {
  if (!q) return text || null;
  return highlightParts(text, q).map((p, i) => (p.hit ? <mark key={i} className="rounded bg-amber-200 px-0.5 text-slate-900">{p.t}</mark> : <span key={i}>{p.t}</span>));
}

// ───────────── Thẻ tài liệu ─────────────
export function DocCard({ d, folderName, customerName, snippet, query, onOpen, onEdit, onDownload, onDelete, onShare, shared, readOnly }) {
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
          <div className="line-clamp-2 text-[14px] font-extrabold leading-snug text-slate-800"><Hl text={d.title} q={query} /></div>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-slate-400">
            <Badge tone={k.tone}>{k.label}</Badge>
            <span>{fmtSize(d.size_bytes)}</span><span>·</span><span>{fmtDate(d.updated_at || d.created_at)}</span>
            {!d.indexed_at && <span title="Chưa nạp vào hỏi đáp AI — vào tab Hỏi đáp để nạp" className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 font-bold text-amber-600"><Sparkles size={10} />chưa nạp AI</span>}
          </div>
        </div>
      </div>
      {snippet ? <p className="line-clamp-3 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] leading-snug text-slate-600" title="Đoạn khớp trong nội dung"><Hl text={tidySnippet(snippet)} q={query} /></p>
        : d.excerpt ? <p className="line-clamp-2 text-[12px] leading-snug text-slate-500"><Hl text={d.excerpt} q={query} /></p> : null}
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
export function Reader({ id, folders, onClose, onEdit, onDownload, onAsk, onShare, readOnly }) {
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
      <div className="flex shrink-0 items-center gap-1.5 border-b border-slate-100 bg-white px-3 sm:gap-2 py-2.5 sm:px-5">
        <button type="button" onClick={onClose} aria-label="Đóng" className="flex shrink-0 items-center gap-1 rounded-xl bg-slate-100 px-2.5 py-2 text-[13px] font-bold text-slate-700 hover:bg-slate-200 sm:px-3"><X size={15} /> <span className="hidden sm:inline">Đóng</span></button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-extrabold text-slate-800">{doc?.title || "Đang mở…"}</div>
          {doc && <div className="truncate text-[11px] text-slate-400">{path || "Chưa phân loại"} · {(KINDS[doc.kind] || KINDS.txt).label} · {fmtSize(doc.size_bytes)}</div>}
        </div>
        {doc && <>
          {!readOnly && <button type="button" onClick={() => onAsk(doc)} className="flex items-center gap-1 shrink-0 rounded-xl bg-indigo-50 px-2.5 py-2 sm:px-3 text-[13px] font-bold text-indigo-700 hover:bg-indigo-100"><Sparkles size={14} /> <span className="hidden sm:inline">Hỏi AI về tài liệu này</span><span className="sm:hidden">Hỏi AI</span></button>}
          {!readOnly && <button type="button" onClick={() => onShare(doc)} className="flex items-center gap-1 shrink-0 rounded-xl border border-slate-200 px-2.5 py-2 text-[13px] font-bold text-slate-600 hover:bg-slate-50 sm:px-3"><Link2 size={14} /> <span className="hidden sm:inline">Chia sẻ</span></button>}
          {!readOnly && <button type="button" onClick={() => onEdit(doc.id)} className="hidden items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-[13px] font-bold text-slate-600 hover:bg-slate-50 sm:flex"><Pencil size={14} /> Sửa</button>}
          <button type="button" onClick={() => onDownload(doc)} className="flex items-center gap-1 shrink-0 rounded-xl border border-slate-200 px-2.5 py-2 text-[13px] font-bold text-slate-600 hover:bg-slate-50 sm:px-3"><Download size={14} /> <span className="hidden sm:inline">Tải về</span></button>
        </>}
      </div>
      {err ? <div className="grid flex-1 place-items-center p-6 text-sm text-rose-600">{err}</div>
        : !doc ? <div className="grid flex-1 place-items-center"><Loader2 className="animate-spin text-indigo-500" /></div>
          : <iframe title={doc.title} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={html} className="min-h-0 w-full flex-1 border-0 bg-white" />}
    </div>
  );
}

// ───────────── Sửa thông tin tài liệu ─────────────
export function EditDocModal({ id, folders, onClose, onSaved }) {
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
export function PasteModal({ folders, defaultFolder, defaultCustomer, onClose, onCreated }) {
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
        <div><label className={labelCls}>Nội dung</label><textarea rows={12} autoFocus className={`${inputCls} h-44 font-mono text-[12px] sm:h-auto`} value={f.content} onChange={(e) => set("content")(e.target.value)} placeholder="Dán hoặc gõ nội dung vào đây…" /></div>
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
export function FolderModal({ mode, folder, parentId, folders, onClose, onSaved }) {
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
