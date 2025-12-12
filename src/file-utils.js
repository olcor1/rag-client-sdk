// src/file-utils.js
const fs = require("fs");
const path = require("path");

function packFiles(filePaths, baseDir = process.cwd()) {
  const out = [];
  for (const p of filePaths || []) {
    const rel = p.replace(/^\.\//, "");
    const abs = path.join(baseDir, rel);
    if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) continue;
    const content = fs.readFileSync(abs, "utf-8");
    out.push({ path: rel, content });
  }
  return out;
}

function applyFiles(baseDir, data) {
  const files = Array.isArray(data) ? data : data.files || [];
  for (const f of files) {
    const rel = (f.path || "").replace(/^\.\//, "");
    const abs = path.join(baseDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, f.content || "", "utf-8");
    console.log("📄 Wrote", rel);
  }
}

function listProjectFilesRecursive(baseDir, current = "") {
  const abs = path.join(baseDir, current);
  if (!fs.existsSync(abs)) return [];
  const entries = fs.readdirSync(abs, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (["node_modules", ".git", ".cache"].includes(e.name)) continue;
    const relPath = path.join(current, e.name).replace(/\\/g, "/");
    if (e.isDirectory()) {
      out.push({ type: "dir", path: relPath });
      out.push(...listProjectFilesRecursive(baseDir, relPath));
    } else {
      out.push({ type: "file", path: relPath });
    }
  }
  return out;
}

function listProjectFiles(baseDir = process.cwd()) {
  return listProjectFilesRecursive(baseDir, "");
}

module.exports = { packFiles, applyFiles, listProjectFiles };
