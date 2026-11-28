import { Activity, AlertTriangle, Bell, Bot, Brain, ChevronDown, History, Info, Loader2, Play, Radio, RefreshCw, ShieldAlert, Square, Trash2 } from "lucide-react";
import { Badge, Card } from "../components/ui.jsx";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import BotSignalBoard from "../components/BotSignalBoard.jsx";
import InfoTip from "../components/InfoTip.jsx";
import { LEVELS, MIN_RR, TFS, cfgOf, finalize } from "../lib/paperBot.js";
import { MONTH_TARGET, demoCacheGet, demoCacheSet, monthLabel, monthOf, useUsdVnd, weakStreams } from "../lib/coinShared.js";
import PairReview from "../components/PairReview.jsx";
import PnlCalendar from "../components/PnlCalendar.jsx";
import { Term } from "../components/Term.jsx";
import { ask } from "../components/ConfirmDialog.jsx";
import { fmtNum, timeLeft } from "../lib/format.js";
import { outcomeOf, statsMoney } from "../lib/liveStats.js";
import { runSessionAsync } from "../lib/botRunner.js";
import { useData } from "../lib/store.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { viReason } from "../lib/glossary.js";
import { BotChart } from "../components/coinbot/BotChart.jsx";
import { CoinsEditor, EDIT_TFS, SetupForm, Sw3Rules } from "../components/coinbot/BotSetup.jsx";
import { FollowNote, Num, OpenCard, RulesLog, SignalFunnel, StatTable, Title, TradeWhy, ago, confirmLiveFollow, dt, f2, hm, pct, px, rr, setupName, side, tone, tpLbl, usd, useLive, useLiveFollow } from "../components/coinbot/botShared.jsx";

// Tab "Demo tự động": bot giao dịch GIẢ LẬP Futures theo bộ kiến thức — chạy từ ngày bắt đầu tới nay và tiếp tục theo
// từng nến mới cho tới khi chủ bấm Dừng. Phiên lưu ở settings.paperBot; kết quả tính lại từ nến Binance (luật cố định
// nên mở app lúc nào cũng ra đúng kết quả như bot chạy liên tục 24/7).
// Realtime: WebSocket Binance Futures (nến đang chạy) → lệnh mở nhảy lãi/lỗ từng giây, chạm SL/TP đóng ngay; nến đóng → bot xét tín hiệu mới.
// Tự tối ưu: walk-forward (paperBot.js) — chạy song song "Luật gốc" để so sánh.

// 25/11/2026 sếp chốt PHƯƠNG ÁN B+ cho Demo + bot thật (báo cáo ~/Desktop/Kiem-tra-chien-luoc-coin.html, kiểm 2019–2026):
// 38 mã · rủi ro 1,5% (20 mã mới 0,75%) · tối đa 15 lệnh · chốt 20% (thay 1/3) ở +0,75R · chỉ vào khi phá vỡ ≥ 0,5 ATR (thay 0,3).
const BP_COINS2 = ["FIL", "AAVE", "APT", "ARB", "OP", "INJ", "SUI", "ICP", "HBAR", "ALGO", "VET", "SAND", "AXS", "EGLD", "THETA", "GRT", "CRV", "LDO", "RUNE", "ZEC"];
const isBP = (c) => BP_COINS2.every((x) => c.coins.includes(x)) && c.sw?.brkAtr >= 0.5 && Math.abs((c.sw?.partFrac ?? 1 / 3) - 0.2) < 1e-9;
const bpCfg = (raw = {}) => { const b = cfgOf({ cfg: raw }); return { ...raw, coins: [...new Set([...b.coins, ...BP_COINS2])], riskPct: 1.5, riskByCoin: Object.fromEntries(BP_COINS2.map((c) => [c, 0.75])), maxOpen: 15, sw: { ...(raw.sw || {}), partFrac: 0.2, brkAtr: 0.5 } }; };

