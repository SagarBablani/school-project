import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Read the same .env the API server loads (via --env-file-if-exists) so the
  // proxy target can never drift out of sync with whatever port it actually
  // listens on ("" means load every var, not just VITE_-prefixed ones).
  const env = loadEnv(mode, process.cwd(), "");
  const apiPort = env.PORT || 4001;
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        "/api": `http://127.0.0.1:${apiPort}`
      }
    }
  };
});
