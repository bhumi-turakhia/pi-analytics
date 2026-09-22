import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import { spawn, ChildProcess } from 'child_process';
import http from 'http';

function fastapiBackendPlugin(): Plugin {
  let backendProc: ChildProcess | null = null;

  function ensureBackendRunning() {
    const req = http.get('http://127.0.0.1:8001/health', (res) => {
      if (res.statusCode === 200) {
        // Backend is already active
      }
    });

    req.on('error', () => {
      backendProc = spawn(
        'python3',
        ['-m', 'uvicorn', 'app.main:app', '--app-dir', 'backend', '--host', '127.0.0.1', '--port', '8001'],
        {
          stdio: 'inherit',
          detached: false,
        }
      );
      backendProc.on('error', (err) => {
        console.error('[FastAPI] Backend start error:', err);
      });
    });
  }

  return {
    name: 'fastapi-backend-plugin',
    configureServer() {
      ensureBackendRunning();
    },
    configurePreviewServer() {
      ensureBackendRunning();
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), fastapiBackendPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8001',
          changeOrigin: true,
        },
        '/health': {
          target: 'http://127.0.0.1:8001',
          changeOrigin: true,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
