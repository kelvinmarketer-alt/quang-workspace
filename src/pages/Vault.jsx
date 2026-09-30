import { useMemo, useRef, useState } from "react";
import {
  Plus, X, Trash2, Pencil, Copy, Check, Eye, EyeOff, Search,
  KeyRound, CreditCard, Landmark, Lock, ShieldAlert, ExternalLink,
  Sparkles, ImagePlus, Loader2, Settings as SettingsIcon,
} from "lucide-react";
import { Card, Badge } from "../components/ui.jsx";
import { useData } from "../lib/store.jsx";
import { aiReadVault, imageToDataUrl } from "../lib/ai.js";
import { usePasteImages } from "../lib/paste.js";

const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";

// Định nghĩa 3 loại + các trường (key, nhãn, có ẩn/bí mật?)
const TYPES = {
  app: {
    label: "Ứng dụng", icon: KeyRound, tone: "indigo", emoji: "🔑",
    grad: "from-indigo-500 to-violet-500",
    fields: [
      ["username", "Tài khoản / Email", false],
      ["password", "Mật khẩu", true],
      ["url", "Link đăng nhập", false],
      ["twofa", "Mã 2FA / Khôi phục", true],
    ],
  },
  card: {
    label: "Thẻ", icon: CreditCard, tone: "violet", emoji: "💳",
    grad: "from-violet-500 to-fuchsia-500",
    fields: [
      ["holder", "Chủ thẻ", false],
      ["number", "Số thẻ", true],
      ["expiry", "Hết hạn (MM/YY)", false],
      ["cvv", "CVV", true],
      ["bank", "Ngân hàng phát hành", false],
    ],
  },
  bank: {
    label: "Thanh toán", icon: Landmark, tone: "emerald", emoji: "🏦",
    grad: "from-emerald-500 to-teal-500",
    fields: [
      ["holder", "Chủ tài khoản", false],
      ["number", "Số tài khoản", false],
      ["bank", "Ngân hàng / Ví", false],
      ["branch", "Chi nhánh", false],
    ],
  },
};
const TYPE_KEYS = Object.keys(TYPES);

const maskVal = (v) => (v ? "•".repeat(Math.min(String(v).length, 12)) : "");
const tail = (v) => { const s = String(v || "").replace(/\s/g, ""); return s.length > 4 ? "•••• " + s.slice(-4) : s; };

// Ghép văn bản để copy toàn bộ 1 mục
function itemToText(item) {
  const t = TYPES[item.type] || TYPES.app;
  const lines = [`${t.emoji} ${item.title || t.label}`];
  for (const [k, lbl] of t.fields) if (item[k]) lines.push(`${lbl}: ${item[k]}`);
  if (item.note) lines.push(`Ghi chú: ${item.note}`);
  return lines.join("\n");
}

async function copy(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.focus(); ta.select();
    const ok = document.execCommand("copy"); document.body.removeChild(ta); return ok;
  } catch { return false; }
}

