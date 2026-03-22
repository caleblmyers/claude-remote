import crypto from "crypto";
import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { getConfig } from "../config";

const TOKEN_EXPIRY = "7d";

export interface AuthPayload {
  iat: number;
  exp: number;
}

/**
 * The JWT signing secret is derived from the setup code via HMAC,
 * so the setup code itself is never used directly as a key.
 * This means leaking the setup code doesn't directly compromise existing tokens.
 */
function getSigningSecret(): string {
  const { secret } = getConfig().auth;
  return crypto.createHmac("sha256", secret).update("claude-remote-jwt").digest("hex");
}

export function issueToken(): string {
  return jwt.sign({}, getSigningSecret(), { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, getSigningSecret()) as AuthPayload;
  } catch {
    return null;
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip auth for login and health check
  if (req.path === "/auth/login" || req.path === "/health") {
    next();
    return;
  }

  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization token" });
    return;
  }

  const token = header.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  next();
}

export function validateSetupCode(code: string): boolean {
  const { secret } = getConfig().auth;
  // Constant-time comparison to prevent timing attacks
  if (code.length !== secret.length) return false;
  return crypto.timingSafeEqual(Buffer.from(code), Buffer.from(secret));
}
