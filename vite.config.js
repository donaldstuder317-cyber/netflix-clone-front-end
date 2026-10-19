import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// Multi-page app: every HTML file is an entry point.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        browse: resolve(__dirname, 'src/pages/browse.html'),
        myList: resolve(__dirname, 'src/pages/my-list.html'),
        player: resolve(__dirname, 'src/pages/player.html'),
        search: resolve(__dirname, 'src/pages/search.html'),
        signUp: resolve(__dirname, 'src/pages/sign-up.html'),
        titleDetail: resolve(__dirname, 'src/pages/title-detail.html'),
      },
    },
  },
})
