// ui/public/app.js (V3)

let state = {
  projectId: "",
  files: [],
  config: null,
  lastGenerateResult: null,
  filter: "",
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

function setEnvStatus(message, isError = false) {
  const el = document.getElementById("env-status");
  el.textContent = message || "";
  el.style.color = isError ? "#f97373" : "#f97316";
}

function setLastSyncInfo(text) {
  const el = document.getElementById("lastSyncInfo");
  el.textContent = text || "";
}

function buildTree(files) {
  const root = {};
  for (const f of files) {
    const parts = f.path.split("/");
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLast = i === parts.length - 1;
      if (!node[name]) node[name] = { name, children: {}, type: isLast && f.type === "file" ? "file" : "dir" };
      node = node[name].children;
    }
  }
  return root;
}

function renderNode(node, basePath = "") {
  const container = document.createElement("div");
  const fullPath = basePath ? basePath + "/" + node.name : node.name;

  if (node.type === "dir") {
    const label = document.createElement("div");
    label.className = "dir-label";
    const toggle = document.createElement("span");
    toggle.textContent = "▾";
    toggle.dataset.collapsed = "false";
    const nameSpan = document.createElement("span");
    nameSpan.textContent = node.name || "(racine)";
    label.appendChild(toggle);
    label.appendChild(nameSpan);

    const childrenContainer = document.createElement("div");
    childrenContainer.className = "dir-children";

    label.addEventListener("click", () => {
      const collapsed = toggle.dataset.collapsed === "true";
      toggle.dataset.collapsed = collapsed ? "false" : "true";
      toggle.textContent = collapsed ? "▾" : "▸";
      childrenContainer.style.display = collapsed ? "block" : "none";
    });

    container.appendChild(label);

    const children = node.children || {};
    for (const key of Object.keys(children).sort()) {
      childrenContainer.appendChild(renderNode(children[key], fullPath || children[key].name));
    }

    container.appendChild(childrenContainer);
  } else {
    const row = document.createElement("div");
    row.className = "file-node";
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.dataset.path = fullPath;
    const span = document.createElement("span");
    span.textContent = node.name;
    label.appendChild(cb);
    label.appendChild(span);
    row.appendChild(label);
    container.appendChild(row);
  }
  return container;
}

function getSelectedFilePaths() {
  return Array.from(document.querySelectorAll('#file-tree input[type="checkbox"]:checked')).map(cb => cb.dataset.path);
}

function switchTab(tabName) {
  document.querySelectorAll("#tabs .tab").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tabName));
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === "tab-" + tabName));
}

