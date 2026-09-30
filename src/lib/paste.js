import { useEffect } from "react";

// Cho phép DÁN ảnh (Ctrl/Cmd+V) ở bất kỳ đâu component đang mở.
// onFiles(File[]) nhận danh sách ảnh dán được. Bỏ qua nếu clipboard không có ảnh (vd đang dán text).
export function usePasteImages(onFiles, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const h = (e) => {
      const items = (e.clipboardData && e.clipboardData.items) || [];
      const files = [];
      for (const it of items) if (it.type && it.type.startsWith("image/")) { const f = it.getAsFile(); if (f) files.push(f); }
      if (files.length) { e.preventDefault(); onFiles(files); }
    };
    document.addEventListener("paste", h);
    return () => document.removeEventListener("paste", h);
  }, [onFiles, enabled]);
}
