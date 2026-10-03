import { useEffect, useState } from "react";
import { Megaphone, Trash2, KeyRound, Search, Save, RefreshCw } from "lucide-react";
import { Card, Badge } from "./ui.jsx";
import { supabase } from "../lib/supabase.js";

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
        <h3 className="text-base font-extrabold">Quảng cáo — tài khoản & token Meta</h3>
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
    </Card>
  );
}
