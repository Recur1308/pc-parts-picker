const STORAGE_KEY = "munich-pc-parts";
const TOKEN_KEY = "munich-pc-parts-github-token";
const AUTO_PUBLISH_KEY = "munich-pc-parts-auto-publish";
const GITHUB_OWNER = "Recur1308";
const GITHUB_REPO = "pc-parts-picker";
const GITHUB_BRANCH = "main";
const PARTS_FILE = "data/parts.json";
const PRICE_WORKFLOW = "update-prices.yml";
const CURRENCY = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

const sampleParts = [
  {
    id: crypto.randomUUID(),
    category: "CPU",
    name: "AMD Ryzen 7 7800X3D",
    query: "AMD Ryzen 7 7800X3D boxed",
    priorityUrl: "",
    notes: "Gaming CPU, AM5 platform."
  },
  {
    id: crypto.randomUUID(),
    category: "Video Card",
    name: "NVIDIA GeForce RTX 4070 Super",
    query: "RTX 4070 Super 12GB",
    priorityUrl: "",
    notes: "Avoid marketplace listings with unclear warranty."
  },
  {
    id: crypto.randomUUID(),
    category: "Storage",
    name: "Samsung 990 Pro 2TB",
    query: "Samsung 990 Pro 2TB M.2",
    priorityUrl: "",
    notes: "Check heatsink clearance with motherboard."
  }
];

let parts = loadParts();
let prices = {};
let sharedParts = [];
let priceUpdatedAt = null;

const els = {
  form: document.querySelector("#part-form"),
  partId: document.querySelector("#part-id"),
  category: document.querySelector("#category"),
  name: document.querySelector("#name"),
  query: document.querySelector("#query"),
  priorityUrl: document.querySelector("#priority-url"),
  notes: document.querySelector("#notes"),
  list: document.querySelector("#parts-list"),
  filter: document.querySelector("#filter"),
  total: document.querySelector("#total-price"),
  known: document.querySelector("#known-count"),
  bestSource: document.querySelector("#best-source"),
  lastUpdated: document.querySelector("#last-updated"),
  editMode: document.querySelector("#edit-mode"),
  reset: document.querySelector("#reset-form"),
  sample: document.querySelector("#load-sample"),
  exportData: document.querySelector("#export-data"),
  importData: document.querySelector("#import-data"),
  fileInput: document.querySelector("#file-input"),
  token: document.querySelector("#github-token"),
  autoPublish: document.querySelector("#auto-publish"),
  saveToken: document.querySelector("#save-token"),
  publishParts: document.querySelector("#publish-parts"),
  syncState: document.querySelector("#sync-state"),
  syncMessage: document.querySelector("#sync-message")
};

init();

async function init() {
  restoreSyncSettings();
  bindEvents();
  await loadSharedParts();
  await loadPriceCache();
  render();
}

function bindEvents() {
  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const part = readForm();
    const existingIndex = parts.findIndex((item) => item.id === part.id);
    if (existingIndex >= 0) {
      parts[existingIndex] = part;
    } else {
      parts.push(part);
    }
    saveParts();
    resetForm();
    render();
    maybeAutoPublish();
  });

  els.reset.addEventListener("click", resetForm);
  els.filter.addEventListener("input", render);

  els.sample.addEventListener("click", () => {
    parts = [...parts, ...sampleParts.map((part) => ({ ...part, id: crypto.randomUUID() }))];
    saveParts();
    render();
    maybeAutoPublish();
  });

  els.exportData.addEventListener("click", exportParts);
  els.importData.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", importParts);
  els.saveToken.addEventListener("click", saveToken);
  els.publishParts.addEventListener("click", publishParts);
  els.autoPublish.addEventListener("change", () => {
    localStorage.setItem(AUTO_PUBLISH_KEY, els.autoPublish.checked ? "1" : "0");
  });
}

