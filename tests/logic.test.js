// Kiểm thử phần TÍNH TOÁN (lỗi số liệu tìm thấy 01/11 — giữ để không tái phát)
import { describe, it, expect } from "vitest";
import { formatShort } from "../src/lib/format.js";
import { expensesInRange, debtToDate, totalDebt } from "../src/lib/selectors.js";
import { parseQuickTask } from "../src/lib/quickTask.js";
import { memberAccess } from "../src/lib/permissions.js";
import { projects } from "./fixture.js";

describe("định dạng số", () => {
  it("thập phân kiểu Việt (dấu phẩy)", () => {
    expect(formatShort(891_900_000)).toBe("891,9 tr");
    expect(formatShort(1_500_000_000)).toBe("1,5 tỷ");
    expect(formatShort(450_000)).toBe("450k");
  });
});

describe("chi phí định kỳ", () => {
  it("bắt đầu ngày 31 vẫn đủ mỗi tháng 1 kỳ (kẹp cuối tháng)", () => {
    const e = [{ id: "e", amount: 100, date: "2025-01-31", recurring: "monthly", active: true }];
    const r = expensesInRange(e, "2025-01-01", "2025-12-31");
    expect(r.items[0].count).toBe(12);
    expect(r.total).toBe(1200);
  });
  it("hằng năm ngày 29/2 → năm thường vẫn tính 1 lần", () => {
    const e = [{ id: "y", amount: 100, date: "2024-02-29", recurring: "yearly", active: true }];
    expect(expensesInRange(e, "2025-01-01", "2025-12-31").items[0].count).toBe(1);
  });
  it("khoản tạm dừng không tính", () => {
    const e = [{ id: "x", amount: 100, date: "2025-01-01", recurring: "monthly", active: false }];
    expect(expensesInRange(e, "2025-01-01", "2025-12-31").total).toBe(0);
  });
});

describe("công nợ", () => {
  it("nợ tới hạn không tính đợt có ngày tương lai", () => {
    const t = new Date(), today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
    expect(totalDebt(projects)).toBeGreaterThan(debtToDate(projects, today));
  });
});

describe("thêm việc nhanh", () => {
  const now = new Date(2026, 10, 1);
  it("'mai' là ngày mai", () => expect(parseQuickTask("Gửi báo cáo mai", [], now).date).toBe("2026-11-02"));
  it("'chị Mai' là tên người", () => { const r = parseQuickTask("Gọi chị Mai", [], now); expect(r.date).toBeNull(); expect(r.title).toBe("Gọi chị Mai"); });
  it("ngày không có thật không được hiểu là ngày", () => expect(parseQuickTask("Nộp 31/2", [], now).date).toBeNull());
  it("giờ chiều", () => expect(parseQuickTask("Họp 3h chiều", [], now).time).toBe("15:00"));
});

describe("phân quyền", () => {
  it("thành viên KHÔNG xem tiền coin dù hồ sơ cũ lỡ cấp", () => {
    const a = memberAccess({ email: "nv@x.com", access: { coinInvest: "edit", coinLive: "view", coinMarket: "view" } });
    expect(a.coinInvest).toBe("none");
    expect(a.coinLive).toBe("none");
    expect(a.coinMarket).toBe("view");
  });
});

describe("nhãn biểu đồ Coin (05/11)", async () => {
  const { buildLines, modeOf, loadTags } = await import("../src/components/CoinCharts.jsx");
  const levels = [{ price: 10, title: "Protected H", color: "#f00" }, { price: 5, title: "POC", color: "#999" }];
  const all = Object.fromEntries(["protH", "protL", "kvUp", "kvDn", "poc", "ai"].map((k) => [k, "full"]));
  it("3 mức: có nhãn / chỉ đường / ẩn", () => {
    expect(buildLines({ levels, tags: all }).map((l) => [l.title, l.axis])).toEqual([["Protected H", true], ["POC", true]]);
    expect(buildLines({ levels, tags: { ...all, protH: "line" } })[0].axis).toBe(false);
    expect(buildLines({ levels, tags: { ...all, poc: "off" } }).map((l) => l.title)).toEqual(["Protected H"]);
  });
  it("ô nhỏ tự ẩn nhãn nhưng giữ đường", () => {
    expect(modeOf(all, "poc", true)).toBe("line");
    expect(modeOf({ poc: "off" }, "poc", true)).toBe("off");
    expect(buildLines({ levels, tags: all, compact: true }).every((l) => l.axis === false)).toBe(true);
  });
  it("máy đã tắt nhóm cũ → chuyển đúng sang từng nhãn", () => {
    localStorage.removeItem("qws_mkt_tags");
    localStorage.setItem("qws_mkt_layers", JSON.stringify({ ema: false, levels: true }));
    const t = loadTags();
    expect([t.ema20, t.ema50, t.protH, t.poc, t.smc]).toEqual(["off", "off", "full", "full", "full"]);
    localStorage.removeItem("qws_mkt_layers");
  });
});

describe("công cụ vẽ Coin (06/11)", async () => {
  const { makeScale, moveDrawing, makeDrawing } = await import("../src/lib/chartDraw.js");
  const C = [0, 3600, 7200, 10800].map((time) => ({ time }));
  const sc = makeScale(C);
  it("thời gian ↔ chỉ số nến, ngoài vùng nến thì ngoại suy", () => {
    expect(sc.toL(3600)).toBe(1);
    expect(sc.toL(5400)).toBe(1.5);
    expect(sc.toL(18000)).toBe(5); // 2 nến sau nến cuối
    expect(sc.toT(-1)).toBe(-3600);
    expect(sc.toT(sc.toL(9000))).toBe(9000);
  });
  it("dời hình: đúng số nến + giá; đường ngang chỉ đổi giá", () => {
    const r = makeDrawing("rect", { t: 0, price: 100 }, { t: 7200, price: 90 }, "1h");
    const m = moveDrawing(r, 1, 5, sc);
    expect([m.p1.t, m.p1.price, m.p2.t, m.p2.price]).toEqual([3600, 105, 10800, 95]);
    const h = moveDrawing(makeDrawing("hline", { t: 0, price: 50 }, null, "1h"), 3, -2, sc);
    expect(h.price).toBe(48);
    expect(h.p1).toBeUndefined();
  });
});

