import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const partsPath = path.join(root, "data", "parts.json");
const pricesPath = path.join(root, "data", "prices.json");
const blockedDomains = ["ebay."];

const payload = JSON.parse(await fs.readFile(partsPath, "utf8"));
const parts = Array.isArray(payload.parts) ? payload.parts : [];
const output = {
  updatedAt: new Date().toISOString(),
  parts: {}
};

for (const part of parts) {
  const urls = candidateUrls(part);
  const offers = [];

  for (const url of urls) {
    if (isBlocked(url)) continue;
    const offer = await fetchOffer(url);
    if (offer) offers.push(offer);
  }

  output.parts[part.id || part.name] = {
    name: part.name,
    offers: dedupeOffers(offers).sort((a, b) => a.price - b.price).slice(0, 4)
  };
}

await fs.writeFile(pricesPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Updated prices for ${parts.length} parts.`);

function candidateUrls(part) {
  const query = part.query || part.name;
  const urls = [
    part.priorityUrl,
    ...(Array.isArray(part.urls) ? part.urls : []),
    idealoSearchUrl(query),
    geizhalsSearchUrl(query),
    alternateSearchUrl(query),
    amazonSearchUrl(query)
  ];
  return urls.filter(Boolean);
}

function idealoSearchUrl(query) {
  return `https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=${encodeURIComponent(query)}`;
}

function geizhalsSearchUrl(query) {
  return `https://geizhals.de/?fs=${encodeURIComponent(query)}&hloc=de`;
}

function alternateSearchUrl(query) {
  return `https://www.alternate.de/listing.xhtml?q=${encodeURIComponent(query)}`;
}

function amazonSearchUrl(query) {
  return `https://www.amazon.de/s?k=${encodeURIComponent(query)}`;
}

async function fetchOffer(url) {
  try {
    const response = await fetch(url, {
      headers: {
        "accept": "text/html,application/xhtml+xml",
        "accept-language": "de-DE,de;q=0.9,en;q=0.8",
        "user-agent": "Mozilla/5.0 (compatible; MunichPartsPicker/1.0; +https://github.com/)"
      },
      redirect: "follow"
    });

    if (!response.ok) {
      console.warn(`Skipped ${url}: HTTP ${response.status}`);
      return null;
    }

    const html = await response.text();
    const price = extractPrice(html);
    if (!price) {
      console.warn(`No price found for ${url}`);
      return null;
    }

    return {
      price,
      source: sourceName(url, html),
      url: response.url || url,
      fetchedAt: new Date().toISOString()
    };
  } catch (error) {
    console.warn(`Skipped ${url}: ${error.message}`);
    return null;
  }
}

function extractPrice(html) {
  const jsonLdPrices = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .flatMap((match) => parseJsonLdPrices(match[1]));
  if (jsonLdPrices.length) return Math.min(...jsonLdPrices);

  const metaPrice = firstMatch(html, [
    /<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+itemprop=["']price["'][^>]+content=["']([^"']+)["']/i,
    /"price"\s*:\s*"?(€?\s?[0-9][0-9.,]*)"?/i
  ]);
  if (metaPrice) return parseEuro(metaPrice);

  const visiblePrices = [...html.matchAll(/(?:€\s*)?([0-9]{1,4}(?:[.,][0-9]{3})*(?:[.,][0-9]{2}))\s*(?:€|EUR)/gi)]
    .map((match) => parseEuro(match[1]))
    .filter((price) => price && price > 1 && price < 10000);
  return visiblePrices.length ? Math.min(...visiblePrices) : null;
}

function parseJsonLdPrices(raw) {
  const cleaned = raw.replace(/&quot;/g, '"').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return collectPrices(parsed);
  } catch {
    return [];
  }
}

function collectPrices(value) {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectPrices);

  const prices = [];
  if (value.price) {
    const price = parseEuro(String(value.price));
    if (price) prices.push(price);
  }
  if (value.lowPrice) {
    const price = parseEuro(String(value.lowPrice));
    if (price) prices.push(price);
  }
  if (value.offers) {
    prices.push(...collectPrices(value.offers));
  }
  return prices;
}

function firstMatch(value, patterns) {
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

function parseEuro(value) {
  const normalized = String(value)
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const price = Number.parseFloat(normalized);
  return Number.isFinite(price) ? price : null;
}

function sourceName(url, html) {
  const ogSite = firstMatch(html, [/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i]);
  return ogSite || new URL(url).hostname.replace(/^www\./, "");
}

function dedupeOffers(offers) {
  const seen = new Set();
  return offers.filter((offer) => {
    const key = `${offer.source}:${offer.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isBlocked(value) {
  const lower = String(value).toLowerCase();
  return blockedDomains.some((domain) => lower.includes(domain));
}
