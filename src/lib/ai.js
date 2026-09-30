// Gọi OpenAI API (client-side) để bóc tách dữ liệu từ ảnh / đoạn chat
// thành khách hàng + dự án + đợt thu. Key/model truyền vào từ store.settings.

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function systemPrompt() {
  const today = iso(new Date());
  return `Bạn là trợ lý NHẬP LIỆU cho app quản lý dịch vụ marketing (Web, App, ADS, Coaching, Seo, Landing, Khác).
Nhiệm vụ: đọc ảnh hoặc đoạn text người dùng đưa, trích xuất thành JSON khách hàng + dự án + các ĐỢT THU.
Hôm nay là ${today}. Chỉ trả về JSON, không giải thích.

QUY TẮC:
- Tiền: "10tr"=10000000, "1tr5"=1500000, "500k"=500000, "8 triệu"=8000000. Trả về SỐ nguyên đồng (number), không có dấu chấm.
- Ngày: nếu chỉ có ngày/tháng (vd 9/1) → giả định năm hiện tại. Định dạng "YYYY-MM-DD". Không rõ thì để hôm nay.
- Mỗi DÒNG text thường là 1 ĐỢT THU. Gộp các đợt cùng 1 khách + cùng loại dịch vụ vào CHUNG 1 dự án (project.installments).
- category phải thuộc: Web, App, ADS, Coaching, Seo, Landing, Khác.
- Với ADS: amount = số tiền NHẬN (ngân sách khách đưa); serviceFee = phí chạy (nếu không nói rõ thì = 20% amount); spend = tiền chạy thực tế; chiết khấu = amount - serviceFee - spend (KHÔNG cần trả, app tự tính).
- Với dịch vụ khác: amount = phí dịch vụ của đợt đó; serviceFee/spend = 0.
- collected = đã thu của đợt. Nếu nói "thu đủ"/"đã thanh toán"/"đã nhận" → collected = amount. Nếu "cọc 50%" → collected = 50% amount. Nếu chưa nói gì hoặc "chưa thu" → collected = 0.
- refund = tiền hoàn khách (khi job dừng); carry = tiền chuyển đợt sau; ctv = hoa hồng cộng tác viên. Mặc định 0.
- status: "doing" (đang làm), "done" (xong), "paused" (tạm dừng), "cancel" (huỷ). Mặc định "doing".

SCHEMA JSON trả về:
{
  "customers": [{ "name": "Tên", "phone": "SĐT" }],
  "projects": [{
    "customerName": "Tên khách",
    "phone": "SĐT (nếu có)",
    "name": "Tên dự án",
    "category": "ADS",
    "status": "doing",
    "note": "",
    "installments": [
      { "label": "Tháng 6", "date": "2026-06-10", "amount": 10000000, "serviceFee": 2000000, "spend": 4000000, "refund": 0, "carry": 0, "ctv": 0, "otherCost": 0, "collected": 10000000 }
    ]
  }]
}`;
}

export async function aiImport({ text, imageDataUrl, apiKey, model }) {
  const key = (apiKey || "").trim();
  if (!key) throw new Error("Chưa có API key OpenAI. Vào Cài đặt để nhập key.");
  if (!text && !imageDataUrl) throw new Error("Cần ảnh hoặc đoạn text để phân tích.");

  const userContent = [];
  if (text) userContent.push({ type: "text", text });
  if (imageDataUrl) userContent.push({ type: "image_url", image_url: { url: imageDataUrl } });

  const body = {
    model: model || "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt() },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = res.status + "";
    try { const e = await res.json(); msg = e.error?.message || JSON.stringify(e); } catch {}
    throw new Error("OpenAI lỗi: " + msg);
  }
  const data = await res.json();
  const txt = data.choices?.[0]?.message?.content || "{}";
  let parsed;
  try { parsed = JSON.parse(txt); } catch { throw new Error("Không đọc được JSON từ AI."); }
  return {
    customers: Array.isArray(parsed.customers) ? parsed.customers : [],
    projects: Array.isArray(parsed.projects) ? parsed.projects : [],
  };
}

