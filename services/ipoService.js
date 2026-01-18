const fs = require("fs");
const path = require("path");
const { fetchAastocksCalendar } = require("./sources/aastocks");
const { fetchMoomooCalendar } = require("./sources/moomoo");

const AASTOCKS_URL = process.env.AASTOCKS_URL || "";
const MOOMOO_URL = process.env.MOOMOO_URL || "https://www.moomoo.com/quote/hk/ipo?from=futunn";
const DATA_SOURCE = (process.env.DATA_SOURCE || (MOOMOO_URL ? "moomoo" : (AASTOCKS_URL ? "aastocks" : "static"))).toLowerCase();
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 10 * 60 * 1000);
const STATIC_PATH = process.env.STATIC_PATH || path.join(__dirname, "..", "data", "ipos.json");
const STATIC_FALLBACK = (process.env.STATIC_FALLBACK || "true").toLowerCase() === "true";

const cache = {
  data: null,
  updatedAt: 0,
  source: "static"
};

function readStaticIpos() {
  const raw = fs.readFileSync(STATIC_PATH, "utf8");
  const data = JSON.parse(raw);
  return Array.isArray(data) ? data : [];
}

async function loadFromSource() {
  if (DATA_SOURCE === "moomoo") {
    if (!MOOMOO_URL) {
      throw new Error("MOOMOO_URL is not configured.");
    }
    const items = await fetchMoomooCalendar(MOOMOO_URL);
    return { ipos: items, source: "MOOMOO" };
  }

  if (DATA_SOURCE === "aastocks") {
    if (!AASTOCKS_URL) {
      throw new Error("AASTOCKS_URL is not configured.");
    }
    const items = await fetchAastocksCalendar(AASTOCKS_URL);
    return { ipos: items, source: "AASTOCKS" };
  }

  const items = readStaticIpos();
  return { ipos: items, source: "static" };
}

async function getIpos() {
  const now = Date.now();
  if (cache.data && now - cache.updatedAt < CACHE_TTL_MS) {
    return { ipos: cache.data, source: cache.source, updatedAt: cache.updatedAt };
  }

  try {
    const result = await loadFromSource();
    cache.data = result.ipos;
    cache.source = result.source;
    cache.updatedAt = Date.now();
    return { ipos: cache.data, source: cache.source, updatedAt: cache.updatedAt };
  } catch (error) {
    if (!STATIC_FALLBACK) {
      throw error;
    }
    const fallback = readStaticIpos();
    cache.data = fallback;
    cache.source = "static-fallback";
    cache.updatedAt = Date.now();
    return { ipos: cache.data, source: cache.source, updatedAt: cache.updatedAt };
  }
}

module.exports = {
  getIpos
};
