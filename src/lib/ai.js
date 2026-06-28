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

// Đọc file ảnh -> data URL base64
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
