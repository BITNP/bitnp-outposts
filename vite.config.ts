import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // GitHub Pages 部署在子路径（https://<user>.github.io/<repo>/）时由 CI 传入
  // VITE_BASE=/<repo>/；本地开发不设置，保持 '/'。
  base: process.env.VITE_BASE ?? '/',
})
