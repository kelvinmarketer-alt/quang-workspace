import { useRef, useState } from "react";
import { Sparkles, ImagePlus, MessageSquareText, Key, Save, Loader2, Check, X, Trash2, Eye, EyeOff, Settings as SettingsIcon, Mic, MicOff } from "lucide-react";
import { Card, SectionTitle, formatVND, MoneyInput, DateField } from "./ui.jsx";
import { PROJECT_CATEGORIES } from "../data/seed.js";
import { useData } from "../lib/store.jsx";
import { aiImport, fileToDataUrl } from "../lib/ai.js";
import { usePasteImages } from "../lib/paste.js";
import { guardClose, markDirty } from "./ConfirmDialog.jsx";

const num = (v) => Number(String(v ?? "").replace(/[^\d-]/g, "")) || 0;
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const amt = (v) => (typeof v === "number" ? Math.round(v) : num(v));
const cellCls = "w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs";
const isISO = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "");

// 1 đợt thu sửa tại chỗ: tên đợt · ngày · nhận · đã thu (· tiền chạy nếu ADS) + bỏ dòng
function InstEditor({ x, onChange, onRemove, showSpend }) {
  const money = (k, label) => (
    <label className="block min-w-0 text-[10px] font-bold text-slate-400">{label}
      <MoneyInput value={String(amt(x[k]) || "")} onChange={(v) => onChange({ [k]: v })} className={`${cellCls} mt-0.5 font-bold text-slate-700`} placeholder="0" />
    </label>
  );
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-2">
      <div className="flex items-center gap-1.5">
        <input value={x.label ?? ""} onChange={(e) => onChange({ label: e.target.value })} placeholder="Đợt" className={`${cellCls} flex-1 font-semibold`} />
        <DateField value={isISO(x.date) ? x.date : ""} onChange={(v) => onChange({ date: v })} placeholder={x.date || "Chọn ngày"} className={`${cellCls} w-28 shrink-0`} />
        <button onClick={onRemove} className="-my-1 shrink-0 rounded-lg p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-600" title="Bỏ dòng này"><Trash2 size={15} /></button>
      </div>
      <div className={`mt-1.5 grid gap-1.5 ${showSpend ? "grid-cols-3" : "grid-cols-2"}`}>
        {money("amount", "Nhận")}{money("collected", "Đã thu")}{showSpend && money("spend", "Tiền chạy")}
      </div>
    </div>
  );
}

