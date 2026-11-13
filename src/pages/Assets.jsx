import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, X, Pencil, Trash2, Wallet, Landmark, Gem, TrendingUp, Home, Car, HandCoins, CreditCard, Coins, RefreshCw, Loader2, PiggyBank } from "lucide-react";
import { Card, SectionTitle, MoneyInput, formatVND, formatShort } from "../components/ui.jsx";
import { ask, guardClose, markDirty } from "../components/ConfirmDialog.jsx";
import { useData } from "../lib/store.jsx";
import { useInvestTotal, useUsdVnd } from "../lib/coinShared.js";
import { fmtUsd } from "../lib/format.js";

// TÀI SẢN (13/11/2026, sếp: "báo cáo tổng quan tài sản, tôi nhập vào và cộng cả tiền đầu tư → ra tổng tài sản").
// Tổng tài sản ròng = các khoản nhập tay (trừ khoản nợ) + tiền đầu tư Coin tự cập nhật (ví Binance + coin nhập tay, theo giá hiện tại).
// Chỉ chủ. Dữ liệu ở state.assets (khoá mới → tài khoản phụ không đọc được qua máy chủ) + state.assetHistory (mỗi tháng 1 dòng).
export const ASSET_TYPES = [
  { k: "cash", l: "Tiền mặt", I: Wallet, c: "#10b981" },
  { k: "bank", l: "Ngân hàng / tiết kiệm", I: Landmark, c: "#0ea5e9" },
  { k: "gold", l: "Vàng / ngoại tệ", I: Gem, c: "#f59e0b" },
  { k: "invest", l: "Đầu tư khác (cổ phiếu, quỹ, Forex…)", I: TrendingUp, c: "#6366f1" },
  { k: "property", l: "Nhà đất", I: Home, c: "#8b5cf6" },
  { k: "vehicle", l: "Xe / tài sản khác", I: Car, c: "#64748b" },
  { k: "receivable", l: "Cho vay (người khác nợ mình)", I: HandCoins, c: "#14b8a6" },
  { k: "debt", l: "Khoản nợ (vay, thẻ tín dụng)", I: CreditCard, c: "#f43f5e" },
];
const TYPE = Object.fromEntries(ASSET_TYPES.map((t) => [t.k, t]));
const num = (v) => Number(String(v ?? "").replace(/[^\d]/g, "")) || 0;
const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";
const monthNow = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
const mLabel = (m) => { const [y, mo] = m.split("-"); return `T${Number(mo)}/${y.slice(2)}`; };
const ago = (t) => { if (!t) return ""; const d = Math.round((Date.now() - t) / 86400000); return d <= 0 ? "hôm nay" : d === 1 ? "hôm qua" : d < 30 ? `${d} ngày trước` : `${Math.round(d / 30)} tháng trước`; };

// Pure: cộng theo loại + tổng ròng (cho test)
export function assetSummary(assets, investVnd = 0) {
  const by = Object.fromEntries(ASSET_TYPES.map((t) => [t.k, 0]));
  for (const a of assets || []) { const k = TYPE[a.type] ? a.type : "vehicle"; by[k] += Number(a.amount) || 0; }
  const gross = ASSET_TYPES.filter((t) => t.k !== "debt").reduce((s, t) => s + by[t.k], 0) + investVnd;
  return { by, invest: investVnd, gross, debt: by.debt, net: gross - by.debt };
}