function appendChatMessage(role, content) {
  const container = document.getElementById("chat-messages");
  const msg = document.createElement("div");
  msg.className = "message " + (role === "user" ? "user" : "bot");
  if (role === "bot") {
    const md = document.createElement("div");
    md.className = "markdown-body";
    md.innerHTML = marked.parse(content || "");
    msg.appendChild(md);
  } else {
    msg.textContent = content;
  }
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function renderGenerateSummary(result) {
  const summaryEl = document.getElementById("generate-summary");
  const parts = [];
  if (result._meta?.synced?.length) {
    parts.push("## Sync");
    parts.push("- " + result._meta.synced.join("\n- "));
  }
  if (Array.isArray(result.warnings) && result.warnings.length) {
    parts.push("## Warnings");
    for (const w of result.warnings) parts.push("- " + w);
  }
  if (Array.isArray(result.todos) && result.todos.length) {
    parts.push("## TODOs");
    for (const t of result.todos) parts.push("- " + t);
  }
  if (!parts.length) parts.push("_Aucun warning ni TODO._");
  summaryEl.innerHTML = marked.parse(parts.join("\n"));
}

async function loadConfig() {
  try {
    const cfg = await api("/api/config");
    state.config = cfg;
    state.projectId = cfg.defaultProjectId || "";
    document.getElementById("projectIdInput").value = state.projectId;
    if (cfg.missingEnv && cfg.missingEnv.length) setEnvStatus("Secrets / variables: " + cfg.missingEnv.join(", "), false);
    else setEnvStatus("Prêt. RAG_URL=" + cfg.ragUrl);
  } catch (err) {
    console.error(err);
    setEnvStatus("Config error: " + err.message, true);
  }
}

async function loadFiles() {
  const data = await api("/api/files/list");
  state.files = data.files || [];
  renderFiles();
}

function renderFiles() {
  const rootContainer = document.getElementById("file-tree");
  rootContainer.innerHTML = "";
  const filtered = state.filter
    ? state.files.filter(f => f.type === "file" && f.path.toLowerCase().includes(state.filter.toLowerCase())).concat(state.files.filter(f => f.type === "dir" && f.path.toLowerCase().includes(state.filter.toLowerCase())))
    : state.files;

  const treeStruct = buildTree(filtered);
  const rootNode = { name: "", type: "dir", children: treeStruct };
  rootContainer.appendChild(renderNode(rootNode, ""));
}

function currentProjectId() {
  return document.getElementById("projectIdInput").value.trim() || state.projectId || "sample";
}

function syncBefore() {
  return document.getElementById("syncBeforeToggle").checked;
}
function inlineFiles() {
  return document.getElementById("inlineToggle").checked;
}

async function handleSyncSelected() {
  const projectId = currentProjectId();
  const filePaths = getSelectedFilePaths();
  if (!filePaths.length) return alert("Sélectionne au moins un fichier à sync.");
  setLastSyncInfo("Sync en cours...");
  const res = await api("/api/sync", { method: "POST", body: JSON.stringify({ projectId, filePaths }) });
  setLastSyncInfo("✅ Synced: " + (res.synced?.length || 0) + " fichier(s)");
}

async function handleSyncAll() {
  const projectId = currentProjectId();
  setLastSyncInfo("Sync all en cours...");
  const res = await api("/api/sync-all", { method: "POST", body: JSON.stringify({ projectId }) });
  setLastSyncInfo(`✅ Sync all: ${res.synced?.length || 0} fichiers (${res.totalBytes || 0} bytes)`);
}

async function handleChat() {
  const promptEl = document.getElementById("promptInput");
  const prompt = promptEl.value.trim();
  if (!prompt) return;

  const projectId = currentProjectId();
  const filePaths = getSelectedFilePaths();
  appendChatMessage("user", prompt);
  promptEl.value = "";

  try {
    const body = { projectId, sessionId: "sess-" + Date.now(), prompt, filePaths, syncBefore: syncBefore(), inlineFiles: inlineFiles() };
    const result = await api("/api/chat", { method: "POST", body: JSON.stringify(body) });
    if (result._meta?.synced?.length) setLastSyncInfo("✅ Synced: " + result._meta.synced.length + " fichier(s)");
    appendChatMessage("bot", result.message || "(réponse vide)");
  } catch (err) {
    appendChatMessage("bot", "Erreur: " + err.message);
  }
}

async function handleGenerate() {
  const promptEl = document.getElementById("promptInput");
  const prompt = promptEl.value.trim();
  if (!prompt) return;

  const projectId = currentProjectId();
  const filePaths = getSelectedFilePaths();

  try {
    const body = { projectId, sessionId: "gen-" + Date.now(), prompt, filePaths, syncBefore: syncBefore(), inlineFiles: inlineFiles() };
    const result = await api("/api/generate", { method: "POST", body: JSON.stringify(body) });
    state.lastGenerateResult = result;
    document.getElementById("generate-json").textContent = JSON.stringify(result, null, 2);
    renderGenerateSummary(result);
    document.getElementById("applyFilesBtn").disabled = !(result.files && result.files.length);
    switchTab("generate");
  } catch (err) {
    document.getElementById("generate-json").textContent = "Erreur: " + err.message;
    document.getElementById("applyFilesBtn").disabled = true;
  }
}

async function handleApplyFiles() {
  const r = state.lastGenerateResult;
  if (!r?.files?.length) return;
  const resp = await api("/api/apply-files", { method: "POST", body: JSON.stringify({ files: r.files }) });
  alert("Appliqué:\n" + (resp.applied || []).join("\n"));
}

async function handleSendMemoryText() {
  const projectId = currentProjectId();
  const memoryPath = document.getElementById("memoryFilePathInput").value || "domain.md";
  const content = document.getElementById("memoryContent").value || "";
  if (!content.trim()) return alert("Le contenu mémoire est vide.");
  await api("/api/memory/apply", { method: "POST", body: JSON.stringify({ projectId, files: [{ path: memoryPath, content }] }) });
  alert("Mémoire envoyée.");
}

async function handleSendSelectedAsMemory() {
  const projectId = currentProjectId();
  const memoryPath = document.getElementById("memoryFilePathInput").value || "domain.md";
  const selected = getSelectedFilePaths();
  if (!selected.length) return alert("Sélectionne un fichier.");
  await api("/api/memory/apply-from-file", { method: "POST", body: JSON.stringify({ projectId, projectFilePath: selected[0], memoryFilePath: memoryPath }) });
  alert("Fichier envoyé en mémoire.");
}

function initTabs() {
  document.querySelectorAll("#tabs .tab").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
}

function initEvents() {
  document.getElementById("saveProjectIdBtn").addEventListener("click", () => {
    const v = document.getElementById("projectIdInput").value.trim();
    state.projectId = v || state.projectId;
    setEnvStatus("Project ID actif: " + state.projectId);
  });

  document.getElementById("chatBtn").addEventListener("click", handleChat);
  document.getElementById("generateBtn").addEventListener("click", handleGenerate);
  document.getElementById("applyFilesBtn").addEventListener("click", handleApplyFiles);

  document.getElementById("sendMemoryBtn").addEventListener("click", handleSendMemoryText);
  document.getElementById("sendSelectedAsMemoryBtn").addEventListener("click", handleSendSelectedAsMemory);

  document.getElementById("syncSelectedBtn").addEventListener("click", handleSyncSelected);
  document.getElementById("syncAllBtn").addEventListener("click", handleSyncAll);

  document.getElementById("fileSearch").addEventListener("input", (e) => {
    state.filter = e.target.value || "";
    renderFiles();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  initTabs();
  initEvents();
  await loadConfig();
  await loadFiles();
});
