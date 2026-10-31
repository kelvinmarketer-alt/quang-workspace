// Bộ chuyển động toàn app (01/11 sếp duyệt): thẻ, biểu đồ, thanh, bảng, số lớn chạy hiệu ứng mỗi khi CUỘN TỚI;
// cuộn đi rồi quay lại thì chạy lại từ đầu. Không cần sửa từng trang: tự gắn vào mọi .card trong .bento (+ phần tử có data-reveal).
// CSS đi kèm ở index.css (khối "CHUYỂN ĐỘNG"). Máy bật "giảm chuyển động" thì không chạy gì.
const SEL = ".bento .card, .bento [data-reveal]";
const NUM_SEL = ".tabular-nums:is(.text-lg,.text-xl,.text-2xl,.text-3xl,.text-4xl), [data-count]";

const reduce = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// ---- chạy số: đọc chữ đang hiện ("891,9 tr", "4.737", "$4.975,70", "+$0,00") → đếm từ 0 lên, cuối cùng trả đúng chữ gốc ----
function parseNum(tok) {
  const dots = (tok.match(/\./g) || []).length, commas = (tok.match(/,/g) || []).length;
  let dec = null;
  if (dots && commas) dec = tok.lastIndexOf(".") > tok.lastIndexOf(",") ? "." : ",";
  else if (dots === 1 && !/\.\d{3}$/.test(tok)) dec = ".";
  else if (commas === 1 && !/,\d{3}$/.test(tok)) dec = ",";
  const th = dec === "." ? "," : dec === "," ? "." : dots ? "." : commas ? "," : "";
  const places = dec ? tok.length - tok.lastIndexOf(dec) - 1 : 0;
  const v = Number(tok.split(th).join("").replace(dec || "#", "."));
  return isFinite(v) ? { v, dec, th, places } : null;
}
function fmtLike(x, p) {
  const [i, f] = Math.abs(x).toFixed(p.places).split(".");
  const ii = p.th ? i.replace(/\B(?=(\d{3})+(?!\d))/g, p.th) : i;
  return (x < 0 ? "-" : "") + ii + (p.places ? p.dec + f : "");
}
const RUNNING = new WeakMap();
function countUp(el) {
  const node = [...el.childNodes].find((n) => n.nodeType === 3 && /\d/.test(n.nodeValue));
  if (!node) return;
  const orig = RUNNING.get(node)?.orig ?? node.nodeValue;
  const m = orig.match(/\d[\d.,]*/);
  const p = m && parseNum(m[0]);
  if (!p || p.v === 0) return;
  const pre = orig.slice(0, m.index), post = orig.slice(m.index + m[0].length);
  const st = { orig, last: null };
  RUNNING.set(node, st);
  const t0 = performance.now(), dur = 900;
  const step = (t) => {
    if (RUNNING.get(node) !== st) return;
    if (st.last != null && node.nodeValue !== st.last) { RUNNING.delete(node); return; } // React đã đổi số → dừng
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4);
    st.last = k < 1 ? pre + fmtLike(p.v * e, p) + post : orig;
    node.nodeValue = st.last;
    if (k < 1) requestAnimationFrame(step); else RUNNING.delete(node);
  };
  requestAnimationFrame(step);
}

// ---- đánh số thứ tự cho các phần tử cùng hàng → lệch nhịp (stagger) ----
function indexSiblings(el) {
  const kids = el.parentElement ? [...el.parentElement.children].filter((c) => c.matches?.(SEL)) : [];
  const i = Math.max(0, kids.indexOf(el));
  el.style.setProperty("--rv-i", String(Math.min(i, 10)));
}

let io, mo;
export function initMotion() {
  if (io || typeof window === "undefined" || !("IntersectionObserver" in window)) return;
  document.documentElement.classList.add("motion-on");
  io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      const el = en.target;
      if (en.isIntersecting) {
        if (el.classList.contains("rv-in")) continue;
        el.classList.add("rv-in");
        if (!reduce()) el.querySelectorAll(NUM_SEL).forEach((n) => { if (!n.closest(".rv-skip")) countUp(n); });
      } else if (en.boundingClientRect.top > window.innerHeight || en.boundingClientRect.bottom < 0) {
        el.classList.remove("rv-in"); // ra hẳn khỏi màn hình → lần sau cuộn tới chạy lại
      }
    }
  }, { threshold: 0.08, rootMargin: "0px 0px -6% 0px" });
  const add = (el) => { if (el.__rv) return; el.__rv = 1; el.classList.add("rv"); indexSiblings(el); io.observe(el); };
  const scan = (root) => { if (root.nodeType !== 1) return; if (root.matches(SEL)) add(root); root.querySelectorAll?.(SEL).forEach(add); };
  scan(document.body);
  mo = new MutationObserver((muts) => { for (const m of muts) m.addedNodes.forEach(scan); });
  mo.observe(document.body, { childList: true, subtree: true });
}