function AssetModal({ initial, onClose, onSave }) {
  const [f, setF] = useState(() => ({ name: "", type: "bank", amount: "", note: "", ...initial, amount: initial?.amount ? String(initial.amount) : "" }));
  const ok = f.name.trim() && num(f.amount) > 0;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-3 sm:p-4" onInputCapture={markDirty}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={guardClose(onClose)} />
      <div className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold">{initial?.id ? "Sửa khoản" : "Thêm khoản tài sản / nợ"}</h3>
          <button aria-label="Đóng" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Loại</span>
            <select id="asset-type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className={inputCls}>
              {ASSET_TYPES.map((t) => <option key={t.k} value={t.k}>{t.l}</option>)}
            </select>
          </label>
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Tên khoản</span>
            <input id="asset-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} placeholder={f.type === "debt" ? "VD: Vay mua xe, thẻ tín dụng VIB" : "VD: Tiết kiệm Techcombank, 2 cây vàng SJC"} autoFocus />
          </label>
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">{f.type === "debt" ? "Số tiền còn nợ (đồng)" : "Giá trị hiện tại (đồng)"}</span>
            <MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} className={inputCls} placeholder="100.000.000" />
          </label>
          <label className="block text-sm"><span className="mb-1 block font-semibold text-slate-600">Ghi chú</span>
            <input id="asset-note" value={f.note || ""} onChange={(e) => setF({ ...f, note: e.target.value })} className={inputCls} placeholder="VD: đáo hạn 03/2027, lãi 5,2%/năm" />
          </label>
        </div>
        <button disabled={!ok} onClick={() => { onSave({ name: f.name.trim(), type: f.type, amount: num(f.amount), note: (f.note || "").trim() }); onClose(); }}
          className="mt-4 w-full rounded-xl bg-gradient-to-r from-indigo-500 to-sky-500 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/30 disabled:opacity-50">
          {initial?.id ? "Lưu" : "Thêm"}
        </button>
      </div>
    </div>
  );
}