describe("phương pháp SW3 (06/11)", async () => {
  const { cfgOf, finalize } = await import("../src/lib/paperBot.js");
  const cfg = cfgOf({ cfg: { strategy: "sw3", riskPct: 1, tfs: ["5m"], setups: ["TREND"] } });
  const base = { id: "BTC-4h-1-SW3", key: "BTC|4h", coin: "BTC", tf: "4h", setup: "SW3", side: 1, entryAt: 1000, entry: 100, sl: 90, curSl: 90, tp: 107.5, risk: 10, part: 0, pf: 1 / 3, feeR: 0.01, exitAt: null, r: null, lastBarAt: 1000, last: 100 };
  const raw = (t) => ({ cfg, startAt: 0, until: 2000, stopped: false, trades: [t], baseTrades: [t] });
  it("cấu hình SW3 luôn H4, không tối ưu, không dừng ngày", () => {
    expect(cfg.tfs).toEqual(["4h"]);
    expect(cfg.setups).toEqual(["SW3"]);
    expect(cfg.adaptive).toBe(false);
    expect(cfg.dailyStopPct).toBe(0);
    expect(cfg.maxOpen).toBe(4);
    expect(cfg.sw.partR).toBe(0.75);
  });
  it("chạm mức chốt 1/3 KHÔNG đóng cả lệnh, chạm SL thì đóng", () => {
    const up = finalize(raw(base), { "BTC|4h": { t: 2000, h: 109, l: 99, c: 108 } }).trades[0];
    expect(up.exitAt).toBeNull();
    expect(up.uR).toBeCloseTo(0.8 - 0.01, 5);
    const dn = finalize(raw({ ...base, part: 0.75, curSl: 100 }), { "BTC|4h": { t: 2000, h: 101, l: 99, c: 99.5 } }, new Map()).trades[0];
    expect(dn.exitAt).not.toBeNull();
    expect(dn.reason).toBe("Chốt 1/3 + hoà vốn");
    expect(dn.r).toBeCloseTo(0.25 - 0.01 - (2 / 3) * 0.0007 * 100 / 10, 5); // 1/3 × 0,75R − phí
  });
  it("dừng ngày 0 = không bỏ lệnh nào", () => {
    const L = [0, 1, 2].map((i) => ({ ...base, id: `x${i}`, coin: `C${i}`, entryAt: 1000 + i, exitAt: 1000 + i + 0.5, r: -1 }));
    const P = finalize({ cfg, startAt: 0, until: 5000, stopped: true, trades: L, baseTrades: L }, null).portfolio;
    expect(P.trades.filter((t) => t.status === "skip").length).toBe(0);
  });
});

describe("phương án D (06/11): SW3 + lệnh chờ M15 + 18 mã", async () => {
  const { cfgOf, finalize, SW3D_COINS2, MAX_COINS } = await import("../src/lib/paperBot.js");
  const cfg = cfgOf({ cfg: { strategy: "sw3", sw: { entry: "lim" }, riskByCoin: { LINK: 0.45 } } });
  it("cấu hình D: 18 mã, rủi ro 0,85%, tối đa 10 lệnh, lệnh chờ 0,25 ATR trong 4 giờ", () => {
    expect(MAX_COINS).toBeGreaterThanOrEqual(18);
    expect(cfg.coins.length).toBe(18);
    expect(cfg.coins).toEqual(expect.arrayContaining(SW3D_COINS2));
    expect(cfg.riskPct).toBe(0.85);
    expect(cfg.maxOpen).toBe(10);
    expect(cfg.sw).toMatchObject({ entry: "lim", limAtr: 0.25, limH: 4, stopAtr: 2, partR: 0.75 });
    expect(cfg.cfgVer).toBe(14);
  });
  it("phiên SW3 cũ (không có sw.entry) giữ nguyên vào thị trường, 8 mã, 4 lệnh", () => {
    const old = cfgOf({ cfg: { strategy: "sw3" } });
    expect(old.sw.entry).toBeUndefined();
    expect(old.coins.length).toBe(8);
    expect(old.maxOpen).toBe(4);
  });
  it("rủi ro theo mã: mã mới 0,45%, mã cũ 0,85%", () => {
    const mk = (coin, i) => ({ id: `${coin}-4h-${i}-SW3`, key: `${coin}|4h`, coin, tf: "4h", setup: "SW3", side: 1, entryAt: 1000 + i, entry: 100, sl: 90, curSl: 90, tp: 107.5, risk: 10, part: 0, pf: 1 / 3, feeR: 0, exitAt: 1500 + i, r: -1, lastBarAt: 1000 });
    const L = [mk("BTC", 0), mk("LINK", 1)];
    const P = finalize({ cfg, startAt: 0, until: 5000, stopped: true, trades: L, baseTrades: L }, null).portfolio;
    const [b, l] = P.trades;
    expect(b.riskUsd).toBeCloseTo(1000 * 0.0085, 6);
    expect(l.riskUsd).toBeCloseTo(1000 * 0.0045, 6); // lệnh BTC chưa đóng lúc LINK vào → vốn vẫn 1.000$
  });
});
