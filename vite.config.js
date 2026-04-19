import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/storyboarder-master/', // Use '/storyboarder-master/' for github pages, or '/' if using a custom domain.
  plugins: [react()],
})