async function loadPriceCache() {
  try {
    const response = await fetch("./data/prices.json", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    prices = payload.parts || {};
    if (payload.updatedAt) {
      priceUpdatedAt = payload.updatedAt;
      const updated = new Date(payload.updatedAt);
      els.lastUpdated.textContent = `Prices updated ${updated.toLocaleString("de-DE")}`;
    }
  } catch {
    els.lastUpdated.textContent = "Price cache unavailable";
  }
}

async function loadSharedParts() {
  try {
    const response = await fetch("./data/parts.json", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    sharedParts = Array.isArray(payload.parts) ? payload.parts : [];
    if (!parts.length && sharedParts.length) {
      parts = sharedParts.map(normalizePart);
      saveParts(false);
    }
  } catch {
    sharedParts = [];
  }
}

function loadParts() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveParts(markDirty = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(parts));
  if (markDirty) setSyncMessage("Unsynced local changes", "Local");
}

function normalizePart(part) {
  return {
    id: part.id || crypto.randomUUID(),
    category: part.category || "Other",
    name: part.name || "Unnamed part",
    query: part.query || part.name || "Unnamed part",
    priorityUrl: part.priorityUrl || "",
    urls: Array.isArray(part.urls) ? part.urls : [],
    notes: part.notes || ""
  };
}

function restoreSyncSettings() {
  const token = localStorage.getItem(TOKEN_KEY) || "";
  els.token.value = token;
  els.autoPublish.checked = localStorage.getItem(AUTO_PUBLISH_KEY) === "1";
  setSyncMessage(token ? "Token saved in this browser." : "Website edits stay local until published.", token ? "Ready" : "Local");
}

function readForm() {
  const name = els.name.value.trim();
  return {
    id: els.partId.value || crypto.randomUUID(),
    category: els.category.value,
    name,
    query: els.query.value.trim() || name,
    priorityUrl: els.priorityUrl.value.trim(),
    urls: [],
    notes: els.notes.value.trim()
  };
}

function resetForm() {
  els.form.reset();
  els.partId.value = "";
  els.editMode.textContent = "New";
}

function render() {
  const term = els.filter.value.trim().toLowerCase();
  const visible = parts.filter((part) => {
    const haystack = `${part.category} ${part.name} ${part.query} ${part.notes}`.toLowerCase();
    return haystack.includes(term);
  });

  if (!visible.length) {
    els.list.innerHTML = `<div class="empty-state">Add parts to start tracking Idealo and shop prices.</div>`;
  } else {
    els.list.innerHTML = visible.map(renderPart).join("");
  }

  bindCardEvents();
  renderSummary(visible);
}

function renderPart(part) {
  const result = getPriceResult(part);
  const links = getSearchLinks(part);
  const warning = result.best ? "" : `<span class="warning">No cached price yet</span>`;

  return `
    <article class="part-card" data-id="${escapeAttr(part.id)}">
      <div>
        <div class="part-title">
          <span class="category-pill">${escapeHtml(part.category)}</span>
          <h3>${escapeHtml(part.name)}</h3>
        </div>
        <p class="part-meta">
          <span>${escapeHtml(part.query || part.name)}</span>
          ${warning}
        </p>
        ${part.notes ? `<p class="part-meta">${escapeHtml(part.notes)}</p>` : ""}
        <div class="price-row">
          ${renderPriceBox("Current price", result.best)}
          ${renderPriceBox("Second option", result.second)}
        </div>
        <div class="link-row">
          ${part.priorityUrl ? `<a href="${escapeAttr(part.priorityUrl)}" target="_blank" rel="noreferrer">Priority URL</a>` : ""}
          ${links.map((link) => `<a href="${escapeAttr(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.label)}</a>`).join("")}
        </div>
      </div>
      <div class="card-actions">
        <button class="secondary-button edit-part" type="button">Edit</button>
        <button class="danger-button delete-part" type="button">Delete</button>
      </div>
    </article>
  `;
}

function renderPriceBox(label, offer) {
  if (!offer) {
    return `
      <div class="price-box">
        <span>${label}</span>
        <strong>-</strong>
      </div>
    `;
  }

  return `
    <div class="price-box">
      <span>${label}</span>
      <strong>${CURRENCY.format(offer.price)}</strong>
      <a href="${escapeAttr(offer.url)}" target="_blank" rel="noreferrer">${escapeHtml(offer.source)}</a>
    </div>
  `;
}

function bindCardEvents() {
  document.querySelectorAll(".edit-part").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.closest(".part-card").dataset.id;
      const part = parts.find((item) => item.id === id);
      if (!part) return;
      els.partId.value = part.id;
      els.category.value = part.category;
      els.name.value = part.name;
      els.query.value = part.query || "";
      els.priorityUrl.value = part.priorityUrl || "";
      els.notes.value = part.notes || "";
      els.editMode.textContent = "Editing";
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  document.querySelectorAll(".delete-part").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.closest(".part-card").dataset.id;
      parts = parts.filter((part) => part.id !== id);
      saveParts();
      render();
      maybeAutoPublish();
    });
  });
}

function renderSummary(visible) {
  const bestOffers = visible.map(getPriceResult).map((result) => result.best).filter(Boolean);
  const total = bestOffers.reduce((sum, offer) => sum + offer.price, 0);
  const sourceCounts = bestOffers.reduce((counts, offer) => {
    counts[offer.source] = (counts[offer.source] || 0) + 1;
    return counts;
  }, {});
  const bestSource = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";

  els.total.textContent = CURRENCY.format(total);
  els.known.textContent = `${bestOffers.length}/${visible.length}`;
  els.bestSource.textContent = bestSource;
}

function getPriceResult(part) {
  const byId = prices[part.id];
  const byName = prices[part.name];
  const byMatchingName = Object.values(prices).find((entry) => entry?.name === part.name);
  const offers = normalizeOffers(byId?.offers || byName?.offers || byMatchingName?.offers || []);
  return {
    best: offers[0],
    second: offers[1]
  };
}

function normalizeOffers(offers) {
  return offers
    .filter((offer) => offer && Number.isFinite(Number(offer.price)) && !isEbay(offer.url || offer.source || ""))
    .map((offer) => ({
      price: Number(offer.price),
      source: offer.source || hostname(offer.url) || "Unknown",
      url: offer.url || "#"
    }))
    .sort((a, b) => a.price - b.price);
}

function getSearchLinks(part) {
  const query = encodeURIComponent(part.query || part.name);
  return [
    { label: "Idealo", url: `https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=${query}` },
    { label: "Geizhals", url: `https://geizhals.de/?fs=${query}&hloc=de` },
    { label: "Alternate", url: `https://www.alternate.de/listing.xhtml?q=${query}` },
    { label: "Amazon.de", url: `https://www.amazon.de/s?k=${query}` }
  ];
}