export default function Assets() {
  const { isOwner, assets = [], assetHistory = [], coins = [], addAsset, updateAsset, deleteAsset, snapAssets } = useData();
  const inv = useInvestTotal(!!isOwner, coins);
  const vnd = useUsdVnd();
  const investVnd = Math.round(inv.usd * vnd);
  const S = useMemo(() => assetSummary(assets, investVnd), [assets, investVnd]);
  const [modal, setModal] = useState(null);

  // Ghi mốc tháng này khi số đầu tư đã tải xong (ví lỗi vẫn ghi phần nhập tay + coin nhập tay)
  useEffect(() => {
    if (!isOwner || !inv.ready || inv.missing || (!assets.length && !investVnd)) return;
    snapAssets?.({ m: monthNow(), total: S.net, invest: investVnd, at: Date.now() });
  }, [isOwner, inv.ready, inv.missing, S.net, investVnd]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOwner) return <Card className="py-10 text-center text-sm text-slate-500">Trang Tài sản chỉ chủ workspace xem được.</Card>;

  const hist = [...assetHistory].sort((a, b) => a.m.localeCompare(b.m)).slice(-12);
  const prev = [...assetHistory].filter((h) => h.m < monthNow()).sort((a, b) => b.m.localeCompare(a.m))[0];
  const delta = prev ? S.net - prev.total : null;
  const hMax = Math.max(1, ...hist.map((h) => Math.abs(h.total)));
  // Cơ cấu (chỉ phần tài sản, không gồm nợ): Đầu tư Coin + từng loại nhập tay
  const parts = [{ k: "coin", l: "Đầu tư Coin (tự cập nhật)", v: investVnd, c: "#eab308", I: Coins }, ...ASSET_TYPES.filter((t) => t.k !== "debt").map((t) => ({ k: t.k, l: t.l, v: S.by[t.k], c: t.c, I: t.I }))].filter((p) => p.v > 0).sort((a, b) => b.v - a.v);
  const groups = ASSET_TYPES.map((t) => ({ ...t, items: assets.filter((a) => (TYPE[a.type] ? a.type : "vehicle") === t.k).sort((a, b) => (b.amount || 0) - (a.amount || 0)) })).filter((g) => g.items.length);

  return (
    <div className="space-y-4">
      {/* Tổng */}
      <div className="card overflow-hidden p-0">
        <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-4 text-white sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-indigo-200"><PiggyBank size={14} /> Tổng tài sản ròng</div>
              <div className="mt-1 break-words text-3xl font-extrabold tabular-nums sm:text-4xl">{formatVND(S.net)}</div>
              <div className="mt-1 text-[12px] text-indigo-200">
                Tài sản {formatShort(S.gross)} − nợ {formatShort(S.debt)}
                {delta != null && <> · <b className={delta >= 0 ? "text-emerald-300" : "text-rose-300"}>{delta >= 0 ? "+" : "−"}{formatShort(Math.abs(delta))}</b> so với {mLabel(prev.m)}</>}
              </div>
            </div>
            <button onClick={() => setModal({})} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-sm font-bold text-white hover:bg-white/20"><Plus size={15} /> Thêm khoản</button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[["Tiền & tiết kiệm", S.by.cash + S.by.bank], ["Đầu tư", investVnd + S.by.invest + S.by.gold], ["Nhà, xe, cho vay", S.by.property + S.by.vehicle + S.by.receivable], ["Khoản nợ", -S.debt]].map(([l, v]) => (
              <div key={l} className="min-w-0 rounded-xl bg-white/10 p-2.5">
                <div className="truncate text-[10.5px] font-bold uppercase text-indigo-200">{l}</div>
                <div className={`truncate text-base font-extrabold tabular-nums ${v < 0 ? "text-rose-300" : ""}`}>{v < 0 ? "−" + formatShort(-v) : formatShort(v)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Đầu tư tự cập nhật */}
        <Card>
          <SectionTitle action={<button onClick={() => inv.sync()} disabled={inv.syncing} className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-[12px] font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-60">{inv.syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Đồng bộ</button>}>Tiền đầu tư Coin</SectionTitle>
          {!inv.ready ? <div className="flex items-center gap-2 py-4 text-sm text-slate-400"><Loader2 size={15} className="animate-spin" /> Đang lấy ví Binance và giá…</div> : (
            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-2"><span className="text-sm font-semibold text-slate-600">Ví Binance (Spot + Earn + Futures)</span><span className="text-right"><b className="tabular-nums text-slate-800">{fmtUsd(inv.binance)}</b><span className="block text-[11px] text-slate-400">≈ {formatVND(Math.round(inv.binance * vnd))}</span></span></div>
              {inv.manual > 0 && <div className="flex items-baseline justify-between gap-2"><span className="text-sm font-semibold text-slate-600">Coin nhập tay (ngoài Binance)</span><span className="text-right"><b className="tabular-nums text-slate-800">{fmtUsd(inv.manual)}</b><span className="block text-[11px] text-slate-400">≈ {formatVND(Math.round(inv.manual * vnd))}</span></span></div>}
              <div className="flex items-baseline justify-between gap-2 border-t border-slate-100 pt-2"><span className="text-sm font-extrabold text-slate-700">Cộng vào tổng tài sản</span><b className="tabular-nums text-amber-600">{formatVND(investVnd)}</b></div>
              <div className="text-[11px] text-slate-400">Tỉ giá {Math.round(vnd).toLocaleString("vi-VN")}đ/USD · giá cập nhật mỗi phút{inv.at ? ` · ví đồng bộ ${new Date(inv.at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}` : ""}</div>
              {inv.err && <div className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12px] font-semibold text-amber-700">Chưa đọc được ví Binance ({inv.err}) — đang tính phần coin nhập tay.</div>}
              {inv.missing > 0 && <div className="text-[11px] font-semibold text-amber-600">{inv.missing} mã chưa có giá — chưa cộng.</div>}
              <Link to="/coin?tab=invest" className="inline-block text-[12px] font-bold text-indigo-600 hover:underline">Xem chi tiết danh mục coin →</Link>
            </div>
          )}
        </Card>

        {/* Cơ cấu */}
        <Card>
          <SectionTitle>Cơ cấu tài sản</SectionTitle>
          {parts.length === 0 ? <div className="py-4 text-sm text-slate-400">Chưa có khoản nào. Bấm "Thêm khoản" để nhập tiền mặt, tài khoản ngân hàng, vàng, nhà đất…</div> : (
            <div className="space-y-2.5">
              <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">{parts.map((p) => <span key={p.k} style={{ width: `${(p.v / S.gross) * 100}%`, background: p.c }} title={p.l} />)}</div>
              {parts.map((p) => (
                <div key={p.k} className="flex items-center gap-2 text-sm">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white" style={{ background: p.c }}><p.I size={14} /></span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{p.l}</span>
                  <span className="shrink-0 tabular-nums font-bold text-slate-800">{formatShort(p.v)}</span>
                  <span className="w-11 shrink-0 text-right text-[12px] tabular-nums text-slate-400">{Math.round((p.v / S.gross) * 100)}%</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Danh sách khoản nhập tay */}
      <Card>
        <SectionTitle action={<button onClick={() => setModal({})} className="flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 text-[12px] font-bold text-indigo-600 hover:bg-indigo-100"><Plus size={13} /> Thêm</button>}>Các khoản đã nhập</SectionTitle>
        {groups.length === 0 && <div className="py-3 text-sm text-slate-400">Chưa nhập khoản nào. Tiền đầu tư Coin đã tự cộng ở trên.</div>}
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.k}>
              <div className="mb-1.5 flex items-center gap-2 text-[12px] font-extrabold uppercase text-slate-500"><g.I size={14} style={{ color: g.c }} /> {g.l}<span className="ml-auto tabular-nums" style={{ color: g.k === "debt" ? "#e11d48" : undefined }}>{g.k === "debt" ? "−" : ""}{formatShort(S.by[g.k])}</span></div>
              <div className="divide-y divide-slate-50 rounded-xl border border-slate-100">
                {g.items.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-slate-800">{a.name}</div>
                      <div className="truncate text-[11px] text-slate-400">{[a.note, a.updatedAt ? `cập nhật ${ago(a.updatedAt)}` : ""].filter(Boolean).join(" · ")}</div>
                    </div>
                    <div className={`shrink-0 text-right text-sm font-extrabold tabular-nums ${g.k === "debt" ? "text-rose-600" : "text-slate-800"}`}>{g.k === "debt" ? "−" : ""}{formatShort(a.amount)}</div>
                    <button aria-label="Sửa" title="Sửa" onClick={() => setModal(a)} className="shrink-0 rounded-lg p-2 text-slate-300 hover:text-indigo-600 sm:p-1.5"><Pencil size={14} /></button>
                    <button aria-label="Xoá" title="Xoá" onClick={async () => { if (await ask(`Xoá khoản "${a.name}"?`)) deleteAsset(a.id); }} className="shrink-0 rounded-lg p-2 text-slate-300 hover:text-rose-600 sm:p-1.5"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Theo tháng */}
      {hist.length > 0 && (
        <Card>
          <SectionTitle action={<span className="text-xs font-bold text-slate-400">ghi mỗi lần mở trang, 1 mốc/tháng</span>}>Tài sản ròng theo tháng</SectionTitle>
          <div className="flex h-40 items-end gap-1.5 overflow-x-auto pb-1">
            {hist.map((h) => (
              <div key={h.m} className="flex min-w-[2.6rem] flex-1 flex-col items-center gap-1">
                <span className="text-[10px] font-bold tabular-nums text-slate-500">{formatShort(h.total).replace(" tr", "tr")}</span>
                <span className="w-full rounded-t-md bg-gradient-to-t from-indigo-500 to-sky-400" style={{ height: `${Math.max(4, (Math.abs(h.total) / hMax) * 110)}px` }} title={`${mLabel(h.m)}: ${formatVND(h.total)} (đầu tư ${formatVND(h.invest || 0)})`} />
                <span className="text-[10px] font-semibold text-slate-400">{mLabel(h.m)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      <p className="px-1 text-[11px] leading-relaxed text-slate-400">Giá trị nhà đất, xe, vàng là số anh tự nhập — nhớ sửa khi giá thay đổi. Tiền đầu tư Coin tính theo giá Binance lúc mở trang. Quỹ trong Kế toán là phần chia lợi nhuận (nằm sẵn trong tài khoản ngân hàng) nên không cộng thêm để tránh tính trùng.</p>

      {modal && <AssetModal initial={modal.id ? modal : null} onClose={() => setModal(null)} onSave={(v) => (modal.id ? updateAsset(modal.id, v) : addAsset(v))} />}
    </div>
  );
}
