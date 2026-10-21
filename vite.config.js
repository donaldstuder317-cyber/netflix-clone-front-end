import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// Serve the React donate page at the clean URL /donate (dev + preview).
// BrowserRouter inside the page then matches the same path.
const donateRewrite = (req, _res, next) => {
  if (req.url && /^\/donate\/?(\?.*)?$/.test(req.url)) {
    req.url = '/src/pages/donate.html' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '')
  }
  next()
}
const donateRoute = () => ({
  name: 'donate-route',
  configureServer(server) { server.middlewares.use(donateRewrite) },
  configurePreviewServer(server) { server.middlewares.use(donateRewrite) },
})

// Multi-page app: every HTML file is an entry point.
export default defineConfig({
  plugins: [react(), donateRoute()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        browse: resolve(__dirname, 'src/pages/browse.html'),
        donate: resolve(__dirname, 'src/pages/donate.html'),
        myList: resolve(__dirname, 'src/pages/my-list.html'),
        player: resolve(__dirname, 'src/pages/player.html'),
        search: resolve(__dirname, 'src/pages/search.html'),
        signUp: resolve(__dirname, 'src/pages/sign-up.html'),
        titleDetail: resolve(__dirname, 'src/pages/title-detail.html'),
      },
    },
  },
})
