// BỘ KIẾN THỨC GIAO DỊCH của Quang — tổng hợp từ Drive:
//  • "EA trading": Kiến thức chiến lược EA (bản thường + 6/3), Kiến thức của bot (EA BTC v8), Tài liệu học Trade, Code EA (v8/v9/v17)
//  • "vsa": 86 slide khoá VSA Thực chiến (đã đọc trực tiếp từng ảnh, đối chiếu với VSA_Knowledge_Base)
// Diễn đạt lại thành quy tắc cô đọng để AI áp dụng khi phân tích. KHÔNG chứa thông tin tài khoản/ID cá nhân.

export const KNOWLEDGE_SOURCES = [
  "EA BTC (SMC & Price Action) v8 → v9 → v17",
  "Kiến thức chiến lược EA (Key Volume, SFP, OB chuẩn, QML, Volume Profile, quy trình 4 bước)",
  "Tài liệu học Trade (Demand/Supply zone + CHoCH khung nhỏ)",
  "VSA & Wyckoff — 86 slide (Volume, Climax, Up/Downthrust, No Supply, Phân kỳ volume, SOS, Breakout, Liquidity $$$)",
];

export const KNOWLEDGE = [
  {
    key: "core", title: "Nguyên tắc cốt lõi",
    rules: [
      "Chỉ xác nhận tín hiệu khi NẾN ĐÃ ĐÓNG; nến đang chạy có thể rút râu đảo chiều.",
      "Chỉ giao dịch SAU KHI cá mập (SM) đã lấy thanh khoản — không vào lệnh trước cú quét.",
      "Ưu tiên CONFIRM ENTRY (chờ test/nến xác nhận/cấu trúc nhỏ phá vỡ). Không đặt Limit 'chặn tàu' mù quáng tại vùng: giá xuyên qua hoặc stop hunt đều làm lệnh Limit thua. Risk entry chỉ khi có stop hunt kèm volume cao tại vùng mạnh.",
      "Chỉ vào lệnh TẠI vùng có lý do (Order Block, Key Volume, SDz, rìa vùng sideway); tín hiệu nến lơ lửng giữa biểu đồ hoặc ngay trước cản đối diện → đứng ngoài.",
      "Đa khung: khung lớn (D1/W) cho Location & xu hướng; khung giữa (H4/H1) cho vùng canh Buy/Sell; khung nhỏ cho xác nhận. Mục tiêu là điểm vào hợp lý, không phải thắng 100%.",
    ],
  },
  {
    key: "trend", title: "Xu hướng & bộ lọc",
    rules: [
      "Cấu trúc: HH+HL = tăng (chỉ ưu tiên BUY), LL+LH = giảm (chỉ ưu tiên SELL); chỉ dùng đỉnh/đáy đã xác nhận.",
      "EMA200: giá trên → ưu tiên BUY, dưới → ưu tiên SELL. EMA89 dốc phẳng (|slope| ≤ 2 bps/5 nến) hoặc ADX ≤ 20 = thị trường đi ngang → hạn chế đánh theo xu hướng.",
      "Protected Low = đáy tạo ra đỉnh cao nhất mới (uptrend); Protected High = đỉnh tạo ra đáy thấp nhất mới (downtrend). Đóng cửa thủng Protected = xu hướng có thể kết thúc (CHoCH). Sau CHoCH nên chờ thêm BOS cùng chiều mới tin xu hướng mới.",
      "Sideway (biên 20 nến < 2.5 ATR): chỉ đánh ở RÌA hộp khi có quét râu ra ngoài rồi đóng cửa vào trong (fakeout); tuyệt đối không đánh ở giữa hộp.",
    ],
  },
  {
    key: "zones", title: "Vùng giao dịch (SMC + Key Volume)",
    rules: [
      "Key Volume = nến volume đột biến (≥2–2.5× trung bình; mạnh nhất là nến vol lớn nhất 100 nến) — 'dấu chân cá mập'. SM vào đâu sẽ BẢO VỆ ở đó: khi giá quay lại vùng này mà volume lại kích mạnh + từ chối giá → cơ hội vào lệnh theo SM.",
      "SDz mạnh = vùng giá rời đi mạnh kèm volume siêu cao (vị thế SM). Vùng được phản ứng ≥2 lần càng mạnh; phía trên/dưới SDz là thanh khoản.",
      "Order Block = nến ngược màu cuối cùng trước cú phá cấu trúc (BOS/CHoCH). OB CHUẨN cần đủ 3: (1) hình thành sau cú quét thanh khoản (trap/SFP), (2) có BOS, (3) để lại FVG. Key Volume trùng OB = 'Super Zone' (ưu tiên số 1).",
      "FVG (khoảng trống 3 nến) chưa lấp: giá có xu hướng quay lại lấp → vùng canh lệnh. FTA = vùng phá vỡ chưa retest, thường thành cản cứng.",
      "Volume Profile: HVN (thanh khoản dày) là nam châm/cản; LVN (mỏng) giá trượt nhanh qua. Phá khỏi HVN vào LVN → đánh momentum, TP tại rìa HVN kế tiếp; chạm rìa HVN + SFP/engulfing → đánh đảo chiều, SL sau râu quét.",
      "Vùng vào lệnh hợp lý: sát Key Level nhất (SL tối ưu, R:R cao), tránh vào giữa range hay sát SDz đối diện.",
    ],
  },
  {
    key: "liquidity", title: "Thanh khoản ($$$)",
    rules: [
      "Thanh khoản nằm ở nơi retail đặt stop: swing high/low khung lớn, đỉnh/đáy bằng nhau, trendline, key level chạm nhiều lần, biên vùng tích lũy. Trên đỉnh = buy-stop, dưới đáy = sell-stop.",
      "Setup 4 bước theo volume: (1) xác định vùng liquidity trên/dưới SDz → (2) retail vào khi giá về SDz (volume tăng) → (3) SM vào khi giá chọc vào vùng $$$: volume tăng mạnh và giá BỊ CHẶN (climax/up-downthrust) → (4) giá test lại với volume THẤP → vào bằng nến đảo chiều hoặc cấu trúc nhỏ phá vỡ. Test volume còn cao → có thể cần test thêm.",
      "Stop hunt HỢP LỆ bắt buộc có volume cao/siêu cao (tail bar/pin bar quét qua thanh khoản). Bẫy giá (bull/bear trap) = đóng cửa xuyên S/R 1 hoặc vài nến rồi quay lại — volume có thể không rõ, dựa vào việc giá lấy lại mức. Shakeout/Spring thường sau tích lũy hoặc nhịp điều chỉnh.",
    ],
  },
  {
    key: "vsa", title: "VSA – đọc nến + volume",
    rules: [
      "Mỗi nến xét đủ 4 yếu tố: Volume (so MA20 volume), Spread (high−low), vị trí Close, và BỐI CẢNH (quan trọng nhất).",
      "Hài hoà: spread rộng + volume tăng = xu hướng hợp lệ. Phân kỳ: volume cao + spread hẹp (nỗ lực không kết quả, SM chặn đà) HOẶC spread rộng + volume thấp (thiếu thanh khoản, không bền).",
      "Buying Climax: đang tăng, nến volume cao/siêu cao, râu trên dài (25–50%) hoặc thân hẹp → SM đang bán. Selling Climax đối xứng ở đáy → SM gom. Climax CHƯA là lệnh: chờ CHoCH xác nhận (khi đó vùng climax thành SDz mạnh); nếu giá chỉ hồi nhẹ rồi đi tiếp → climax thất bại.",
      "Upthrust: râu vượt kháng cự/key level, đóng dưới, thân nhỏ, volume rất lớn → SM lấy thanh khoản để BÁN. Downthrust/Spring đối xứng → MUA. Thường ở Phase B Wyckoff (đỉnh/đáy thứ 2–3 của range).",
      "No Supply (mua): ở đáy cũ từ đáy thứ 2 trở đi sau climax/downthrust, nến thân hẹp + volume thấp hơn các nến trước → cạn cung. No Demand đối xứng ở đỉnh (bán). Test cung thành công = giá thử đáy với volume thấp.",
      "Stopping volume: 3 nến cùng chiều volume tăng dần, biên độ ngắn dần (≈ nêm) → cảnh báo phân phối/đảo chiều. Phân kỳ volume tại 2 đỉnh (đỉnh sau cao hơn, volume thấp hơn) → lực mua cạn; nếu giá vẫn đi tiếp sau phân kỳ thì vùng đó thành vị thế SM (invisible SDz).",
      "SOS (đáy, sau xu hướng giảm, volume cao): sức mạnh tăng dần Climax < Downthrust < Stopping vol < Bag holding < Two-bar reversal < Bottom reversal. Giao dịch 3 bước: SOS volume siêu cao → chờ đi ngang 2–8 nến thân ngắn volume thấp (có thể shakeout) → vào khi nến đóng vượt nến giảm gần nhất / phá cấu trúc nhỏ, break phải có volume cao.",
      "Wyckoff: Selling Climax mở đầu Tích lũy (SC→AR→ST→Spring→phá kháng cự); Buying Climax mở đầu Phân phối (BC→range→UT/LPSY→phá hỗ trợ).",
    ],
  },
  {
    key: "breakout", title: "Breakout",
    rules: [
      "KHÔNG vào lệnh ngay trên nến breakout. Breakout volume THẤP = thiếu SM, nghi giả. Breakout volume SIÊU CAO vào vùng liquidity mà spread nhỏ/râu dài = SM có thể đang lấy thanh khoản để bán → nguy cơ 'xiên', sẵn sàng đổi bias.",
      "Breakout an toàn: (a) Buildup — nén sát key level rồi phá; (b) Break → Test volume thấp nằm trên key level (absorption/test for supply) → nến Confirm; (c) phá mạnh, hồi sâu test key level rồi confirm.",
      "Quy tắc 2 nến (EA): nến phá vỡ thân dài + volume lớn, nến kế tiếp cùng màu đóng cửa vượt nến trước mới vào (Market tại giá đóng nến xác nhận). Nếu nến sau đóng ngược qua đáy/đỉnh nến phá vỡ → huỷ.",
      "Khi giá tới cản: (1) đục thẳng qua với volume lớn → chờ retest rồi đánh theo; (2) không phá, rút râu liên tục → chờ 1 nến xác nhận thân dài râu ngắn (marubozu) mới vào.",
    ],
  },
  {
    key: "setups", title: "Các setup vào lệnh",
    rules: [
      "TREND_CONFIRM: thuận xu hướng (EMA200 + cấu trúc), giá hồi chạm Key Volume/hỗ trợ có nén giá, nến tín hiệu (engulfing có volume > nến trước hoặc nến lớn ≥0.8 ATR) + volume > TB20, rồi nến xác nhận → vào. SL sau Protected High/Low gần nhất (không đặt sát râu nến tín hiệu).",
      "SMC_REVERSAL: CHoCH (đóng thủng Protected) → xác định OB khởi nguồn → CHỜ giá hồi về OB → pin bar/engulfing (hoặc micro-CHoCH khung nhỏ) tại OB → vào. SL ngay sau OB. Không FOMO ngay khi vừa CHoCH.",
      "SFP: râu quét qua đỉnh/đáy swing cũ nhưng đóng cửa quay lại → vào khi nến đóng, SL tại râu quét (+đệm). Chỉ đánh khi mức bị quét trùng Key Volume/cản khung lớn và có volume cao.",
      "OB CHUẨN (Trap→BOS→FVG): canh tại mép OB hoặc 50% thân nến OB, an toàn hơn là chờ engulfing khung nhỏ.",
      "QML: Đỉnh1 → Đáy1 → Đỉnh2 cao hơn (quét) → Đáy2 thấp hơn (BOS) → canh SELL tại giá Đỉnh1 (vai trái), mạnh nhất khi trùng Key Volume. Đối xứng cho BUY.",
      "2 đỉnh/2 đáy CÓ TRAP: không vào khi giá chạm đỉnh/đáy cũ; chờ giá đâm thủng (trap) rồi SFP/engulfing quay lại mới vào; SL sau râu quét. Theo VSA: đáy/đỉnh 1 volume cao, lần 2 volume thấp hơn rõ.",
      "Mẫu nến xác nhận: Engulfing kèm volume tăng, Mother Bar breakout (đóng vượt giá mở nến mẹ), 3-Bar Reversal (nến 2 quét, nến 3 đóng vượt cả 2 nến trước), Pin bar. Có giá trị nhất: sau trap/SFP, thuận xu hướng lớn, tại key level, ở rìa sideway.",
    ],
  },
  {
    key: "risk", title: "Điểm vào, cắt lỗ, chốt lời & quản lý lệnh",
    rules: [
      "SL theo CẤU TRÚC: sau Protected High/Low, sau toàn bộ vùng OB/tích lũy, hoặc sau râu quét thanh khoản; cộng đệm ~0.2 ATR. Không đặt SL bên trong vùng.",
      "Bộ lọc khoảng cách: |Entry − SL| không quá 4 × ATR — nến phá vỡ quá dài đẩy giá xa vùng thì HUỶ lệnh (tránh đuổi giá).",
      "TP tại thanh khoản đối diện (đỉnh/đáy gần nhất chưa quét, equal highs/lows), OB/HVN kế tiếp; R:R tối thiểu ~1:2, có thể thả trôi theo xu hướng (EA giới hạn 3R–10R).",
      "Quản lý: giá chạy +1R → dời SL về hoà vốn (dương nhẹ); trailing theo ATR (×1.8–3); thoát nếu giá đi ngang trong vùng quá ~5 nến không chạy hoặc xuất hiện nến đảo chiều mạnh ngược hướng; nhưng trong ~3–10 nến đầu tôn trọng SL ban đầu. Chốt sớm khi chạm Key Volume/OB đối diện kèm nến từ chối. Thoát khẩn cấp khi cấu trúc khung lớn CHoCH ngược chiều.",
      "Rủi ro mỗi lệnh ~1% tài khoản (khối lượng = 1% vốn / khoảng cách SL).",
    ],
  },
];

// Bản văn bản gọn để nạp vào system prompt của AI
export const PLAYBOOK_TEXT = KNOWLEDGE.map((s, i) => `${i + 1}. ${s.title.toUpperCase()}\n${s.rules.map((r) => `- ${r}`).join("\n")}`).join("\n\n");

export const SETUP_TYPES = ["TREND_CONFIRM", "SMC_REVERSAL", "SFP", "OB_CHUAN", "QML", "DOUBLE_TRAP", "VSA_SOS", "BREAKOUT_TEST", "VOLUME_PROFILE", "KHAC"];
