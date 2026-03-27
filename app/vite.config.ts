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

const apiPort = process.env.VITE_API_PORT ?? "3000";

export default defineConfig({
  plugins: [react(), tailwindcss(), handleConnectionReset()],
  define: {
    __API_PORT__: JSON.stringify(apiPort),
  },
  server: {
    host: true,
    port: 5174,
    proxy: {
      "/api": `http://localhost:${apiPort}`,
      "/ws": {
        target: `ws://localhost:${apiPort}`,
        ws: true,
      },
    },
  },
});
