import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@contracts': path.resolve(__dirname, '../../packages/contracts/generated/ts'),
    },
  },
  server: { port: Number(process.env.PORT) || 5173 },
});
