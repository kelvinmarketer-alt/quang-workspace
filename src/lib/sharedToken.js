// Link chia sẻ tài liệu /xem/<mã> (09/11). Tách riêng (28/11) để trang chính không phải nạp cả trang xem tài liệu + thư viện Markdown.
export const sharedToken = (pathname = window.location.pathname) => { const m = /^\/xem\/([A-Za-z0-9_-]{32,128})\/?$/.exec(pathname); return m ? m[1] : null; };
