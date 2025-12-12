#!/usr/bin/env node
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const { createRagClient } = require("../src/client");
const { packFiles, applyFiles, listProjectFiles } = require("../src/file-utils");

const app = express();
app.use(bodyParser.json({ limit: "5mb" })); // V3: allow a bit bigger for sync

const DEFAULT_RAG_URL =
  process.env.RAG_URL ||
  "https://59777e18-055f-4c6c-9004-7765de7b00a7-00-2h9t5vscbp24t.worf.replit.dev";

const ragUrl = (process.env.RAG_URL || DEFAULT_RAG_URL).replace(/\/+$/, "");
const ragSecret = process.env.RAG_SECRET || "";
const defaultProjectId = process.env.RAG_PROJECT_ID || "sample";

const client = createRagClient({ ragUrl, apiKey: ragSecret, projectId: defaultProjectId });

client.wake().then(() => console.log("🔔 Wake-up envoyé au RAG")).catch(() => {});

app.get("/api/config", (req, res) => {
  const missingEnv = [];
  if (!process.env.RAG_SECRET) missingEnv.push("RAG_SECRET");
  if (!process.env.RAG_URL) missingEnv.push("RAG_URL (optional, fallback exists)");
  if (!process.env.RAG_PROJECT_ID) missingEnv.push("RAG_PROJECT_ID (optional)");
  res.json({ ragUrl, defaultProjectId, missingEnv });
});

app.get("/api/files/list", (req, res) => {
  const files = listProjectFiles(process.cwd());
  res.json({ files });
});

app.post("/api/files/read", (req, res) => {
  const { path: filePath } = req.body || {};
  if (!filePath) return res.status(400).json({ error: "path requis" });
  const abs = path.join(process.cwd(), filePath);
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) return res.status(404).json({ error: "Fichier introuvable" });
  const content = fs.readFileSync(abs, "utf-8");
  res.json({ path: filePath, content });
});

// Sync selected files to Server A (no LLM)
app.post("/api/sync", async (req, res) => {
  try {
    const { projectId, filePaths } = req.body || {};
    const pid = projectId || defaultProjectId;
    const files = packFiles(filePaths || [], process.cwd());
    const result = await client.sync({ projectId: pid, files });
    res.json({ ok: true, synced: files.map(f => f.path), result });
  } catch (err) {
    console.error("Error /api/sync:", err);
    res.status(500).json({ error: err.message || "Erreur sync" });
  }
});

// Sync "all" (guard rails: cap total files and size)
app.post("/api/sync-all", async (req, res) => {
  try {
    const { projectId, maxFiles = 200, maxBytes = 2_000_000 } = req.body || {};
    const pid = projectId || defaultProjectId;
    const filesIndex = listProjectFiles(process.cwd()).filter(f => f.type === "file").map(f => f.path);

    const chosen = [];
    let total = 0;
    for (const p of filesIndex) {
      if (chosen.length >= maxFiles) break;
      const abs = path.join(process.cwd(), p);
      if (!fs.existsSync(abs)) continue;
      const stat = fs.statSync(abs);
      if (stat.size > 400_000) continue; // skip huge files
      if (total + stat.size > maxBytes) break;
      chosen.push(p);
      total += stat.size;
    }

    const files = packFiles(chosen, process.cwd());
    const result = await client.sync({ projectId: pid, files });
    res.json({ ok: true, synced: files.map(f => f.path), totalBytes: total, result });
  } catch (err) {
    console.error("Error /api/sync-all:", err);
    res.status(500).json({ error: err.message || "Erreur sync-all" });
  }
});

// Chat: V3 default = sync selected first, then call /ai/chat without inlining files
app.post("/api/chat", async (req, res) => {
  try {
    const { projectId, sessionId, prompt, filePaths, syncBefore = true, inlineFiles = false } = req.body || {};
    const pid = projectId || defaultProjectId;

    const files = packFiles(filePaths || [], process.cwd());

    if (syncBefore && files.length) {
      await client.sync({ projectId: pid, files });
    }

    const result = await client.chat({
      projectId: pid,
      sessionId,
      prompt,
      files,
      inlineFiles: inlineFiles === true
    });
    res.json({ ...result, _meta: { synced: syncBefore ? files.map(f => f.path) : [], inlineFiles: inlineFiles === true } });
  } catch (err) {
    console.error("Error /api/chat:", err);
    res.status(500).json({ error: err.message || "Erreur chat" });
  }
});

app.post("/api/generate", async (req, res) => {
  try {
    const { projectId, sessionId, prompt, filePaths, syncBefore = true, inlineFiles = false } = req.body || {};
    const pid = projectId || defaultProjectId;

    const files = packFiles(filePaths || [], process.cwd());

    if (syncBefore && files.length) {
      await client.sync({ projectId: pid, files });
    }

    const result = await client.generate({
      projectId: pid,
      sessionId,
      prompt,
      files,
      inlineFiles: inlineFiles === true
    });
    res.json({ ...result, _meta: { synced: syncBefore ? files.map(f => f.path) : [], inlineFiles: inlineFiles === true } });
  } catch (err) {
    console.error("Error /api/generate:", err);
    res.status(500).json({ error: err.message || "Erreur generate" });
  }
});

app.post("/api/apply-files", (req, res) => {
  try {
    const { files } = req.body || {};
    if (!Array.isArray(files)) return res.status(400).json({ error: "files[] requis" });
    applyFiles(process.cwd(), { files });
    res.json({ ok: true, applied: files.map(f => f.path) });
  } catch (err) {
    console.error("Error /api/apply-files:", err);
    res.status(500).json({ error: err.message || "Erreur apply-files" });
  }
});

// Memory helpers (text or from selected file)
app.post("/api/memory/apply", async (req, res) => {
  try {
    const { projectId, files } = req.body || {};
    if (!projectId || !Array.isArray(files)) return res.status(400).json({ error: "projectId et files[] requis" });
    const result = await client.sync({ projectId, files });
    res.json(result);
  } catch (err) {
    console.error("Error /api/memory/apply:", err);
    res.status(500).json({ error: err.message || "Erreur memory/apply" });
  }
});

app.post("/api/memory/apply-from-file", async (req, res) => {
  try {
    const { projectId, projectFilePath, memoryFilePath } = req.body || {};
    if (!projectId || !projectFilePath || !memoryFilePath) {
      return res.status(400).json({ error: "projectId, projectFilePath, memoryFilePath requis" });
    }
    const abs = path.join(process.cwd(), projectFilePath);
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) return res.status(404).json({ error: "Fichier projet introuvable" });
    const content = fs.readFileSync(abs, "utf-8");
    const result = await client.sync({ projectId, files: [{ path: memoryFilePath, content }] });
    res.json(result);
  } catch (err) {
    console.error("Error /api/memory/apply-from-file:", err);
    res.status(500).json({ error: err.message || "Erreur memory/apply-from-file" });
  }
});

app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3030;
app.listen(PORT, () => {
  console.log(`🚀 RAG Devtools UI (V3) running on http://localhost:${PORT}`);
  console.log(`   RAG_URL: ${ragUrl}`);
  if (!ragSecret) console.log("⚠️ RAG_SECRET n'est pas défini. Configure-le dans les secrets.");
});
