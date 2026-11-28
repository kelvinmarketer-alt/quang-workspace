// Tách từ pages/CoinBot.jsx (28/11/2026) — chỉ di chuyển mã, logic giữ nguyên.
import { Brain, Loader2, Play, Settings2 } from "lucide-react";
import { Card } from "../ui.jsx";
import { FollowNote, SUGGEST, futuresHas, normCoin } from "./botShared.jsx";
import { MAX_COINS, MIN_RR, SETUPS, SW3D_DEFAULT, SW3D_MANAGE, SW3_DEFAULT, SW3_MANAGE, SW3_RULES, TFS, cfgOf } from "../../lib/paperBot.js";
import { fmtNum } from "../../lib/format.js";
import { useState } from "react";

export function CoinsEditor({ coins, onChange }) {
  const [add, setAdd] = useState(""), [edit, setEdit] = useState(null), [msg, setMsg] = useState(null), [busy, setBusy] = useState(false);
  const submit = async (raw, idx = null) => {
    setMsg(null);
    const c = normCoin(raw); if (!c) return;
    if (idx != null && coins[idx] === c) { setEdit(null); return; }
    if (coins.includes(c)) return setMsg(`${c}USDT đã có trong danh sách`);
    if (idx == null && coins.length >= MAX_COINS) return setMsg(`Tối đa ${MAX_COINS} cặp (nhiều cặp chạy chậm và dễ bị Binance giới hạn tần suất)`);
    setBusy(true); const ok = await futuresHas(c); setBusy(false);
    if (ok === null) return setMsg("Không kiểm tra được với Binance (mạng) — thử lại");
    if (!ok) return setMsg(`Binance Futures không có cặp ${c}USDT (gõ mã coin, vd SOL, 1000PEPE)`);
    onChange(idx == null ? [...coins, c] : coins.map((x, i) => (i === idx ? c : x)));
    setAdd(""); setEdit(null);
  };
  const remove = (c) => { if (coins.length <= 1) return setMsg("Cần ít nhất 1 cặp"); setMsg(null); onChange(coins.filter((x) => x !== c)); };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {coins.map((c, i) => edit?.i === i ? (
          <span key={c} className="flex items-center gap-1 rounded-lg border border-indigo-300 bg-white px-1.5 py-1">
            <input autoFocus value={edit.v} onChange={(e) => setEdit({ i, v: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") submit(edit.v, i); if (e.key === "Escape") setEdit(null); }} className="w-20 text-[12px] font-bold uppercase outline-none" />
            <button disabled={busy} onClick={() => submit(edit.v, i)} className="text-[11px] font-bold text-indigo-600">Lưu</button>
            <button onClick={() => setEdit(null)} className="text-[11px] text-slate-400">Huỷ</button>
          </span>
        ) : (
          <span key={c} className="flex items-center overflow-hidden rounded-lg bg-slate-900 text-[12px] font-bold text-white">
            <button onClick={() => setEdit({ i, v: c })} title="Sửa" className="px-2.5 py-1.5">{c}USDT</button>
            <button onClick={() => remove(c)} aria-label={`Xoá ${c}`} className="border-l border-white/20 px-2 py-1.5 text-white/70 hover:text-white">✕</button>
          </span>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <input value={add} onChange={(e) => setAdd(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(add); }} placeholder="Thêm cặp: gõ mã coin (vd SOL)" className="w-full min-w-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] uppercase placeholder:normal-case" />
        <button disabled={busy || !add.trim()} onClick={() => submit(add)} className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40">{busy ? <Loader2 size={13} className="animate-spin" /> : "Thêm"}</button>
      </div>
      {SUGGEST.some((x) => !coins.includes(x)) && <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-400">Gợi ý: {SUGGEST.filter((x) => !coins.includes(x)).map((x) => <button key={x} disabled={busy} onClick={() => submit(x)} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-bold text-slate-600">+{x}</button>)}</div>}
      {msg && <div className="mt-1.5 rounded-lg bg-rose-50 px-2 py-1 text-[11.5px] font-semibold text-rose-700">{msg}</div>}
      <div className="mt-1 text-[11px] leading-snug text-slate-400">Bấm tên cặp để sửa, ✕ để xoá. Bot thật dùng chung danh sách này. Cặp mới chưa được kiểm chứng — theo dõi Thống kê → Theo cặp. (Thử 270 ngày: thêm SOL + BNB nhiều lệnh hơn nhưng R giảm, sụt vốn sâu hơn.)</div>
    </div>
  );
}

// Khung giờ bot được chọn (27/10: thêm H1, H4 — bot thật quét mỗi nến M5 đóng nên khung lớn cũng bắt kịp)
export const EDIT_TFS = ["5m", "15m", "1h", "4h"];
// Luật SW3 (sếp duyệt 06/11): 5 tiêu chí vào lệnh + quản lý lệnh — hiện ở form phiên mới và nút "Xem luật"
export function Sw3Rules({ cfg }) {
  const c = cfg || SW3D_DEFAULT, d = c.sw?.entry === "lim";
  const rb = Object.entries(c.riskByCoin || {}).filter(([k]) => (c.coins || []).includes(k));
  return (
    <div className="space-y-2 text-[12px] leading-snug text-slate-600">
      <div className="font-extrabold text-slate-800">Vào lệnh khi nến H4 vừa đóng đạt ĐỦ 5 tiêu chí</div>
      <ol className="space-y-1.5">{SW3_RULES.map((r, i) => (
        <li key={r.k} className="flex gap-2"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-extrabold text-white">{i + 1}</span><span><b className="text-slate-800">{r.t}.</b> {r.d}</span></li>
      ))}</ol>
      <div className="pt-1 font-extrabold text-slate-800">{d ? "Điểm vào M15 + quản lý lệnh (phương án D)" : "Quản lý lệnh"}</div>
      <ul className="list-disc space-y-1 pl-5">{d ? <>
        {SW3D_MANAGE.slice(0, -1).map((m) => <li key={m}>{m}</li>)}
        <li>Rủi ro {fmtNum(c.riskPct, 2, 0)}% vốn/lệnh{rb.length ? `, riêng ${rb.map(([k]) => k).join(", ")} ${fmtNum(Math.min(c.riskPct, rb[0][1]), 2, 0)}%` : ""}; tối đa {c.maxOpen} lệnh mở, mỗi mã 1 lệnh.</li>
      </> : SW3_MANAGE.map((m) => <li key={m}>{m.replace("Rủi ro 1% vốn/lệnh, tối đa 4 lệnh mở", `Rủi ro ${fmtNum(c.riskPct, 2, 0)}% vốn/lệnh, tối đa ${c.maxOpen} lệnh mở`)}</li>)}</ul>
      <div className="rounded-lg bg-slate-50 p-2 text-[11.5px] text-slate-500">{d
        ? "Kiểm thử 2018–11/2026 trên 18 mã (đã trừ phí, funding thật): khoảng 18–19 lệnh/tháng, thắng khoảng 62%, lãi 48%/năm (2018–23) và 69%/năm (2024–26), sụt vốn lớn nhất khoảng 24%. 10 mã mới kém đều hơn 8 mã cũ nên chỉ ½ rủi ro. Kết quả quá khứ, không phải tư vấn đầu tư."
        : "Kiểm thử 2018–11/2026 trên 8 mã (đã trừ phí, funding thật): thắng khoảng 62%, khoảng 8–9 lệnh/tháng. Kiểm walk-forward 2020–2026: 7/7 năm lãi. Ở rủi ro 1%/lệnh, sụt vốn lớn nhất khi kiểm thử khoảng 21%, chạy thật có thể tới khoảng 30%. Kết quả quá khứ, không phải tư vấn đầu tư."}</div>
    </div>
  );
}
export function Sw3SetupForm({ initial, onStart, onCancel, onLegacy, follow }) {
  const [days, setDays] = useState(90); // 06/11 sếp: phiên mới phải có sẵn lệnh lịch sử các tháng gần nhất để đo
  const [v, setV] = useState(initial?.strategy === "sw3" && initial?.sw?.entry !== "lim" ? "sw3" : "D");
  const base = (x) => (x === "D" ? SW3D_DEFAULT : SW3_DEFAULT);
  const [c, setC] = useState(() => cfgOf({ cfg: { ...base(v), strategy: "sw3" } }));
  const pick = (x) => { setV(x); setC(cfgOf({ cfg: { ...base(x), strategy: "sw3" } })); };
  const field = (k, label, step = 1, suffix = "") => (
    <label className="block text-[12px]"><span className="mb-1 block font-semibold text-slate-500">{label}</span>
      <div className="flex items-center gap-1"><input type="number" step={step} value={c[k]} onChange={(e) => setC({ ...c, [k]: Number(e.target.value) })} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />{suffix && <span className="text-slate-400">{suffix}</span>}</div>
    </label>
  );
  const chip = (on) => `rounded-lg px-3 py-1.5 text-[12px] font-bold ${on ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`;
  const ok = c.coins.length && c.capital > 0 && c.riskPct > 0 && c.maxOpen > 0;
  return (
    <Card className="!p-4">
      <div className="mb-1 flex items-center gap-2 text-[15px] font-extrabold text-slate-800"><Settings2 size={17} className="text-indigo-500" /> Phiên demo · {v === "D" ? "phương án D (SW3 + lệnh chờ M15, 18 mã)" : "phương pháp SW3 (swing H4, 8 mã)"}</div>
      <div className="mb-3 text-[11.5px] text-slate-500">Bot thật (Testnet) chạy đúng luật này theo phiên Demo. <button onClick={onLegacy} className="font-bold text-indigo-600">Dùng bộ luật cũ v12</button></div>
      <FollowNote mode={follow} />
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1.5">{[["D", "Phương án D · ~19 lệnh/tháng"], ["sw3", "SW3 · 8 mã, vào ngay"]].map(([x, l]) => <button key={x} onClick={() => pick(x)} className={chip(v === x)}>{l}</button>)}</div>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3"><Sw3Rules cfg={c} /></div>
        <div><div className="mb-1 text-[12px] font-semibold text-slate-500">Bắt đầu</div><div className="flex flex-wrap gap-1.5">{[[0, "Từ bây giờ"], [30, "Chạy lại 30 ngày"], [90, "Chạy lại 90 ngày"], [180, "Chạy lại 180 ngày"]].map(([d, l]) => <button key={d} onClick={() => setDays(d)} className={chip(days === d)}>{l}</button>)}</div>
          <div className="mt-1 text-[11px] text-slate-400">Chạy lại quá khứ để có sẵn lịch sử lệnh các tháng gần nhất mà đo lường; lệnh mới từ lúc bắt đầu vẫn ghi tiếp vào cùng phiên.</div></div>
        <div><div className="mb-1 text-[12px] font-semibold text-slate-500">Cặp (Binance Futures, khung H4)</div><CoinsEditor coins={c.coins} onChange={(coins) => setC((o) => ({ ...o, coins }))} /></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{field("capital", "Vốn ảo", 100, "$")}{field("riskPct", "Rủi ro / lệnh", 0.25, "%")}{field("maxOpen", "Tối đa lệnh mở")}{field("maxLev", "Đòn bẩy tối đa", 1, "x")}</div>
        <div className="flex gap-2">
          {onCancel && <button onClick={onCancel} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600">Huỷ</button>}
          <button disabled={!ok} onClick={() => onStart({ startAt: Date.now() - days * 86400000, cfg: { strategy: "sw3", coins: c.coins, capital: c.capital, riskPct: c.riskPct, maxOpen: c.maxOpen, maxLev: c.maxLev, ...(v === "D" ? { sw: { entry: "lim" }, riskByCoin: c.riskByCoin } : {}) }, createdAt: Date.now() })} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-2.5 text-sm font-bold text-white disabled:opacity-40"><Play size={15} /> Bắt đầu chạy demo {v === "D" ? "phương án D" : "SW3"}</button>
        </div>
      </div>
    </Card>
  );
}
export function SetupForm(props) {
  const [legacy, setLegacy] = useState(false); // mặc định SW3 (phương pháp đang dùng từ 06/11)
  return legacy ? <LegacySetupForm {...props} onSw3={() => setLegacy(false)} /> : <Sw3SetupForm {...props} onLegacy={() => setLegacy(true)} />;
}
export function LegacySetupForm({ initial, onStart, onCancel, follow, onSw3 }) {
  const [days, setDays] = useState(90);
  const [c, setC] = useState(() => cfgOf({ cfg: initial }));
  const tog = (k, v) => setC((o) => ({ ...o, [k]: o[k].includes(v) ? o[k].filter((x) => x !== v) : [...o[k], v] }));
  const chip = (on) => `rounded-lg px-3 py-1.5 text-[12px] font-bold ${on ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`;
  const field = (k, label, step = 1, suffix = "", min) => (
    <label className="block text-[12px]"><span className="mb-1 block font-semibold text-slate-500">{label}</span>
      <div className="flex items-center gap-1"><input type="number" step={step} min={min} value={c[k]} onChange={(e) => setC({ ...c, [k]: Number(e.target.value) })} onBlur={() => { if (min != null && c[k] > 0 && c[k] < min) setC((o) => ({ ...o, [k]: min })); }} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />{suffix && <span className="text-slate-400">{suffix}</span>}</div>
    </label>
  );
  const ok = c.coins.length && c.tfs.length && c.setups.length && c.capital > 0 && c.riskPct > 0;
  return (
    <Card className="!p-4">
      <div className="mb-3 flex items-center gap-2 text-[15px] font-extrabold text-slate-800"><Settings2 size={17} className="text-indigo-500" /> Cấu hình phiên demo · bộ luật cũ v12 <button onClick={onSw3} className="ml-auto text-[12px] font-bold text-indigo-600">← Về SW3</button></div>
      <FollowNote mode={follow} />
      <div className="space-y-3">
        <div><div className="mb-1 text-[12px] font-semibold text-slate-500">Chạy lại từ quá khứ</div><div className="flex flex-wrap gap-1.5">{[30, 60, 90].map((d) => <button key={d} onClick={() => setDays(d)} className={chip(days === d)}>{d} ngày trước</button>)}</div></div>
        <div><div className="mb-1 text-[12px] font-semibold text-slate-500">Cặp (Binance Futures)</div><CoinsEditor coins={c.coins} onChange={(coins) => setC((o) => ({ ...o, coins }))} /></div>
        <div><div className="mb-1 text-[12px] font-semibold text-slate-500">Khung giờ</div><div className="flex flex-wrap gap-1.5">{EDIT_TFS.map((k) => <button key={k} onClick={() => tog("tfs", k)} className={chip(c.tfs.includes(k))}>{TFS[k].label}</button>)}</div></div>
        <div><div className="mb-1 text-[12px] font-semibold text-slate-500">Setup theo bộ kiến thức</div>
          <div className="space-y-1">{Object.entries(SETUPS).filter(([k]) => k !== "SW3").map(([k, s]) => (
            <button key={k} onClick={() => tog("setups", k)} className={`block w-full rounded-lg border px-3 py-2 text-left ${c.setups.includes(k) ? "border-indigo-300 bg-indigo-50/60" : "border-slate-200 opacity-60"}`}>
              <div className="text-[12.5px] font-bold text-slate-800">{c.setups.includes(k) ? "☑" : "☐"} {s.label}</div><div className="text-[11px] leading-snug text-slate-500">{s.desc}</div>
            </button>
          ))}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {field("capital", "Vốn ảo", 100, "$")}{field("riskPct", "Rủi ro / lệnh", 0.25, "%")}{field("maxOpen", "Tối đa lệnh mở")}{field("maxLev", "Đòn bẩy tối đa", 1, "x")}
          {field("dailyStopPct", "Dừng ngày khi lỗ", 0.5, "%")}{field("rr", `Chốt lời gốc (R:R ≥ ${MIN_RR})`, 0.5, "R", MIN_RR)}{field("beAtR", "Dời hoà vốn ở (0=tắt)", 0.5, "R")}{field("feePct", "Phí mỗi chiều", 0.01, "%")}
          {field("maxFeeR", "Bỏ lệnh khi phí > (0=tắt)", 0.05, "R")}{field("streakN", "Thua liền N lệnh → giảm rủi ro (0=tắt)", 1, "lệnh")}{field("streakRiskPct", "Rủi ro khi đang chuỗi thua", 0.25, "%")}
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
          <div className="text-[13px] font-extrabold text-emerald-800">Chỉ vào LỆNH CHỜ (limit) — đúng điểm đẹp mới vào, không thì bỏ</div>
          <div className="mt-1 text-[11.5px] leading-snug text-emerald-900/70">Đặt lệnh chờ ở giá đóng nến tín hiệu (phí maker 0,02%, không trượt). Chỉ khớp khi giá <b>xuyên qua</b> mức đặt trong số nến chờ; hết hạn không khớp → huỷ. Trước khi đặt còn kiểm tra: <b>không đuổi giá</b> (giá vào không xa EMA50 quá N ATR) và <b>SL ngoài vùng nhiễu</b> (≥ N ATR). Lúc thiết lập (chạy lại quá khứ) hai luật này nâng rõ tỉ lệ thắng — xem hiệu quả thật ở Thống kê → “Luật vào đẹp có hiệu quả không?”.</div>
          <div className="mt-2 text-[12px] font-semibold text-emerald-900">Vùng Key Volume (bộ kiến thức: chỉ vào TẠI vùng có lý do)</div>
          <div className="mt-1 flex flex-wrap gap-1.5">{[[1, "Nến volume lớn nhất 100 nến (khuyên dùng)"], [3, "Top 3 nến volume"], [0, "Tắt"]].map(([k, l]) => <button key={k} onClick={() => setC({ ...c, keyVolume: k })} className={chip(c.keyVolume === k)}>{l}</button>)}</div>
          <div className="mt-1 text-[11px] text-emerald-900/60">Giá vào phải nằm trong vùng nến Key Volume (nến volume ≥ 2,5× TB20 lớn nhất 100 nến). Đây là luật lọc mạnh nhất lúc thiết lập; hiệu quả thật xem ở Thống kê.</div>
          <div className="mt-2 text-[12px] font-semibold text-emerald-900">Xác nhận theo bộ kiến thức (VSA · Price Action · đa khung)</div>
          {[["sigVol", "Nến tín hiệu phải có volume > TB20 (VSA: có lực xác nhận)"], ["noEngulf", "Không vào ngay sau nến engulfing lớn (tránh đuổi giá sau nến mạnh)"], ["d1Bias", "Chỉ vào thuận xu hướng D1 (ít lệnh hơn, thắng cao hơn)"]].map(([k, l]) => <label key={k} className="mt-1 flex items-center gap-2 text-[12px] font-semibold text-emerald-900"><input type="checkbox" checked={!!c[k]} onChange={(e) => setC({ ...c, [k]: e.target.checked })} /> {l}</label>)}
          <div className="mt-1 text-[11px] text-emerald-900/60">Càng nhiều bộ lọc → ít lệnh hơn nhưng chọn lọc hơn (bật D1 thường chỉ vài lệnh mỗi tuần).</div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{field("maxExtAtr", "Không đuổi: xa EMA50 ≤ (0=tắt)", 0.5, "ATR")}{field("minSlAtr", "SL tối thiểu (0=tắt)", 0.5, "ATR")}{field("fillBars", "Chờ khớp tối đa", 1, "nến")}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{field("partialAtR", `Chốt 50% ở (0=tắt, ≥ ${MIN_RR})`, 0.5, "R", MIN_RR)}</div>
        <label className="flex items-center gap-2 text-[12.5px] font-semibold text-slate-700"><input type="checkbox" checked={c.htfFilter} onChange={(e) => setC({ ...c, htfFilter: e.target.checked })} /> Chỉ đánh thuận xu hướng khung lớn — khung lớn CHỈ dùng xác định bias: M5 theo H1, M15 theo H4 (EMA200)</label>
        <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-3">
          <label className="flex items-center gap-2 text-[13px] font-extrabold text-violet-800"><input type="checkbox" checked={c.adaptive} onChange={(e) => setC({ ...c, adaptive: e.target.checked })} /><Brain size={15} /> Tự tối ưu dần (walk-forward)</label>
          <div className="mt-1 text-[11.5px] leading-snug text-violet-900/70">Mỗi tín hiệu được thử song song 6 cấu hình (R:R 1.5/2/3 × có/không dời hoà vốn). Khi có tín hiệu mới, bot chỉ nhìn các lệnh <b>đã đóng trước đó</b> (không nhìn trước tương lai) → chọn cấu hình kỳ vọng cao nhất, kỳ vọng thấp hơn ngưỡng thì <b>bỏ tín hiệu</b>. Thiếu mẫu ở cặp+khung+setup thì học từ nhóm rộng hơn. Luôn chạy kèm “Luật gốc” để so sánh.</div>
          {c.adaptive && <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{field("warmupDays", "Học trước ngày bắt đầu", 5, "ngày")}{field("lookback", "Xét N lệnh gần nhất", 5)}{field("minSample", "Cần tối thiểu", 1, "mẫu")}{field("minExp", "Vào khi điểm ≥", 0.05, "R")}{field("confK", "Độ thận trọng (0=tắt)", 0.25, "× sai số")}</div>}
          {c.adaptive && <label className="mt-2 flex items-center gap-2 text-[12px] font-semibold text-violet-900"><input type="checkbox" checked={c.tfGate} onChange={(e) => setC({ ...c, tfGate: e.target.checked })} /> Nghỉ cả khung giờ khi khung đó đang lỗ (kỳ vọng gần đây âm)</label>}
          {c.adaptive && <label className="mt-1 flex items-center gap-2 text-[12px] font-semibold text-violet-900"><input type="checkbox" checked={c.learnLoss} onChange={(e) => setC({ ...c, learnLoss: e.target.checked })} /> Rút kinh nghiệm sau mỗi lệnh thua (tự kiểm chứng: bài học chỉ áp dụng khi chứng minh được là giúp)</label>}
        </div>
        <div className="rounded-lg bg-slate-50 p-2.5 text-[11.5px] leading-snug text-slate-500">
          <b className="text-slate-700">Đề xuất cho vốn 1.000$:</b> rủi ro <b>2%/lệnh</b> (≈20$, theo bạn chốt), tối đa <b>3 lệnh</b> cùng lúc, đòn bẩy ≤ <b>20x</b>, dừng ngày khi lỗ <b>6%</b> (= 3 lệnh thua), bỏ lệnh khi phí &gt; <b>0,35R</b> (SL quá sát), vào bằng <b>lệnh chờ</b>, không dời hoà vốn (dữ liệu cho thấy dời hoà vốn làm giảm lợi nhuận). Chạy lại 3 tháng gần nhất; bộ tối ưu + bài học từ lệnh thua TỰ KIỂM CHỨNG — chỉ được chặn lệnh khi chứng minh được là giúp. <b>R:R tối thiểu 1:{String(MIN_RR).replace(".", ",")}</b> — bộ tối ưu chỉ chọn trong R:R 1,5 / 2 / 3. Khối lượng tự tính = tiền rủi ro ÷ khoảng cách SL.
        </div>
        <div className="flex gap-2">
          {onCancel && <button onClick={onCancel} className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-bold text-slate-600">Huỷ</button>}
          <button disabled={!ok} onClick={() => onStart({ startAt: Date.now() - days * 86400000, cfg: c, createdAt: Date.now() })} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 py-2.5 text-sm font-bold text-white disabled:opacity-40"><Play size={15} /> Bắt đầu chạy demo</button>
        </div>
      </div>
    </Card>
  );
}

// WebSocket Binance Futures: nến đang chạy của mọi cặp × khung. Gom cập nhật 1 lần/giây; nến đóng → onClose().
