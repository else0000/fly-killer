import { defineConfig } from 'vitest/config'

export default defineConfig({
  /**
   * GitHub Pages project sites are served from https://<user>.github.io/<repo>/,
   * so every emitted asset URL has to carry the repo name as a prefix. If the
   * repository ends up named something other than "fly-killer", change this to
   * match; use '/' for a user/org site served from the domain root.
   */
  base: '/fly-killer/',
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
