import { describe, it, expect } from "vitest";
import { timeLeft } from "../src/lib/format.js";

describe("timeLeft (lệnh chờ còn bao lâu, 10/11)", () => {
  const now = 1_800_000_000_000;
  it("phút / giờ / ngày / sắp hết", () => {
    expect(timeLeft(now + 30_000, now)).toBe("sắp hết hạn");
    expect(timeLeft(now - 60_000, now)).toBe("sắp hết hạn");
    expect(timeLeft(now + 12 * 60_000, now)).toBe("còn 12 phút");
    expect(timeLeft(now + 135 * 60_000, now)).toBe("còn 2 giờ 15 phút");
    expect(timeLeft(now + 3 * 3600_000, now)).toBe("còn 3 giờ");
    expect(timeLeft(now + 26 * 3600_000, now)).toBe("còn 1 ngày 2 giờ");
    expect(timeLeft(undefined, now)).toBe("");
  });
});