// 1 dòng trường trong phần mở rộng: nhãn + giá trị (ẩn nếu bí mật) + nút hiện + nút copy
function FieldRow({ label, value, secret }) {
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);
  const isUrl = /^https?:\/\//i.test(value || "");
  const doCopy = async () => { if (await copy(value)) { setDone(true); setTimeout(() => setDone(false), 1200); } };
  return (
    <div className="flex items-center gap-2 border-t border-slate-50 py-2">
      <div className="w-24 shrink-0 text-[11px] font-semibold text-slate-400 sm:w-28">{label}</div>
      <div className="min-w-0 flex-1 truncate font-mono text-[13px] text-slate-700">
        {secret && !show ? maskVal(value) : (
          isUrl
            ? <a href={value} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline">{value}<ExternalLink size={11} /></a>
            : value
        )}
      </div>
      {secret && (
        <button onClick={() => setShow((v) => !v)} className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" title={show ? "Ẩn" : "Hiện"}>
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      )}
      <button onClick={doCopy} className={`shrink-0 rounded-lg p-1.5 ${done ? "text-emerald-600" : "text-slate-400 hover:bg-slate-100"}`} title="Copy">
        {done ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

function VaultCard({ item, canW, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const t = TYPES[item.type] || TYPES.app;
  const sub =
    item.type === "app" ? (item.username || item.url || "")
    : item.type === "card" ? [item.bank, tail(item.number)].filter(Boolean).join(" · ")
    : [item.bank, item.number].filter(Boolean).join(" · ");
  const copyAll = async (e) => { e.stopPropagation(); if (await copy(itemToText(item))) { setCopied(true); setTimeout(() => setCopied(false), 1400); } };
  return (
    <Card className="!p-0 overflow-hidden">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 p-3 text-left">
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${t.grad} text-white`}>
          <t.icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-extrabold text-slate-800">{item.title || t.label}</div>
          {sub && <div className="truncate text-[11px] text-slate-400">{sub}</div>}
        </div>
        <button onClick={copyAll} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${copied ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-700"}`} title="Copy tất cả để gửi">
          <span className="inline-flex items-center gap-1">{copied ? <Check size={12} /> : <Copy size={12} />}{copied ? "Đã copy" : "Copy"}</span>
        </button>
      </button>
      {open && (
        <div className="border-t border-slate-100 bg-slate-50/50 px-3 pb-3">
          {t.fields.filter(([k]) => item[k]).map(([k, lbl, secret]) => (
            <FieldRow key={k} label={lbl} value={item[k]} secret={secret} />
          ))}
          {item.note && <FieldRow label="Ghi chú" value={item.note} secret={false} />}
          <div className="mt-2 flex items-center gap-2">
            <button onClick={copyAll} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2 text-[12px] font-bold text-white hover:bg-slate-700">
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Đã copy" : "Copy tất cả để gửi"}
            </button>
            {canW && (
              <>
                <button onClick={() => onEdit(item)} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:text-indigo-600"><Pencil size={14} /></button>
                <button onClick={() => { if (confirm(`Xoá "${item.title || t.label}"?`)) onDelete(item.id); }} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:text-rose-600"><Trash2 size={14} /></button>
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// Thêm HÀNG LOẠT: nhiều dòng trong 1 lần, lưu 1 phát
function VaultBatchModal({ startType = "app", onClose, onSave }) {
  const blank = (type) => ({ _k: Math.random().toString(36).slice(2, 8), type, title: "", note: "" });
  const [rows, setRows] = useState([blank(startType)]);
  const setRow = (k, patch) => setRows((rs) => rs.map((r) => (r._k === k ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, blank(rs[rs.length - 1]?.type || "app")]);
  const delRow = (k) => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r._k !== k) : rs));
  const valid = rows.filter((r) => (r.title || "").trim());
  const save = () => { if (valid.length) { onSave(valid.map(({ _k, ...r }) => ({ ...r, title: r.title.trim() }))); onClose(); } };
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <h3 className="text-lg font-extrabold">Thêm hàng loạt</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {rows.map((r, idx) => {
            const t = TYPES[r.type] || TYPES.app;
            return (
              <div key={r._k} className="rounded-xl border border-slate-200 p-3">
                <div className="mb-2 flex items-center gap-1.5">
                  {TYPE_KEYS.map((k) => {
                    const Ty = TYPES[k]; const on = r.type === k;
                    return (
                      <button key={k} onClick={() => setRow(r._k, { type: k })} className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold ${on ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"}`}>
                        <Ty.icon size={12} /> {Ty.label}
                      </button>
                    );
                  })}
                  <span className="ml-auto text-[11px] font-bold text-slate-300">#{idx + 1}</span>
                  {rows.length > 1 && <button onClick={() => delRow(r._k)} className="rounded-lg p-1 text-slate-300 hover:text-rose-600"><Trash2 size={14} /></button>}
                </div>
                <input value={r.title} onChange={(e) => setRow(r._k, { title: e.target.value })} className={`${inputCls} mb-2 font-semibold`} placeholder={r.type === "app" ? "Tên gọi * (Facebook, Gmail…)" : r.type === "card" ? "Tên gọi * (Visa Techcombank…)" : "Tên gọi * (Vietcombank, Momo…)"} />
                <div className="grid grid-cols-2 gap-2">
                  {t.fields.map(([k, lbl]) => (
                    <input key={k} value={r[k] || ""} onChange={(e) => setRow(r._k, { [k]: e.target.value })} className={inputCls} placeholder={lbl} autoComplete="off" />
                  ))}
                </div>
                <input value={r.note || ""} onChange={(e) => setRow(r._k, { note: e.target.value })} className={`${inputCls} mt-2`} placeholder="Ghi chú (tuỳ chọn)" />
              </div>
            );
          })}
          <button onClick={addRow} className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-200 py-2.5 text-sm font-bold text-slate-500 hover:border-indigo-300 hover:text-indigo-600"><Plus size={15} /> Thêm dòng</button>
        </div>
        <div className="border-t border-slate-100 p-4">
          <button onClick={save} disabled={!valid.length} className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg disabled:opacity-40">Lưu tất cả ({valid.length})</button>
        </div>
      </div>
    </div>
  );
}

// Modal AI: đọc ẢNH (danh sách tài khoản/thẻ) → tự bóc + điền + thêm hàng loạt
function VaultAiModal({ onClose, onAdd }) {
  const { settings } = useData();
  const hasKey = !!(settings.openaiKey || "").trim();
  const fileRef = useRef(null);
  const [img, setImg] = useState(null);
  const [note, setNote] = useState("");
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [items, setItems] = useState(null);
  const handleFiles = async (files) => { const f = files && files[0]; if (!f || !f.type?.startsWith("image/")) return; try { setImg(await imageToDataUrl(f, 1600, 0.85)); setErr(""); } catch { setErr("Không đọc được ảnh."); } };
  const pick = async (e) => { await handleFiles(e.target.files); e.target.value = ""; };
  usePasteImages(handleFiles);
  const analyze = async () => {
    setErr(""); setItems(null); setLoading(true);
    try {
      const r = await aiReadVault({ imageDataUrl: img, text: note, apiKey: settings.openaiKey, model: settings.openaiModel });
      if (!r.items?.length) setErr("AI không đọc được tài khoản nào. Thử ảnh rõ hơn hoặc đổi model gpt-4o.");
      setItems(r.items || []);
    } catch (e) { setErr(e.message || "Lỗi không xác định"); }
    setLoading(false);
  };
  const setItem = (i, patch) => setItems((it) => it.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const removeItem = (i) => setItems((it) => it.filter((_, j) => j !== i));
  const add = () => { if (items && items.length) { onAdd(items); onClose(); } };
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
          <button
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
            className={`flex w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed py-6 text-sm font-bold ${drag ? "border-indigo-400 bg-indigo-50" : "border-slate-200 text-slate-500 hover:border-indigo-300 hover:bg-indigo-50/40"}`}>
            <span className="flex items-center gap-2"><ImagePlus size={18} /> {img ? "Đổi ảnh khác" : "Chọn ảnh (bảng tài khoản / mật khẩu / thẻ)"}</span>
            <span className="text-[11px] font-medium text-slate-400">hoặc <b>dán ảnh (Ctrl/Cmd+V)</b> · kéo-thả ảnh vào đây</span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={pick} className="hidden" />
          {img && (
            <div className="relative inline-block">
              <img src={img} alt="preview" className="max-h-44 rounded-xl border border-slate-200" />
              <button onClick={() => setImg(null)} className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-rose-500 text-white"><X size={14} /></button>
            </div>
          )}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Ghi chú cho AI (tuỳ chọn)…" />
          <button onClick={analyze} disabled={loading || !hasKey || !img} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg disabled:opacity-40">
            {loading ? <><Loader2 size={16} className="animate-spin" /> Đang đọc ảnh…</> : <><Sparkles size={16} /> Đọc ảnh bằng AI</>}
          </button>
          <div className="text-center text-[11px] text-slate-400">Mật khẩu/số thẻ đọc từ ảnh — nên đổi model <b>gpt-4o</b> ở Cài đặt & kiểm tra lại trước khi lưu.</div>
          {err && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600">{err}</div>}
          {items && items.length > 0 && (
            <div className="rounded-xl border border-slate-100 p-2">
              <div className="mb-1 px-1 text-[11px] font-bold uppercase text-slate-400">AI bóc được ({items.length}) — sửa/bỏ trước khi thêm</div>
              <div className="max-h-56 space-y-1.5 overflow-y-auto">
                {items.map((r, i) => { const t = TYPES[r.type] || TYPES.app; const sub = r.type === "app" ? [r.username, r.password ? "••••" : ""].filter(Boolean).join(" · ") : r.type === "card" ? [r.bank, r.number].filter(Boolean).join(" · ") : [r.bank, r.number].filter(Boolean).join(" · "); return (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-slate-100 p-2">
                    <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br ${t.grad} text-white`}><t.icon size={14} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1"><input value={r.title} onChange={(e) => setItem(i, { title: e.target.value })} className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-700 outline-none" /><Badge tone={t.tone}>{t.label}</Badge></div>
                      <div className="truncate text-[11px] text-slate-400">{sub || "—"}</div>
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

function VaultModal({ initial, onClose, onSave }) {
  const [f, setF] = useState({ type: "app", title: "", note: "", ...initial });
  const t = TYPES[f.type] || TYPES.app;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = () => { if ((f.title || "").trim()) { onSave({ ...f, title: f.title.trim() }); onClose(); } };
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">{initial?.id ? "Sửa mục" : "Thêm mục"}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        {/* Chọn loại */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          {TYPE_KEYS.map((k) => {
            const Ty = TYPES[k]; const on = f.type === k;
            return (
              <button key={k} onClick={() => setF({ ...f, type: k })} className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 text-[12px] font-bold ${on ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-500"}`}>
                <Ty.icon size={16} /> {Ty.label}
              </button>
            );
          })}
        </div>
        <label className="mb-3 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Tên gọi *</span><input value={f.title} onChange={set("title")} autoFocus className={inputCls} placeholder={f.type === "app" ? "Facebook, Gmail…" : f.type === "card" ? "Visa Techcombank…" : "Vietcombank, Momo…"} /></label>
        {t.fields.map(([k, lbl]) => (
          <label key={k} className="mb-3 block text-sm">
            <span className="mb-1 block font-semibold text-slate-600">{lbl}</span>
            <input value={f[k] || ""} onChange={set(k)} className={inputCls} autoComplete="off" />
          </label>
        ))}
        <label className="mb-4 block text-sm"><span className="mb-1 block font-semibold text-slate-600">Ghi chú</span><textarea value={f.note || ""} onChange={set("note")} rows={2} className={inputCls} /></label>
        <button onClick={save} className={`w-full rounded-xl bg-gradient-to-r ${t.grad} py-2.5 text-sm font-bold text-white shadow-lg`}>Lưu</button>
      </div>
    </div>
  );
}

export default function Vault() {
  const { vault = [], addVaultItem, addVaultItems, updateVaultItem, deleteVaultItem, isOwner, ownerId } = useData();
  const canW = isOwner || !ownerId; // ghi = chủ (store đã chặn owner-only)
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(null); // sửa 1 mục
  const [batch, setBatch] = useState(false); // thêm hàng loạt
  const [aiOpen, setAiOpen] = useState(false); // thêm bằng AI đọc ảnh

  const counts = useMemo(() => {
    const c = { all: vault.length, app: 0, card: 0, bank: 0 };
    for (const v of vault) c[v.type] = (c[v.type] || 0) + 1;
    return c;
  }, [vault]);

  const list = useMemo(() => {
    const lq = q.trim().toLowerCase();
    return vault.filter((v) => (tab === "all" || v.type === tab) && (!lq || JSON.stringify(v).toLowerCase().includes(lq)));
  }, [vault, tab, q]);

  // Chưa resolve chủ → chờ; đã resolve mà KHÔNG phải chủ → khoá (bảo mật)
  if (ownerId && !isOwner) {
    return (
      <Card>
        <div className="py-12 text-center">
          <Lock size={28} className="mx-auto text-slate-300" />
          <div className="mt-2 text-sm font-bold text-slate-600">Chỉ chủ workspace mới xem được kho tài khoản</div>
          <div className="mt-1 text-xs text-slate-400">Đây là dữ liệu nhạy cảm (mật khẩu, thẻ, tài khoản).</div>
        </div>
      </Card>
    );
  }

  const TABS = [["all", "Tất cả"], ["app", "Ứng dụng"], ["card", "Thẻ"], ["bank", "Thanh toán"]];

  return (
    <div className="space-y-4">
      {/* Cảnh báo bảo mật */}
      <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-700">
        <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-500" />
        <span>Dữ liệu nhạy cảm — <b>chỉ tài khoản của bạn</b> thấy được. Bấm 👁 để hiện mục ẩn, <b>Copy</b> để gửi cho người khác. Tránh chia sẻ quyền chủ cho người lạ.</span>
      </div>

      {/* Tabs loại */}
      <div className="grid grid-cols-4 gap-1.5">
        {TABS.map(([k, lbl]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-xl py-2 text-[12px] font-bold transition ${tab === k ? "bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow" : "bg-white text-slate-500 hover:text-slate-800"}`}>
            {lbl}<span className="ml-1 opacity-70">{counts[k] || 0}</span>
          </button>
        ))}
      </div>

      {/* Tìm kiếm */}
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
        <Search size={16} className="text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên, tài khoản, ngân hàng…" className="w-full text-sm text-slate-700 outline-none placeholder:text-slate-400" />
        {q && <button onClick={() => setQ("")} className="text-slate-400 hover:text-slate-600"><X size={15} /></button>}
      </div>

      {/* Danh sách */}
      {list.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <KeyRound size={28} className="mx-auto text-slate-300" />
            <div className="mt-2 text-sm font-bold text-slate-600">{vault.length === 0 ? "Chưa có mục nào" : "Không tìm thấy"}</div>
            <div className="mt-1 text-xs text-slate-400">Lưu tài khoản app, thẻ, tài khoản ngân hàng để copy & gửi nhanh.</div>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {list.map((item) => (
            <VaultCard key={item.id} item={item} canW={canW} onEdit={setModal} onDelete={deleteVaultItem} />
          ))}
        </div>
      )}

      {canW && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setAiOpen(true)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 py-2.5 text-sm font-bold text-indigo-600 hover:bg-indigo-100">
            <Sparkles size={15} /> AI đọc ảnh
          </button>
          <button onClick={() => setModal({ type: tab === "all" ? "app" : tab })} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">
            <Plus size={15} /> Thêm 1 mục
          </button>
          <button onClick={() => setBatch(true)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30">
            <Plus size={15} /> Hàng loạt
          </button>
        </div>
      )}

      {modal && <VaultModal initial={modal} onClose={() => setModal(null)} onSave={(data) => (modal.id ? updateVaultItem(modal.id, data) : addVaultItem(data))} />}
      {batch && <VaultBatchModal startType={tab === "all" ? "app" : tab} onClose={() => setBatch(false)} onSave={addVaultItems} />}
      {aiOpen && <VaultAiModal onClose={() => setAiOpen(false)} onAdd={addVaultItems} />}
    </div>
  );
}
