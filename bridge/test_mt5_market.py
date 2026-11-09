# Kiểm tra mt5_market.py với MT5 + Supabase GIẢ (chạy: python3 bridge/test_mt5_market.py)
import sys, types, time, datetime as dt, json, os
sys.path.insert(0, os.path.dirname(__file__))
fake = types.ModuleType("MetaTrader5")
for k, v in dict(TIMEFRAME_M5=5, TIMEFRAME_M15=15, TIMEFRAME_H1=60, TIMEFRAME_H4=240, TIMEFRAME_D1=1440, TIMEFRAME_W1=10080, TIMEFRAME_MN1=43200).items(): setattr(fake, k, v)
class Info: 
    def __init__(s, name, digits): s.name, s.digits, s.spread = name, digits, 12
SYMS = {"XAUUSD": 2, "EURUSD": 5, "USDJPY": 3, "BTCUSD.x": 2}
fake.symbol_info = lambda n: Info(n, SYMS[n]) if n in SYMS else None
fake.symbols_get = lambda pat: [Info(n, d) for n, d in SYMS.items() if n.startswith(pat.rstrip("*"))]
fake.symbol_select = lambda n, f: True
NOW = int(time.time())
class Tick: pass
def tick(n):
    t = Tick(); t.time = NOW + 2 * 3600 + (3 * 3600 if False else 0); t.bid, t.ask = 2650.123, 2650.4; return t
fake.symbol_info_tick = tick
STEP = {5: 300, 15: 900, 60: 3600, 240: 14400, 1440: 86400, 10080: 604800, 43200: 2592000}
def rates(real, tf, pos, n):
    step = STEP[tf]; base = (NOW // step) * step + 2 * 3600  # giờ "máy chủ" = UTC + 2h
    out = []
    for i in range(n - 1, -1, -1):
        t = base - (i + pos) * step
        out.append({"time": t, "open": 1.0 + i * 0.001, "high": 1.1, "low": 0.9, "close": 1.05, "tick_volume": 100 + i})
    return out
fake.copy_rates_from_pos = rates
sys.modules["MetaTrader5"] = fake
os.environ["MT5_SERVER_OFFSET_H"] = "2"
import mt5_market as m
m.mt5 = fake

class FakeSupa:
    def __init__(s): s.rows = {}; s.cmd = {"watch": ["XAUUSD", "FOO", "BTCUSD"]}
    def upsert(s, rows):
        for r in rows: s.rows[r["id"]] = r
    def get_data(s, rid): return s.cmd if rid == "command" else None
f = m.Feed(FakeSupa()); f.tfc = {k: getattr(fake, v[0]) for k, v in m.TF.items()}
rows, payload = f.cycle()
d = payload["data"]
assert "FOO" in d["missing"] and "XAUUSD" in d["ok"] and "BTCUSD" in d["ok"], d["ok"]
assert f.real["BTCUSD"] == "BTCUSD.x"                       # hậu tố sàn được dò ra
assert len(rows) == len(d["ok"]) * len(m.TF), len(rows)     # lần đầu ghi đủ hàng nến mọi khung
r = next(x for x in rows if x["id"] == "mk|EURUSD|1h")["data"]
assert r["digits"] == 5 and len(r["bars"]) == 1000 and r["bars"][-1][0] == (NOW // 3600) * 3600  # giờ đã đổi sang UTC, đúng đầu giờ
assert abs(d["q"]["EURUSD"]["f"]["1h"][0] - r["bars"][-1][0]) == 0
assert d["live"] is True
f.pushed.update(f.pending)
rows2, _ = f.cycle()
assert rows2 == [], "chưa có nến mới thì không ghi lại hàng nến"
f.pending = {}
print("OK — mkq", len(json.dumps(payload)), "byte;", len(rows), "hàng nến, hàng 1h", len(json.dumps(r)), "byte")
# DST: mùa hè Mỹ → +3h, mùa đông → +2h
os.environ.pop("MT5_SERVER_OFFSET_H")
assert m.server_offset_s(dt.datetime(2026, 7, 1, tzinfo=dt.timezone.utc).timestamp()) == 3 * 3600
assert m.server_offset_s(dt.datetime(2026, 12, 1, tzinfo=dt.timezone.utc).timestamp()) == 2 * 3600
print("OK — DST")
