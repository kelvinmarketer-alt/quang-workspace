import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import crypto from 'node:crypto'

// Mã luật = 12 ký tự đầu sha256 của src/lib/paperBot.js — bot thật (lib/paperBot.js chép y hệt) báo cùng mã → app biết code luật 2 bên có khớp không
const RULES_HASH = crypto.createHash('sha256').update(fs.readFileSync(new URL('./src/lib/paperBot.js', import.meta.url))).digest('hex').slice(0, 12)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __RULES_HASH__: JSON.stringify(RULES_HASH) },
  server: { port: 5190, host: true },
  // 01/11: tách thư viện ít đổi (React, router, Supabase) ra file riêng → mỗi lần cập nhật app, máy chỉ tải lại phần code app
  build: { rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], supabase: ['@supabase/supabase-js'] } } } },
})
