import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  const backendPort = env.PORT || '3100'
  const frontendPort = Number(env.VITE_PORT) || 3101

  return {
    plugins: [react()],
    root: '.',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src/client'),
        '@shared': path.resolve(__dirname, './src/shared'),
      },
    },
    server: {
      port: frontendPort,
      proxy: {
        '/trpc': {
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist/client',
    },
  }
})