function exportParts() {
  const exportable = parts.map(normalizePart);
  const blob = new Blob([JSON.stringify({ parts: exportable }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "parts.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function importParts(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const incoming = Array.isArray(payload.parts) ? payload.parts : [];
    parts = incoming.map(normalizePart);
    saveParts();
    render();
    maybeAutoPublish();
  } finally {
    event.target.value = "";
  }
}

function saveToken() {
  const token = els.token.value.trim();
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    setSyncMessage("Token saved. Publishing can update GitHub now.", "Ready");
  } else {
    localStorage.removeItem(TOKEN_KEY);
    setSyncMessage("Token removed. Edits are local only.", "Local");
  }
}

async function maybeAutoPublish() {
  if (!els.autoPublish.checked || !getToken()) return;
  await publishParts();
}

async function publishParts() {
  const token = getToken();
  if (!token) {
    setSyncMessage("Add and save a GitHub token first.", "Local");
    return;
  }

  setPublishing(true, "Publishing parts to GitHub...");
  try {
    const remote = await githubRequest(`contents/${PARTS_FILE}?ref=${GITHUB_BRANCH}`, { token });
    const remotePayload = parseJsonFile(remote.content);
    const mergedParts = mergeParts(Array.isArray(remotePayload.parts) ? remotePayload.parts : [], parts);
    const body = JSON.stringify({ parts: mergedParts }, null, 2) + "\n";
    await githubRequest(`contents/${PARTS_FILE}`, {
      token,
      method: "PUT",
      body: {
        message: "Update parts from website",
        content: toBase64(body),
        sha: remote.sha,
        branch: GITHUB_BRANCH
      }
    });

    parts = mergedParts;
    saveParts(false);
    render();

    setSyncMessage("Parts published. Starting price update...", "Syncing");
    const previousPriceUpdate = latestPriceUpdate();
    await githubRequest(`actions/workflows/${PRICE_WORKFLOW}/dispatches`, {
      token,
      method: "POST",
      body: { ref: GITHUB_BRANCH },
      expectNoContent: true
    });
    setSyncMessage("Price update running. Checking GitHub...", "Syncing");
    await pollPriceCache(token, previousPriceUpdate);
  } catch (error) {
    setSyncMessage(error.message || "Publish failed.", "Error");
  } finally {
    setPublishing(false);
  }
}

function mergeParts(remoteParts, localParts) {
  const merged = new Map();
  remoteParts.map(normalizePart).forEach((part) => {
    merged.set(partKey(part), part);
  });
  localParts.map(normalizePart).forEach((part) => {
    const key = partKey(part);
    const existing = merged.get(key);
    merged.set(key, {
      ...existing,
      ...part,
      id: existing?.id || part.id,
      priorityUrl: part.priorityUrl || existing?.priorityUrl || "",
      urls: [...new Set([...(existing?.urls || []), ...(part.urls || [])])]
    });
  });
  return [...merged.values()];
}

function partKey(part) {
  return normalizeKey(part.name || part.query || part.id);
}

function normalizeKey(value) {
  return String(value).trim().toLowerCase().replace(/\s+/g, " ");
}

function parseJsonFile(content) {
  try {
    return JSON.parse(fromBase64(content || ""));
  } catch {
    return {};
  }
}

async function pollPriceCache(token, previousUpdatedAt) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    await wait(3000);
    const remotePrices = await githubRequest(`contents/data/prices.json?ref=${GITHUB_BRANCH}`, { token });
    const payload = parseJsonFile(remotePrices.content);
    if (!payload.updatedAt || payload.updatedAt === previousUpdatedAt) continue;
    priceUpdatedAt = payload.updatedAt;
    prices = payload.parts || {};
    const updated = new Date(payload.updatedAt);
    els.lastUpdated.textContent = `Prices updated ${updated.toLocaleString("de-DE")}`;
    render();
    setSyncMessage("Published and prices refreshed from GitHub.", "Synced");
    return;
  }
  setSyncMessage("Published. Price workflow is still finishing.", "Synced");
}

function latestPriceUpdate() {
  return priceUpdatedAt;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function githubRequest(path, options) {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/${path}`, {
    method: options.method || "GET",
    headers: {
      "accept": "application/vnd.github+json",
      "authorization": `Bearer ${options.token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28"
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (options.expectNoContent && response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || `GitHub request failed with HTTP ${response.status}`);
  }
  return payload;
}

function getToken() {
  return els.token.value.trim() || localStorage.getItem(TOKEN_KEY) || "";
}

function setPublishing(isPublishing, message) {
  els.publishParts.disabled = isPublishing;
  els.saveToken.disabled = isPublishing;
  if (message) setSyncMessage(message, "Syncing");
}

function setSyncMessage(message, state) {
  els.syncMessage.textContent = message;
  els.syncState.textContent = state;
}

function toBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(String(value).replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isEbay(value) {
  return String(value).toLowerCase().includes("ebay");
}

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
