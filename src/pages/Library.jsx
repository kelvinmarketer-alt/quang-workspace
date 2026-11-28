import { AlertTriangle, ChevronRight, FilePlus2, FileText, FolderPlus, Inbox, Layers, Library as LibraryIcon, Lightbulb, Loader2, Pencil, RefreshCw, Search, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Card } from "../components/ui.jsx";
import { MAX_FILE_BYTES, buildTree, countDocs, descendantIds, downloadDoc, filterDocs, flattenTree, fmtSize, fold, folderPath, intersectHits, isMissingTable, libAddDoc, libDeleteDoc, libDeleteFolder, libGet, libIdea, libIndex, libLoad, libSearch, libShares, libUpdateDoc, prepareFile, searchWords, shareExpired, sortDocs } from "../lib/library.js";
import { ask } from "../components/ConfirmDialog.jsx";
import { todayISO } from "../lib/format.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useData } from "../lib/store.jsx";
import { useSearchParams } from "react-router-dom";
import { ACCEPT, DocCard, EditDocModal, FolderModal, PasteModal, Reader, SpecialRow, TreeNode, inputCls, labelCls } from "../components/library/LibParts.jsx";
import { ChatPanel, MeaningSearch, ShareModal } from "../components/library/LibChat.jsx";

export default function LibraryPage() {
  const data = useData() || {};
  const readOnly = !!data.ownerId && !data.isOwner; // thành viên được cấp quyền: CHỈ XEM (không tải lên / sửa / xoá / Hỏi đáp AI)
  const [sp, setSp] = useSearchParams();
  const customerList = data.customerList || [];
  const say = (text) => data.setToast && data.setToast({ text });
  const [folders, setFolders] = useState([]), [docs, setDocs] = useState([]);
  const [state, setState] = useState("loading"), [errMsg, setErrMsg] = useState("");
  const [folderId, setFolderId] = useState("all"); // all | none | mã thư mục
  const [query, setQuery] = useState(""), [hits, setHits] = useState(null), [sort, setSort] = useState("new"), [searchErr, setSearchErr] = useState("");
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

  // Tìm trong NỘI DUNG (máy chủ, bỏ dấu) — chạy sau khi ngừng gõ 0,35 giây.
  // 11/11: cả cụm không có → tìm TỪNG TỪ (tối đa 4) và giữ tài liệu có đủ mọi từ (không cần đứng liền nhau).
  // Hàm máy chủ lỗi / chưa cài → không báo lỗi đỏ, chỉ nói rõ đang tìm theo tên, nhãn, ghi chú.
  useEffect(() => {
    const q = query.trim();
    if (fold(q).length < 2) { setHits(null); setSearchErr(""); return undefined; }
    let alive = true;
    const t = setTimeout(async () => {
      let r;
      try { r = await libSearch(q); } catch (e) { r = { data: null, error: e }; }
      let map = new Map((r?.data || []).map((x) => [x.id, x.snippet]));
      const words = searchWords(q);
      if (!r?.error && !map.size && words.length >= 2) {
        try {
          const rs = await Promise.all(words.map((w) => libSearch(w)));
          if (!rs.some((x) => x?.error)) map = intersectHits(rs.map((x) => x?.data || []));
        } catch { /* giữ kết quả rỗng */ }
      }
      if (!alive) return;
      setHits(map);
      setSearchErr(r?.error ? (isMissingTable(r.error) ? "Máy chủ chưa có hàm tìm trong nội dung — đang chỉ tìm theo tên, nhãn, ghi chú." : "Chưa tìm được trong nội dung lúc này — đang chỉ tìm theo tên, nhãn, ghi chú.") : "");
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
            {searching && searchErr && <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] font-semibold text-amber-700"><AlertTriangle size={13} className="shrink-0" /> {searchErr}</div>}
            {searching && !readOnly && <MeaningSearch q={query.trim()} onOpen={(id) => setReader(id)} />}

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
                  <DocCard key={d.id} d={d} snippet={searching ? hits?.get(d.id) : null} query={searching ? query.trim() : ""} customerName={d.customer_id ? custName.get(d.customer_id) || null : null}
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
