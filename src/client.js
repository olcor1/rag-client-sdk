// src/client.js
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

const DEFAULT_RAG_URL =
  process.env.RAG_URL ||
  "https://59777e18-055f-4c6c-9004-7765de7b00a7-00-2h9t5vscbp24t.worf.replit.dev";

function normalizeUrl(u) {
  if (!u) return "";
  return u.replace(/\/+$/, "");
}

function createRagClient(config = {}) {
  const ragUrl = normalizeUrl(config.ragUrl || DEFAULT_RAG_URL);
  const apiKey = config.apiKey || process.env.RAG_SECRET || "";
  const defaultProjectId = config.projectId || process.env.RAG_PROJECT_ID || "sample";

  async function post(path, body) {
    const url = ragUrl + path;
    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers["x-api-key"] = apiKey;
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body || {}) });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`RAG request failed ${res.status}: ${text}`);
    }
    return res.json();
  }

  async function get(path) {
    const url = ragUrl + path;
    const headers = {};
    if (apiKey) headers["x-api-key"] = apiKey;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`RAG request failed ${res.status}: ${text}`);
    }
    return res.json();
  }

  async function wake() {
    try {
      await get("/health");
      return true;
    } catch (err) {
      console.warn("Wake RAG failed:", err.message);
      return false;
    }
  }

  async function sync({ projectId, files }) {
    return post("/projects/memory/apply", { projectId: projectId || defaultProjectId, files: files || [] });
  }

  // V3 behaviour: prefer sync+retrieve on server side. Optionally inline for debugging.
  async function chat({ projectId, sessionId, prompt, files = [], inlineFiles = false }) {
    return post("/ai/chat", {
      projectId: projectId || defaultProjectId,
      sessionId,
      prompt,
      inputs: { files: inlineFiles ? files : [] },
    });
  }

  async function generate({ projectId, sessionId, prompt, files = [], inlineFiles = false }) {
    return post("/ai/generate", {
      projectId: projectId || defaultProjectId,
      sessionId,
      prompt,
      inputs: { files: inlineFiles ? files : [] },
    });
  }

  async function initProject({ projectId }) {
    return post("/projects/init", { projectId: projectId || defaultProjectId });
  }

  return { ragUrl, apiKey, defaultProjectId, wake, sync, chat, generate, initProject };
}

module.exports = { createRagClient };
