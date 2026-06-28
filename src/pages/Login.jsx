import { useState } from "react";
import { LineChart, Lock, Mail, Loader2 } from "lucide-react";
import { useAuth } from "../lib/auth.jsx";

export default function Login() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState("in"); // in | up
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const fn = mode === "in" ? signIn : signUp;
    const { data, error } = await fn(email.trim(), pw);
    setBusy(false);
    if (error) { setMsg({ t: "err", m: error.message }); return; }
    if (mode === "up" && !data.session) setMsg({ t: "ok", m: "Đã tạo tài khoản. Kiểm tra email xác nhận (nếu có) rồi đăng nhập." });
    // nếu có session → AuthProvider tự chuyển vào app
  };

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-50 via-indigo-50/40 to-sky-50 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-2xl shadow-indigo-500/10">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <img src="/logo.png" alt="2BKIN" className="h-20 w-20 object-contain" />
          <h1 className="text-xl font-extrabold text-slate-900">Quang Workspace</h1>
          <p className="text-sm text-slate-400">{mode === "in" ? "Đăng nhập để vào không gian làm việc" : "Tạo tài khoản mới"}</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-600"><Mail size={14} /> Email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400" placeholder="ban@email.com" />
          </label>
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-600"><Lock size={14} /> Mật khẩu</span>
            <input type="password" required minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400" placeholder="Tối thiểu 6 ký tự" />
          </label>

          {msg && <div className={`rounded-xl px-3 py-2 text-xs font-semibold ${msg.t === "err" ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}>{msg.m}</div>}

          <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 disabled:opacity-60">
            {busy && <Loader2 size={16} className="animate-spin" />} {mode === "in" ? "Đăng nhập" : "Tạo tài khoản"}
          </button>
        </form>

        <div className="mt-4 text-center text-xs text-slate-400">
          {mode === "in" ? (
            <>Chưa có tài khoản? <button onClick={() => { setMode("up"); setMsg(null); }} className="font-bold text-indigo-600">Đăng ký</button></>
          ) : (
            <>Đã có tài khoản? <button onClick={() => { setMode("in"); setMsg(null); }} className="font-bold text-indigo-600">Đăng nhập</button></>
          )}
        </div>
      </div>
    </div>
  );
}
