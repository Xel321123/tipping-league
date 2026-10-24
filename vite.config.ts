import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const projectRoot = import.meta.dirname ?? process.cwd()

/**
 * GitHub Pages serves static files only. Copy the built index.html to 404.html so
 * deep links (/tipping-league/history/<id>) still boot the SPA instead of a 404.
 */
function pagesSpaFallback() {
  return {
    name: 'pages-spa-fallback',
    closeBundle() {
      const dist = resolve(projectRoot, 'dist')
      const index = resolve(dist, 'index.html')
      if (existsSync(index)) copyFileSync(index, resolve(dist, '404.html'))
    },
  }
}

export default defineConfig(() => {
  const onPages = process.env.GITHUB_PAGES === 'true'

  return {
    base: onPages ? '/tipping-league/' : '/',
    plugins: [react(), tailwindcss(), pagesSpaFallback()],
    build: {
      target: 'es2022',
      cssCodeSplit: true,
    },
  }
})
