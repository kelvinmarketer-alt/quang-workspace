// Tách từ pages/CoinMarket.jsx (28/11/2026) — chỉ di chuyển mã, logic giữ nguyên.
import { AlertTriangle, Bell, ChevronDown, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { Card } from "../ui.jsx";
import { MARKETS } from "../../lib/ta.js";
import { ask } from "../ConfirmDialog.jsx";
import { createPortal } from "react-dom";
import { dt, parseNum, pct, sPct } from "./marketUtil.jsx";
import { isSubscribed } from "../../lib/push.js";
import { mergeCmd } from "../../lib/coinShared.js";
import { px } from "../CoinCharts.jsx";
import { supabase } from "../../lib/supabase.js";
import { useEffect, useRef, useState } from "react";

export function usePriceAlerts(active) {
  const [alerts, setAlerts] = useState(null);
  const [err, setErr] = useState(""), [missing, setMissing] = useState(false), [busy, setBusy] = useState(false);
  const readCmd = async () => {
    const { data, error } = await supabase.from("qws_live_bot").select("data").eq("id", "command").maybeSingle();
    if (error) { if (/qws_live_bot|relation|does not exist|schema cache/i.test(error.message)) setMissing(true); throw error; }
    setMissing(false);
    return data?.data || {};
  };
  const load = async () => { try { const d = await readCmd(); setAlerts(Array.isArray(d.priceAlerts) ? d.priceAlerts : []); setErr(""); } catch (e) { setErr(e.message || String(e)); } };
  useEffect(() => {
    if (!active) return undefined;
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 120000); // xem cảnh báo nào máy chủ vừa báo
    return () => clearInterval(t);
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  const write = async (fn) => {
    setBusy(true); setErr("");
    try {
      let priceAlerts = [];
      const { error } = await mergeCmd((cur) => { priceAlerts = fn(Array.isArray(cur.priceAlerts) ? cur.priceAlerts : []); return { priceAlerts }; }, null, { stamp: false });
      if (error) throw error;
      setAlerts(priceAlerts);
      return true;
    } catch (e) { setErr(e.message || String(e)); return false; }
    finally { setBusy(false); }
  };
  const add = ({ symbol, market, op, price, note = "" }) => write((list) => [...list, { id: `pa_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, symbol, market, op, price, note: String(note).trim().slice(0, 120), createdAt: Date.now(), firedAt: null }]);
  return { alerts, err, setErr, missing, busy, load, write, add };
}

export function PriceAlerts({ store, pair, market, price, fx = false, className = "!p-3" }) {
  const { alerts, err, setErr, missing, busy, write } = store;
  const [op, setOp] = useState(">="), [opTouched, setOpTouched] = useState(false), [val, setVal] = useState(""), [note, setNote] = useState("");
  const [push, setPush] = useState(null);
  const prefilled = useRef("");
  useEffect(() => { // máy này đã bật thông báo đẩy chưa (serviceWorker.ready có thể treo nếu chưa đăng ký → chờ tối đa 3 giây)
    let off = false;
    Promise.race([isSubscribed(), new Promise((ok) => setTimeout(() => ok(null), 3000))]).then((v) => { if (!off) setPush(v); }, () => { if (!off) setPush(false); });
    return () => { off = true; };
  }, []);
  useEffect(() => { // đổi coin → điền sẵn giá hiện tại
    if (price && prefilled.current !== pair) { prefilled.current = pair; setVal(String(price)); setOp(">="); setOpTouched(false); }
  }, [pair, price]);
  const num = parseNum(val);
  useEffect(() => { if (!opTouched && num > 0 && price) setOp(num >= price ? ">=" : "<="); }, [num, price, opTouched]);
  const add = async () => {
    if (!(num > 0)) { setErr("Nhập giá hợp lệ"); return; }
    if (await store.add({ symbol: pair, market, op, price: num, note })) setNote("");
  };
  const del = async (a) => {
    if (await ask(`Xoá cảnh báo ${a.symbol} ${a.op === ">=" ? "≥" : "≤"} ${px(a.price)}?`, { ok: "Xoá", danger: true })) write((list) => list.filter((x) => x.id !== a.id));
  };
  const same = num > 0 && price && Math.abs(num - price) < 1e-9;
  const already = num > 0 && price && !same && (op === ">=" ? price >= num : price <= num);
  const sorted = (alerts || []).filter((a) => a && (a.market === "mt5") === fx).sort((a, b) => (!a.firedAt === !b.firedAt ? (b.createdAt || 0) - (a.createdAt || 0) : a.firedAt ? 1 : -1));
  const nActive = sorted.filter((a) => !a.firedAt).length;
  return (
    <Card className={className}>
      <div className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400"><Bell size={13} className="text-amber-500" /> Cảnh báo giá{alerts ? ` · ${nActive} đang chờ` : ""}</div>
      {missing ? (
        <div className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[12px] text-amber-800">Chưa có bảng <b>qws_live_bot</b> trên Supabase — xem hướng dẫn ở tab <b>Bot thật</b>.</div>
      ) : (<>
        <div className="mt-2 text-[11.5px] text-slate-500"><b className="text-slate-700">{pair}</b> · {MARKETS[market]?.label} · giá hiện tại <b className="text-slate-700">{px(price)}</b></div>
        <div className="mt-1.5 flex gap-1.5">
          <div className="flex shrink-0 rounded-lg bg-slate-100 p-0.5">
            {[">=", "<="].map((o) => <button key={o} onClick={() => { setOp(o); setOpTouched(true); }} className={`rounded-md px-2.5 py-1 text-[13px] font-extrabold ${op === o ? "bg-white shadow " + (o === ">=" ? "text-emerald-600" : "text-rose-600") : "text-slate-500"}`}>{o === ">=" ? "≥" : "≤"}</button>)}
          </div>
          <input value={val} onChange={(e) => { setVal(e.target.value); setErr(""); }} inputMode="decimal" placeholder="Giá" className="w-full min-w-0 rounded-lg border border-slate-200 px-2 py-1.5 font-mono text-[13px] outline-none focus:border-indigo-300" />
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="Ghi chú (tuỳ chọn)" className="w-full min-w-0 rounded-lg border border-slate-200 px-2 py-1.5 text-[12.5px] outline-none focus:border-indigo-300" />
          <button onClick={add} disabled={busy || !(num > 0)} className="flex shrink-0 items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40">{busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Thêm</button>
        </div>
        {num > 0 && price ? <div className={`mt-1 text-[11px] ${already ? "font-semibold text-amber-600" : "text-slate-400"}`}>{same ? "Đang điền giá hiện tại — sửa thành mức giá muốn được báo." : already ? "Giá hiện tại đã thoả điều kiện — sẽ báo ở lần kiểm tra tới." : `Báo khi ${pair.replace(/USDT$/, "")} ${op === ">=" ? "lên ≥" : "xuống ≤"} ${px(num)} (cách ${sPct(pct(num, price))}).`}</div> : null}
        {err && <div className="mt-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[12px] font-semibold text-rose-600">{err}</div>}
        {alerts == null ? (
          <div className="mt-2 flex items-center gap-1.5 text-[12px] text-slate-400"><Loader2 size={13} className="animate-spin" /> Đang tải…</div>
        ) : sorted.length > 0 && (
          <ul className="mt-2 divide-y divide-slate-100 border-t border-slate-100">
            {sorted.map((a) => (
              <li key={a.id} className={`flex items-center gap-2 py-1.5 ${a.firedAt ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-extrabold text-slate-800">{(a.symbol || "").replace(/USDT$/, "")} <span className={a.op === ">=" ? "text-emerald-600" : "text-rose-600"}>{a.op === ">=" ? "≥" : "≤"}</span> <span className="font-mono">{px(a.price)}</span> <span className="text-[10.5px] font-semibold text-slate-400">{MARKETS[a.market]?.label}</span></div>
                  {a.note && <div className="truncate text-[11px] text-slate-500">{a.note}</div>}
                </div>
                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${a.firedAt ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{a.firedAt ? `Đã báo ${dt(a.firedAt)}` : "Đang chờ"}</span>
                <button onClick={() => del(a)} disabled={busy} title="Xoá" className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"><Trash2 size={13} /></button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 text-[10.5px] leading-snug text-slate-400">
          Máy chủ kiểm tra <b>5 phút/lần</b> rồi gửi <b>thông báo đẩy</b> — cần bật ở Cài đặt → Thông báo đẩy.{fx ? " Giá lấy từ cầu nối MT5 (kể cả cú chạm trong nến M5 vừa qua); cầu nối tắt hoặc chợ đóng cửa thì không báo." : ""}{" "}
          {push === true ? <span className="font-semibold text-emerald-600">Máy này đã bật ✓</span> : push === false ? <span className="font-semibold text-amber-600">Máy này chưa bật.</span> : null}
        </div>
      </>)}
    </Card>
  );
}

// Dải trạng thái nguồn giá MT5 (chỉ ở thị trường Forex): cầu nối trên máy bàn còn gửi giá không
export function Mt5FeedBar({ feed }) {
  const { q, err, loaded, ts, online } = feed;
  const age = ts ? Math.round((Date.now() - ts) / 1000) : null;
  if (!loaded) return null;
  if (err && !q) return <div className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-[12px] font-semibold text-rose-700"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> Không đọc được dữ liệu MT5: {err}</div>;
  if (!q) return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] leading-snug text-amber-900">
      <div className="flex items-center gap-1.5 font-extrabold"><AlertTriangle size={14} /> Cầu nối giá MT5 chưa chạy</div>
      <div className="mt-1">Trên máy bàn Windows: mở MT5, rồi chạy <b>bridge\mt5_market.py</b> (hoặc bấm <b>cai-cau-noi-gia.bat</b> để tự chạy mỗi lần đăng nhập). Vài giây sau tab này có giá + nến. Hướng dẫn chi tiết: file <b>bridge/HUONG-DAN-GIA-MT5.md</b> trong repo quang-workspace.</div>
    </div>
  );
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-1.5 text-[12px] font-semibold ${online ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
      <span className="flex items-center gap-1.5 font-extrabold"><span className={`h-2 w-2 rounded-full ${online ? "animate-pulse bg-emerald-500" : "bg-amber-500"}`} />{online ? "MT5 đang gửi giá" : "MT5 mất liên lạc"}</span>
      <span>{age != null ? (age < 90 ? `cập nhật ${age} giây trước` : `lần cuối ${Math.round(age / 60)} phút trước`) : ""}</span>
      {!online && <span>Máy bàn / MT5 đang tắt — biểu đồ hiện dữ liệu lần cuối.</span>}
      {online && q.live === false && <span>Chợ đang đóng cửa (cuối tuần / ngoài giờ) — giá là phiên cuối.</span>}
      {online && q.live !== false && <span className="text-emerald-700/70">Khối lượng là tick volume (không phải khối lượng khớp thật) · không có mua/bán chủ động</span>}
    </div>
  );
}

// Nút chuông ở biểu đồ toàn màn hình (27/11): mở ô Cảnh báo giá (thêm / xem / xoá) mà không phải thoát ra
export function AlertPop({ store, pair, market, price, fx }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return;
    const off = (e) => { if (box.current && !box.current.contains(e.target) && !e.target.closest?.('[role="dialog"]')) setOpen(false); };
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, [open]);
  const n = (store.alerts || []).filter((a) => a && !a.firedAt && (a.market === "mt5") === fx).length;
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Cảnh báo giá" aria-label="Cảnh báo giá"
        className={`flex items-center gap-1 rounded-lg border p-1.5 text-[12px] font-bold ${open ? "border-amber-300 bg-amber-50 text-amber-600" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
        <Bell size={14} />{n > 0 && <span className="tabular-nums">{n}</span>}
      </button>
      {open && <div className="absolute right-0 top-full z-[95] mt-1 max-h-[75dvh] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-xl shadow-2xl"><PriceAlerts store={store} pair={pair} market={market} price={price} fx={fx} className="pop-solid !p-3" /></div>}
    </div>
  );
}

// Toàn màn hình: đưa khung biểu đồ ra thẳng <body> (27/11 — nằm trong trang thì thanh đầu trang / thanh bên có thể đè lên)
export function FullPortal({ on, children }) { return on && typeof document !== "undefined" ? createPortal(children, document.body) : children; }

// Chọn mã ngay trong biểu đồ toàn màn hình (27/11): bấm tên mã → ô tìm + danh sách theo dõi; gõ mã mới + Enter → kiểm tra sàn rồi chuyển
export function SymPicker({ sym, watch, fx, onPick, onSearch, busy, err }) {
  const [open, setOpen] = useState(false), [q, setQ] = useState("");
  const box = useRef(null);
  useEffect(() => {
    if (!open) return;
    const off = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, [open]);
  useEffect(() => { setOpen(false); }, [sym]); // gõ mã mới → kiểm tra sàn xong, đổi mã → đóng danh sách
  const k = q.trim().toUpperCase(), list = watch.filter((w) => !k || w.includes(k));
  const go = (w) => { onPick(w); setOpen(false); setQ(""); };
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="listbox" title="Đổi mã"
        className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[14px] font-extrabold text-slate-800 hover:border-indigo-300">
        {fx ? sym : `${sym}/USDT`}<ChevronDown size={14} className={`text-slate-400 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-[95] mt-1 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-2xl">
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5">
            <Search size={14} className="shrink-0 text-slate-400" />
            <input id="fs-sym-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { if (list.length === 1 && !watch.includes(k)) go(list[0]); else if (watch.includes(k)) go(k); else if (k) { onSearch(k); setQ(""); } } if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } }}
              placeholder={fx ? "Tìm hoặc gõ mã MT5 + Enter" : "Tìm hoặc gõ mã coin + Enter"} className="w-full bg-transparent text-[13px] uppercase outline-none placeholder:normal-case" />
            {busy && <Loader2 size={13} className="shrink-0 animate-spin text-slate-400" />}
          </div>
          {err && <div className="mt-1 text-[11.5px] font-semibold text-rose-600">{err}</div>}
          <div role="listbox" className="mt-1.5 grid max-h-[50vh] grid-cols-3 gap-1 overflow-y-auto">
            {list.map((w) => (
              <button key={w} role="option" aria-selected={w === sym} onClick={() => go(w)}
                className={`truncate rounded-md px-1.5 py-1.5 text-[12px] font-bold ${w === sym ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-amber-100"}`}>{w}</button>
            ))}
            {!list.length && k && <button onClick={() => { onSearch(k); setQ(""); }} className="col-span-3 rounded-md bg-indigo-50 px-2 py-1.5 text-left text-[12px] font-bold text-indigo-600">Mở mã {k} →</button>}
          </div>
        </div>
      )}
    </div>
  );
}