// Đọc ảnh chụp màn hình chứa CÁC LINK / TÀI NGUYÊN online -> { resources: [{title,url,type}] } bằng OpenAI Vision.
export async function aiReadResources({ imageDataUrl, text, apiKey, model }) {
  const key = (apiKey || "").trim();
  if (!key) throw new Error("Chưa có API key OpenAI. Vào Cài đặt để nhập key.");
  if (!imageDataUrl && !text) throw new Error("Cần ảnh (hoặc text) để đọc.");
  const sys = `Bạn đọc ảnh chứa TÀI NGUYÊN ONLINE, THƯỜNG LÀ 1 BẢNG (spreadsheet) có hàng tiêu đề + nhiều dòng dữ liệu. Mỗi DÒNG dữ liệu = 1 mục. Trích MỌI dòng thành danh sách. CHỈ trả JSON, không giải thích.

CÁCH ĐỌC BẢNG (QUAN TRỌNG): nhìn HÀNG TIÊU ĐỀ để biết mỗi CỘT là gì, rồi ánh xạ theo cột:
- Cột "Hạng Mục"/"Tên"/"Tên nguồn"/"Nguồn"/"Mục"/"Nền tảng"  →  title
- Cột "Tài khoản"/"Đăng nhập"/"User"/"Username"/"Email"/"Account"  →  username
- Cột "Mật khẩu"/"Mật Khẩu"/"Password"/"Pass"/"MK"  →  password
- Cột "Link"/"Link Đăng Nhập"/"URL"/"Website"/"Đường dẫn"  →  url
- Cột "Ghi chú"/"Note"/"Mô tả"/"Vai trò"  →  note

QUY TẮC BẮT BUỘC:
- title: LẤY ĐÚNG chữ ở cột Hạng Mục/Tên của dòng đó. NẾU cột đó có chữ thì PHẢI dùng đúng nó, TUYỆT ĐỐI KHÔNG tự đặt tên theo link/tên miền. Chỉ khi dòng thật sự trống tên mới để "".
- username & password: lấy đúng ô của dòng, đọc CHÍNH XÁC TỪNG KÝ TỰ (phân biệt hoa/thường, số, ký hiệu @ # . _, dễ nhầm 0-O, 1-l-I). KHÔNG bỏ trống nếu ô có dữ liệu. Không có thì "".
- url: link đầy đủ (kèm "https://"). Nếu dòng có tài khoản/mật khẩu nhưng KHÔNG có link thì VẪN trả mục đó với url="" (đừng bỏ dòng). Không bịa link.
- note: lấy từ cột Ghi chú nếu có.
- type: sheet, doc, slide, drive, figma, canva, notion, youtube, facebook, image, folder, web — suy từ link; không rõ để "web".
- Ghép ĐÚNG từng ô theo hàng ngang, KHÔNG lệch dòng.
Ví dụ 1 dòng (Hạng Mục=Quản trị website, Tài khoản=admin, Mật khẩu=Tuantu@2026, Link=https://site.vn/wp-admin/): { "title":"Quản trị website", "username":"admin", "password":"Tuantu@2026", "url":"https://site.vn/wp-admin/", "type":"web", "note":"" }
SCHEMA: { "resources": [ { "title":"", "url":"", "type":"web", "username":"", "password":"", "note":"" } ] }`;
  const userContent = [{ type: "text", text: (text ? text + "\n" : "") + "Trích tất cả link/tài nguyên trong ảnh này." }];
  if (imageDataUrl) userContent.push({ type: "image_url", image_url: { url: imageDataUrl } });
  const body = {
    model: model || "gpt-4o-mini",
    messages: [{ role: "system", content: sys }, { role: "user", content: userContent }],
    response_format: { type: "json_object" },
    temperature: 0,
  };
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = res.status + "";
    try { const e = await res.json(); msg = e.error?.message || JSON.stringify(e); } catch {}
    throw new Error("OpenAI lỗi: " + msg);
  }
  const data = await res.json();
  const txt = data.choices?.[0]?.message?.content || "{}";
  let p;
  try { p = JSON.parse(txt); } catch { throw new Error("Không đọc được JSON từ AI."); }
  const raw = Array.isArray(p.resources) ? p.resources : (p.url ? [p] : []);
  const resources = raw
    .map((r) => ({ title: (r.title || "").toString().slice(0, 200), url: (r.url || "").toString().trim(), type: (r.type || "").toString(), username: (r.username || "").toString().slice(0, 200), password: (r.password || "").toString().slice(0, 200), note: (r.note || "").toString().slice(0, 300) }))
    .filter((r) => /\S/.test(r.url));
  return { resources };
}