export default function CoinBot({ active: visible = true }) {
  const { settings = {}, setSettings, isOwner, perms = [], myEmail } = useData();
  const follow = useLiveFollow();
  // Nhật ký thay đổi luật (21/10): mỗi lần tắt/bật cặp, khung, sửa cặp, phiên mới, dừng → ghi ai đổi, lúc nào, kèm số liệu LÚC ĐỔI
  // để sau đối chiếu "sau khi đổi" tốt lên hay xấu đi. Giữ 100 dòng gần nhất (settings.paperBotLog).
  const saveWithLog = (paperBot, what, reason = "") => {
    let snap = null;
    try { snap = { n: all.n, winRate: all.winRate, avgR: all.avgR, eq: eqNow }; } catch { /* chưa có kết quả */ }
    const row = { at: Date.now(), by: myEmail || "", what, snap, ...(reason ? { reason: String(reason).slice(0, 200) } : {}) };
    setSettings({ paperBot, paperBotLog: [row, ...(Array.isArray(settings.paperBotLog) ? settings.paperBotLog : [])].slice(0, 100) });
  };
  const canView = isOwner || perms.includes("coinDemo"); // thành viên được cấp quyền: CHỈ XEM (không dừng / phiên mới / sửa cặp)
  const session = settings.paperBot || null;
  const [raw, setRaw] = useState(null);
  const [rawOld, setRawOld] = useState(null); // bản cũ: cùng phiên nhưng chưa có luật vào đẹp — để so sánh
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [config, setConfig] = useState(false);
  const [filter, setFilter] = useState("all");
  const [hStream, setHStream] = useState("all"); // lọc lịch sử theo cặp|khung
  const [hMonth, setHMonth] = useState("all"); // lọc lịch sử theo tháng (giờ VN)
  const histScroll = useRef(0);
  const [showN, setShowN] = useState(40);
  const [view, setView] = useState("auto");
  const [optAll, setOptAll] = useState(false);
  const [tab, setTab] = useState("chart");
  const [showRules, setShowRules] = useState(false), [editCoins, setEditCoins] = useState(null), [editTfs, setEditTfs] = useState([]);
  const tfName = (l) => l.map((x) => TFS[x]?.label || x).join(", ");
  // 14/11: sửa rủi ro & giới hạn ngay trên phiên đang chạy (giữ ngày bắt đầu) — Demo tính lại, bot thật "theo Demo" áp dụng ~5 phút
  const RISK_F = [["riskPct", "Rủi ro / lệnh", "%", 0.1, 5, 0.25], ["maxOpen", "Tối đa lệnh mở", "", 1, 20, 1], ["dailyStopPct", "Dừng ngày khi lỗ (0 = không dừng)", "%", 0, 20, 0.5], ["maxLev", "Đòn bẩy tối đa", "x", 1, 125, 1]];
  const [editRisk, setEditRisk] = useState(null);
  const saveRisk = async () => {
    const nv = Object.fromEntries(RISK_F.map(([k]) => [k, Number(editRisk[k])]));
    const bad = RISK_F.find(([k, , , lo, hi]) => !(nv[k] >= lo && nv[k] <= hi));
    if (bad) return setErr(`${bad[1]} phải trong khoảng ${bad[3]}–${bad[4]}`);
    nv.maxOpen = Math.round(nv.maxOpen); nv.maxLev = Math.round(nv.maxLev);
    const ch = RISK_F.filter(([k]) => Number(cfg[k]) !== nv[k]).map(([k, l, u]) => `${l.replace(/ \(.*\)/, "")}: ${cfg[k]}${u} → ${nv[k]}${u}`);
    // 22/11 sếp: mọi mã chạm SL thua bằng nhau → bỏ mức rủi ro riêng theo mã (rỗng = mọi mã dùng chung "Rủi ro / lệnh")
    const hadByCoin = Object.keys(cfg.riskByCoin || {}).length > 0;
    if (editRisk.same && hadByCoin) { nv.riskByCoin = {}; ch.push(`Mọi mã cùng rủi ro ${nv.riskPct}% (bỏ mức riêng ${Object.keys(cfg.riskByCoin).length} mã)`); }
    if (!ch.length) return setEditRisk(null);
    if (!(await confirmLiveFollow(session.cfg, { ...(session.cfg || {}), ...nv }))) return;
    const ans = await ask(`Lưu rủi ro & giới hạn?\n${ch.map((x) => "• " + x).join("\n")}\nDemo tính lại từ ${dt(session.startAt)} (giữ nguyên ngày bắt đầu); bot thật đang "theo Demo" áp dụng trong ~5 phút.`, { ok: "Lưu & chạy lại", input: "Lý do (không bắt buộc)…" });
    if (!ans) return;
    saveWithLog({ ...session, cfg: { ...(session.cfg || {}), ...nv }, createdAt: Date.now() }, `Rủi ro & giới hạn: ${ch.join(" · ")}`, ans.text);
    setEditRisk(null);
  };
  const saveCoins = async () => {
    if (!editCoins?.length || !editTfs.length) return;
    const added = editCoins.filter((x) => !cfg.coins.includes(x)), removed = cfg.coins.filter((x) => !editCoins.includes(x));
    const tfAdd = editTfs.filter((x) => !cfg.tfs.includes(x)), tfDel = cfg.tfs.filter((x) => !editTfs.includes(x));
    const tfs = EDIT_TFS.filter((x) => editTfs.includes(x));
    const ans = await ask(`Lưu: cặp ${editCoins.join(", ")} · khung ${tfName(tfs)}?${added.length ? `\nThêm cặp: ${added.join(", ")}` : ""}${removed.length ? `\nXoá cặp: ${removed.join(", ")}` : ""}${tfAdd.length ? `\nThêm khung: ${tfName(tfAdd)}` : ""}${tfDel.length ? `\nBỏ khung: ${tfName(tfDel)}` : ""}\nDemo chạy lại từ đầu phiên với cấu hình mới; bot thật áp dụng trong ~5 phút.`, { ok: "Lưu & chạy lại", input: "Lý do đổi (không bắt buộc)…" }); if (!ans) return;
    const what = [added.length || removed.length ? `Sửa cặp: ${editCoins.join(", ")}${added.length ? ` (thêm ${added.join(", ")})` : ""}${removed.length ? ` (bỏ ${removed.join(", ")})` : ""}` : "", tfAdd.length || tfDel.length ? `Khung: ${tfName(tfs)}${tfAdd.length ? ` (thêm ${tfName(tfAdd)})` : ""}${tfDel.length ? ` (bỏ ${tfName(tfDel)})` : ""}` : ""].filter(Boolean).join(" · ");
    saveWithLog({ ...session, cfg: { ...(session.cfg || {}), coins: editCoins, tfs, offStreams: (session.cfg?.offStreams || []).filter((k) => tfs.includes(k.split("|")[1])) }, createdAt: Date.now() }, what, ans.text);
    setEditCoins(null);
  };
  // Tắt 1 cặp từ bảng "nên giữ hay tắt" (cùng cơ chế Thêm/sửa cặp: Demo chạy lại, bot thật áp dụng ~5 phút)
  const removeCoin = async (c) => {
    const next = cfg.coins.filter((x) => x !== c), offNext = (cfg.offStreams || []).filter((k) => !k.startsWith(c + "|"));
    if (!next.length) return;
    const ans = await ask(`Tắt cặp ${c} khỏi bot?\nCòn lại: ${next.join(", ")}.\nDemo chạy lại từ đầu phiên với danh sách mới; bot thật áp dụng trong ~5 phút (lệnh ${c} đang mở trên sàn — nếu có — vẫn giữ SL/TP tới khi đóng). Bật lại được ở "Thêm/sửa cặp".`, { ok: `Tắt ${c}`, danger: true, input: "Lý do (không bắt buộc)…" }); if (!ans) return;
    saveWithLog({ ...session, cfg: { ...(session.cfg || {}), coins: next, offStreams: offNext }, createdAt: Date.now() }, `Tắt cặp ${c}`, ans.text);
  };
  // Tắt / bật RIÊNG 1 khung của 1 cặp (cfg.offStreams) — Demo chạy lại, bot thật áp dụng ~5 phút
  const toggleStream = async (c, tf) => {
    const key = `${c}|${tf}`, cur = cfg.offStreams || [], on = cur.includes(key);
    const next = on ? cur.filter((x) => x !== key) : [...cur, key];
    if (!on && cfg.coins.every((x) => cfg.tfs.every((t) => next.includes(`${x}|${t}`)))) return;
    const lbl = `${c} ${TFS[tf].label}`;
    const ans = await ask(on ? `Bật lại ${lbl}?\nDemo chạy lại từ đầu phiên; bot thật áp dụng trong ~5 phút.` : `Tắt riêng ${lbl}?\nBot không quét / không vào lệnh ở khung này nữa (các khung khác của ${c} vẫn chạy). Demo chạy lại từ đầu phiên; bot thật áp dụng trong ~5 phút. Bật lại được ngay tại bảng này.`, { ok: on ? `Bật ${lbl}` : `Tắt ${lbl}`, danger: !on, input: "Lý do (không bắt buộc)…" }); if (!ans) return;
    saveWithLog({ ...session, cfg: { ...(session.cfg || {}), offStreams: next }, createdAt: Date.now() }, `${on ? "Bật lại" : "Tắt khung"} ${lbl}`, ans.text);
  };
  const [focus, setFocus] = useState(null);
  const [sel, setSel] = useState({ coin: "BTC", tf: "15m" });
  const [toast, setToast] = useState(null);
  const running = useRef(false), lastRun = useRef(0), hits = useRef(new Map()), prevSt = useRef(null), debounce = useRef(null);
  const cfg = cfgOf(session);
  const toBP = async () => {
    const nc = bpCfg(session.cfg || {});
    if (!(await confirmLiveFollow(session.cfg, nc))) return;
    const ans = await ask(`Chuyển Demo + bot thật sang phương án B+?\n• 38 mã (thêm ${BP_COINS2.length} mã mới)\n• Rủi ro 1,5%/lệnh, ${BP_COINS2.length} mã mới 0,75%\n• Tối đa 15 lệnh mở\n• Chốt 20% thay 1/3 ở +0,75R\n• Chỉ vào khi phá vỡ ≥ 0,5 ATR\nDemo tính lại từ ${dt(session.startAt)} (giữ ngày bắt đầu); bot thật đang theo Demo áp dụng trong ~5 phút. Lần đầu tải nến 38 mã mất 2–3 phút.`, { ok: "Chuyển sang B+", input: "Lý do (không bắt buộc)…" });
    if (!ans) return;
    saveWithLog({ ...session, cfg: nc, createdAt: Date.now() }, "Chuyển sang phương án B+: 38 mã · rủi ro 1,5% (20 mã mới 0,75%) · tối đa 15 lệnh · chốt 20% · phá vỡ ≥ 0,5 ATR", ans.text);
  };
  const active = !!session && !session.stoppedAt && canView && visible; // tab ẩn → tắt giá realtime + tính lại (đỡ tốn pin)

  const sessRef = useRef(session); sessRef.current = session;
  const again = useRef(false);
  const run = async () => {
    if (!sessRef.current) return;
    if (running.current) { again.current = true; return; } // phiên đổi giữa chừng → chạy lại sau khi xong
    running.current = true; setErr("");
    const ss = sessRef.current, same = () => sessRef.current?.createdAt === ss.createdAt && sessRef.current?.stoppedAt === ss.stoppedAt;
    try {
      const r = await runSessionAsync(ss, (m) => setBusy(m));
      if (same()) { setRaw(r); lastRun.current = Date.now(); setRawOld(null); demoCacheSet(ss, r); }
    }
    catch (e) { setErr(e.message || String(e)); }
    running.current = false; setBusy("");
    if (again.current || !same()) { again.current = false; run(); }
  };
  const { live, shown, ver, status } = useLive(active, cfg.coins, cfg.tfs, () => { clearTimeout(debounce.current); debounce.current = setTimeout(run, 2500); });

  // Nâng phiên đang chạy lên v4 theo yêu cầu (20/10): chạy lại 3 tháng gần nhất, bỏ H4 (kiểm tra: bỏ H4 tốt hơn nhẹ)
  useEffect(() => {
    if (!isOwner || !session || session.stoppedAt || (session.cfg?.cfgVer || 1) >= 4) return;
    const c = cfgOf(session), tfs = c.tfs.filter((x) => x !== "4h");
    setSettings({ paperBot: { ...session, startAt: Date.now() - 90 * 86400000, createdAt: Date.now(), cfg: { ...c, tfs: tfs.length ? tfs : c.tfs } } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.createdAt]);
  useEffect(() => {
    setRaw(null); setRawOld(null); hits.current = new Map(); prevSt.current = null;
    if (!session) return;
    // Hiện NGAY kết quả lần trước (đúng phiên) trong lúc tính lại ngầm — không phải chờ tải 25 luồng nến
    const ss = session;
    demoCacheGet(ss).then((c) => { if (c && sessRef.current?.createdAt === ss.createdAt && sessRef.current?.stoppedAt === ss.stoppedAt) setRaw((cur) => cur || c); });
    run(); /* eslint-disable-next-line */
  }, [session?.createdAt, session?.stoppedAt]);
  // Bản cũ (chưa lọc vào đẹp) chỉ để so sánh → CHỈ tính khi mở tab Thống kê (đỡ tốn máy)
  const oldBusy = useRef(false);
  useEffect(() => {
    if (tab !== "stats" || !raw || rawOld || oldBusy.current || !session) return;
    const c0 = cfgOf(session); if (!(c0.maxExtAtr > 0 || c0.minSlAtr > 0 || c0.keyVolume > 0)) return;
    oldBusy.current = true;
    runSessionAsync({ ...session, cfg: { ...c0, maxExtAtr: 0, minSlAtr: 0, keyVolume: 0, sigVol: false, noEngulf: false, d1Bias: false } }).then(setRawOld).catch(() => {}).finally(() => { oldBusy.current = false; });
  }, [tab, raw, rawOld]); // eslint-disable-line react-hooks/exhaustive-deps
  const oldFin = useMemo(() => (rawOld ? finalize(rawOld, null) : null), [rawOld]);
  // Dự phòng khi mất WebSocket: mỗi phút xét nến mới (đang có realtime thì 5 phút/lần)
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => { if (!document.hidden && Date.now() - lastRun.current > (status === "live" ? 300000 : 55000)) run(); }, 60000);
    return () => clearInterval(t); /* eslint-disable-next-line */
  }, [active, status, session?.createdAt]);
  useEffect(() => () => clearTimeout(debounce.current), []);
  useEffect(() => { if (visible && session && Date.now() - lastRun.current > 60000) run();   }, [visible]); // mở lại tab → cập nhật ngay

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const res = useMemo(() => finalize(raw, active ? live.current : null, hits.current), [raw, ver, active]);
  const isBase = view === "base" || !cfg.adaptive;
  const P = res ? (isBase ? res.basePortfolio : res.portfolio) : null;
  const vnd = useUsdVnd();
  const list = useMemo(() => (res ? (isBase ? res.baseTrades : res.trades) : []), [res, isBase]);

  // Phát hiện mở/đóng lệnh mới (danh mục chính) → thông báo nổi
  useEffect(() => {
    if (!res) return;
    const rows = res.portfolio.trades.filter((t) => t.status !== "skip"), cur = new Map(rows.map((t) => [t.id, t.status]));
    if (prevSt.current) {
      const evs = [];
      for (const t of rows) {
        const was = prevSt.current.get(t.id);
        if (!was && t.status === "open") evs.push({ text: `Mở ${t.side === 1 ? "MUA" : "BÁN"} ${t.coin} ${TFS[t.tf].label} @ ${px(t.entry)} · cắt lỗ ${px(t.curSl)} · ${tpLbl(t)} ${px(t.tp)}`, ok: true });
        if (was === "open" && t.status === "done") evs.push({ text: `Đóng ${t.coin} ${TFS[t.tf].label} · ${viReason(t.reason)} ${rr(t.r)} (${usd(t.pnl)})`, ok: t.r >= 0 });
      }
      if (evs.length) { setToast({ ...evs[evs.length - 1], more: evs.length - 1, at: Date.now() }); try { navigator.vibrate?.(60); } catch { /* bỏ qua */ } }
    }
    prevSt.current = cur;
  }, [res]);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 9000); return () => clearTimeout(t); }, [toast]);

  const all = useMemo(() => statsMoney(list), [list]);
  const sAuto = useMemo(() => (res ? statsMoney(res.trades) : null), [res]), sBase = useMemo(() => (res ? statsMoney(res.baseTrades) : null), [res]), sRej = useMemo(() => (res ? statsMoney(res.rejected) : null), [res]);
  const by = (key, vals, label = (x) => x) => vals.map((v) => [label(v), statsMoney(list.filter((t) => t[key] === v))]);
  const curveA = useMemo(() => (res ? res.portfolio.curve.map((p) => ({ t: p.t, eq: Math.round(p.eq * 100) / 100 })) : []), [res]);
  const curveB = useMemo(() => (res ? res.basePortfolio.curve.map((p) => ({ t: p.t, eq: Math.round(p.eq * 100) / 100 })) : []), [res]);
  // mở biểu đồ đúng luồng của lệnh được chọn
  const showOnChart = (t) => { if (tab === "history") histScroll.current = window.scrollY; setSel({ coin: t.coin, tf: t.tf }); setFocus(t); setTab("chart"); try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* bỏ qua */ } };
  const backToHistory = () => { setTab("history"); setTimeout(() => { try { window.scrollTo({ top: histScroll.current }); } catch { /* bỏ qua */ } }, 60); };
  const selInit = useRef(false);
  useEffect(() => { // mặc định: luồng có lệnh gần nhất
    if (!res || selInit.current) return; selInit.current = true;
    const last = [...res.portfolio.trades].filter((t) => t.status !== "skip").sort((a, b) => b.entryAt - a.entryAt)[0], c0 = cfgOf(session);
    setSel(last ? { coin: last.coin, tf: last.tf } : { coin: c0.coins[0], tf: c0.tfs[c0.tfs.length - 1] });
  }, [res]); // eslint-disable-line react-hooks/exhaustive-deps
  const chartTrades = useMemo(() => (P ? P.trades.filter((x) => x.coin === sel.coin && x.tf === sel.tf && x.status !== "skip") : []), [P, sel]);
  const chartPending = useMemo(() => (res && active ? res.pending || [] : []).filter((x) => x.coin === sel.coin && x.tf === sel.tf), [res?.pending, active, sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const taken = useMemo(() => {
    if (!P) return [];
    const src = filter === "reject" ? res.rejected.map((t) => ({ ...t, status: "reject" })) : P.trades;
    return src.filter((t) => hStream === "all" || `${t.coin}|${t.tf}` === hStream || t.coin === hStream).filter((t) => hMonth === "all" || monthOf(t.entryAt) === hMonth).filter((t) => (filter === "all" ? t.status !== "skip" : filter === "open" ? t.status === "open" : filter === "skip" ? t.status === "skip" : filter === "reject" ? true : t.status === "done" && outcomeOf(t) === (filter === "win" ? 1 : -1))).sort((a, b) => b.entryAt - a.entryAt);
  }, [P, res, filter, hStream, hMonth]);
  // 13/11: lịch lãi/lỗ theo ngày đóng lệnh (kiểu Binance), tách theo setup
  const calItems = useMemo(() => (P ? P.trades.filter((t) => t.status === "done" && t.exitAt != null && t.pnl != null).map((t) => ({ t: t.exitAt, v: t.pnl, src: t.setup, label: `${t.side === 1 ? "LONG" : "SHORT"} ${t.coin} ${TFS[t.tf]?.label || t.tf} · ${setupName(t.setup)}` })) : []), [P]);
  const calSources = useMemo(() => [...new Set(calItems.map((x) => x.src))].map((k) => ({ k, l: setupName(k) })), [calItems]);
  // Tổng theo tháng (lệnh đã vào, theo cặp đang lọc): số lệnh · thắng · lãi/lỗ $
  const months = useMemo(() => {
    if (!P) return [];
    const m = new Map();
    for (const t of P.trades) {
      if (t.status === "skip" || !(hStream === "all" || `${t.coin}|${t.tf}` === hStream || t.coin === hStream)) continue;
      const k = monthOf(t.entryAt), x = m.get(k) || { k, n: 0, win: 0, done: 0, pnl: 0 };
      x.n++; if (t.status === "done") { x.done++; if (outcomeOf(t) === 1) x.win++; x.pnl += t.pnl || 0; }
      m.set(k, x);
    }
    return [...m.values()].sort((a, b) => (a.k < b.k ? 1 : -1));
  }, [P, hStream]);
  // Xuất lịch sử đang lọc ra CSV (mở được bằng Excel, giữ tiếng Việt)
  const exportCsv = () => {
    const head = ["Vào lúc", "Cặp", "Khung", "Hướng", "Setup", "Giá vào", "SL", "TP", "Kết thúc", "Giá thoát", "Lúc thoát", "R", "Lãi/lỗ $", "Trạng thái"];
    const iso = (t) => (t ? new Date(t + 7 * 3600000).toISOString().slice(0, 16).replace("T", " ") : "");
    const rows = taken.map((t) => [iso(t.entryAt), t.coin, TFS[t.tf].label, t.side === 1 ? "LONG" : "SHORT", setupName(t.setup), t.entry, t.sl, t.tp, t.reason || "", t.exit ?? "", iso(t.exitAt), (t.r ?? t.uR)?.toFixed(2) ?? "", t.pnl != null ? t.pnl.toFixed(2) : "", t.status]);
    const csv = "\ufeff" + [head, ...rows].map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = `lich-su-lenh-demo-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const feed = useMemo(() => {
    if (!P) return [];
    const ev = [];
    for (const t of P.trades) { if (t.status === "skip") continue; ev.push({ t: t.entryAt, kind: "open", tr: t }); if (t.exitAt) ev.push({ t: t.exitAt, kind: "close", tr: t }); }
    return ev.sort((a, b) => b.t - a.t).slice(0, 12);
  }, [P]);

  if (!canView) return <Card><div className="text-sm text-slate-500">Bạn chưa được cấp quyền xem Demo tự động.</div></Card>;
  if (!isOwner && !session) return <Card><div className="py-8 text-center text-sm text-slate-500">Chủ workspace chưa tạo phiên Demo.</div></Card>;
  // 06/11: xoá lịch sử Demo (sếp yêu cầu, làm lại phương pháp mới) — giữ 1 bản dự phòng ẩn settings.paperBotArchive để khôi phục nếu bấm nhầm
  const archive = isOwner && !session ? settings.paperBotArchive : null;
  const restore = async () => { if (await ask(`Khôi phục phiên Demo đã xoá lúc ${dt(archive.removedAt)}?`, { ok: "Khôi phục" })) { saveWithLog(archive.session, "Khôi phục lịch sử Demo"); setSettings({ paperBotArchive: null }); } };
  if (!session || (config && isOwner)) return <>{archive?.session && <Card className="!p-3 mb-3"><div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-500"><History size={14} className="text-slate-400" /> Đã xoá lịch sử Demo lúc <b className="text-slate-700">{dt(archive.removedAt)}</b> — app còn giữ 1 bản dự phòng. <button onClick={restore} className="font-bold text-indigo-600">Khôi phục</button></div></Card>}<SetupForm initial={session?.cfg} follow={follow} onStart={async (s) => { if (!(await confirmLiveFollow(session?.cfg, s.cfg))) return; if (session && isOwner) setSettings({ paperBotArchive: { session, removedAt: Date.now() } }); /* 06/11: phiên mới không xoá mất phiên cũ — giữ bản dự phòng */ saveWithLog(s, `Phiên mới: ${(s.cfg?.coins || []).join("/")} · ${(s.cfg?.tfs || []).map((x) => TFS[x]?.label || x).join(" ")} · rủi ro ${s.cfg?.riskPct ?? "?"}%`); setConfig(false); }} onCancel={session ? () => setConfig(false) : null} /></>;

  const wipe = async () => {
    const n = P ? P.trades.filter((t) => t.status !== "skip").length : null;
    if (!(await ask(`Xoá lịch sử giao dịch Demo?\n${n != null ? `${n} lệnh` : "Toàn bộ lệnh"} từ ${dt(session.startAt)} sẽ không hiện nữa (Demo, Tổng quan Coin, biểu đồ). Bot thật không bị ảnh hưởng.\nApp giữ 1 bản dự phòng ẩn — bấm "Khôi phục" nếu cần lấy lại.`, { ok: "Xoá lịch sử", danger: true }))) return;
    setSettings({ paperBotArchive: { session, removedAt: Date.now() } });
    saveWithLog(null, "Xoá lịch sử Demo");
  };
  const stop = async () => { const ans = await ask("Dừng phiên demo?\nBot ngừng mở lệnh mới; lệnh đang mở được tính lãi/lỗ theo giá lúc dừng. Kết quả giữ lại để xem, bấm “Phiên mới” để chạy lại.\nBot thật KHÔNG dừng theo — muốn dừng bot thật vào tab Bot thật.", { ok: "Dừng phiên", danger: true, input: "Lý do (không bắt buộc)…" }); if (ans) saveWithLog({ ...session, stoppedAt: Date.now() }, "Dừng phiên Demo", ans.text); };
  const eqNow = P ? P.equity + P.unrealized : null, pnl = eqNow != null ? eqNow - cfg.capital : null;
  const open = P ? P.trades.filter((t) => t.status === "open") : [];
  const done = P ? P.trades.filter((t) => t.status === "done") : [];
  const expUsd = done.length ? done.reduce((s, t) => s + t.pnl, 0) / done.length : null;
  const longS = statsMoney(list.filter((t) => t.side === 1)), shortS = statsMoney(list.filter((t) => t.side === -1));
  const net = P ? P.equity - cfg.capital : 0, recovery = P && P.maxDDUsd > 0 ? net / P.maxDDUsd : null;
  const st = { live: ["bg-emerald-500 animate-pulse", "Realtime"], connecting: ["bg-amber-400", "Đang nối giá…"], reconnect: ["bg-amber-500 animate-pulse", "Mất kết nối, đang nối lại…"], off: ["bg-slate-300", "Không realtime"] }[status];
  const optOn = res?.optState.filter((o) => o.take && o.level >= 0).length || 0, optOff = res?.optState.filter((o) => !o.take).length || 0;

  return (
    <div className="space-y-3">
      {isOwner && !session.stoppedAt && !isBP(cfg) && (
        <Card className="!p-3 border border-emerald-200">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1 text-[12.5px] leading-snug text-slate-600"><b className="text-slate-800">Phương án B+</b> (đã kiểm 2019–2026): 38 mã · rủi ro 1,5% (20 mã mới 0,75%) · tối đa 15 lệnh · chốt 20% · chỉ vào khi phá vỡ ≥ 0,5 ATR. Áp cho Demo và bot thật đang theo Demo.</div>
            <button onClick={toBP} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[12.5px] font-bold text-white"><Play size={13} /> Chuyển sang B+</button>
          </div>
        </Card>
      )}
      <Card className="!p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Bot size={18} className="text-emerald-500" />
          <span className="text-[14px] font-extrabold text-slate-800">Bot demo · Futures</span>
          {isOwner && <FollowNote mode={follow} compact />}
          {session.stoppedAt ? <Badge tone="slate">Đã dừng</Badge> : <span className="flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" /> Đang chạy</span>}
          {cfg.adaptive && <span className="flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700"><Brain size={11} /> Tự tối ưu</span>}
          <div className="ml-auto flex gap-1.5">
            <button onClick={run} disabled={!!busy} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-bold text-slate-600 disabled:opacity-50"><RefreshCw size={13} className={busy ? "animate-spin" : ""} /> Cập nhật</button>
            {!isOwner ? <span className="rounded-lg bg-sky-50 px-2.5 py-1.5 text-[12px] font-bold text-sky-700">Chỉ xem</span> : session.stoppedAt ? <><button onClick={wipe} className="flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-[12px] font-bold text-rose-600 hover:bg-rose-50"><Trash2 size={13} /> Xoá lịch sử</button><button onClick={() => setConfig(true)} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-bold text-white"><Play size={13} /> Phiên mới</button></>
              : <button onClick={stop} className="flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1.5 text-[12px] font-bold text-white"><Square size={12} /> Dừng</button>}
          </div>
        </div>
        <div className="mt-1 text-[11.5px] text-slate-500 [overflow-wrap:anywhere]">
          Từ <b>{dt(session.startAt)}</b>{session.stoppedAt ? <> đến <b>{dt(session.stoppedAt)}</b></> : <> · đã chạy {ago(session.startAt)}</>} · {cfg.coins.join(", ")} · {cfg.tfs.map((x) => TFS[x].label).join(" ")}{cfg.offStreams?.length ? <span className="text-amber-600"> (tắt {cfg.offStreams.map((k) => { const [c, t] = k.split("|"); return `${c} ${TFS[t]?.label || t}`; }).join(", ")})</span> : null} · rủi ro {cfg.riskPct}%/lệnh{Object.keys(cfg.riskBySetup || {}).length ? ` (${Object.entries(cfg.riskBySetup).map(([k, x]) => `${k} ${fmtNum(Math.min(x, cfg.riskPct), 2, 0)}%`).join(", ")})` : ""} · tối đa {cfg.maxOpen} lệnh <button onClick={() => setShowRules((v) => !v)} className="font-bold text-indigo-600">{showRules ? "Ẩn luật ▴" : "Xem luật ▾"}</button>{isOwner && !session.stoppedAt && <> · <button onClick={() => { setEditTfs([...cfg.tfs]); setEditCoins((v) => (v ? null : [...cfg.coins])); }} className="font-bold text-indigo-600">{editCoins ? "Đóng sửa ▴" : "Thêm/sửa cặp & khung ▾"}</button> · <button onClick={() => setEditRisk((v) => (v ? null : Object.fromEntries(RISK_F.map(([k]) => [k, cfg[k]]))))} className="font-bold text-indigo-600">{editRisk ? "Đóng ▴" : "Sửa rủi ro & đòn bẩy ▾"}</button></>}
          {editRisk && (
            <div className="mt-2 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
              <div className="mb-1.5 text-[12.5px] font-extrabold text-slate-800">Rủi ro & giới hạn (Demo + bot thật đang theo Demo)</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{RISK_F.map(([k, l, u, lo, hi, st]) => (
                <label key={k} className="block min-w-0"><span className="mb-0.5 block text-[11.5px] font-semibold text-slate-500">{l}</span>
                  <span className="flex items-center gap-1"><input id={`risk-${k}`} type="number" inputMode="decimal" min={lo} max={hi} step={st} value={editRisk[k] ?? ""} onChange={(e) => setEditRisk((o) => ({ ...o, [k]: e.target.value }))} className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" /><span className="text-[11px] text-slate-400">{u}</span></span></label>
              ))}</div>
              {Object.keys(cfg.riskByCoin || {}).length > 0 && <label className="mt-2 flex items-start gap-2 text-[12px] text-slate-700"><input id="risk-same" type="checkbox" checked={!!editRisk.same} onChange={(e) => setEditRisk((o) => ({ ...o, same: e.target.checked }))} className="mt-0.5" /><span><b>Mọi mã cùng mức rủi ro</b> — chạm SL thua bằng nhau. Hiện {Object.keys(cfg.riskByCoin).join(", ")} đang để riêng {fmtNum(Math.min(cfg.riskPct, Object.values(cfg.riskByCoin)[0]), 2, 0)}%.</span></label>}
              <div className="mt-1 text-[11px] leading-snug text-slate-500">Đòn bẩy là trần khối lượng; bot thật tự hạ đòn bẩy trên sàn từng lệnh để giá thanh lý luôn xa hơn SL.</div>
              <div className="mt-2 flex gap-2">
                <button onClick={() => setEditRisk(null)} className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-[12px] font-bold text-slate-600">Huỷ</button>
                <button onClick={saveRisk} className="flex-1 rounded-lg bg-indigo-600 py-2 text-[12px] font-bold text-white">Lưu & chạy lại</button>
              </div>
            </div>
          )}
          {editCoins && (
            <div className="mt-2 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3">
              <div className="mb-1.5 text-[12.5px] font-extrabold text-slate-800">Cặp bot giao dịch (Demo + bot thật)</div>
              <CoinsEditor coins={editCoins} onChange={setEditCoins} />
              <div className="mb-1.5 mt-3 text-[12.5px] font-extrabold text-slate-800">Khung giờ vào lệnh</div>
              <div className="flex flex-wrap gap-1.5">{EDIT_TFS.map((k) => { const on = editTfs.includes(k); return <button key={k} onClick={() => setEditTfs((l) => (on ? l.filter((x) => x !== k) : [...l, k]))} className={`rounded-lg px-3 py-1.5 text-[12px] font-bold ${on ? "bg-slate-900 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200"}`}>{TFS[k].label}</button>; })}</div>
              <div className="mt-1 text-[11px] leading-snug text-slate-500">Khung lớn (H1, H4) ít tín hiệu hơn nhiều; bài kiểm thử gần nhất xem ở thẻ Phễu tín hiệu. Tắt riêng 1 khung của 1 cặp: Thống kê → "Tắt khung".</div>
              <div className="mt-2 flex gap-2">
                <button onClick={() => setEditCoins(null)} className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-[12px] font-bold text-slate-600">Huỷ</button>
                <button disabled={!editTfs.length || (editCoins.join() === cfg.coins.join() && [...editTfs].sort().join() === [...cfg.tfs].sort().join())} onClick={saveCoins} className="flex-1 rounded-lg bg-indigo-600 py-2 text-[12px] font-bold text-white disabled:opacity-40">Lưu & chạy lại</button>
              </div>
              <div className="mt-1 text-[11px] leading-snug text-slate-500">Lưu xong Demo chạy lại từ {dt(session.startAt)} với danh sách cặp mới (cặp xoá → lệnh demo của cặp đó biến mất). Bot thật nhận trong ~5 phút; lệnh/vị thế đang mở của cặp vừa xoá vẫn được bot quản lý (SL/TP) tới khi đóng.</div>
            </div>
          )}
          {showRules && cfg.strategy === "sw3" && <div className="mt-1 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3"><Sw3Rules cfg={cfg} /></div>}
          {showRules && cfg.strategy !== "sw3" && <div className="mt-1 rounded-lg bg-slate-50 p-2 leading-relaxed">Luật đang áp dụng (v{cfg.cfgVer}){cfg.maxFeeR > 0 ? ` · bỏ lệnh phí > ${cfg.maxFeeR}R` : ""} · vào lệnh chờ{cfg.maxExtAtr > 0 ? ` · không đuổi >${cfg.maxExtAtr} ATR` : ""}{cfg.minSlAtr > 0 ? ` · SL ≥${cfg.minSlAtr} ATR` : ""}{cfg.streakN > 0 ? ` · thua ${cfg.streakN} lệnh liền → rủi ro ${fmtNum(cfg.streakRiskPct, 2, 0)}% tới khi thắng lại` : ""}{cfg.keyVolume > 0 ? ` · tại Key Volume${cfg.keyVolume > 1 ? ` top ${cfg.keyVolume}` : ""}` : ""}{cfg.sigVol ? " · nến tín hiệu vol > TB20" : ""}{cfg.noEngulf ? " · không đuổi sau engulfing" : ""}{cfg.htfFilter ? ` · thuận khung lớn ${cfg.tfs.map((x) => `${TFS[x].label}→${TFS[TFS[x].htf].label}`).join(", ")}` : ""}{cfg.d1Bias ? " · bias D1 (chỉ thuận xu hướng D1)" : ""}{cfg.sigVol ? " · vol nến tín hiệu > TB20" : ""} · rủi ro {cfg.streakN > 0 ? "" : "cố định "}{fmtNum(cfg.riskPct, 2, 0)}%/lệnh{Object.keys(cfg.riskBySetup || {}).length ? ` (${Object.entries(cfg.riskBySetup).map(([k, v]) => `${k} ${fmtNum(Math.min(v, cfg.riskPct), 2, 0)}%`).join(", ")})` : ""} · R:R ≥ 1:{String(MIN_RR).replace(".", ",")}{cfg.adaptive ? ` · tối ưu ${cfg.lookback} lệnh/thận trọng ${cfg.confK}${cfg.tfGate ? "/nghỉ khung lỗ" : ""}` : ""}</div>}
          {busy && <span className="ml-1 inline-flex items-center gap-1 text-indigo-600"><Loader2 size={11} className="animate-spin" />{busy}</span>}
          {res && !busy && <span className="text-slate-400"> · bot xét nến lúc {dt(res.at)}</span>}
          {res && busy && <span className="text-slate-400"> · đang hiện kết quả lúc {dt(res.at)}</span>}
        </div>
        {active && (
          <div className="mt-2 grid grid-cols-3 items-center gap-x-2 gap-y-1 border-t border-slate-100 pt-2 sm:flex sm:flex-wrap sm:gap-x-4">
            <span className="col-span-3 flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><span className={`h-2 w-2 rounded-full ${st[0]}`} /><Radio size={12} /> {st[1]}</span>
            {cfg.coins.map((c) => { const s = shown.current[c], fresh = s && Date.now() - s.at < 1500; return (
              <span key={c} className={`whitespace-nowrap rounded-md px-1 py-0.5 text-[11.5px] font-extrabold tabular-nums sm:px-1.5 sm:text-[12.5px] transition-colors duration-500 ${fresh ? (s.dir > 0 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700") : "text-slate-800"}`}>
                <span className="mr-1 text-[10px] font-bold text-slate-400 sm:text-[10.5px]">{c}</span>{s ? px(s.c) : "…"}{s?.dir ? <span className={`hidden sm:inline ${s.dir > 0 ? "text-emerald-500" : "text-rose-500"}`}>{s.dir > 0 ? " ▲" : " ▼"}</span> : null}
              </span>
            ); })}
          </div>
        )}
        {toast && <div className={`mt-2 flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] font-bold ${toast.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}><Bell size={14} className="shrink-0" /> {toast.text}{toast.more ? <span className="font-normal opacity-70"> (+{toast.more} sự kiện)</span> : null}<span className="ml-auto text-[11px] font-normal opacity-60">{hm(toast.at)}</span></div>}
        {err && <div className="mt-2 rounded-lg bg-rose-50 p-2 text-[12px] text-rose-600">{err}</div>}
      </Card>

      {!res ? (err && !busy
        ? <Card><div className="py-10 text-center"><div className="text-[14px] font-extrabold text-rose-600">Chưa tải được dữ liệu Binance</div><div className="mt-1 text-[12px] text-slate-500">{err}</div><button onClick={run} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white"><RefreshCw size={14} /> Thử lại</button></div></Card>
        : <Card><div className="py-12 text-center text-sm text-slate-400"><div className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> {busy || "Đang chạy lại dữ liệu…"}</div><div className="mt-1 text-[11.5px]">Lần đầu cần tải ~3 tháng nến (vài chục nghìn nến) — các lần sau chỉ tải phần mới, mở rất nhanh.</div></div></Card>) : (<>
        {(() => { // Tóm tắt 1 dòng: đang làm gì · lệnh gần nhất · nhịp lệnh · tiến độ tháng này so với mục tiêu
          const tr = P.trades.filter((t) => t.status !== "skip"), last = tr.slice().sort((a, b) => b.entryAt - a.entryAt)[0];
          const weeks = Math.max(1, (Date.now() - session.startAt) / (7 * 86400000)), mNow = tr.filter((t) => monthOf(t.entryAt) === monthOf(Date.now())).length;
          return (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-100 bg-white px-3 py-2 text-[12.5px] text-slate-600 shadow-sm">
              <b className={open.length ? "text-emerald-700" : "text-slate-700"}>{session.stoppedAt ? "Phiên đã dừng" : open.length ? `Đang mở ${open.length} lệnh` : "Đang chờ tín hiệu"}</b>
              {last && <span>Lệnh gần nhất <b className="text-slate-800">{last.coin} {TFS[last.tf].label}</b> · {dt(last.entryAt)}</span>}
              <span>TB <b className="text-slate-800">{fmtNum(tr.length / weeks, 1, 0)}</b> lệnh/tuần</span>
              <span className={mNow >= MONTH_TARGET ? "font-bold text-emerald-700" : ""}>{monthLabel(monthOf(Date.now()))}: <b>{mNow}/{MONTH_TARGET}</b> lệnh</span>
            </div>
          );
        })()}
        {(() => { // Cảnh báo sớm: khung / cặp × khung đang âm 30 ngày gần nhất → mở bảng "nên giữ hay tắt"
          const w = weakStreams(P.trades, cfg); if (!w.tfs.length && !w.pairs.length) return null;
          return (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
              <AlertTriangle size={14} className="shrink-0 text-amber-600" />
              <b>30 ngày qua đang âm:</b>
              {w.tfs.map((x) => <span key={x.tf}>khung <b>{TFS[x.tf].label}</b> ({x.n} lệnh, {rr(x.avgR)})</span>)}
              {w.pairs.slice(0, 4).map((x) => <span key={x.coin + x.tf} className="rounded bg-white/60 px-1.5">{x.coin} {TFS[x.tf].label} · {x.n} lệnh · {rr(x.avgR)}</span>)}
              <button onClick={() => setTab("stats")} className="ml-auto rounded-lg bg-amber-600 px-2.5 py-1 text-[11.5px] font-bold text-white">Xem nên giữ hay tắt</button>
            </div>
          );
        })()}
        {cfg.adaptive && (
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {[["auto", "Bot tự tối ưu", Brain], ["base", "So sánh: không tự tối ưu", Bot]].map(([k, l, I]) => <button key={k} onClick={() => { setView(k); setShowN(40); if (k === "base" && filter === "reject") setFilter("all"); }} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12.5px] font-bold ${view === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}><I size={14} /> {l}</button>)}
          </div>
        )}

        <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4 xl:grid-cols-8">
          <Num label="Vốn hiện tại" v={usd(eqNow)} sub={`vốn đầu ${usd(cfg.capital, 0)}${open.length ? ` · ${open.length} lệnh mở` : ""}`} />
          <Num label="Lãi / lỗ" v={usd(pnl)} sub={`${pct((pnl / cfg.capital) * 100)}${P.unrealized ? ` · tạm tính ${usd(P.unrealized)}` : ""}`} tone={tone(pnl)} />
          <Num label="Tỉ lệ thắng" v={all.winRate != null ? `${fmtNum(all.winRate, 1, 1)}%` : "—"} sub={`${all.wins} thắng · ${all.losses} thua · ${all.bes} hoà`} />
          <Num label="Lệnh đã đóng" v={all.n} sub={`${P.trades.filter((t) => t.status === "skip").length} bị danh mục bỏ`} className="hidden sm:block" />
          <Num label={<Term k="avgR" />} v={rr(all.avgR)} sub="kỳ vọng, đã trừ phí" tone={tone(all.avgR)} className="hidden sm:block" />
          <Num label={<Term k="pf" />} v={all.pf == null ? "—" : all.pf === Infinity ? "∞" : fmtNum(all.pf, 2, 2)} sub=">1 là có lãi" tone={all.pf >= 1 ? "text-emerald-600" : "text-rose-600"} className="hidden sm:block" />
          <Num label={<Term k="dd" />} v={`${fmtNum(P.maxDD, 1, 1)}%`} sub={usd(-P.maxDDUsd)} tone={P.maxDD > 20 ? "text-rose-600" : "text-slate-900"} />
          <Num label="Chuỗi thua dài nhất" v={all.worstStreak} sub={`thắng liền nhiều nhất ${all.bestStreak}`} className="hidden sm:block" />
        </div>
        {(() => { // Chuỗi thua đang diễn ra + luật v9 (giảm rủi ro) đã đỡ được bao nhiêu
          const done = P.trades.filter((t) => t.status === "done").sort((a, b) => a.exitAt - b.exitAt);
          let run = 0; for (let i = done.length - 1; i >= 0 && done[i].pnl < 0; i--) run++;
          const red = done.filter((t) => t.reducedRisk && t.pnl < 0), lost = red.reduce((x, t) => x - t.pnl, 0), full = cfg.streakRiskPct > 0 ? (lost * cfg.riskPct) / cfg.streakRiskPct : lost;
          if (!(cfg.streakN > 0) || (run < cfg.streakN && !red.length)) return null;
          return (
            <div className={`border-t px-3 py-2 text-[12px] leading-snug ${run >= cfg.streakN ? "border-amber-200 bg-amber-50 text-amber-900" : "border-slate-100 bg-white text-slate-600"}`}>
              {run >= cfg.streakN ? <><b>Đang thua {run} lệnh liền</b> (từ {dt(done[done.length - run].exitAt)}) → lệnh tiếp theo rủi ro <b>{fmtNum(cfg.streakRiskPct, 2, 0)}%</b> thay vì {fmtNum(cfg.riskPct, 2, 0)}%, thắng 1 lệnh thì trở lại {fmtNum(cfg.riskPct, 2, 0)}%. </> : null}
              Luật giảm rủi ro sau {cfg.streakN} lệnh thua đã áp cho <b>{red.length}</b> lệnh thua: mất {usd(lost)} thay vì khoảng {usd(full)} (đỡ {usd(full - lost)}).
            </div>
          );
        })()}

        <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
          {[["chart", "Biểu đồ & lệnh", "Biểu đồ"], ["history", `Lịch sử lệnh (${P.trades.filter((t) => t.status !== "skip").length})`, `Lịch sử (${P.trades.filter((t) => t.status !== "skip").length})`], ["stats", "Thống kê", "Thống kê"], ["opt", "Tối ưu & bài học", "Tối ưu"]].map(([k, l, m]) => <button key={k} onClick={() => setTab(k)} className={`flex-1 whitespace-nowrap rounded-lg px-2 py-2 text-[12.5px] font-bold sm:px-3 ${tab === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}><span className="sm:hidden">{m}</span><span className="hidden sm:inline">{l}</span></button>)}
        </div>

        {tab === "chart" && (<>
        <BotSignalBoard cfg={cfg} trades={P.trades} pending={res.pending || []} live={live} ver={ver} active={active} stopped={!!session.stoppedAt} sel={sel}
          onPick={(c, t) => { setSel({ coin: c, tf: t }); setFocus(null); setTimeout(() => document.getElementById("bot-chart")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }} />
        <SignalFunnel res={res} P={P} />
        {(() => { // Vì sao chưa có lệnh: 48 giờ không có lệnh mới → tổng hợp tín hiệu bị bỏ 7 ngày qua theo lý do
          const lastEntry = Math.max(0, ...P.trades.filter((t) => t.status !== "skip").map((t) => t.entryAt));
          if (Date.now() - lastEntry < 48 * 3600000 || !res.skipLog?.length) return null;
          const wk = res.skipLog.filter((x) => Date.now() - x.t < 7 * 86400000), by = {};
          const LES = "bị bài học từ lệnh thua chặn (tự bảo vệ sau chuỗi thua)";
          for (const x of wk) { const k = /^bài học/.test(x.why) ? LES : x.why; by[k] = (by[k] || 0) + 1; }
          // 27/10: tín hiệu bị bài học chặn vẫn được theo dõi "bóng" → cho sếp thấy nếu vào thì ra sao (chặn đúng hay chặn oan)
          const blk = (res.rejected || []).filter((t) => Date.now() - t.signalAt < 7 * 86400000 && /^bài học/.test(t.why || "") && t.r != null);
          const blkR = blk.reduce((a, t) => a + t.r, 0), blkLoss = blk.filter((t) => t.r < 0).length;
          const near = wk.filter((x) => x.why !== "ngược xu hướng khung lớn").slice(0, 5);
          return (
            <Card className="!p-3">
              <Title icon={Info}>Vì sao chưa có lệnh?</Title>
              <div className="text-[12.5px] text-slate-600">Lệnh gần nhất: <b>{lastEntry ? dt(lastEntry) : "chưa có"}</b>. 7 ngày qua có <b>{res.skipLog.length >= 400 && wk.length === res.skipLog.length ? `hơn ${wk.length}` : wk.length}</b> tín hiệu thô nhưng đều bị luật lọc bỏ — bình thường khi thị trường không có điểm vào đẹp (bot chỉ vào khi đủ mọi điều kiện).</div>
              {blk.length > 0 && <div className={`mt-1.5 rounded-lg px-2.5 py-1.5 text-[12px] ${blkR < 0 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}><b>{blk.length}</b> tín hiệu đạt đủ luật nhưng bị <b>bài học từ lệnh thua</b> chặn. Nếu đã vào: {blkLoss} lệnh thua, {blk.length - blkLoss} lệnh thắng, tổng <b>{rr(blkR)}</b> → {blkR < 0 ? "chặn ĐÚNG, đã tránh được lỗ." : "chặn hơi oan — bài học sẽ tự gỡ khi các tín hiệu bị chặn thắng trở lại."} Không phải bot hỏng: kiểm thử 3 kỳ, tắt bài học thì lãi giảm (TB 279$ → 177$/kỳ) và sụt vốn tăng (24% → 31%).</div>}
              <div className="mt-1.5 flex flex-wrap gap-1.5">{Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11.5px] text-slate-600">{k}: <b>{v}</b></span>)}</div>
              {near.length > 0 && <div className="mt-2 space-y-0.5">{near.map((x, i) => <div key={i} className="text-[11.5px] text-slate-500"><span className="tabular-nums text-slate-400">{dt(x.t)}</span> {side(x.side)} <b>{x.coin} {TFS[x.tf].label}</b> {setupName(x.setup)} — bỏ vì {x.why}</div>)}</div>}
            </Card>
          );
        })()}
        <div id="bot-chart" className="scroll-mt-20" />
        <Card className="!p-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-3 py-2">
            {cfg.coins.flatMap((c) => cfg.tfs.map((t) => [c, t])).map(([c, t]) => { const on = sel.coin === c && sel.tf === t, n = P.trades.filter((x) => x.coin === c && x.tf === t && x.status !== "skip").length, op = P.trades.some((x) => x.coin === c && x.tf === t && x.status === "open"); return (
              <button key={c + t} onClick={() => { setSel({ coin: c, tf: t }); setFocus(null); }} className={`rounded-lg px-2.5 py-1.5 text-[12px] font-bold ${on ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>{c} {TFS[t].label} <span className={on ? "text-white/60" : "text-slate-400"}>{n}</span>{op && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400 align-middle" />}</button>
            ); })}
            <span className="ml-auto text-[11px] text-slate-400">▲▼ vào lệnh · ● thoát (xanh lãi, đỏ lỗ)</span>
          </div>
          <BotChart coin={sel.coin} tf={sel.tf} startAt={session.startAt} rawAt={res.at} trades={chartTrades} pending={chartPending} live={live} ver={ver} focus={focus && focus.coin === sel.coin && focus.tf === sel.tf ? focus : null} trail={raw?.sw3Levels} />
          {focus && <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-slate-100 bg-indigo-50/50 px-3 py-2 text-[12px]">{side(focus.side)}<b>{focus.coin} {TFS[focus.tf].label}</b><span className="text-slate-500">{setupName(focus.setup)}</span><span className="tabular-nums">vào {px(focus.entry)} · cắt lỗ {px(focus.sl)} · {tpLbl(focus)} {px(focus.tp)}</span><span className={`font-extrabold ${tone(focus.r ?? focus.uR)}`}>{focus.exitAt ? `${viReason(focus.reason)} ${rr(focus.r)}` : `đang mở ${rr(focus.uR)}`}</span><button onClick={() => setFocus(null)} className="ml-auto text-[11px] font-bold text-indigo-600">Bỏ chọn</button>{histScroll.current > 0 && <button onClick={backToHistory} className="rounded-lg bg-white px-2.5 py-1.5 text-[11.5px] font-bold text-indigo-600 ring-1 ring-indigo-100">← Về lịch sử</button>}</div>}
          {focus && focus.setup === "SW3" && <div className="border-t border-slate-100 bg-indigo-50/30 px-3 py-2"><TradeWhy t={focus} lv={focus.exitAt ? null : raw?.sw3Levels?.[focus.coin]} wide /></div>}
        </Card>

        {open.length > 0 && (
          <Card className="!p-3">
            <Title right={active && status === "live" ? <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />giá realtime</span> : null}>Lệnh đang mở ({open.length})</Title>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{open.map((t) => <OpenCard key={t.id} t={t} lv={raw?.sw3Levels?.[t.coin]} />)}</div>
          </Card>
        )}

        {res.pending?.length > 0 && active && (
          <Card className="!p-3">
            <Title>Lệnh chờ đang đặt ({res.pending.length}) · khớp khi giá xuyên qua, hết hạn thì huỷ</Title>
            <div className="space-y-1">{res.pending.map((p) => { const cur = live.current[`px|${p.coin}`], d = cur ? ((cur - p.lim) / p.lim) * 100 * p.side : null; return (
              <div key={p.id} className="rounded-lg bg-amber-50/70 px-2.5 py-1.5 text-[12px]">
                <div className="flex min-w-0 items-center gap-2 whitespace-nowrap">{side(p.side)}<b>{p.coin} {TFS[p.tf].label}</b><span className="min-w-0 truncate text-slate-500">{setupName(p.setup)}</span><span className="ml-auto shrink-0 tabular-nums">Chờ ở <b>{px(p.lim)}</b></span></div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 tabular-nums text-[11.5px] text-slate-500">
                  {d != null && <span className="rounded-md bg-white px-1.5 font-bold text-slate-800">Giá {px(cur)}</span>}
                  {d != null && <span>còn cách {fmtNum(Math.max(0, d), 2, 2)}%</span>}
                  <span className="text-rose-500">Cắt lỗ {px(p.sl)}</span>
                  <span className="ml-auto text-[11px] text-slate-400"><b className="font-bold text-amber-600">{timeLeft(p.until)}</b> · huỷ lúc {dt(p.until)}</span>
                </div>
              </div>
            ); })}</div>
          </Card>
        )}

        <div className="grid gap-3 xl:grid-cols-3">
          <Card className="!p-3 xl:col-span-2">
            <Title right={<span className="text-[11px] text-slate-400">vốn đầu {usd(cfg.capital, 0)}</span>}>Đường vốn{active ? " · nhảy theo giá realtime" : ""}</Title>
            <div className="h-60">
              <ResponsiveContainer>
                <LineChart>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(t) => dt(t).slice(0, 5)} tick={{ fontSize: 10 }} minTickGap={30} allowDuplicatedCategory={false} />
                  <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} width={50} />
                  <Tooltip formatter={(v) => usd(v)} labelFormatter={(t) => dt(t)} />
                  <ReferenceLine y={cfg.capital} stroke="#94a3b8" strokeDasharray="4 4" />
                  {cfg.adaptive && <Legend wrapperStyle={{ fontSize: 11 }} />}
                  {cfg.adaptive && <Line data={curveB} dataKey="eq" name="Luật gốc" stroke="#94a3b8" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
                  <Line data={cfg.adaptive ? curveA : curveB} dataKey="eq" name={cfg.adaptive ? "Tự tối ưu" : "Vốn"} stroke={cfg.adaptive ? "#8b5cf6" : pnl >= 0 ? "#10b981" : "#f43f5e"} strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {P.days.length > 1 && (<>
              <div className="mt-2 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Lãi/lỗ theo ngày · {P.days.filter((d) => d.v > 0).length}/{P.days.length} ngày lãi</div>
              <div className="h-24">
                <ResponsiveContainer>
                  <BarChart data={P.days}>
                    <XAxis dataKey="d" tickFormatter={(d) => d.slice(8, 10) + "/" + d.slice(5, 7)} tick={{ fontSize: 9 }} minTickGap={20} />
                    <Tooltip formatter={(v) => usd(v)} />
                    <ReferenceLine y={0} stroke="#cbd5e1" />
                    <Bar dataKey="v" name="Lãi/lỗ" isAnimationActive={false}>{P.days.map((d) => <Cell key={d.d} fill={d.v >= 0 ? "#10b981" : "#f43f5e"} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>)}
          </Card>
          <Card className="!p-3">
            <Title icon={Activity}>Hoạt động gần đây</Title>
            <div className="space-y-1">{feed.length ? feed.map((e, i) => { const t = e.tr, fresh = Date.now() - e.t < 15 * 60000; return (
              <div key={i} className={`flex items-center gap-2 rounded-md px-1.5 py-1 text-[12px] ${fresh ? "bg-amber-50" : ""}`}>
                <span className="w-[74px] shrink-0 tabular-nums text-[11px] text-slate-400">{dt(e.t)}</span>
                {e.kind === "open" ? <span className="min-w-0 truncate">{side(t.side)} <b>{t.coin} {TFS[t.tf].label}</b> <span className="text-slate-500">@ {px(t.entry)}</span>{t.reducedRisk && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-700">rủi ro {fmtNum(cfg.streakRiskPct, 2, 0)}%</span>}</span>
                  : <span className="min-w-0 truncate"><span className="font-bold text-slate-600">Đóng</span> <b>{t.coin} {TFS[t.tf].label}</b> <span className="text-slate-500">{viReason(t.reason)}</span>{t.reducedRisk && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-700">rủi ro {fmtNum(cfg.streakRiskPct, 2, 0)}%</span>}</span>}
                {e.kind === "close" && <span className={`ml-auto shrink-0 font-extrabold tabular-nums ${tone(t.pnl)}`}>{usd(t.pnl)}</span>}
              </div>
            ); }) : <div className="text-[12px] text-slate-400">Chưa có lệnh.</div>}</div>
          </Card>
        </div>
        </>)}

        {tab === "history" && (<>
        {open.length > 0 && (
          <Card className="!p-3">
            <Title right={active && status === "live" ? <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />giá realtime</span> : null}>Lệnh đang mở ({open.length})</Title>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">{open.map((t) => <OpenCard key={t.id} t={t} lv={raw?.sw3Levels?.[t.coin]} />)}</div>
          </Card>
        )}

        <PnlCalendar title="Lịch lãi/lỗ bot demo" items={calItems} sources={calSources} rate={vnd} note="Tính theo ngày ĐÓNG lệnh (giờ VN), đã trừ phí. Bấm 1 ngày để xem từng lệnh." />

        <Card className="!p-3">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Lịch sử lệnh</span>
            {[["all", "Tất cả"], ["win", "Thắng"], ["loss", "Thua"], ["open", "Đang mở"], ["skip", "Bị bỏ (danh mục)"], ...(cfg.adaptive && !isBase ? [["reject", "Bị loại"]] : [])].map(([k, l]) => <button key={k} onClick={() => { setFilter(k); setShowN(40); }} className={`rounded-md px-2.5 py-1.5 text-[11.5px] font-bold ${filter === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"}`}>{l}</button>)}
            <span className="ml-auto text-[11px] text-slate-400">{taken.length} lệnh · bấm 1 lệnh để xem trên biểu đồ</span>
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <select value={hStream} onChange={(e) => { setHStream(e.target.value); setShowN(40); }} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] font-bold text-slate-600">
              <option value="all">Mọi cặp · mọi khung</option>
              {cfg.coins.map((c) => <option key={c} value={c}>{c} · mọi khung</option>)}
              {cfg.coins.flatMap((c) => cfg.tfs.map((t) => <option key={c + t} value={`${c}|${t}`}>{c} {TFS[t].label}</option>))}
            </select>
            <select value={hMonth} onChange={(e) => { setHMonth(e.target.value); setShowN(40); }} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[12px] font-bold text-slate-600">
              <option value="all">Mọi tháng</option>
              {months.map((m) => <option key={m.k} value={m.k}>{monthLabel(m.k)}</option>)}
            </select>
            <button onClick={exportCsv} disabled={!taken.length} className="ml-auto rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] font-bold text-slate-600 disabled:opacity-40">Xuất CSV</button>
          </div>
          {months.length > 0 && (
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5">{months.map((m) => (
              <button key={m.k} onClick={() => { setHMonth(hMonth === m.k ? "all" : m.k); setShowN(40); }} className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-left ${hMonth === m.k ? "border-indigo-300 bg-indigo-50" : "border-slate-100 bg-slate-50 hover:border-slate-200"}`}>
                <div className="text-[10.5px] font-bold text-slate-500">{monthLabel(m.k)}</div>
                <div className="text-[12px] tabular-nums"><b className={m.n >= MONTH_TARGET ? "text-emerald-700" : "text-slate-700"}>{m.n} lệnh</b>{m.done ? <span className="text-slate-400"> · thắng {fmtNum((m.win / m.done) * 100, 0, 0)}%</span> : null}</div>
                <div className={`text-[12px] font-extrabold tabular-nums ${tone(m.pnl)}`}>{m.done ? usd(m.pnl) : "—"}</div>
              </button>
            ))}</div>
          )}
          <div className="divide-y divide-slate-100">{taken.slice(0, showN).map((t) => { const R = t.r ?? t.uR, dim = t.status === "skip" || t.status === "reject"; return (
            <button key={t.id} onClick={() => showOnChart(t)} className={`block w-full px-1 py-2 text-left hover:bg-slate-50 ${t.liveExit ? "bg-amber-50/60" : ""} ${focus?.id === t.id ? "bg-indigo-50/70" : ""}`}>
              <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[12.5px] sm:gap-2">
                {side(t.side)}<b>{t.coin}</b><span className="text-slate-400">{TFS[t.tf].label}</span><span className="hidden min-w-0 truncate text-slate-500 sm:inline">{setupName(t.setup)}</span>
                {t.status === "open" && <span className="shrink-0 rounded bg-amber-100 px-1.5 text-[10.5px] font-bold text-amber-700">ĐANG MỞ</span>}
                {t.reducedRisk && t.status !== "skip" && t.status !== "reject" && <span className="shrink-0 rounded bg-amber-100 px-1.5 text-[10.5px] font-bold text-amber-700">rủi ro {fmtNum(cfg.streakRiskPct, 2, 0)}%</span>}
                <span className={`ml-auto shrink-0 font-extrabold tabular-nums ${dim ? "text-slate-400" : tone(R)}`}>{rr(R)}</span>
                <span className={`shrink-0 text-right font-extrabold sm:w-[72px] tabular-nums ${dim ? "text-slate-300" : tone(t.pnl)}`}>{dim ? "—" : usd(t.pnl)}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] tabular-nums text-slate-500">
                <span>{dt(t.entryAt)} · vào {px(t.entry)}</span><span className="hidden text-rose-500 sm:inline">Cắt lỗ {px(t.sl)}</span><span className="hidden text-emerald-600 sm:inline">{tpLbl(t)} {px(t.tp)}</span>
                <span>{t.status === "skip" ? `bỏ: ${t.why}` : t.status === "reject" ? `loại: ${t.why} · nếu vào: ${viReason(t.reason)}` : t.exitAt ? `${viReason(t.reason)} @ ${px(t.exit)} · ${dt(t.exitAt)}${t.liveExit ? " (realtime)" : ""}` : `giá ${px(t.last)}`}</span>
              </div>
              {t.why3 && <div className="mt-0.5 hidden text-[11px] sm:block leading-snug text-slate-400">Tiêu chí lúc vào: {t.why3} · <span className="font-semibold text-indigo-500">bấm để xem vì sao vào / vì sao đóng</span></div>}
              {t.lesson && <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-rose-700/80 sm:line-clamp-none">Rút kinh nghiệm: {t.lesson}</div>}
            </button>
          ); })}</div>
          {!taken.length && <div className="py-6 text-center text-[12px] text-slate-400">Chưa có lệnh nào.</div>}
          {taken.length > showN && <button onClick={() => setShowN((n) => n + 100)} className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg bg-slate-50 py-2 text-[12px] font-bold text-slate-500"><ChevronDown size={14} /> Xem thêm ({taken.length - showN})</button>}
        </Card>
        </>)}

        {tab === "stats" && (<>
        <PairReview cfg={cfg} list={list} ptrades={P.trades} canEdit={isOwner && !session.stoppedAt} onRemoveCoin={removeCoin} onToggleStream={toggleStream} />
        <div className="grid grid-cols-2 gap-px bg-slate-100 sm:hidden">
          <Num label="Lệnh đã đóng" v={all.n} sub={`${P.trades.filter((t) => t.status === "skip").length} bị danh mục bỏ`} />
          <Num label={<Term k="avgR" />} v={rr(all.avgR)} sub="kỳ vọng, đã trừ phí" tone={tone(all.avgR)} />
          <Num label={<Term k="pf" />} v={all.pf == null ? "—" : all.pf === Infinity ? "∞" : fmtNum(all.pf, 2, 2)} sub=">1 là có lãi" tone={all.pf >= 1 ? "text-emerald-600" : "text-rose-600"} />
          <Num label="Chuỗi thua dài nhất" v={all.worstStreak} sub={`thắng liền nhiều nhất ${all.bestStreak}`} />
        </div>
        <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4 xl:grid-cols-8">
          <Num label="Kỳ vọng / lệnh ($)" v={usd(expUsd)} sub="lãi/lỗ TB mỗi lệnh" tone={tone(expUsd)} />
          <Num label="Thắng TB / Thua TB" v={<>{rr(all.avgWin)} <span className="text-slate-300">/</span> <span className="text-rose-600">{rr(all.avgLoss)}</span></>} sub={`payoff ${f2(all.payoff)} · lớn nhất ${rr(all.maxWin)}`} />
          <Num label="SQN (chất lượng hệ)" v={f2(all.sqn)} sub="<1.6 kém · 2–3 tốt" tone={all.sqn >= 1.6 ? "text-emerald-600" : all.sqn != null ? "text-rose-600" : undefined} />
          <Num label="Phí đã trả" v={usd(P.fees)} sub={`TB ${f2(all.feeR)}R/lệnh · trong đó funding ${all.fundR == null ? "—" : `${all.fundR >= 0 ? "" : "nhận "}${fmtNum(Math.abs(all.fundR), 3, 3)}R`}`} />
          <Num label="Recovery factor" v={f2(recovery)} sub="lãi ròng ÷ sụt vốn, >2 tốt" tone={tone(recovery)} />
          <Num label="Giữ lệnh TB" v={all.holdH == null ? "—" : all.holdH >= 24 ? `${fmtNum(all.holdH / 24, 1, 1)} ngày` : `${fmtNum(all.holdH, 1, 1)} giờ`} sub={Object.entries(all.reasons).map(([k, v]) => `${k} ${v}`).join(" · ") || "—"} />
          <Num label="Long / Short" v={<><span className={tone(longS.avgR)}>{fmtNum(longS.winRate, 0, 0) ?? "—"}%</span> <span className="text-slate-300">/</span> <span className={tone(shortS.avgR)}>{fmtNum(shortS.winRate, 0, 0) ?? "—"}%</span></>} sub={`${longS.n} long ${rr(longS.avgR)} · ${shortS.n} short ${rr(shortS.avgR)}`} />
          <Num label="Lệnh thua từng lời" v={rr(all.mfeLoss)} sub={`TB trước khi quay đầu · lệnh thắng từng âm ${rr(all.maeWin == null ? null : -all.maeWin)}`} />
        </div>

        <Card className="!p-3">
          <Title icon={Info}>Nhận xét tự động · {isBase ? "luật gốc" : "bot tự tối ưu"}</Title>
          <div className="grid gap-x-6 gap-y-1.5 text-[12px] leading-snug text-slate-600 md:grid-cols-2">
            {all.n < 100 && <div>• Mới {all.n} lệnh đã đóng — cần ≥ 100 lệnh để tỉ lệ thắng đáng tin.</div>}
            <div>• Hoà vốn ở R:R 2 cần thắng ≥ <b>33%</b>, R:R 3 cần ≥ <b>25%</b>; hiện {fmtNum(all.winRate, 0, 0) ?? "—"}% với payoff {f2(all.payoff)}.</div>
            <div>• Phí + trượt giá ăn TB <b>{f2(all.feeR)}R</b>/lệnh{all.feeR > 0.2 ? " — lớn (SL sát), nên tăng SL tối thiểu theo ATR hoặc ưu tiên khung M15." : "."}</div>
            {all.mfeLoss != null && <div>• Lệnh thua từng lời TB <b>{rr(all.mfeLoss)}</b> trước khi quay đầu{all.mfeLoss >= 0.8 ? " — nhiều lệnh đã gần đúng hướng, chốt sớm/dời hoà vốn sớm có thể cứu." : " — phần lớn sai hướng ngay từ đầu, cần lọc điểm vào chặt hơn."}</div>}
            {(() => { const segs = [...by("tf", cfg.tfs, (x) => TFS[x].label), ...by("setup", cfg.setups, setupName), ...by("coin", cfg.coins)].filter(([, s]) => s.n >= 10).sort((a, b) => b[1].avgR - a[1].avgR); return segs.length ? <><div>• Tốt nhất: <b className="text-emerald-700">{segs[0][0]}</b> ({rr(segs[0][1].avgR)}/lệnh, {segs[0][1].n} lệnh)</div><div>• Kém nhất: <b className="text-rose-700">{segs[segs.length - 1][0]}</b> ({rr(segs[segs.length - 1][1].avgR)}/lệnh)</div></> : null; })()}
            {Object.keys(res.skipped).length > 0 && <div className="text-slate-400">• Luật bỏ qua: {Object.entries(res.skipped).map(([k, v]) => `${v} tín hiệu ${k.toLowerCase()}`).join(", ")}.</div>}
          </div>
        </Card>

        <Card className="!p-3">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatTable title="Theo setup" rows={by("setup", cfg.setups, setupName)} />
            <StatTable title="Theo cặp" rows={by("coin", cfg.coins)} />
            <StatTable title="Theo khung giờ" rows={by("tf", cfg.tfs, (x) => TFS[x].label)} />
            <StatTable title="Theo hướng" rows={[["Long", longS], ["Short", shortS]]} />
          </div>
        </Card>

        <Card className="!p-3">
          <Title icon={Activity}>So sánh khung giờ — khung nào hiệu quả nhất</Title>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12px]">
              <thead><tr className="border-b border-slate-100 text-left text-[10px] uppercase text-slate-400">
                <th className="py-1.5 pr-2">Khung</th><th className="py-1.5 pr-2 text-right">Lệnh (gốc)</th><th className="py-1.5 pr-2 text-right">Thắng</th><th className="py-1.5 pr-2 text-right"><Term k="avgR" align="right">R TB</Term></th><th className="py-1.5 pr-2 text-right"><Term k="pf" align="right">Hệ số lãi</Term></th><th className="py-1.5 pr-2 text-right">Phí TB</th><th className="py-1.5 pr-2 text-right">Lãi/lỗ gốc</th>{cfg.adaptive && <><th className="py-1.5 pr-2 text-right text-violet-600">Tự tối ưu</th><th className="py-1.5">Bot hiện tại</th></>}
              </tr></thead>
              <tbody>{(() => {
                const rows = cfg.tfs.map((tf) => ({ tf, b: statsMoney(res.baseTrades.filter((t) => t.tf === tf)), a: statsMoney(res.trades.filter((t) => t.tf === tf)), usdB: res.basePortfolio.trades.filter((t) => t.tf === tf && t.status !== "skip").reduce((x, t) => x + t.pnl, 0), usdA: res.portfolio.trades.filter((t) => t.tf === tf && t.status !== "skip").reduce((x, t) => x + t.pnl, 0), st: res.tfState?.find((x) => x.tf === tf) }));
                const best = rows.filter((r) => r.b.n >= 10).sort((x, y) => y.b.avgR - x.b.avgR)[0]?.tf;
                return rows.map(({ tf, b, a, usdB, usdA, st }) => (
                  <tr key={tf} className={`border-b border-slate-50 ${tf === best ? "bg-emerald-50/60" : ""}`}>
                    <td className="py-1.5 pr-2 font-extrabold text-slate-800">{TFS[tf].label}{tf === best ? " 🏆" : ""}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{b.n}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{b.winRate == null ? "—" : `${fmtNum(b.winRate, 0, 0)}%`}</td>
                    <td className={`py-1.5 pr-2 text-right font-bold tabular-nums ${tone(b.avgR)}`}>{rr(b.avgR)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{b.pf === Infinity ? "∞" : f2(b.pf)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums text-slate-500">{f2(b.feeR)}R</td>
                    <td className={`py-1.5 pr-2 text-right font-bold tabular-nums ${tone(usdB)}`}>{usd(usdB, 0)}</td>
                    {cfg.adaptive && <><td className={`py-1.5 pr-2 text-right font-bold tabular-nums ${a.n ? tone(usdA) : "text-slate-400"}`}>{a.n ? <>{usd(usdA, 0)} <span className="font-normal text-slate-400">· {a.n} lệnh</span></> : "không vào"}</td>
                      <td className="py-1.5 text-[11px]">{st?.pause ? <span className="font-bold text-rose-600">Tạm nghỉ (khung đang {rr(st.exp)})</span> : st?.exp != null ? <span className="font-bold text-emerald-700">Đang đánh ({rr(st.exp)})</span> : <span className="text-slate-400">đang học</span>}</td></>}
                  </tr>
                ));
              })()}</tbody>
            </table>
          </div>
          <div className="mt-1.5 text-[11px] leading-snug text-slate-400">Lãi/lỗ gốc = mọi tín hiệu của khung theo luật gốc trong danh mục. "Bot hiện tại" = kỳ vọng {cfg.lookback * 3} lệnh gần nhất của cả khung; âm thì bot tự nghỉ khung đó tới khi hồi lại.</div>
        </Card>

        {rawOld && (() => {
          const o = oldFin, so = statsMoney(o.baseTrades), sb = statsMoney(res.baseTrades), sa = statsMoney(res.trades);
          const cols = [["Bot (luật mới + tối ưu)", sa, res.portfolio, "text-violet-700"], ["Luật mới (cố định)", sb, res.basePortfolio, "text-emerald-700"], ["Bản cũ (chưa lọc vào đẹp)", so, o.basePortfolio, "text-slate-500"]].filter((c, i) => i || cfg.adaptive);
          return (
            <Card className="!p-3">
              <Title icon={Activity}>Luật vào đẹp có hiệu quả không? (cùng phiên, cùng dữ liệu)</Title>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-[12px]">
                  <thead><tr className="border-b border-slate-100 text-left text-[10px] uppercase text-slate-400"><th className="py-1.5 pr-2" />{cols.map(([l, , , c]) => <th key={l} className={`py-1.5 pr-2 text-right ${c}`}>{l}</th>)}</tr></thead>
                  <tbody>{[
                    ["Lệnh đã đóng", (s) => s.n], ["Tỉ lệ thắng", (s) => (s.winRate == null ? "—" : `${fmtNum(s.winRate, 1, 1)}%`)], ["Lời/lỗ TB mỗi lệnh (R)", (s) => rr(s.avgR)], ["Hệ số lãi (lãi ÷ lỗ)", (s) => (s.pf === Infinity ? "∞" : f2(s.pf))],
                    ["Vốn", (s, P) => usd(P.equity + P.unrealized, 0)], ["Sụt vốn lớn nhất", (s, P) => `${fmtNum(P.maxDD, 1, 1)}%`],
                  ].map(([l, f]) => <tr key={l} className="border-b border-slate-50"><td className="py-1.5 pr-2 font-bold text-slate-600">{l}</td>{cols.map(([k, s, P, c]) => <td key={k} className={`py-1.5 pr-2 text-right font-bold tabular-nums ${c}`}>{f(s, P)}</td>)}</tr>)}</tbody>
                </table>
              </div>
              <div className="mt-1.5 text-[11px] text-slate-400">Bản cũ = cùng tín hiệu, cùng lệnh chờ nhưng không kiểm tra đuổi giá / SL sát / Key Volume / volume nến tín hiệu / engulfing. {Object.entries(res.skipped).filter(([k]) => /đuổi|sát|không về|volume|engulf|D1/i.test(k)).map(([k, v]) => `${v} tín hiệu bị bỏ vì ${k}`).join(" · ")}</div>
            </Card>
          );
        })()}
        </>)}

        {tab === "opt" && (<>
        <RulesLog log={settings.paperBotLog} list={list} />
        {cfg.adaptive && cfg.learnLoss && (
          <Card className="!p-3">
            <Title icon={Brain}>Rút kinh nghiệm từ lệnh thua</Title>
            {(() => {
              const m = res.metaNow || {}, line = (x, name) => !x ? null : x.mb == null
                ? <div className="text-[12px] text-slate-500">• {name}: <b>đang thu thập</b> ({x.b || 0} tín hiệu bị chặn, cần ≥ {cfg.lessonMin} để kiểm chứng)</div>
                : <div className={`text-[12px] ${x.ok ? "text-emerald-700" : "text-amber-700"}`}>• {name}: <b>{x.ok ? "ĐANG ÁP DỤNG" : "CHỈ QUAN SÁT"}</b> — tín hiệu bị chặn TB <b>{rr(x.mb)}</b> so với tín hiệu được vào <b>{rr(x.mk)}</b> ({x.b} lệnh gần nhất){x.ok ? " → chặn đúng, giúp giảm lỗ." : " → chặn chưa đúng (lệnh bị chặn lại tốt hơn), nên chưa dùng để chặn."}</div>;
              return <div className="space-y-1 rounded-lg bg-slate-50 p-2.5">{line(m.lesson, "Bài học từ lệnh thua")}{line(m.opt, "Bộ tối ưu (tắt ô / nghỉ khung)")}
                <div className="text-[11px] text-slate-400">Mỗi lệnh thua, hệ thống xem đặc điểm của lệnh (ADX, biến động, khoảng cách EMA50, độ rộng SL, phiên, hướng, độ dốc EMA50, thân nến…). Đặc điểm nào {cfg.lessonN} lệnh gần nhất thua rõ (≤ −0,2R) thành bài học. Bài học chỉ được dùng để chặn khi chính nó chứng minh được là đúng.</div></div>;
            })()}
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Bài học hiện có ({res.lessonsActive.length})</div>
                {res.lessonsActive.length ? <div className="space-y-0.5">{res.lessonsActive.map((l) => <div key={l.k} className="flex items-center gap-2 text-[12px]"><span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{l.label}</span><span className="shrink-0 tabular-nums text-slate-400">{l.n} lệnh · thắng {fmtNum(l.win, 0, 0)}%</span><span className={`shrink-0 font-bold tabular-nums ${tone(l.exp)}`}>{rr(l.exp)}</span></div>)}</div> : <div className="text-[12px] text-slate-400">Chưa có đặc điểm nào thua rõ rệt.</div>}
              </div>
              <div>
                <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Nhật ký học ({res.lessons.length})</div>
                <div className="max-h-44 space-y-0.5 overflow-y-auto">{[...res.lessons].reverse().slice(0, 40).map((l, i) => (
                  <div key={i} className="text-[11.5px] leading-snug"><span className="tabular-nums text-slate-400">{dt(l.t)}</span> <b className={l.on ? "text-rose-700" : "text-emerald-700"}>{l.on ? "Học" : "Gỡ"}</b> {l.label} <span className="text-slate-400">({l.n} lệnh, {rr(l.exp)}){l.from ? ` · từ lệnh thua ${l.from}` : ""}</span></div>
                ))}</div>
              </div>
            </div>
          </Card>
        )}

        {cfg.adaptive && (
          <div className="grid gap-3 xl:grid-cols-3">
            <Card className="!p-3">
              <Title icon={Brain}>Tự tối ưu so với Luật gốc</Title>
              <table className="w-full text-[12px]">
                <thead><tr className="border-b border-slate-100 text-left text-[10px] uppercase text-slate-400"><th className="py-1.5 pr-2" /><th className="py-1.5 pr-2 text-right text-violet-600">Tự tối ưu</th><th className="py-1.5 pr-2 text-right">Luật gốc</th><th className="py-1.5 text-right">Bị loại*</th></tr></thead>
                <tbody>{[
                  ["Lệnh", (s) => s.n], ["Tỉ lệ thắng", (s) => (s.winRate == null ? "—" : `${fmtNum(s.winRate, 0, 0)}%`)], ["R TB", (s) => rr(s.avgR), true], ["Hệ số lãi", (s) => (s.pf === Infinity ? "∞" : f2(s.pf))], ["Tổng R", (s) => fmtNum(s.totalR, 1, 1), true],
                ].map(([l, f, col]) => (
                  <tr key={l} className="border-b border-slate-50">
                    <td className="py-1.5 pr-2 font-bold text-slate-600">{l}</td>
                    {[sAuto, sBase, sRej].map((s, i) => <td key={i} className={`py-1.5 pr-2 text-right font-bold tabular-nums ${col ? tone(s.avgR) : i === 0 ? "text-violet-700" : "text-slate-700"}`}>{f(s)}</td>)}
                  </tr>
                ))}
                  <tr className="border-b border-slate-50"><td className="py-1.5 pr-2 font-bold text-slate-600">Vốn / sụt vốn</td><td className="py-1.5 pr-2 text-right tabular-nums text-violet-700">{usd(res.portfolio.equity + res.portfolio.unrealized, 0)} / {fmtNum(res.portfolio.maxDD, 0, 0)}%</td><td className="py-1.5 pr-2 text-right tabular-nums">{usd(res.basePortfolio.equity + res.basePortfolio.unrealized, 0)} / {fmtNum(res.basePortfolio.maxDD, 0, 0)}%</td><td /></tr>
                </tbody>
              </table>
              <div className="mt-2 space-y-1 text-[11.5px] leading-snug text-slate-500">
                <div>* Bị loại = tín hiệu bộ tối ưu bỏ qua, tính <b>nếu vẫn vào</b> theo luật gốc.</div>
                {sRej.n >= 10 && sAuto.n >= 10 && <div className={`font-bold ${sRej.avgR < sAuto.avgR ? "text-emerald-700" : "text-rose-700"}`}>{sRej.avgR < sAuto.avgR ? `✓ Bộ tối ưu loại đúng: tín hiệu bị bỏ TB ${rr(sRej.avgR)} < lệnh được vào ${rr(sAuto.avgR)}.` : `✗ Bộ tối ưu đang loại nhầm: tín hiệu bị bỏ TB ${rr(sRej.avgR)} ≥ lệnh được vào ${rr(sAuto.avgR)} — đang bám nhiễu, cần thêm dữ liệu.`}</div>}
                <div>Học thêm {res.learned} tín hiệu trong {cfg.warmupDays} ngày trước ngày bắt đầu · hiện bật {optOn} ô, tắt {optOff} ô.</div>
              </div>
            </Card>
            <Card className="!p-3 xl:col-span-2">
              <Title icon={Brain} right={<button onClick={() => setOptAll((v) => !v)} className="text-[11px] font-bold text-indigo-600">{optAll ? "Thu gọn" : `Xem tất cả (${res.optState.length})`}</button>}>Bộ tối ưu đang quyết định</Title>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-[12px]">
                  <thead><tr className="border-b border-slate-100 text-left text-[10px] uppercase text-slate-400"><th className="py-1.5 pr-2">Cặp · khung · setup</th><th className="py-1.5 pr-2">Trạng thái</th><th className="py-1.5 pr-2">Cấu hình chọn</th><th className="py-1.5 pr-2 text-right">Kỳ vọng</th><th className="py-1.5 pr-2 text-right">Thắng</th><th className="py-1.5 pr-2 text-right">Mẫu</th><th className="py-1.5">Học từ</th></tr></thead>
                  <tbody>{(optAll ? res.optState : res.optState.slice(0, 10)).map((o) => (
                    <tr key={o.cell} className="border-b border-slate-50">
                      <td className="py-1.5 pr-2"><b>{o.coin}</b> {TFS[o.tf].label} <span className="text-slate-500">{setupName(o.setup)}</span></td>
                      <td className="py-1.5 pr-2">{o.level < 0 ? <Badge tone="slate">Đang học</Badge> : o.take ? <Badge tone="emerald">Bật</Badge> : <Badge tone="rose">Tắt</Badge>}</td>
                      <td className="py-1.5 pr-2 text-slate-600">{o.level < 0 ? "gốc" : o.variant}</td>
                      <td className={`py-1.5 pr-2 text-right font-bold tabular-nums ${tone(o.exp)}`}>{o.exp == null ? "—" : rr(o.exp)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{o.win == null ? "—" : `${fmtNum(o.win, 0, 0)}%`}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{o.n}</td>
                      <td className="py-1.5 text-[11px] text-slate-400">{o.level < 0 ? `cần ≥ ${cfg.minSample} lệnh` : LEVELS[o.level]}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {res.optLog.length > 0 && (<>
                <div className="mt-3 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Nhật ký tối ưu ({res.optLog.length} lần điều chỉnh)</div>
                <div className="mt-1 max-h-48 space-y-0.5 overflow-y-auto">{[...res.optLog].reverse().slice(0, 40).map((e, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-x-2 text-[11.5px]">
                    <span className="tabular-nums text-slate-400">{dt(e.t)}</span>
                    <b>{e.coin} {TFS[e.tf].label} {setupName(e.setup)}</b>
                    {e.take ? <span className="font-bold text-emerald-700">{e.prevOn === false ? "Bật lại" : e.first ? "Bật" : "Đổi"} → {e.level < 0 ? "luật gốc (chưa đủ mẫu)" : e.variant}</span> : <span className="font-bold text-rose-700">Tắt</span>}
                    {e.exp != null && <span className="text-slate-400">kỳ vọng {rr(e.exp)} / {e.n} lệnh · {LEVELS[e.level]}</span>}
                  </div>
                ))}</div>
              </>)}
            </Card>
          </div>
        )}
        {!cfg.adaptive && <Card><div className="text-[12px] text-slate-500">Phiên này tắt tự tối ưu.</div></Card>}
        </>)}

        <div className="flex items-start gap-2 px-3 text-[11px] leading-snug text-slate-400 sm:px-0">
          <ShieldAlert size={13} className="mt-0.5 shrink-0" />
          <span>Lệnh ẢO trên dữ liệu thật Binance Futures — không phải tư vấn đầu tư. <InfoTip label="Cách bot demo tính">Không đặt lệnh thật, khoá Binance vẫn chỉ đọc. Luật: chỉ nến đã đóng mới ra tín hiệu, chỉ vào lệnh chờ ở giá đóng nến tín hiệu (khớp khi giá xuyên qua, hết hạn thì huỷ), không đuổi giá, SL ngoài vùng nhiễu, SL &amp; TP cùng chạm 1 nến tính THUA, bỏ lệnh SL &gt; 4 ATR hoặc SL quá sát. Phí: vào lệnh chờ 0,02%, chốt lời 0,02%, cắt lỗ 0,05% + trượt giá, và phí FUNDING thật của Binance (BTC/ETH mỗi 8h, XAU mỗi 4h) khi giữ lệnh qua mốc funding. Lệnh mở theo giá realtime: chạm SL/TP là đóng ngay. Bộ tự tối ưu chỉ học từ lệnh đã đóng trước thời điểm quyết định. Kết quả quá khứ không đảm bảo tương lai — chỉ để kiểm tra phương pháp, không phải tư vấn đầu tư.</InfoTip></span>
        </div>
      </>)}
    </div>
  );
}
