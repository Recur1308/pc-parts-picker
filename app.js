const STORAGE_KEY = "munich-pc-parts";
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
  fileInput: document.querySelector("#file-input")
};

init();

async function init() {
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
  });

  els.reset.addEventListener("click", resetForm);
  els.filter.addEventListener("input", render);

  els.sample.addEventListener("click", () => {
    parts = [...parts, ...sampleParts.map((part) => ({ ...part, id: crypto.randomUUID() }))];
    saveParts();
    render();
  });

  els.exportData.addEventListener("click", exportParts);
  els.importData.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", importParts);
}

async function loadPriceCache() {
  try {
    const response = await fetch("./data/prices.json", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    prices = payload.parts || {};
    if (payload.updatedAt) {
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
      saveParts();
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

function saveParts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(parts));
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
  } finally {
    event.target.value = "";
  }
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
