import { defineConfig, loadEnv, type Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { generateIncidentSummary } from "./api/_lib/summarize-core";

/** Read a JSON request body off a raw Node stream (dev server has no parser). */
function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

/**
 * Serves POST /api/summarize during `npm run dev` by reusing the exact same
 * core function the Vercel serverless function uses in production. This means
 * the AI feature works locally with no extra CLI tools — and the local and
 * deployed behaviour can't drift, because there's only one implementation.
 */
function devApiPlugin(): Plugin {
  return {
    name: "dev-api-summarize",
    configureServer(server) {
      // loadEnv with an empty prefix pulls ALL vars from .env, including the
      // unprefixed ANTHROPIC_API_KEY (Vite only auto-exposes VITE_* ones).
      const env = loadEnv(server.config.mode, process.cwd(), "");

      server.middlewares.use("/api/summarize", async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        res.setHeader("content-type", "application/json");
        const apiKey = env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "Missing ANTHROPIC_API_KEY in .env" }));
          return;
        }
        try {
          const body = await readJson(req);
          const summary = await generateIncidentSummary(body as never, apiKey);
          res.statusCode = 200;
          res.end(JSON.stringify({ summary }));
        } catch (err) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Upstream error" }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devApiPlugin()],
});
