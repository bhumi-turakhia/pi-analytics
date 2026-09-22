import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import { spawn, ChildProcess } from 'child_process';
import http from 'http';

function fastapiBackendPlugin(): Plugin {
  let backendProc: ChildProcess | null = null;

  function startBackend() {
    if (backendProc && !backendProc.killed) {
      return;
    }
    backendProc = spawn(
      'python3',
      ['-m', 'uvicorn', 'app.main:app', '--app-dir', 'backend', '--host', '127.0.0.1', '--port', '8001'],
      {
        stdio: 'inherit',
        detached: false,
      }
    );
    backendProc.on('error', (err) => {
      console.error('[FastAPI] Backend spawn error:', err);
      backendProc = null;
    });
    backendProc.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.warn(`[FastAPI] Backend exited with code ${code}, restarting...`);
        backendProc = null;
        setTimeout(startBackend, 1000);
      }
    });
  }

  function ensureBackendRunning() {
    const req = http.get('http://127.0.0.1:8001/health', (res) => {
      if (res.statusCode !== 200) {
        startBackend();
      }
    });

    req.on('error', () => {
      startBackend();
    });

    req.end();
  }

  return {
    name: 'fastapi-backend-plugin',
    configureServer(server) {
      ensureBackendRunning();
      // Periodically check health every 10s to keep backend alive
      const interval = setInterval(ensureBackendRunning, 10000);
      server.httpServer?.on('close', () => clearInterval(interval));
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
          configure: (proxy) => {
            proxy.on('error', (_err, req, res) => {
              const httpRes = res as import('http').ServerResponse;
              if (httpRes && typeof httpRes.writeHead === 'function' && !httpRes.headersSent) {
                httpRes.writeHead(503, { 'Content-Type': 'application/json' });
                httpRes.end(
                  JSON.stringify({
                    error: 'Backend starting up, please refresh in a moment',
                    status: 'starting',
                  })
                );
              }
            });
          },
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
