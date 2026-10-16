import "dotenv/config";
import { createServer } from "node:http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import express from "express";
import { closeDatabase } from "../db";
import { appRouter } from "../routers";
import { stripeWebhookHandler } from "../stripe";
import { createContext } from "./context";
import { ENV, validateRuntimeConfiguration } from "./env";
import { isMalformedRequestTarget } from "./requestTarget";
import { serveStatic, setupVite } from "./vite";

function configuredPort(): number {
  const port = Number.parseInt(process.env.PORT || "3000", 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  return port;
}

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

async function startServer(): Promise<void> {
  validateRuntimeConfiguration();

  const app = express();
  app.disable("x-powered-by");
  if (ENV.trustProxyHops > 0) app.set("trust proxy", ENV.trustProxyHops);

  app.use((request, response, next) => {
    if (isMalformedRequestTarget(request.originalUrl || request.url)) {
      response.status(400).type("text/plain").send("Bad Request");
      return;
    }
    next();
  });

  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(self)"
    );
    if (ENV.isProduction) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000");
      res.setHeader("Content-Security-Policy", CONTENT_SECURITY_POLICY);
    }
    next();
  });
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  // Stripe verifies the exact request bytes, so this must precede JSON parsing.
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json", limit: "1mb" }),
    stripeWebhookHandler
  );

  app.use(express.json({ limit: "1mb" }));
  app.use(
    "/api/trpc",
    createExpressMiddleware({ router: appRouter, createContext })
  );
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  const server = createServer(app);
  let closeVite: (() => Promise<void>) | null = null;
  if (ENV.isProduction) serveStatic(app);
  else closeVite = await setupVite(app, server);

  server.requestTimeout = 30_000;
  server.headersTimeout = 35_000;
  server.keepAliveTimeout = 5_000;

  const port = configuredPort();
  server.listen(port, "0.0.0.0", () => {
    console.log(`Server listening on port ${port}`);
  });

  let closing = false;
  const shutdown = (signal: string) => {
    if (closing) return;
    closing = true;
    console.log(`Received ${signal}; shutting down.`);
    // Exit even if a connection or watcher refuses to close.
    setTimeout(() => process.exit(process.exitCode ?? 0), 4_000).unref();
    server.close(async error => {
      await closeDatabase().catch(() => undefined);
      if (error) {
        console.error("HTTP server shutdown failed", { error: error.message });
        process.exitCode = 1;
      }
    });
    // Idle keep-alive sockets would otherwise hold the server open.
    server.closeIdleConnections();
    if (closeVite) {
      // Development only: open HMR sockets and the file watcher.
      server.closeAllConnections();
      void closeVite().catch(() => undefined);
    }
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

startServer().catch(error => {
  console.error("Server startup failed", {
    error: error instanceof Error ? error.message : "Unknown error",
  });
  process.exitCode = 1;
});
