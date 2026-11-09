# -*- coding: utf-8 -*-
"""
mt5_market.py — Cầu nối GIÁ + NẾN từ MT5 lên Supabase cho tab "Thị trường Forex" của Quang Workspace (09/11/2026).

Chạy trên máy bàn Windows, cạnh MT5 (terminal đã đăng nhập IC Markets). CHỈ ĐỌC dữ liệu: không gọi order_send,
không đặt/sửa/đóng lệnh, không đụng EA, không hỏi mật khẩu. Chạy song song với mt5_bridge.py (EA) được, hai tiến trình độc lập.

Ghi vào bảng qws_mt5_bot (đã có sẵn, cùng bảng của EA) bằng service key:
  mk|<MÃ>|<khung>  nến [t(giây UTC), open, high, low, close, tick_volume] — ghi lúc khởi động + mỗi khi nến mới mở
  mkq              ~6 giây/lần: bid/ask/spread + nến ĐANG CHẠY của mọi khung, ok[] (mã có), missing[] (sàn không có)
Đọc: dòng 'command' → data.watch (mã THÊM do app yêu cầu) để theo dõi thêm ngoài danh sách mặc định.

Cấu hình: file .env cạnh script (hoặc thư mục cha) hoặc biến môi trường — tìm khoá SUPABASE_URL và khoá service
(SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_KEY). Dùng đúng giá trị mà mt5_bridge.py đang dùng.
Tuỳ chọn: MT5_SERVER_OFFSET_H (ép lệch giờ máy chủ so với UTC, vd 2 hoặc 3), MT5_FX_SYMBOLS (thêm mã, cách nhau dấu phẩy).
"""
import json, os, sys, time, datetime as dt, urllib.request, urllib.error
from zoneinfo import ZoneInfo

try:
    import MetaTrader5 as mt5
except ImportError:  # cho phép import để chạy test với mt5 giả
    mt5 = None

VERSION = 1
DEFAULT = ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "BTCUSD", "ETHUSD", "US500", "JP225", "US2000"]  # = FX_DEFAULT trong app
TF = {  # khoá app -> (tên hằng MT5, số nến lưu)
    "5m": ("TIMEFRAME_M5", 400), "15m": ("TIMEFRAME_M15", 600), "1h": ("TIMEFRAME_H1", 1000), "4h": ("TIMEFRAME_H4", 1000),
    "1d": ("TIMEFRAME_D1", 1000), "1w": ("TIMEFRAME_W1", 600), "1M": ("TIMEFRAME_MN1", 200),
}
TABLE = "qws_mt5_bot"
QUOTE_EVERY = 6      # giây
WATCH_EVERY = 30     # giây đọc lại danh sách mã thêm
NY = ZoneInfo("America/New_York")


def log(*a):
    print(dt.datetime.now().strftime("%H:%M:%S"), *a, flush=True)


# ---------- cấu hình ----------
def load_env():
    env = dict(os.environ)
    here = os.path.dirname(os.path.abspath(__file__))
    # cùng nguồn khoá với mt5_bridge.py: QWS_ENV, hoặc .env của qws-live-bot (máy bàn Windows)
    files = [os.path.join(here, ".env"), os.path.join(os.path.dirname(here), ".env")]
    files.append(os.environ.get("QWS_ENV") or r"C:\Users\PC\Projects\qws-live-bot\.env")
    for f in files:
        if os.path.isfile(f):
            for line in open(f, encoding="utf-8", errors="ignore"):
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    return env


def pick(env, names):
    for n in names:
        if env.get(n):
            return env[n]
    return None


class Supa:
    def __init__(self, url, key):
        self.base = url.rstrip("/") + "/rest/v1/" + TABLE
        self.h = {"apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json"}

    def _req(self, method, url, body=None, extra=None):
        data = json.dumps(body, separators=(",", ":")).encode() if body is not None else None
        h = dict(self.h); h.update(extra or {})
        r = urllib.request.Request(url, data=data, method=method, headers=h)
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.read()

    def upsert(self, rows):
        for i in range(0, len(rows), 8):  # lô nhỏ cho khỏi quá giới hạn kích thước
            self._req("POST", self.base + "?on_conflict=id", rows[i:i + 8], {"Prefer": "resolution=merge-duplicates,return=minimal"})

    def get_data(self, rid):
        raw = self._req("GET", f"{self.base}?id=eq.{rid}&select=data")
        arr = json.loads(raw or b"[]")
        return arr[0]["data"] if arr else None


# ---------- thời gian ----------
def server_offset_s(utc_guess):
    """Lệch giờ máy chủ IC Markets so với UTC (giây): GMT+2, mùa hè Mỹ GMT+3. MT5_SERVER_OFFSET_H ép cố định."""
    f = os.environ.get("MT5_SERVER_OFFSET_H")
    if f:
        return int(float(f) * 3600)
    d = dt.datetime.fromtimestamp(utc_guess, dt.timezone.utc).astimezone(NY)
    return 3 * 3600 if d.dst() else 2 * 3600


def to_utc(t_server):
    return int(t_server - server_offset_s(t_server - 2 * 3600))


