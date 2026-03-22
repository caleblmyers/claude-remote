import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Prevent Vite from crashing when a phone disconnects abruptly (ECONNRESET)
function handleConnectionReset(): Plugin {
  return {
    name: "handle-connection-reset",
    configureServer(server) {
      server.httpServer?.on("clientError", (err: NodeJS.ErrnoException, socket) => {
        if (err.code === "ECONNRESET") {
          socket.destroy();
          return;
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), handleConnectionReset()],
  server: {
    host: true,
    port: 5174,
    proxy: {
      "/api": "http://localhost:3000",
      "/ws": {
        target: "ws://localhost:3000",
        ws: true,
      },
    },
  },
});
