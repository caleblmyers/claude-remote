import http from "http";
import express from "express";
import { loadConfig } from "./config";
import apiRouter from "./api";
import { createWsServer } from "./ws";
import { authMiddleware } from "./auth";
import { initVapid } from "./push";

// Prevent uncaught errors from crashing the server
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err.message);
});
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
});

const config = loadConfig();
initVapid();

const app: express.Express = express();
app.use(express.json());

// Allow CORS from the Vite dev server during development
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,DELETE,OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,Authorization"
  );
  if (_req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Auth middleware on all /api routes
app.use("/api", authMiddleware);
app.use("/api", apiRouter);

const server = http.createServer(app);
createWsServer(server);

const { port, host } = config.server;
server.listen(port, host, () => {
  console.log(`Claude Remote backend listening on http://${host}:${port}`);
  console.log(`WebSocket server ready on ws://${host}:${port}`);
  console.log(`Health check: http://localhost:${port}/api/health`);
});

export default app;
