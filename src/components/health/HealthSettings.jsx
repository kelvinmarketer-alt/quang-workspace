import { useEffect, useState } from "react";
import { BellRing, Check, Info, Send, ChevronDown } from "lucide-react";
import { Card, SectionTitle } from "../ui.jsx";
import { useAuth } from "../../lib/auth.jsx";
import { useData } from "../../lib/store.jsx";
import { targets, waterGoal, GOALS, ACTIVITY, fastState } from "../../lib/health.js";
import { setCfg } from "../../lib/healthStore.js";
import { pushSupported, permission, enablePush, isSubscribed } from "../../lib/push.js";
import { supabase } from "../../lib/supabase.js";
import { num, inputCls, btnPrimary, btnGhost, Toggle, Field } from "./bits.jsx";

// Form chỉ số cơ thể — dùng ở Cài đặt và ở màn hình chào lần đầu
export function ProfileForm({ profile, onSaved, compact }) {
  const [f, setF] = useState(() => ({ sex: "m", birthYear: "", heightCm: "", weightKg: "", activity: 1.375, goal: "recomp", ...(profile || {}) }));
  const p = { ...f, birthYear: Math.round(num(f.birthYear)), heightCm: num(f.heightCm), weightKg: num(f.weightKg), activity: Number(f.activity) };
  const tg = targets(p);
  const save = () => { if (!tg) return; setCfg((c) => ({ ...c, profile: p })); onSaved?.(); };
  return (
    <div>
      <div className={`grid gap-3 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
        <Field label="Giới tính"><select id="sk-sex" value={f.sex} onChange={(e) => setF({ ...f, sex: e.target.value })} className={inputCls}><option value="m">Nam</option><option value="f">Nữ</option></select></Field>
        <Field label="Năm sinh"><input id="sk-year" inputMode="numeric" value={f.birthYear} onChange={(e) => setF({ ...f, birthYear: e.target.value })} className={inputCls} placeholder="1990" /></Field>
        <Field label="Chiều cao (cm)"><input id="sk-height" inputMode="decimal" value={f.heightCm} onChange={(e) => setF({ ...f, heightCm: e.target.value })} className={inputCls} placeholder="170" /></Field>
        <Field label="Cân nặng (kg)"><input id="sk-weight" inputMode="decimal" value={f.weightKg} onChange={(e) => setF({ ...f, weightKg: e.target.value })} className={inputCls} placeholder="72" /></Field>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Mức vận động"><select id="sk-activity" value={f.activity} onChange={(e) => setF({ ...f, activity: e.target.value })} className={inputCls}>{ACTIVITY.map((a) => <option key={a.k} value={a.k}>{a.label}</option>)}</select></Field>
        <Field label="Mục tiêu" hint={GOALS[f.goal]?.hint}><select id="sk-goal" value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} className={inputCls}>{Object.entries(GOALS).map(([k, g]) => <option key={k} value={k}>{g.label}</option>)}</select></Field>
      </div>
      {tg && (
        <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl bg-slate-50 p-3 text-center sm:grid-cols-4">
          <div><div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Cơ thể tiêu hao</div><div className="text-lg font-extrabold tabular-nums text-slate-900">{tg.tdee}</div><div className="text-[11.5px] text-slate-500">kcal mỗi ngày</div></div>
          <div><div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Nên ăn</div><div className="text-lg font-extrabold tabular-nums text-amber-600">{tg.kcal}</div><div className="text-[11.5px] text-slate-500">kcal mỗi ngày</div></div>
          <div><div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Đạm</div><div className="text-lg font-extrabold tabular-nums text-emerald-600">{tg.protein} g</div><div className="text-[11.5px] text-slate-500">mỗi ngày</div></div>
          <div><div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Nước</div><div className="text-lg font-extrabold tabular-nums text-sky-600">{(waterGoal({ profile: p }, null) / 1000).toLocaleString("vi-VN")} lít</div><div className="text-[11.5px] text-slate-500">mỗi ngày</div></div>
        </div>
      )}
      <button onClick={save} disabled={!tg} className={btnPrimary + " mt-3"}><Check size={16} /> {profile ? "Lưu chỉ số" : "Lưu và bắt đầu"}</button>
      {!tg && (f.birthYear || f.heightCm || f.weightKg) ? <span className="ml-3 text-[12.5px] text-slate-500">Nhập đủ năm sinh, chiều cao, cân nặng để tính.</span> : null}
    </div>
  );
}

function PushStatus() {
  const { user } = useAuth();
  const { setToast } = useData();
  const [on, setOn] = useState(null), [busy, setBusy] = useState(false);
  useEffect(() => { let alive = true; if (!pushSupported()) { setOn(false); return undefined; } isSubscribed().then((v) => alive && setOn(v)).catch(() => alive && setOn(false)); return () => { alive = false; }; }, []);
  if (on === null) return null;
  const test = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("qws-send-push", { body: { user_id: user.id, title: "💧 Uống nước nào (gửi thử)", body: "Lời nhắc thật sẽ trông như thế này. Uống xong bấm vào đây để ghi 1 ly.", url: "/suc-khoe?uong=250", tag: "sk-nuoc" } });
      if (error) throw error;
      setToast?.({ text: data?.sent ? `Đã gửi tới ${data.sent} máy. Chưa thấy trong 10 giây thì kiểm tra chế độ Không làm phiền.` : "Chưa có máy nào bật thông báo cho tài khoản này.", at: Date.now() });
    } catch { setToast?.({ text: "Chưa gửi được lời nhắc thử, kiểm tra mạng rồi thử lại.", at: Date.now() }); }
    setBusy(false);
  };
  if (on && permission() === "granted") return <div className="flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2"><p className="flex min-w-0 flex-1 items-center gap-2 text-[13px] font-semibold text-emerald-800"><Check size={15} /> Máy này đã bật thông báo, sẽ nhận được lời nhắc.</p><button onClick={test} disabled={busy} className={btnGhost + " py-1.5"}><Send size={14} /> {busy ? "Đang gửi…" : "Gửi thử lời nhắc"}</button></div>;
  const enable = async () => { setBusy(true); try { await enablePush(user.id); setOn(true); } catch (e) { setToast?.({ text: e.message || "Chưa bật được thông báo", at: Date.now() }); } setBusy(false); };
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 px-3 py-2.5">
      <BellRing size={18} className="shrink-0 text-amber-500" />
      <div className="min-w-0 flex-1 text-[13px] text-amber-800"><b>Máy này chưa bật thông báo</b> nên chưa nhận được lời nhắc.{!pushSupported() && " Trên iPhone: mở app bằng Safari, bấm Chia sẻ → Thêm vào Màn hình chính, rồi mở app từ màn hình chính và quay lại đây."}</div>
      {pushSupported() && <button onClick={enable} disabled={busy} className="rounded-xl bg-amber-500 px-3.5 py-2 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-50">{busy ? "…" : "Bật thông báo"}</button>}
    </div>
  );
}

const timeCls = inputCls + " tabular-nums";
// Nhóm cài đặt gập lại được: tiêu đề + tóm tắt giá trị đang đặt
function Fold({ title, sub, children, open }) {
  return (
    <details open={open} className="card group p-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 sm:p-5"><span className="min-w-0"><span className="block text-base font-extrabold tracking-tight text-slate-900">{title}</span><span className="block truncate text-[12.5px] text-slate-500">{sub}</span></span><ChevronDown size={18} className="shrink-0 text-slate-400 transition group-open:rotate-180" /></summary>
      <div className="px-4 pb-4 sm:px-5 sm:pb-5">{children}</div>
    </details>
  );
}
export default function HealthSettings({ cfg }) {
  const up = (path, v) => setCfg((c) => {
    const next = JSON.parse(JSON.stringify(c)); let o = next; const ks = path.split(".");
    for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]] = o[ks[i]] || {};
    o[ks[ks.length - 1]] = v; return next;
  });
  const fs = fastState(cfg.fast, Date.now());
  const auto = waterGoal({ ...cfg, water: { ...cfg.water, goalMl: 0 } }, null);
  return (
    <div className="space-y-4">
      <Card><SectionTitle>Chỉ số cơ thể & mục tiêu</SectionTitle><ProfileForm key={JSON.stringify(cfg.profile)} profile={cfg.profile} /></Card>

      <Card>
        <SectionTitle>Lời nhắc</SectionTitle>
        <div className="-mt-1 mb-4"><PushStatus /></div>
        <div className="space-y-5">
          <div>
            <Toggle id="sk-r-water" on={cfg.water.remind.on} onChange={(v) => up("water.remind.on", v)} label="Nhắc uống nước" hint="Chỉ nhắc trong khung giờ, vừa uống xong thì lùi lượt nhắc, uống đủ thì thôi" />
            {cfg.water.remind.on && (
              <div className="mt-2 grid grid-cols-3 gap-2">
                <Field label="Từ"><input type="time" value={cfg.water.remind.from} onChange={(e) => up("water.remind.from", e.target.value)} className={timeCls} /></Field>
                <Field label="Đến"><input type="time" value={cfg.water.remind.to} onChange={(e) => up("water.remind.to", e.target.value)} className={timeCls} /></Field>
                <Field label="Cách nhau"><select value={cfg.water.remind.every} onChange={(e) => up("water.remind.every", Number(e.target.value))} className={inputCls}>{[60, 90, 120, 150, 180].map((m) => <option key={m} value={m}>{m} phút</option>)}</select></Field>
              </div>
            )}
          </div>
          <div>
            <Toggle id="sk-r-gym" on={cfg.gym.remind.on} onChange={(v) => up("gym.remind.on", v)} label="Nhắc giờ tập" hint="Chỉ nhắc vào ngày có buổi trong lịch tập" />
            {cfg.gym.remind.on && <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-sm"><Field label="Giờ nhắc"><input type="time" value={cfg.gym.remind.time} onChange={(e) => up("gym.remind.time", e.target.value)} className={timeCls} /></Field><Field label="Nghỉ giữa hiệp"><select value={cfg.gym.restSec || 90} onChange={(e) => up("gym.restSec", Number(e.target.value))} className={inputCls}>{[45, 60, 90, 120, 150, 180].map((s) => <option key={s} value={s}>{s} giây</option>)}</select></Field></div>}
          </div>
          <div>
            <Toggle id="sk-r-weigh" on={cfg.weigh.remind} onChange={(v) => up("weigh.remind", v)} label="Nhắc cân buổi sáng" hint="Bỏ qua nếu hôm đó đã nhập số cân" />
            {cfg.weigh.remind && <div className="mt-2 sm:max-w-[180px]"><Field label="Giờ nhắc"><input type="time" value={cfg.weigh.time} onChange={(e) => up("weigh.time", e.target.value)} className={timeCls} /></Field></div>}
          </div>
          <Toggle id="sk-r-week" on={cfg.weekly.on} onChange={(v) => up("weekly.on", v)} label="Tổng kết tuần" hint="20 giờ tối Chủ nhật: số ngày uống đủ nước, số buổi tập, cân trung bình thay đổi bao nhiêu" />
        </div>
        <p className="mt-4 flex gap-2 text-[12px] text-slate-500"><Info size={14} className="mt-0.5 shrink-0" /> Máy chủ kiểm tra 5 phút một lần, nên lời nhắc có thể tới trễ tối đa 5 phút so với giờ đặt.</p>
      </Card>

      <Fold title="Nước" sub={`${cfg.water.goalMl || auto} ml mỗi ngày · ly ${cfg.water.glassMl} ml`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mục tiêu mỗi ngày (ml)" hint={`Để trống = tự tính theo cân nặng (${auto} ml, ngày có tập cộng 500 ml)`}><input inputMode="numeric" value={cfg.water.goalMl || ""} onChange={(e) => up("water.goalMl", Math.round(num(e.target.value)))} className={inputCls} placeholder={String(auto)} /></Field>
          <Field label="Một ly của anh"><select value={cfg.water.glassMl} onChange={(e) => up("water.glassMl", Number(e.target.value))} className={inputCls}>{[150, 200, 250, 300, 350, 500].map((m) => <option key={m} value={m}>{m} ml</option>)}</select></Field>
        </div>
      </Fold>

      <Fold title="Bước chân" sub={`mục tiêu ${(Number(cfg.stepsGoal) || 8000).toLocaleString("vi-VN")} bước mỗi ngày`}>
        <div className="sm:max-w-[220px]"><Field label="Mục tiêu mỗi ngày"><select value={Number(cfg.stepsGoal) || 8000} onChange={(e) => up("stepsGoal", Number(e.target.value))} className={inputCls}>{[5000, 6000, 8000, 10000, 12000].map((m) => <option key={m} value={m}>{m.toLocaleString("vi-VN")} bước</option>)}</select></Field></div>
        <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-slate-600">
          <b className="text-slate-900">Tự gửi số bước từ iPhone (làm một lần):</b>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5">
            <li>Mở app <b>Phím tắt</b> → tab Tự động hoá → dấu + → chọn "Thời gian trong ngày", đặt 21:00, hằng ngày, "Chạy ngay".</li>
            <li>Thêm tác vụ <b>Tìm mẫu sức khoẻ</b>: loại "Số bước", ngày bắt đầu "là hôm nay".</li>
            <li>Thêm tác vụ <b>Tính số liệu thống kê</b>: "Tổng" của kết quả trên.</li>
            <li>Thêm tác vụ <b>Mở URL</b>: <code className="rounded bg-white px-1">https://boss.2bkin.io.vn/suc-khoe?buoc=</code> rồi chèn biến "Số liệu thống kê" vào cuối.</li>
          </ol>
          <p className="mt-1">Lần đầu link mở bằng Safari, anh đăng nhập một lần ở đó. Chưa cài thì cứ nhập tay ở tab Hôm nay.</p>
        </div>
      </Fold>

      <Fold title="Nhịn ăn theo giờ" sub={cfg.fast.on ? `đang bật · ăn ${fs.start}–${fs.end}` : "đang tắt"}>
        <div className="space-y-3">
          <Toggle id="sk-fast" on={cfg.fast.on} onChange={(v) => up("fast.on", v)} label="Bật nhịn ăn theo giờ" hint="Chỉ ăn trong một khung giờ mỗi ngày, ngoài giờ đó chỉ uống nước, trà, cà phê đen" />
          {cfg.fast.on && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
                <Field label="Bắt đầu ăn lúc"><input type="time" value={cfg.fast.start} onChange={(e) => up("fast.start", e.target.value)} className={timeCls} /></Field>
                <Field label="Ăn trong"><select value={cfg.fast.hours} onChange={(e) => up("fast.hours", Number(e.target.value))} className={inputCls}>{[6, 8, 10, 12].map((h) => <option key={h} value={h}>{h} tiếng (nhịn {24 - h})</option>)}</select></Field>
              </div>
              <p className="text-[12.5px] text-slate-500">Giờ ăn: {fs.start} đến {fs.end}.</p>
              <Toggle id="sk-fast-r" on={cfg.fast.remind} onChange={(v) => up("fast.remind", v)} label="Báo khi tới giờ ăn và hết giờ ăn" />
            </>
          )}
        </div>
      </Fold>
      <p className="px-1 text-[12px] text-slate-400">Đây là công cụ ghi chép và nhắc nhở, không thay cho lời khuyên của bác sĩ. Có bệnh nền (huyết áp, tiểu đường, dạ dày…) nên hỏi bác sĩ trước khi ăn kiêng hoặc nhịn ăn.</p>
    </div>
  );
}