// Đọc ảnh chứa DANH SÁCH TÀI KHOẢN / THẺ / TK NGÂN HÀNG -> { items: [{type,title,...fields}] } bằng OpenAI Vision.
export async function aiReadVault({ imageDataUrl, text, apiKey, model }) {
  const key = (apiKey || "").trim();
  if (!key) throw new Error("Chưa có API key OpenAI. Vào Cài đặt để nhập key.");
  if (!imageDataUrl) throw new Error("Cần ảnh để đọc.");
  const sys = `Bạn đọc ảnh chứa DANH SÁCH TÀI KHOẢN ĐĂNG NHẬP / THẺ NGÂN HÀNG / TÀI KHOẢN NGÂN HÀNG-VÍ, THƯỜNG LÀ 1 BẢNG có hàng tiêu đề + nhiều dòng. Mỗi DÒNG = 1 mục. Trích MỌI dòng thành JSON. CHỈ trả JSON, không giải thích.
NẾU LÀ BẢNG: nhìn hàng tiêu đề để ánh xạ cột → cột "Hạng Mục"/"Tên"/"Nguồn" = title; "Tài khoản"/"Đăng nhập"/"User"/"Email" = username; "Mật khẩu"/"Password"/"Pass" = password; "Link"/"Link Đăng Nhập"/"URL" = url; "Ghi chú"/"Note" = note. LẤY ĐÚNG chữ ở cột tên (KHÔNG tự đặt theo link). Đọc CHÍNH XÁC từng ký tự tài khoản/mật khẩu, ghép đúng theo hàng ngang không lệch dòng.
Mỗi mục có "type":
- "app" = tài khoản ứng dụng/web (Facebook, Gmail, hosting, CMS…). Trường: title (tên app/dịch vụ), username (tài khoản/email/đăng nhập), password, url (link đăng nhập nếu có), twofa (mã 2FA/khôi phục nếu có), note.
- "card" = thẻ ngân hàng/Visa/Master. Trường: title (tên thẻ), holder (chủ thẻ), number (số thẻ), expiry (MM/YY), cvv, bank (ngân hàng phát hành), note.
- "bank" = tài khoản ngân hàng / ví điện tử (Momo, ZaloPay…). Trường: title (tên), holder (chủ tài khoản), number (số tài khoản), bank (ngân hàng/ví), branch (chi nhánh), note.
QUY TẮC:
- Chọn type đúng nhất theo dữ liệu của mục. Nếu chỉ là tài khoản đăng nhập app/web → "app".
- Đọc CHÍNH XÁC từng ký tự password/số thẻ/số tài khoản/cvv (phân biệt hoa-thường, 0-O, 1-l-I).
- Ghép ĐÚNG các trường vào mục (dòng) của nó. Trường không có để "".
- title bắt buộc có (nếu trống thì suy từ tên app/ngân hàng). Bỏ mục hoàn toàn trống.
SCHEMA: { "items": [ { "type":"app", "title":"Facebook", "username":"user@mail.com", "password":"Abc@123", "url":"", "twofa":"", "note":"" } ] }`;
  const userContent = [{ type: "text", text: (text ? text + "\n" : "") + "Trích tất cả tài khoản/thẻ/tài khoản ngân hàng trong ảnh này." }];
  if (imageDataUrl) userContent.push({ type: "image_url", image_url: { url: imageDataUrl } });
  const body = {
    model: model || "gpt-4o-mini",
    messages: [{ role: "system", content: sys }, { role: "user", content: userContent }],
    response_format: { type: "json_object" },
    temperature: 0,
  };
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = res.status + "";
    try { const e = await res.json(); msg = e.error?.message || JSON.stringify(e); } catch {}
    throw new Error("OpenAI lỗi: " + msg);
  }
  const data = await res.json();
  const txt = data.choices?.[0]?.message?.content || "{}";
  let p;
  try { p = JSON.parse(txt); } catch { throw new Error("Không đọc được JSON từ AI."); }
  const raw = Array.isArray(p.items) ? p.items : (p.title ? [p] : []);
  const S = (v) => (v == null ? "" : String(v).slice(0, 300));
  const items = raw
    .map((r) => {
      const type = ["app", "card", "bank"].includes(r.type) ? r.type : "app";
      return { type, title: S(r.title), username: S(r.username), password: S(r.password), url: S(r.url), twofa: S(r.twofa), holder: S(r.holder), number: S(r.number), expiry: S(r.expiry), cvv: S(r.cvv), bank: S(r.bank), branch: S(r.branch), note: S(r.note) };
    })
    .filter((r) => r.title || r.username || r.number || r.password);
  return { items };
}

