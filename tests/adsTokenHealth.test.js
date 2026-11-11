import { describe, it, expect } from "vitest";
import { classifyAdsError, updateHealth, tokenWarnings, expiredOnFromMsg } from "../src/lib/adsTokenHealth.js";
import { highlightParts, searchWords, intersectHits } from "../src/lib/library.js";

describe("token TKQC — nhận lỗi", () => {
  it("phân loại lỗi Facebook", () => {
    expect(classifyAdsError("Error validating access token: Session has expired on Tuesday, 05-Nov-26")).toBe("token");
    expect(classifyAdsError("Invalid OAuth access token - Cannot parse access token")).toBe("token");
    expect(classifyAdsError("Chưa có token")).toBe("token");
    expect(classifyAdsError("(#200) Ad account owner has NOT grant ads_management or ads_read permission")).toBe("perm");
    expect(classifyAdsError("An unexpected error has occurred. Please retry your request later.")).toBe("other");
    expect(classifyAdsError("")).toBeNull();
  });
  it("đọc ngày hết hạn trong lỗi", () => expect(expiredOnFromMsg("Session has expired on Tuesday, 05-Nov-26 01:00:00 PST")).toBe("05/11/2026"));
  it("nhớ lần tải được cuối + lỗi tạm chỉ báo khi kéo dài ≥ 1 giờ", () => {
    const t0 = 1_800_000_000_000;
    let h = updateHealth({}, [{ id: "1", name: "A" }], t0);
    expect(h["1"].lastOk).toBe(t0);
    const bad = [{ id: "1", name: "A", error: "Please retry your request later" }];
    h = updateHealth(h, bad, t0 + 60000);
    expect(tokenWarnings(h, bad, t0 + 60000)).toEqual([]);
    h = updateHealth(h, bad, t0 + 2 * 3600000);
    expect(h["1"].firstErr).toBe(t0 + 60000);
    const w = tokenWarnings(h, bad, t0 + 2 * 3600000);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ kind: "other", lastOk: t0 });
    // Google không tính
    expect(tokenWarnings({}, [{ id: "g-error", platform: "google", error: "x token" }])).toEqual([]);
  });
});

describe("Kho tài liệu — tô sáng + tìm từng từ", () => {
  it("tô sáng không phân biệt dấu, giữ nguyên chữ gốc", () => {
    const parts = highlightParts("Quản lý kho hàng", "quan ly");
    expect(parts.filter((p) => p.hit).map((p) => p.t)).toEqual(["Quản lý"]);
    expect(parts.map((p) => p.t).join("")).toBe("Quản lý kho hàng");
  });
  it("tô từng từ khi không liền nhau", () => {
    expect(highlightParts("Doanh thu tháng 10 tăng", "doanh tang").filter((p) => p.hit).map((p) => p.t)).toEqual(["Doanh", "tăng"]);
  });
  it("từ khoá: bỏ dấu, ≥2 ký tự, tối đa 4", () => expect(searchWords("Đơn a hàng tồn kho cũ mới")).toEqual(["don", "hang", "ton", "kho"]));
  it("gộp kết quả: chỉ tài liệu có đủ mọi từ", () => {
    const m = intersectHits([[{ id: "1", snippet: "s1" }, { id: "2", snippet: "s2" }], [{ id: "2", snippet: "x" }]]);
    expect([...m]).toEqual([["2", "s2"]]);
  });
});
