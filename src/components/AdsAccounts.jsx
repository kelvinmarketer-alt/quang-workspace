import { useEffect, useState } from "react";
import { Megaphone, Trash2, KeyRound, Search, Save, RefreshCw, Copy, Check } from "lucide-react";
import { Card, Badge } from "./ui.jsx";
import { supabase } from "../lib/supabase.js";
import GADS_SCRIPT from "../../supabase/gads-script.js?raw";

// Quản lý TKQC Meta cho module Quảng cáo (CHỈ CHỦ). Token gửi thẳng lên edge fn qws-meta-ads,
// lưu ở bảng qws_ads_accounts (chỉ service role đọc) — app không bao giờ nhận lại token, chỉ 6 ký tự cuối.
const call = async (body) => {
  const { data, error } = await supabase.functions.invoke("qws-meta-ads", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
};
const inputCls = "rounded-lg border border-slate-200 px-2 py-1.5 text-xs";
const GROUPS = [["conv", "Chuyển đổi"], ["brand", "Thương hiệu"]];

function GroupSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {GROUPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
}

// Google Ads: số liệu do Google Ads Script đẩy về mỗi giờ. Chủ lấy script (đã gắn khoá) để dán vào MCC / tài khoản lẻ.
function GoogleSection() {
  const [list, setList] = useState([]);
  const [script, setScript] = useState("");
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");
  const refresh = async () => {
    try { setList((await call({ mode: "gads_list" })).accounts || []); } catch (e) { setErr(e.message || String(e)); }
  };
  useEffect(() => { refresh(); }, []);
  const getScript = async (rotate) => {
    if (rotate && !window.confirm("Tạo khoá mới? Các script đang chạy sẽ ngừng đẩy số cho tới khi dán lại script mới.")) return;
    setErr("");
    try { const { key } = await call({ mode: "gads_key", rotate: !!rotate }); setScript(GADS_SCRIPT.replace("__INGEST_KEY__", key)); setCopied(false); }
    catch (e) { setErr(e.message || String(e)); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(script); setCopied(true); } catch { setErr("Không copy được — bôi đen ô script rồi Ctrl/Cmd+C"); } };
  const update = async (cid, patch) => { try { await call({ mode: "gads_update", cid, patch }); await refresh(); } catch (e) { setErr(e.message || String(e)); } };
  const remove = async (a) => {
    if (!window.confirm(`Xoá "${a.name}" và toàn bộ số liệu Google đã lưu của tài khoản này?`)) return;
    try { await call({ mode: "gads_delete", cid: a.customer_id }); await refresh(); } catch (e) { setErr(e.message || String(e)); }
  };
  const ago = (t) => { if (!t) return "chưa đồng bộ"; const m = Math.round((Date.now() - Date.parse(t)) / 60000); return m < 60 ? `${m} phút trước` : `${Math.round(m / 60)} giờ trước`; };
  return (
    <div className="mt-5 border-t border-slate-100 pt-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-extrabold">Google Ads</span>
        <span className="text-[11px] text-slate-400">script tự đẩy số mỗi giờ</span>
        <button onClick={refresh} className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" title="Tải lại"><RefreshCw size={14} /></button>
      </div>
      <div className="space-y-2">
        {list.map((a) => (
          <div key={a.customer_id} className={`flex flex-wrap items-center gap-2 rounded-xl border p-2.5 ${a.active ? "border-slate-100" : "border-dashed border-slate-200 opacity-60"}`}>
            <input defaultValue={a.name} onBlur={(e) => e.target.value !== a.name && update(a.customer_id, { name: e.target.value })} className={`${inputCls} w-44 font-bold`} />
            <GroupSelect value={a.grp} onChange={(v) => update(a.customer_id, { group: v })} />
            <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={!!a.active} onChange={(e) => update(a.customer_id, { active: e.target.checked })} />Đang dùng</label>
            <span className="text-[11px] text-slate-400">{String(a.customer_id).replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")} · {ago(a.last_sync)}</span>
            {a.policy_issues > 0 && <Badge tone="rose">{a.policy_issues} QC bị hạn chế</Badge>}
            <button onClick={() => remove(a)} className="ml-auto rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500"><Trash2 size={14} /></button>
          </div>
        ))}
        {!list.length && <div className="text-xs text-slate-400">Chưa có số liệu Google. Lấy script bên dưới, dán vào MCC 2BKIN và tài khoản VUADONGGOI.</div>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => getScript(false)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white">Lấy script Google Ads</button>
        {script && <button onClick={copy} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Đã copy" : "Copy script"}</button>}
        <button onClick={() => getScript(true)} className="rounded-lg px-3 py-1.5 text-xs font-bold text-slate-400 hover:bg-slate-100">Tạo khoá mới</button>
      </div>
      {script && (
        <>
          <textarea readOnly value={script} onFocus={(e) => e.target.select()} className="mt-2 h-28 w-full rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-[10px]" />
          <ol className="mt-1 list-decimal pl-5 text-[11px] text-slate-500">
            <li>Google Ads (MCC 2BKIN) → Công cụ → Hành động hàng loạt → <b>Tập lệnh</b> → nút <b>+</b> → xoá mẫu, dán script.</li>
            <li>Bấm <b>Uỷ quyền</b> → <b>Xem trước</b> (thấy log tên tài khoản là chạy được) → <b>Lưu</b>.</li>
            <li>Ở danh sách tập lệnh, cột Tần suất chọn <b>Hằng giờ</b>. Làm lại y hệt trong tài khoản VUADONGGOI (mkt.vuadonggoi).</li>
          </ol>
        </>
      )}
      {err && <div className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{err}</div>}
    </div>
  );
}

export default function AdsAccounts() {
  const [list, setList] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const [found, setFound] = useState(null); // [{id,name,group,services,brand,pick,...}]
  const [msg, setMsg] = useState("");
  const [newTok, setNewTok] = useState({}); // id -> token mới

  const refresh = async () => {
    setErr("");
    try { setList((await call({ mode: "config_list" })).accounts || []); } catch (e) { setErr(e.message || String(e)); }
  };
  useEffect(() => { refresh(); }, []);

  const discover = async () => {
    setBusy(true); setErr(""); setMsg(""); setFound(null);
    try {
      const d = await call({ mode: "config_discover", token: token.trim() });
      setFound((d.accounts || []).map((a) => ({ ...a, pick: !a.added && a.status === 1 })));
      if (!(d.accounts || []).length) setErr("Token hợp lệ nhưng chưa được gán tài khoản quảng cáo nào.");
    } catch (e) { setErr("Token lỗi: " + (e.message || String(e))); }
    setBusy(false);
  };
  const save = async () => {
    const accounts = (found || []).filter((a) => a.pick);
    if (!accounts.length) return;
    setBusy(true); setErr("");
    try {
      await call({ mode: "config_save", token: token.trim(), accounts: accounts.map((a, i) => ({ ...a, sort: list.length + i })) });
      setMsg(`Đã lưu ${accounts.length} tài khoản.`); setToken(""); setFound(null); await refresh();
    } catch (e) { setErr(e.message || String(e)); }
    setBusy(false);
  };
  const update = async (id, patch) => {
    setErr("");
    try { await call({ mode: "config_update", id, patch }); await refresh(); } catch (e) { setErr(e.message || String(e)); }
  };
  const remove = async (a) => {
    if (!window.confirm(`Xoá "${a.name}" khỏi module Quảng cáo? (Không ảnh hưởng tài khoản trên Facebook)`)) return;
    setErr("");
    try { await call({ mode: "config_delete", id: a.id }); await refresh(); } catch (e) { setErr(e.message || String(e)); }
  };
  const setF = (id, patch) => setFound((f) => f.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <Megaphone size={18} className="text-indigo-500" />
        <h3 className="text-base font-extrabold">Quảng cáo — tài khoản Meta & Google</h3>
        <button onClick={refresh} className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" title="Tải lại"><RefreshCw size={14} /></button>
      </div>

      {list.length === 0 && !err && <div className="mb-3 text-xs text-slate-400">Chưa có tài khoản nào. Dán token System User của 1 BM bên dưới để thêm.</div>}
      <div className="space-y-2">
        {list.map((a) => (
          <div key={a.id} className={`rounded-xl border p-2.5 ${a.active ? "border-slate-100" : "border-dashed border-slate-200 opacity-60"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <input defaultValue={a.name} onBlur={(e) => e.target.value !== a.name && update(a.id, { name: e.target.value })} className={`${inputCls} w-44 font-bold`} />
              <GroupSelect value={a.group} onChange={(v) => update(a.id, { group: v })} />
              <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={!!a.services} onChange={(e) => update(a.id, { services: e.target.checked })} />Gom theo dịch vụ TMV</label>
              <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={!!a.active} onChange={(e) => update(a.id, { active: e.target.checked })} />Đang dùng</label>
              <span className="text-[11px] text-slate-400">ID {a.id} · token {a.tokenTail || "—"}</span>
              <button onClick={() => remove(a)} className="ml-auto rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500"><Trash2 size={14} /></button>
            </div>
            <div className="mt-1.5 flex items-center gap-1.5">
              <KeyRound size={12} className="text-slate-300" />
              <input type="password" autoComplete="off" value={newTok[a.id] || ""} onChange={(e) => setNewTok({ ...newTok, [a.id]: e.target.value })} placeholder="Đổi token (dán token mới)" className={`${inputCls} flex-1`} />
              {newTok[a.id] && <button onClick={async () => { await update(a.id, { token: newTok[a.id] }); setNewTok({ ...newTok, [a.id]: "" }); }} className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-white">Lưu token</button>}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl bg-slate-50 p-3">
        <div className="mb-1.5 text-xs font-extrabold text-slate-700">Thêm tài khoản từ token (mỗi BM 1 token)</div>
        <div className="flex gap-2">
          <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Dán token System User (quyền ads_read)" className={`${inputCls} flex-1 bg-white`} />
          <button onClick={discover} disabled={busy || !token.trim()} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"><Search size={13} />Lấy danh sách TKQC</button>
        </div>
        {found && found.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {found.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white p-2 text-xs">
                <input type="checkbox" checked={!!a.pick} onChange={(e) => setF(a.id, { pick: e.target.checked })} />
                <input value={a.name} onChange={(e) => setF(a.id, { name: e.target.value })} className={`${inputCls} w-44 font-bold`} />
                <GroupSelect value={a.group} onChange={(v) => setF(a.id, { group: v })} />
                <label className="flex items-center gap-1 text-slate-500"><input type="checkbox" checked={!!a.services} onChange={(e) => setF(a.id, { services: e.target.checked })} />Dịch vụ TMV</label>
                <span className="text-[11px] text-slate-400">{a.metaName} · ID {a.id} · {a.currency}</span>
                {a.status !== 1 && <Badge tone="rose">Không hoạt động</Badge>}
                {a.added && <Badge tone="emerald">Đã có — lưu sẽ cập nhật token</Badge>}
              </div>
            ))}
            <button onClick={save} disabled={busy || !found.some((a) => a.pick)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"><Save size={13} />Lưu {found.filter((a) => a.pick).length} tài khoản</button>
          </div>
        )}
        <div className="mt-2 text-[11px] text-slate-400">Token chỉ gửi lên máy chủ và cất trong bảng riêng, app không hiển thị lại (chỉ 6 ký tự cuối).</div>
      </div>
      {msg && <div className="mt-2 text-xs font-semibold text-emerald-600">{msg}</div>}
      {err && <div className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{err}</div>}
      <GoogleSection />
    </Card>
  );
}