// Đọc file ảnh -> data URL base64
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Đọc ảnh + THU NHỎ (max cạnh maxDim) + nén JPEG -> data URL (giảm dung lượng gửi OpenAI + làm thumbnail)
export function imageToDataUrl(file, maxDim = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = reject;
    r.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        try {
          let { width, height } = img;
          const scale = Math.min(1, maxDim / Math.max(width, height));
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
          const c = document.createElement("canvas");
          c.width = width; c.height = height;
          c.getContext("2d").drawImage(img, 0, 0, width, height);
          resolve(c.toDataURL("image/jpeg", quality));
        } catch (e) { resolve(r.result); } // lỗi canvas → dùng ảnh gốc
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

// Đọc ảnh BIÊN LAI / SAO KÊ / DANH SÁCH giao dịch -> { transactions: [{amount,date,note}] } bằng OpenAI Vision.
// Ảnh có thể là 1 giao dịch HOẶC danh sách nhiều giao dịch → trả về MẢNG (mỗi giao dịch 1 phần tử).
export async function aiReadExpense({ imageDataUrl, apiKey, model }) {
  const key = (apiKey || "").trim();
  if (!key) throw new Error("Chưa có API key OpenAI. Vào Cài đặt để nhập key.");
  if (!imageDataUrl) throw new Error("Cần ảnh để đọc.");
  const today = iso(new Date());
  const sys = `Bạn đọc ảnh chụp BIÊN LAI / GIAO DỊCH / SAO KÊ / LỊCH SỬ NGÂN HÀNG / VÍ ĐIỆN TỬ. Ảnh có thể là 1 giao dịch HOẶC DANH SÁCH nhiều giao dịch (nhiều dòng). Trích TỪNG giao dịch thành 1 phần tử. Hôm nay ${today}. CHỈ trả JSON, không giải thích.
QUY TẮC:
- amount = số tiền của giao dịch đó, SỐ nguyên đồng, bỏ hết dấu chấm/phẩy/ký hiệu tiền: "-500.000đ"→500000, "500,000 VND"→500000, "1,5tr"→1500000. Ngân hàng VN hay ghi rút gọn theo NGHÌN: "42,0" / "42.0" / "42K" nghĩa là 42.000 → trả 42000; "110,0"→110000. Luôn lấy giá trị DƯƠNG.
- type = CHIỀU tiền của dòng đó: "in" nếu TIỀN VÀO (nhận tiền, cộng "+", màu xanh, "Nhận từ", "GD ghi có", số dương); "out" nếu TIỀN RA (chi/chuyển đi, trừ "-", màu đỏ, "Chuyển tới", "GD ghi nợ", thanh toán). Dựa vào dấu +/−, màu sắc, hoặc chữ để quyết định. Không chắc thì "out".
- date = ngày giao dịch "YYYY-MM-DD"; không rõ thì "${today}".
- note = người gửi/nhận hoặc nội dung ngắn của dòng đó (vd tên người, "Chuyển khoản", "Thanh toán").
- Lấy MỌI dòng giao dịch có số tiền đọc được. Không đọc được dòng nào thì bỏ dòng đó (đừng bịa).
SCHEMA: { "transactions": [ { "amount": 42000, "type": "out", "date": "${today}", "note": "Phạm Văn Hải" } ] }`;
  const body = {
    model: model || "gpt-4o-mini",
    messages: [
      { role: "system", content: sys },
      { role: "user", content: [{ type: "text", text: "Đọc tất cả giao dịch trong ảnh này." }, { type: "image_url", image_url: { url: imageDataUrl } }] },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  };
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = res.status + "";
    try { const e = await res.json(); msg = e.error?.message || JSON.stringify(e); } catch {}
    throw new Error("OpenAI lỗi: " + msg);
  }
  const data = await res.json();
  const txt = data.choices?.[0]?.message?.content || "{}";
  let p;
  try { p = JSON.parse(txt); } catch { throw new Error("Không đọc được JSON từ AI."); }
  // Hỗ trợ cả schema mảng lẫn 1 giao dịch lẻ (phòng khi model trả {amount} thay vì {transactions})
  const raw = Array.isArray(p.transactions) ? p.transactions : (p.amount != null ? [p] : []);
  const transactions = raw
    .map((t) => ({
      amount: Math.abs(Number(String(t.amount ?? "").replace(/[^\d-]/g, "")) || 0),
      type: t.type === "in" ? "in" : "out",
      date: /^\d{4}-\d{2}-\d{2}$/.test(t.date || "") ? t.date : today,
      note: (t.note || "").toString().slice(0, 120),
    }))
    .filter((t) => t.amount > 0);
  return { transactions };
}
