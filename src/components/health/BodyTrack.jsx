import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Ruler, Trash2, Lock } from "lucide-react";
import { Card, SectionTitle } from "../ui.jsx";
import { ask } from "../ConfirmDialog.jsx";
import { useAuth } from "../../lib/auth.jsx";
import { lastKeys, dm, vnNum } from "../../lib/health.js";
import { setDayField } from "../../lib/healthStore.js";
import { addPhoto, listPhotos, delPhoto, photosSupported } from "../../lib/healthPhotos.js";
import { num, inputCls, btnPrimary, btnGhost, LineChart } from "./bits.jsx";

// SỐ ĐO & ẢNH CƠ THỂ (20/11): giảm mỡ + tăng cơ thì cân hay đứng yên → vòng eo và ảnh mới cho thấy thay đổi.
// Vòng eo lưu cùng dữ liệu ngày (đồng bộ). Ảnh CHỈ nằm trong máy này (riêng tư, không lên máy chủ).
export default function BodyTrack({ days, todayKey }) {
  const { user } = useAuth();
  const [w, setW] = useState("");
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const fileRef = useRef(null);
  useEffect(() => { let alive = true; if (photosSupported() && user?.id) listPhotos(user.id).then((p) => alive && setPhotos(p)).catch(() => {}); return () => { alive = false; }; }, [user?.id]);

  const keys = useMemo(() => lastKeys(90).reverse(), [todayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const pts = keys.map((k, i) => ({ x: i, y: Number(days[k]?.waist) || null }));
  const have = pts.filter((p) => p.y);
  const first = have[0]?.y, lastV = have[have.length - 1]?.y;
  const save = () => { const v = num(w); if (v < 40 || v > 200) return; setDayField("waist", Math.round(v * 10) / 10, todayKey); setW(""); };
  const pick = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    setBusy(true); setErr("");
    try { const row = await addPhoto(f, todayKey, user.id); setPhotos((p) => [...p, row]); } catch (x) { setErr(x.message || "Không lưu được ảnh"); }
    setBusy(false);
  };
  const remove = async (p) => { if (!(await ask("Xoá ảnh này?\nẢnh chỉ lưu trong máy này nên xoá rồi không lấy lại được.", { ok: "Xoá ảnh", danger: true }))) return; await delPhoto(p.id); setPhotos((a) => a.filter((x) => x.id !== p.id)); };
  const a = photos[0], b = photos.length > 1 ? photos[photos.length - 1] : null;

  return (
    <Card>
      <SectionTitle>Vòng eo & ảnh cơ thể</SectionTitle>
      <p className="-mt-2 mb-3 text-[13px] text-slate-500">Mỗi tuần đo và chụp một lần, cùng một buổi sáng. Khi vừa giảm mỡ vừa tăng cơ, cân có thể đứng yên nhưng vòng eo nhỏ lại.</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="w-40 text-[12px] font-semibold text-slate-500">Vòng eo hôm nay (cm)
          <input id="sk-eo" inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} className={inputCls + " mt-0.5 text-center text-lg font-bold tabular-nums"} placeholder={days[todayKey]?.waist ? vnNum(days[todayKey].waist) : lastV ? vnNum(lastV) : "85"} />
        </label>
        <button onClick={save} disabled={!(num(w) >= 40 && num(w) <= 200)} className={btnPrimary}><Ruler size={16} /> Lưu vòng eo</button>
        {first && lastV && have.length > 1 && <span className="pb-2.5 text-[12.5px] text-slate-600">Từ {vnNum(first)} → <b className="text-slate-900">{vnNum(lastV)} cm</b> ({lastV - first > 0 ? "+" : ""}{vnNum(lastV - first)} cm)</span>}
      </div>
      <p className="mt-1 text-[12px] text-slate-400">Đo ngang rốn, thở ra bình thường, thước vừa chạm da không siết.</p>
      {have.length > 1 && <div className="mt-2"><LineChart count={keys.length} unit="cm" labels={[dm(keys[0]), "hôm nay"]} series={[{ color: "#8b5cf6", dots: true, points: pts }]} /></div>}

      <div className="mt-4 border-t border-slate-100 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-extrabold text-slate-900">Ảnh so sánh</div>
          {photosSupported() && <><input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} aria-label="Chọn ảnh cơ thể" /><button onClick={() => fileRef.current?.click()} disabled={busy} className={btnGhost}><Camera size={15} /> {busy ? "Đang lưu…" : "Thêm ảnh hôm nay"}</button></>}
        </div>
        <p className="mt-1 flex items-start gap-1.5 text-[12px] text-slate-500"><Lock size={13} className="mt-0.5 shrink-0" /> Ảnh chỉ lưu trong máy này, không gửi lên máy chủ. Đổi máy hoặc xoá dữ liệu trình duyệt thì ảnh không còn.</p>
        {err && <p className="mt-1 text-[12.5px] font-semibold text-rose-600">{err}</p>}
        {a && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[a, b].filter(Boolean).map((p, i) => (
              <figure key={p.id} className="overflow-hidden rounded-xl bg-slate-100">
                <img src={p.data} alt={`Ảnh cơ thể ngày ${dm(p.day)}`} className="aspect-[3/4] w-full object-cover" />
                <figcaption className="flex items-center justify-between px-2 py-1 text-[12px] font-bold text-slate-600"><span>{i === 0 && b ? "Đầu tiên" : b ? "Mới nhất" : "Ảnh đầu"} · {dm(p.day)}</span><button onClick={() => remove(p)} aria-label={`Xoá ảnh ngày ${dm(p.day)}`} className="rounded p-1 text-slate-400 hover:text-rose-600"><Trash2 size={13} /></button></figcaption>
              </figure>
            ))}
          </div>
        )}
        {photos.length > 2 && <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">{photos.slice(1, -1).map((p) => <figure key={p.id} className="w-16 shrink-0"><img src={p.data} alt={`Ảnh ngày ${dm(p.day)}`} className="aspect-[3/4] w-full rounded-lg object-cover" /><figcaption className="flex items-center justify-between text-[10.5px] text-slate-500">{dm(p.day)}<button onClick={() => remove(p)} aria-label={`Xoá ảnh ngày ${dm(p.day)}`} className="text-slate-400 hover:text-rose-600"><Trash2 size={11} /></button></figcaption></figure>)}</div>}
        {!a && <p className="mt-2 text-[13px] text-slate-500">Chưa có ảnh. Chụp thẳng trước gương, cùng chỗ, cùng ánh sáng để dễ so sánh.</p>}
      </div>
    </Card>
  );
}
