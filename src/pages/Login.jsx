import { useState } from "react";
import { LineChart, Lock, Mail, Loader2 } from "lucide-react";
import { useAuth } from "../lib/auth.jsx";
import { supabase } from "../lib/supabase.js";

// Lỗi Supabase (tiếng Anh) → câu tiếng Việt dễ hiểu
function viErr(error) {
  const m = String(error?.message || error || "");
  if (/invalid login credentials/i.test(m)) return "Sai email hoặc mật khẩu";
  if (/email not confirmed/i.test(m)) return "Email chưa được xác nhận — mở hộp thư, bấm link xác nhận rồi đăng nhập lại";
  if (/already registered|already exists/i.test(m)) return "Email này đã có tài khoản — chuyển sang Đăng nhập";
  if (/rate limit|too many|security purposes|429/i.test(m) || error?.status === 429) return "Thử quá nhiều lần — đợi vài phút rồi thử lại";
  if (/password should be|weak password|at least 6/i.test(m)) return "Mật khẩu quá yếu — tối thiểu 6 ký tự";
  if (/invalid email|unable to validate email/i.test(m)) return "Email không hợp lệ";
  if (/signups? not allowed|signup is disabled/i.test(m)) return "Đăng ký đang bị tắt — nhờ chủ workspace tạo tài khoản";
  if (/failed to fetch|network|load failed/i.test(m) || (typeof navigator !== "undefined" && navigator.onLine === false)) return "Không kết nối được máy chủ — kiểm tra mạng rồi thử lại";
  return m || "Có lỗi xảy ra, thử lại";
}

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
    let data, error;
    try { ({ data, error } = await fn(email.trim(), pw)); } catch (err) { error = err; }
    setBusy(false);
    if (error) { setMsg({ t: "err", m: viErr(error) }); return; }
    if (mode === "up" && !data?.session) setMsg({ t: "ok", m: "Đã tạo tài khoản. Kiểm tra email xác nhận (nếu có) rồi đăng nhập." });
    // nếu có session → AuthProvider tự chuyển vào app
  };

  // Quên mật khẩu: gửi email đặt lại (cần nhập email trước)
  const forgot = async () => {
    const em = email.trim();
    if (!em) { setMsg({ t: "err", m: "Nhập email ở ô trên trước, rồi bấm \"Quên mật khẩu?\"" }); return; }
    setBusy(true); setMsg(null);
    let error;
    try { ({ error } = await supabase.auth.resetPasswordForEmail(em, { redirectTo: window.location.origin })); } catch (err) { error = err; }
    setBusy(false);
    if (error) { setMsg({ t: "err", m: viErr(error) }); return; }
    setMsg({ t: "ok", m: `Đã gửi email đặt lại mật khẩu tới ${em}. Mở link trong email để vào app, rồi đổi mật khẩu ở Cài đặt.` });
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
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400" placeholder="ban@email.com" />
          </label>
          <label className="block">
            <span className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-600"><Lock size={14} /> Mật khẩu</span>
            <input type="password" required minLength={6} autoComplete={mode === "in" ? "current-password" : "new-password"} value={pw} onChange={(e) => setPw(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400" placeholder="Tối thiểu 6 ký tự" />
          </label>
          {mode === "in" && (
            <div className="-mt-1 text-right">
              <button type="button" onClick={forgot} disabled={busy} className="text-xs font-bold text-indigo-600 hover:underline disabled:opacity-60">Quên mật khẩu?</button>
            </div>
          )}

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