// Xem trước kết quả AI — SỬA từng dòng / bỏ dòng trước khi "Thêm vào app"
function ParsedPreview({ parsed, mode, onChange }) {
  const projects = parsed.projects || [];
  const customers = parsed.customers || [];
  const setP = (pi, fn) => onChange({ ...parsed, projects: projects.map((p, i) => (i === pi ? fn(p) : p)) });
  const setInst = (pi, ii, patch) => setP(pi, (p) => ({ ...p, installments: (p.installments || []).map((x, j) => (j === ii ? { ...x, ...patch } : x)) }));
  const delInst = (pi, ii) => setP(pi, (p) => ({ ...p, installments: (p.installments || []).filter((_, j) => j !== ii) }));
  const delProject = (pi) => onChange({ ...parsed, projects: projects.filter((_, i) => i !== pi) });
  const delCustomer = (ci) => onChange({ ...parsed, customers: customers.filter((_, i) => i !== ci) });
  const insts = projects.flatMap((p, pi) => (p.installments || []).map((x, ii) => ({ x, pi, ii })));
  if (mode === "installment") {
    if (!insts.length) return <div className="text-sm text-slate-400">Không còn đợt nào để thêm.</div>;
    const showSpend = insts.some(({ x }) => amt(x.spend) > 0);
    return <div className="space-y-1.5">{insts.map(({ x, pi, ii }) => <InstEditor key={`${pi}-${ii}`} x={x} showSpend={showSpend} onChange={(patch) => setInst(pi, ii, patch)} onRemove={() => delInst(pi, ii)} />)}</div>;
  }
  if (!projects.length && !customers.length) return <div className="text-sm text-slate-400">Không còn dữ liệu nào để thêm.</div>;
  return (
    <div className="space-y-2">
      {projects.map((p, pi) => {
        const total = (p.installments || []).reduce((a, x) => a + amt(x.amount), 0);
        const showSpend = p.category === "ADS" || (p.installments || []).some((x) => amt(x.spend) > 0);
        return (
          <div key={pi} className="rounded-xl border border-slate-100 p-2.5">
            <div className="flex items-center gap-1.5">
              <select value={PROJECT_CATEGORIES.includes(p.category) ? p.category : "Khác"} onChange={(e) => setP(pi, (q) => ({ ...q, category: e.target.value }))} className={`${cellCls} w-auto shrink-0 font-bold text-indigo-600`}>
                {PROJECT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <input value={p.name ?? ""} onChange={(e) => setP(pi, (q) => ({ ...q, name: e.target.value }))} placeholder="Tên dự án" className={`${cellCls} flex-1 text-sm font-bold text-slate-800`} />
              <button onClick={() => delProject(pi)} className="-my-1 shrink-0 rounded-lg p-2 text-slate-300 hover:bg-rose-50 hover:text-rose-600" title="Bỏ dự án này"><Trash2 size={15} /></button>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <input value={p.customerName ?? ""} onChange={(e) => setP(pi, (q) => ({ ...q, customerName: e.target.value }))} placeholder="Tên khách" className={`${cellCls} flex-1`} />
              <span className="shrink-0 text-sm font-extrabold text-slate-700">{formatVND(total)}</span>
            </div>
            <div className="mt-1.5 space-y-1.5">
              {(p.installments || []).map((x, ii) => <InstEditor key={ii} x={x} showSpend={showSpend} onChange={(patch) => setInst(pi, ii, patch)} onRemove={() => delInst(pi, ii)} />)}
              {!(p.installments || []).length && <div className="text-[11px] text-slate-400">Dự án chưa có đợt thu.</div>}
            </div>
          </div>
        );
      })}
      {customers.length > 0 && (
        <div className="rounded-xl border border-slate-100 p-2.5 text-sm">
          <div className="mb-1 font-bold text-slate-700">Khách hàng mới</div>
          <div className="flex flex-wrap gap-1.5">
            {customers.map((c, ci) => (
              <span key={ci} className="inline-flex items-center rounded-lg bg-slate-100 pl-2.5 text-xs font-semibold text-slate-600">{c.name}
                <button onClick={() => delCustomer(ci)} className="rounded-lg p-2 text-slate-400 hover:text-rose-600" title="Bỏ khách này"><X size={12} /></button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AiKeyBar() {
  const { settings, setSettings } = useData();
  const [key, setK] = useState(settings.openaiKey || "");
  const [model, setM] = useState(settings.openaiModel || "gpt-4o-mini");
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const save = () => { setSettings({ openaiKey: key.trim(), openaiModel: model }); setSaved(true); setTimeout(() => setSaved(false), 1500); };
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase text-slate-500"><Key size={13} /> API Key OpenAI</div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <input type={showKey ? "text" : "password"} value={key} onChange={(e) => setK(e.target.value)} placeholder="sk-..." className="w-full text-sm outline-none" />
          <button onClick={() => setShowKey((s) => !s)} className="text-slate-400 hover:text-slate-600">{showKey ? <EyeOff size={15} /> : <Eye size={15} />}</button>
        </div>
        <select value={model} onChange={(e) => setM(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold">
          <option value="gpt-4o-mini">gpt-4o-mini (rẻ)</option>
          <option value="gpt-4o">gpt-4o (mạnh)</option>
        </select>
        <button onClick={save} className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-sm font-bold text-white hover:bg-slate-900"><Save size={14} /> {saved ? "Đã lưu" : "Lưu"}</button>
      </div>
      <div className="mt-1.5 text-[11px] text-slate-400">Key lưu cùng dữ liệu app (sẽ đồng bộ qua database khi deploy online). Lấy key tại platform.openai.com/api-keys</div>
    </div>
  );
}

/** Hộp nhập AI dùng chung. mode: "project" | "installment". onApply(parsed) thực hiện ghi dữ liệu. */
export function AiImportBox({ mode = "project", onApply, keyHint = true }) {
  const { settings } = useData();
  const hasKey = settings.aiReady ?? !!(settings.openaiKey || "").trim();
  const [tab, setTab] = useState("chat");
  const [text, setText] = useState("");
  const [imgNote, setImgNote] = useState("");
  const [imgData, setImgData] = useState(null);
  const fileRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [parsed, setParsed] = useState(null);
  const [done, setDone] = useState("");

  // Nhập bằng giọng nói (Web Speech API) — Chrome/Android/desktop. iOS dùng nút micro của bàn phím.
  const recRef = useRef(null);
  const [listening, setListening] = useState(false);
  const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const toggleMic = () => {
    if (listening) { recRef.current?.stop(); return; }
    if (!SR) { setErr("Thiết bị/trình duyệt không hỗ trợ thu âm trực tiếp. Trên iPhone hãy bấm nút micro 🎤 trên bàn phím để đọc vào ô này."); return; }
    const rec = new SR();
    rec.lang = "vi-VN"; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (e) => {
      let add = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) add += e.results[i][0].transcript;
      if (add.trim()) setText((p) => (p ? p + " " : "") + add.trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setErr(""); setTab("chat"); setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };

  const ctxHint = mode === "installment" ? "(Đây là các ĐỢT THU thêm cho 1 dự án đã có. Trích các đợt thu.) " : "";

  const [drag, setDrag] = useState(false);
  const handleImages = async (files) => { const file = files && files[0]; if (!file || !file.type?.startsWith("image/")) return; setImgData(await fileToDataUrl(file)); setTab("img"); };
  const pickImage = async (e) => { await handleImages(e.target.files); e.target.value = ""; };
  usePasteImages(handleImages);

  const analyze = async () => {
    setErr(""); setParsed(null); setDone(""); setLoading(true);
    try {
      const res = tab === "img"
        ? await aiImport({ imageDataUrl: imgData, text: ctxHint + (imgNote || "Trích xuất dữ liệu thu tiền từ ảnh này."), apiKey: settings.openaiKey, model: settings.openaiModel })
        : await aiImport({ text: ctxHint + text, apiKey: settings.openaiKey, model: settings.openaiModel });
      setParsed(res);
    } catch (e) { setErr(e.message || "Lỗi không xác định"); }
    setLoading(false);
  };

  // Số dòng còn lại sau khi user sửa/bỏ trong bản xem trước
  const count = !parsed ? 0 : mode === "installment"
    ? (parsed.projects || []).flatMap((p) => p.installments || []).length
    : (parsed.projects || []).length + (parsed.customers || []).length;
  const apply = () => {
    if (!parsed || !count) return;
    onApply(parsed);
    const nP = (parsed.projects || []).length;
    setDone(`✓ Đã thêm ${mode === "installment" ? `${count} đợt` : `${nP} dự án`} vào app.`);
    setParsed(null); setText(""); setImgNote(""); setImgData(null);
  };

  const placeholder = mode === "installment"
    ? "Mỗi dòng 1 đợt thu của dự án này. VD:\nTháng 7 nhận 8tr chạy 3tr, thu đủ\nTháng 8 nhận 10tr chạy 4tr, chưa thu"
    : "Mỗi dòng 1 đợt thu, gõ tự nhiên. VD:\nCao JBL chạy ads tháng 6, nhận 10tr chạy 4tr, thu đủ\nVTY làm web, cọc 50% của 20tr ngày 9/1\nVua Đóng Gói seo 12tr full phí";

  return (
    <div>
      {!hasKey && keyHint && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-700">
          <SettingsIcon size={15} className="shrink-0" /> Chưa có API key OpenAI. Vào <b>Cài đặt</b> để nhập trước khi dùng.
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={() => setTab("chat")} className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${tab === "chat" ? "border-indigo-500 bg-indigo-50 text-indigo-600" : "border-slate-200 text-slate-500"}`}><MessageSquareText size={16} /> Từ chat</button>
        <button onClick={() => setTab("img")} className={`flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${tab === "img" ? "border-indigo-500 bg-indigo-50 text-indigo-600" : "border-slate-200 text-slate-500"}`}><ImagePlus size={16} /> Từ ảnh</button>
      </div>

      {tab === "chat" ? (
        <div className="relative mt-3">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="w-full rounded-xl border border-slate-200 px-3 py-2 pr-14 text-sm" placeholder={placeholder} />
          <button type="button" onClick={toggleMic} title="Đọc bằng giọng nói" className={`absolute right-2.5 top-2.5 grid h-10 w-10 place-items-center rounded-full shadow ${listening ? "animate-pulse bg-rose-500 text-white" : "bg-indigo-100 text-indigo-600 hover:bg-indigo-200"}`}>
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          {listening && <div className="mt-1 text-[11px] font-bold text-rose-500">🔴 Đang nghe… cứ đọc tự nhiên (vd "Cao JBL chạy ads tháng 6 nhận 10 triệu chạy 4 triệu thu đủ"), xong bấm micro để dừng rồi Phân tích.</div>}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <button
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); handleImages(e.dataTransfer.files); }}
            className={`flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed py-6 text-sm font-bold ${drag ? "border-indigo-400 bg-indigo-50" : "border-slate-200 text-slate-500 hover:border-indigo-300 hover:bg-indigo-50/40"}`}>
            <span className="flex items-center gap-2"><ImagePlus size={18} /> {imgData ? "Đổi ảnh khác" : "Chọn ảnh (chụp dashboard, hoá đơn, chuyển khoản…)"}</span>
            <span className="text-[11px] font-medium text-slate-400">hoặc <b>dán ảnh (Ctrl/Cmd+V)</b> · kéo-thả ảnh vào đây</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={pickImage} className="hidden" />
          {imgData && (
            <div className="relative inline-block">
              <img src={imgData} alt="preview" className="max-h-44 rounded-xl border border-slate-200" />
              <button onClick={() => setImgData(null)} className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-rose-500 text-white"><X size={14} /></button>
            </div>
          )}
          <textarea value={imgNote} onChange={(e) => setImgNote(e.target.value)} rows={2} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Ghi chú thêm cho AI (vd: khách Cao JBL, ADS tháng 6)…" />
        </div>
      )}

      <button onClick={analyze} disabled={loading || !hasKey || (tab === "img" ? !imgData : !text.trim())} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 disabled:opacity-40">
        {loading ? <><Loader2 size={16} className="animate-spin" /> Đang phân tích…</> : <><Sparkles size={16} /> Phân tích bằng AI</>}
      </button>

      {err && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600">{err}</div>}
      {done && <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-600">{done}</div>}

      {parsed && (
        <div className="mt-4 rounded-xl border border-slate-100 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-700">AI bóc được — sửa / bỏ dòng rồi thêm</span>
            <button onClick={() => setParsed(null)} className="-m-1 rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Bỏ toàn bộ kết quả"><Trash2 size={15} /></button>
          </div>
          <ParsedPreview parsed={parsed} mode={mode} onChange={setParsed} />
          <button onClick={apply} disabled={!count} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-40"><Check size={16} /> Thêm {count > 0 ? `${count} ${mode === "installment" ? "đợt" : "mục"} ` : ""}vào app</button>
        </div>
      )}
    </div>
  );
}

/** Modal bọc AiImportBox — dùng ở trang Dự án (project) và mục Thêm đợt (installment). */
export function AiImportModal({ mode = "project", projectId, onClose }) {
  const { importParsed, addInstallment } = useData();
  const apply = (parsed) => {
    if (mode === "installment" && projectId) {
      (parsed.projects || []).flatMap((p) => p.installments || []).forEach((i) =>
        addInstallment(projectId, {
          label: (i.label || "Đợt").toString(), date: i.date || todayISO(),
          amount: num(i.amount), serviceFee: num(i.serviceFee), spend: num(i.spend), refund: num(i.refund),
          carry: num(i.carry), ctv: num(i.ctv), otherCost: num(i.otherCost), collected: num(i.collected),
        })
      );
    } else {
      importParsed(parsed);
    }
  };
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4" onInputCapture={markDirty}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={guardClose(onClose)} />
      <div className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-extrabold"><Sparkles size={18} className="text-indigo-500" /> {mode === "installment" ? "Thêm đợt bằng AI" : "Thêm dự án bằng AI"}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <AiImportBox mode={mode} onApply={apply} />
      </div>
    </div>
  );
}

/** Phần trong trang Cài đặt. */
export default function AiImport() {
  const { importParsed } = useData();
  return (
    <Card>
      <SectionTitle action={<Sparkles size={18} className="text-indigo-500" />}>Nhập bằng AI (OpenAI)</SectionTitle>
      <AiKeyBar />
      <div className="mt-4"><AiImportBox mode="project" onApply={importParsed} keyHint={false} /></div>
    </Card>
  );
}
