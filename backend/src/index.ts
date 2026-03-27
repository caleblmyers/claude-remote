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

// CORS middleware: uses config.cors.allowedOrigins to control access.
// If allowedOrigins includes '*', all origins are allowed (default).
// Otherwise, only requests whose Origin header matches an entry are allowed.
app.use((req, res, next) => {
  const { allowedOrigins } = config.cors;
  const requestOrigin = req.headers.origin;

  if (allowedOrigins.includes("*")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    res.setHeader("Vary", "Origin");
  } else {
    // Origin not allowed — omit the header so the browser blocks the request
    if (req.method === "OPTIONS") return res.sendStatus(403);
    return next();
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,DELETE,OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,Authorization"
  );
  if (req.method === "OPTIONS") return res.sendStatus(204);
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
