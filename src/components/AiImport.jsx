import { useRef, useState } from "react";
import { Sparkles, ImagePlus, MessageSquareText, Key, Save, Loader2, Check, X, Trash2, Eye, EyeOff, Settings as SettingsIcon } from "lucide-react";
import { Card, SectionTitle, Badge, formatVND } from "./ui.jsx";
import { useData } from "../lib/store.jsx";
import { aiImport, fileToDataUrl } from "../lib/ai.js";

const num = (v) => Number(String(v ?? "").replace(/[^\d-]/g, "")) || 0;
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function ParsedPreview({ parsed, mode }) {
  const projects = parsed.projects || [];
  const customers = parsed.customers || [];
  const insts = projects.flatMap((p) => p.installments || []);
  if (!projects.length && !customers.length) return <div className="text-sm text-slate-400">AI không tìm thấy dữ liệu nào.</div>;
  if (mode === "installment") {
    return (
      <div className="space-y-1.5">
        {insts.map((x, j) => (
          <div key={j} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
            <span className="font-semibold text-slate-700">{x.label || "Đợt"} <span className="font-normal text-slate-400">· {x.date}{x.spend ? ` · chạy ${formatVND(num(x.spend))}` : ""}</span></span>
            <span className="text-slate-500">nhận {formatVND(num(x.amount))} · thu {formatVND(num(x.collected))}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {projects.map((p, i) => {
        const total = (p.installments || []).reduce((a, x) => a + num(x.amount), 0);
        return (
          <div key={i} className="rounded-xl border border-slate-100 p-3">
            <div className="flex items-center gap-2">
              <Badge tone="indigo">{p.category || "Khác"}</Badge>
              <span className="text-sm font-bold text-slate-800">{p.name || "Dự án"}</span>
              <span className="text-xs text-slate-400">· {p.customerName}</span>
              <span className="ml-auto text-sm font-extrabold text-slate-700">{formatVND(total)}</span>
            </div>
            <div className="mt-1 space-y-0.5">
              {(p.installments || []).map((x, j) => (
                <div key={j} className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>{x.label || "Đợt"} · {x.date}{x.spend ? ` · chạy ${formatVND(num(x.spend))}` : ""}</span>
                  <span>nhận {formatVND(num(x.amount))} · thu {formatVND(num(x.collected))}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {customers.length > 0 && (
        <div className="rounded-xl border border-slate-100 p-3 text-sm"><span className="font-bold text-slate-700">Khách hàng: </span><span className="text-slate-500">{customers.map((c) => c.name).join(", ")}</span></div>
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
  const hasKey = !!(settings.openaiKey || "").trim();
  const [tab, setTab] = useState("chat");
  const [text, setText] = useState("");
  const [imgNote, setImgNote] = useState("");
  const [imgData, setImgData] = useState(null);
  const fileRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [parsed, setParsed] = useState(null);
  const [done, setDone] = useState("");

  const ctxHint = mode === "installment" ? "(Đây là các ĐỢT THU thêm cho 1 dự án đã có. Trích các đợt thu.) " : "";

  const pickImage = async (e) => { const file = e.target.files?.[0]; if (!file) return; setImgData(await fileToDataUrl(file)); e.target.value = ""; };

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

  const apply = () => {
    if (!parsed) return;
    onApply(parsed);
    const count = mode === "installment"
      ? (parsed.projects || []).flatMap((p) => p.installments || []).length
      : (parsed.projects || []).length;
    setDone(`✓ Đã thêm ${count} ${mode === "installment" ? "đợt" : "dự án"} vào app.`);
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
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder={placeholder} />
      ) : (
        <div className="mt-3 space-y-3">
          <button onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-6 text-sm font-bold text-slate-500 hover:border-indigo-300 hover:bg-indigo-50/40">
            <ImagePlus size={18} /> {imgData ? "Đổi ảnh khác" : "Chọn ảnh (chụp dashboard, hoá đơn, chuyển khoản…)"}
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
            <span className="text-sm font-bold text-slate-700">AI bóc được — kiểm tra rồi thêm</span>
            <button onClick={() => setParsed(null)} className="text-slate-400 hover:text-rose-600"><Trash2 size={15} /></button>
          </div>
          <ParsedPreview parsed={parsed} mode={mode} />
          <button onClick={apply} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-white hover:bg-emerald-600"><Check size={16} /> Thêm vào app</button>
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
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
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