# ---------- MT5 ----------
class Feed:
    def __init__(self, supa):
        self.supa = supa
        self.real = {}        # mã chuẩn -> tên thật trên sàn
        self.missing = set()
        self.pushed = {}      # (mã, khung) -> t nến đang chạy lần cuối ghi THÀNH CÔNG
        self.pending = {}     # như trên nhưng chưa chắc đã ghi — chỉ chuyển sang pushed sau khi Supabase nhận
        self.watch = []
        self.watch_at = 0
        self.tfc = {k: getattr(mt5, v[0]) for k, v in TF.items()} if mt5 else {}

    def resolve(self, sym):
        if sym in self.real:
            return self.real[sym]
        if sym in self.missing:
            return None
        name = None
        if mt5.symbol_info(sym) is not None:
            name = sym
        else:
            cand = [s.name for s in (mt5.symbols_get(sym + "*") or []) if s.name.upper().startswith(sym)]
            cand.sort(key=len)
            name = cand[0] if cand else None
        if name and mt5.symbol_select(name, True):
            self.real[sym] = name
            log("mã", sym, "->", name)
            return name
        self.missing.add(sym)
        log("KHÔNG có mã", sym)
        return None

    def symbols(self):
        if time.time() - self.watch_at > WATCH_EVERY:
            self.watch_at = time.time()
            try:
                cmd = self.supa.get_data("command") or {}
                self.watch = [str(x).upper() for x in cmd.get("watch", []) if str(x).replace("_", "").isalnum()][:30]
            except Exception as e:  # noqa: BLE001
                log("đọc watch lỗi:", e)
        extra = [x.strip().upper() for x in os.environ.get("MT5_FX_SYMBOLS", "").split(",") if x.strip()]
        out = []
        for s in DEFAULT + extra + self.watch:
            if s not in out:
                out.append(s)
        return out

    def bars(self, real, tf, n, pos=0):
        r = mt5.copy_rates_from_pos(real, self.tfc[tf], pos, n)
        return [] if r is None else r

    def row_bar(self, b, digits):
        return [to_utc(int(b["time"])), round(float(b["open"]), digits), round(float(b["high"]), digits), round(float(b["low"]), digits), round(float(b["close"]), digits), int(b["tick_volume"])]

    def cycle(self):
        syms, ok, q, rows, live = self.symbols(), [], {}, [], False
        self.pending = {}
        now = time.time()
        for sym in syms:
            real = self.resolve(sym)
            if not real:
                continue
            info = mt5.symbol_info(real); tick = mt5.symbol_info_tick(real)
            if info is None or tick is None:
                continue
            ok.append(sym)
            d = int(info.digits)
            if tick.time and now - to_utc(int(tick.time)) < 600:
                live = True
            f = {}
            for tf in TF:
                cur = self.bars(real, tf, 1)
                if len(cur) == 0:
                    continue
                bar = self.row_bar(cur[-1], d)
                f[tf] = bar
                if self.pushed.get((sym, tf)) != bar[0]:  # nến mới mở (hoặc lần đầu) → ghi lại cả hàng nến
                    full = self.bars(real, tf, TF[tf][1])
                    if len(full):
                        rows.append({"id": f"mk|{sym}|{tf}", "data": {"sym": sym, "tf": tf, "digits": d, "upd": int(now * 1000), "bars": [self.row_bar(b, d) for b in full]}, "updated_at": dt.datetime.utcnow().isoformat() + "Z"})
                        self.pending[(sym, tf)] = bar[0]
            q[sym] = {"bid": round(float(tick.bid), d), "ask": round(float(tick.ask), d), "digits": d, "spread": int(info.spread), "f": f}
        payload = {"id": "mkq", "data": {"v": VERSION, "ts": int(now * 1000), "live": live, "ok": ok, "missing": sorted(self.missing), "q": q}, "updated_at": dt.datetime.utcnow().isoformat() + "Z"}
        return rows, payload


def main():
    if mt5 is None:
        sys.exit("Thiếu thư viện MetaTrader5 — chạy: pip install MetaTrader5")
    env = load_env()
    url, key = pick(env, ["SUPABASE_URL", "VITE_SUPABASE_URL"]), pick(env, ["SUPABASE_SERVICE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_KEY"])
    if not url or not key:
        sys.exit("Không thấy SUPABASE_URL / khoá service trong .env — dùng đúng giá trị của mt5_bridge.py")
    for k, v in env.items():
        if k.startswith("MT5_"):
            os.environ[k] = v
    supa = Supa(url, key)
    while not mt5.initialize():
        log("MT5 chưa sẵn sàng:", mt5.last_error(), "— thử lại sau 15 giây")
        time.sleep(15)
    log("đã nối MT5", mt5.terminal_info().name if mt5.terminal_info() else "")
    feed = Feed(supa)
    fails = 0
    while True:
        t0 = time.time()
        try:
            rows, payload = feed.cycle()
            supa.upsert(rows + [payload])
            feed.pushed.update(feed.pending)
            if rows:
                log(f"ghi {len(rows)} hàng nến + giá ({len(payload['data']['ok'])} mã)")
            fails = 0
        except (urllib.error.URLError, OSError) as e:
            fails += 1; log("lỗi mạng/Supabase:", e)  # pending bị bỏ → chu kỳ sau ghi lại hàng nến
        except Exception as e:  # noqa: BLE001
            fails += 1; log("lỗi:", repr(e))
            if fails >= 5:
                mt5.shutdown(); time.sleep(5); mt5.initialize()
        time.sleep(max(1.0, QUOTE_EVERY - (time.time() - t0)))


if __name__ == "__main__":
    main()
