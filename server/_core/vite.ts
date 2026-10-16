import express, { type Express } from "express";
import fs from "node:fs";
import { type Server } from "node:http";
import path from "node:path";

/** Development: Vite middleware with hot reload. */
export async function setupVite(app: Express, server: Server): Promise<void> {
  // Loaded lazily so production never needs Vite installed.
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    configFile: path.resolve(import.meta.dirname, "../..", "vite.config.ts"),
    server: {
      middlewareMode: true,
      hmr: { server },
      allowedHosts: true,
    },
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    try {
      const templatePath = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      const template = await fs.promises.readFile(templatePath, "utf-8");
      const page = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      next(error);
    }
  });
}

/** Production: hashed assets are cached for a year, HTML is always revalidated. */
export function serveStatic(app: Express): void {
  const distPath = path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Build directory not found: ${distPath}. Run "pnpm build" first.`
    );
  }

  app.use(
    "/assets",
    express.static(path.join(distPath, "assets"), {
      immutable: true,
      maxAge: "1y",
      fallthrough: false,
    })
  );
  app.use(express.static(distPath, { index: false, maxAge: "1h" }));
  app.use("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
