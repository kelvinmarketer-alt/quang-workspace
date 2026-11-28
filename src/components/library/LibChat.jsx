// Tách từ pages/Library.jsx (28/11/2026) — chỉ di chuyển mã, logic giữ nguyên.
import { Card } from "../ui.jsx";
import { Check, Copy, Link2, Loader2, MessageSquare, Send, Sparkles, Trash2 } from "lucide-react";
import { Modal, inputCls, labelCls } from "./LibParts.jsx";
import { SHARE_EXPIRY, descendantIds, flattenTree, fmtDate, isMissingTable, libAsk, libShareCreate, libShareRevoke, libShareSetExpiry, renderAnswer, semanticSearch, shareExpired, shareUrl, unindexedDocs } from "../../lib/library.js";
import { ask } from "../ConfirmDialog.jsx";
import { useEffect, useMemo, useRef, useState } from "react";

export const CHAT_KEY = "qws_lib_chat_v1";
export const loadChat = () => { try { const v = JSON.parse(localStorage.getItem(CHAT_KEY) || "[]"); return Array.isArray(v) ? v.slice(-30) : []; } catch { return []; } };
export const MD_CLS = "text-[14px] leading-relaxed text-slate-700 [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_h1]:text-[15px] [&_h2]:text-[15px] [&_h3]:text-[14px] [&_h1]:font-extrabold [&_h2]:font-extrabold [&_h3]:font-bold [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_a]:text-indigo-600 [&_a]:underline [&_table]:text-[12px] [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_th]:border [&_th]:border-slate-200 [&_th]:px-2";
export const SUGGEST = ["Tóm tắt các ý chính trong phạm vi này", "Có tài liệu nào nói về chi phí và cách tiết kiệm không?", "Liệt kê các bước quan trọng cần làm theo tài liệu"];

// ───────────── Chia sẻ tài liệu bằng link online ─────────────
export function ShareModal({ doc, share, onClose, onChanged }) {
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

export function ChatPanel({ docs, folders, customers = [], scope, setScope, onOpenDoc, indexing, onIndex }) {
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
// 13/11: TÌM THEO Ý NGHĨA — bấm mới gọi máy chủ (đổi câu tìm thành vector, so với các đoạn đã nạp hỏi đáp). Tìm theo chữ vẫn chạy như cũ.
export function MeaningSearch({ q, onOpen }) {
  const [st, setSt] = useState({ q: "", busy: false, list: null, err: "" });
  const fresh = st.q === q;
  const run = async () => {
    setSt({ q, busy: true, list: null, err: "" });
    const r = await semanticSearch(q);
    setSt({ q, busy: false, list: r.data?.results || [], err: r.error || "" });
  };
  if (!q) return null;
  return (
    <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={run} disabled={st.busy} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-2.5 py-1.5 text-[12px] font-bold text-white hover:bg-violet-700 disabled:opacity-60">
          {st.busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Tìm theo ý nghĩa
        </button>
        <span className="text-[11.5px] text-slate-500">{fresh && st.list ? `${st.list.length} tài liệu gần nghĩa với "${q}"` : "Tìm cả tài liệu không chứa đúng chữ đã gõ (chỉ tài liệu đã nạp hỏi đáp)"}</span>
      </div>
      {fresh && st.err && <div className="mt-2 text-[12px] font-semibold text-amber-700">{st.err}</div>}
      {fresh && st.list && st.list.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {st.list.map((r) => (
            <li key={r.doc_id}>
              <button type="button" onClick={() => onOpen(r.doc_id)} className="block w-full rounded-lg bg-white p-2 text-left hover:bg-violet-50">
                <div className="flex items-center justify-between gap-2"><span className="truncate text-[13px] font-bold text-slate-800">{r.title}</span><span className="shrink-0 text-[11px] font-bold text-violet-600">{Math.round((r.score || 0) * 100)}% gần nghĩa</span></div>
                <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-slate-500">{r.excerpt}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
