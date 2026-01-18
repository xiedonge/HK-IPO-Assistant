const cheerio = require("cheerio");

const NAME_ZH_ALIASES = [
  "nameZh",
  "name_zh",
  "companyNameZh",
  "companyNameCn",
  "companyNameCN",
  "chineseName",
  "cnName",
  "nameCn"
];
const NAME_EN_ALIASES = [
  "nameEn",
  "name_en",
  "companyNameEn",
  "companyNameEN",
  "englishName",
  "enName"
];
const NAME_ALIASES = [
  "name",
  "companyName",
  "company",
  "stockName",
  "issuerName",
  "securityName"
];
const TICKER_ALIASES = [
  "ticker",
  "stockCode",
  "code",
  "symbol",
  "tickerSymbol",
  "stockId",
  "secCode",
  "securityCode"
];

const DATE_ALIASES = {
  subscriptionStart: [
    "subscriptionStart",
    "subscribeStart",
    "applyStart",
    "applyStartDate",
    "offerStart",
    "offerStartDate",
    "startDate",
    "startTime",
    "subscriptionStartDate"
  ],
  subscriptionEnd: [
    "subscriptionEnd",
    "subscribeEnd",
    "applyEnd",
    "applyEndDate",
    "offerEnd",
    "offerEndDate",
    "endDate",
    "endTime",
    "subscriptionEndDate"
  ],
  pricingDate: [
    "pricingDate",
    "priceDate",
    "priceFixDate",
    "pricing",
    "pricingTime"
  ],
  allotmentDate: [
    "allotmentDate",
    "resultDate",
    "allocationDate",
    "announcementDate",
    "announceDate"
  ],
  listingDate: [
    "listingDate",
    "listDate",
    "ipoDate",
    "tradeDate",
    "listingTime",
    "listing"
  ]
};

const NUMBER_ALIASES = {
  issuePrice: ["issuePrice", "offerPrice", "price", "offerPriceHKD"],
  lotSize: ["lotSize", "boardLot", "lot", "lotShares"],
  oversubMultiple: ["oversubMultiple", "oversub", "oversubscription", "overSubscribed"],
  cornerstonePct: ["cornerstonePct", "cornerstoneRatio", "cornerstonePercent"],
  revenueCAGR: ["revenueCAGR", "cagr", "revenueGrowth"],
  peRatio: ["peRatio", "pe", "peRatioTtm"],
  peerPe: ["peerPe", "industryPe", "peIndustry"]
};

const BOOLEAN_ALIASES = {
  greenShoe: ["greenShoe", "greenshoe", "overAllotment", "overallotment", "otc"]
};

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function containsCjk(value) {
  return /[\u4e00-\u9fff]/.test(value);
}

function normalizeTicker(value) {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  const digits = raw.match(/\d+/g);
  if (!digits) return normalizeWhitespace(raw);
  const joined = digits.join("");
  if (joined.length >= 5) return joined.slice(-5).padStart(5, "0");
  return joined.padStart(5, "0");
}

function normalizeDate(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") {
    const ms = value > 1e12 ? value : value > 1e9 ? value * 1000 : null;
    if (!ms) return "";
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
  }
  const raw = String(value);
  const match = raw.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (!match) return "";
  const year = match[1];
  const month = match[2].padStart(2, "0");
  const day = match[3].padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function extractDateRange(value) {
  if (!value) return { start: "", end: "" };
  const matches = String(value).match(/(\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})/g) || [];
  if (matches.length >= 2) {
    return {
      start: normalizeDate(matches[0]),
      end: normalizeDate(matches[1])
    };
  }
  if (matches.length === 1) {
    const single = normalizeDate(matches[0]);
    return { start: single, end: single };
  }
  return { start: "", end: "" };
}

function parseNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value).replace(/,/g, "");
  const match = raw.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const num = Number(match[0]);
  return Number.isFinite(num) ? num : null;
}

function getValueByAliases(obj, aliases) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(obj, alias)) {
      return obj[alias];
    }
  }
  const lowerMap = Object.keys(obj).reduce((acc, key) => {
    acc[key.toLowerCase()] = key;
    return acc;
  }, {});
  for (const alias of aliases) {
    const key = lowerMap[alias.toLowerCase()];
    if (key) return obj[key];
  }
  return undefined;
}

function extractNameParts(obj) {
  const nameZh = getValueByAliases(obj, NAME_ZH_ALIASES);
  const nameEn = getValueByAliases(obj, NAME_EN_ALIASES);
  const name = getValueByAliases(obj, NAME_ALIASES);

  const zh = nameZh ? normalizeWhitespace(String(nameZh)) : "";
  const en = nameEn ? normalizeWhitespace(String(nameEn)) : "";

  if (zh || en) {
    return { nameZh: zh, nameEn: en };
  }

  if (!name) return { nameZh: "", nameEn: "" };
  const cleaned = normalizeWhitespace(String(name));

  if (cleaned.includes("/")) {
    const parts = cleaned.split("/").map((part) => normalizeWhitespace(part));
    if (containsCjk(parts[0])) return { nameZh: parts[0], nameEn: parts[1] || "" };
    if (containsCjk(parts[1])) return { nameZh: parts[1], nameEn: parts[0] };
    return { nameZh: parts[0], nameEn: parts[1] || "" };
  }

  const bracketMatch = cleaned.match(/^(.*?)[\(\[](.+?)[\)\]]$/);
  if (bracketMatch) {
    const left = normalizeWhitespace(bracketMatch[1]);
    const right = normalizeWhitespace(bracketMatch[2]);
    if (containsCjk(left)) return { nameZh: left, nameEn: right };
    if (containsCjk(right)) return { nameZh: right, nameEn: left };
  }

  if (containsCjk(cleaned)) {
    return { nameZh: cleaned, nameEn: "" };
  }
  return { nameZh: "", nameEn: cleaned };
}

function buildId(ticker, name) {
  if (ticker) return ticker;
  return normalizeWhitespace(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function pickValue(obj, aliasList) {
  const raw = getValueByAliases(obj, aliasList);
  return raw === undefined ? null : raw;
}

function mapItem(obj, sourceUrl) {
  const { nameZh, nameEn } = extractNameParts(obj);
  const tickerRaw = pickValue(obj, TICKER_ALIASES);
  const ticker = normalizeTicker(tickerRaw);
  const issuePrice = parseNumber(pickValue(obj, NUMBER_ALIASES.issuePrice));
  const lotSize = parseNumber(pickValue(obj, NUMBER_ALIASES.lotSize));
  const oversubMultiple = parseNumber(pickValue(obj, NUMBER_ALIASES.oversubMultiple));
  const cornerstonePct = parseNumber(pickValue(obj, NUMBER_ALIASES.cornerstonePct));
  const revenueCAGR = parseNumber(pickValue(obj, NUMBER_ALIASES.revenueCAGR));
  const peRatio = parseNumber(pickValue(obj, NUMBER_ALIASES.peRatio));
  const peerPe = parseNumber(pickValue(obj, NUMBER_ALIASES.peerPe));

  const greenShoeRaw = pickValue(obj, BOOLEAN_ALIASES.greenShoe);
  const greenShoe = greenShoeRaw === true || String(greenShoeRaw || "").toLowerCase() === "yes";

  const subscriptionStart = normalizeDate(pickValue(obj, DATE_ALIASES.subscriptionStart));
  const subscriptionEnd = normalizeDate(pickValue(obj, DATE_ALIASES.subscriptionEnd));
  const pricingDate = normalizeDate(pickValue(obj, DATE_ALIASES.pricingDate));
  const allotmentDate = normalizeDate(pickValue(obj, DATE_ALIASES.allotmentDate));
  const listingDate = normalizeDate(pickValue(obj, DATE_ALIASES.listingDate));

  return {
    id: buildId(ticker, nameZh || nameEn || ""),
    nameZh,
    nameEn,
    ticker,
    industryZh: "",
    industryEn: "",
    sectorHeat: "neutral",
    issuePrice,
    lotSize,
    subscriptionStart,
    subscriptionEnd,
    pricingDate,
    allotmentDate,
    listingDate,
    sponsor: "",
    sponsorBreakRate: null,
    greenShoe,
    cornerstone: "",
    topTierCornerstone: false,
    cornerstonePct,
    oversubMultiple,
    marginFullDay1: false,
    peRatio,
    peerPe,
    revenueCAGR,
    profitTrend: "",
    sourcePrimary: "MOOMOO",
    sourceUrls: [sourceUrl],
    lastSeenAt: new Date().toISOString()
  };
}

function scoreItem(obj) {
  let score = 0;
  if (getValueByAliases(obj, NAME_ZH_ALIASES) || getValueByAliases(obj, NAME_EN_ALIASES) || getValueByAliases(obj, NAME_ALIASES)) {
    score += 2;
  }
  if (getValueByAliases(obj, TICKER_ALIASES)) score += 2;

  const dates = [
    DATE_ALIASES.subscriptionStart,
    DATE_ALIASES.subscriptionEnd,
    DATE_ALIASES.pricingDate,
    DATE_ALIASES.allotmentDate,
    DATE_ALIASES.listingDate
  ];
  dates.forEach((aliases) => {
    const value = getValueByAliases(obj, aliases);
    if (normalizeDate(value)) score += 1;
  });
  return score;
}

function scoreArray(arr) {
  if (!Array.isArray(arr) || !arr.length) return 0;
  const sample = arr.slice(0, 10);
  const scores = sample.map((item) => (item && typeof item === "object" ? scoreItem(item) : 0));
  const avg = scores.reduce((sum, val) => sum + val, 0) / sample.length;
  return avg + Math.min(arr.length / 10, 2);
}

function findCandidateArrays(root, maxDepth = 6) {
  const candidates = [];
  const seen = new Set();

  function walk(node, depth) {
    if (!node || typeof node !== "object" || depth > maxDepth) return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node) && node.length && typeof node[0] === "object") {
      candidates.push(node);
      return;
    }

    Object.entries(node).forEach(([key, value]) => {
      if (Array.isArray(value) && value.length && typeof value[0] === "object") {
        candidates.push(value);
      } else if (value && typeof value === "object") {
        if (/ipo|listing|calendar/i.test(key)) {
          walk(value, depth + 1);
        } else {
          walk(value, depth + 1);
        }
      }
    });
  }

  walk(root, 0);
  return candidates;
}

function getByPath(root, path) {
  if (!path) return null;
  const parts = path.split(".").filter(Boolean);
  let current = root;
  for (const part of parts) {
    if (!current) return null;
    if (part.endsWith("]")) {
      const match = part.match(/^(.+)\[(\d+)\]$/);
      if (!match) return null;
      current = current[match[1]];
      if (!current) return null;
      current = current[Number(match[2])];
    } else {
      current = current[part];
    }
  }
  return current;
}

function extractNextData(html) {
  const match = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    return null;
  }
}

function extractScriptJson(html) {
  const $ = cheerio.load(html);
  const results = [];
  $("script[type='application/json']").each((_, el) => {
    const text = $(el).text();
    if (!text) return;
    try {
      const data = JSON.parse(text);
      results.push(data);
    } catch (error) {
      return;
    }
  });
  return results;
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (HK IPO Assistant)"
    },
    signal: controller.signal
  });
  clearTimeout(timeout);
  if (!response.ok) {
    throw new Error(`Moomoo request failed: ${response.status}`);
  }
  return response.text();
}

function parseHtmlTable(html, sourceUrl) {
  const $ = cheerio.load(html);
  const table = $("table").first();
  if (!table.length) return [];

  const headers = table.find("tr").first().find("th,td").map((_, cell) => normalizeWhitespace($(cell).text())).get();
  if (!headers.length) return [];

  const columns = {
    name: -1,
    ticker: -1,
    subscriptionRange: -1,
    pricingDate: -1,
    allotmentDate: -1,
    listingDate: -1
  };

  headers.forEach((header, index) => {
    const lower = header.toLowerCase();
    if (lower.includes("code") || lower.includes("ticker") || lower.includes("symbol")) {
      columns.ticker = index;
      return;
    }
    if (lower.includes("company") || lower.includes("name") || lower.includes("issuer")) {
      columns.name = index;
      return;
    }
    if (lower.includes("subscription") || lower.includes("offer")) {
      columns.subscriptionRange = index;
      return;
    }
    if (lower.includes("pricing") || (lower.includes("price") && !lower.includes("offer"))) {
      columns.pricingDate = index;
      return;
    }
    if (lower.includes("allotment") || lower.includes("result")) {
      columns.allotmentDate = index;
      return;
    }
    if (lower.includes("listing") || lower.includes("list")) {
      columns.listingDate = index;
    }
  });

  const rows = table.find("tr").slice(1);
  const items = [];

  rows.each((_, row) => {
    const cells = $(row).find("td");
    if (!cells.length) return;
    const nameRaw = columns.name >= 0 ? normalizeWhitespace(cells.eq(columns.name).text()) : "";
    const tickerRaw = columns.ticker >= 0 ? normalizeWhitespace(cells.eq(columns.ticker).text()) : "";
    if (!nameRaw && !tickerRaw) return;

    const { nameZh, nameEn } = extractNameParts({ name: nameRaw });
    const ticker = normalizeTicker(tickerRaw);
    const rangeText = columns.subscriptionRange >= 0 ? normalizeWhitespace(cells.eq(columns.subscriptionRange).text()) : "";
    const range = extractDateRange(rangeText);

    const pricingDate = columns.pricingDate >= 0
      ? normalizeDate(normalizeWhitespace(cells.eq(columns.pricingDate).text()))
      : "";
    const allotmentDate = columns.allotmentDate >= 0
      ? normalizeDate(normalizeWhitespace(cells.eq(columns.allotmentDate).text()))
      : "";
    const listingDate = columns.listingDate >= 0
      ? normalizeDate(normalizeWhitespace(cells.eq(columns.listingDate).text()))
      : "";

    items.push({
      id: buildId(ticker, nameRaw),
      nameZh,
      nameEn,
      ticker,
      industryZh: "",
      industryEn: "",
      sectorHeat: "neutral",
      issuePrice: null,
      lotSize: null,
      subscriptionStart: range.start,
      subscriptionEnd: range.end,
      pricingDate,
      allotmentDate,
      listingDate,
      sponsor: "",
      sponsorBreakRate: null,
      greenShoe: false,
      cornerstone: "",
      topTierCornerstone: false,
      cornerstonePct: null,
      oversubMultiple: null,
      marginFullDay1: false,
      peRatio: null,
      peerPe: null,
      revenueCAGR: null,
      profitTrend: "",
      sourcePrimary: "MOOMOO",
      sourceUrls: [sourceUrl],
      lastSeenAt: new Date().toISOString()
    });
  });

  return items;
}

async function fetchMoomooCalendar(url) {
  const html = await fetchHtml(url);
  const jsonPath = process.env.MOOMOO_JSON_PATH || "";

  const candidates = [];
  const nextData = extractNextData(html);
  if (nextData) candidates.push(nextData);
  candidates.push(...extractScriptJson(html));

  let list = null;
  if (jsonPath) {
    for (const candidate of candidates) {
      const value = getByPath(candidate, jsonPath);
      if (Array.isArray(value)) {
        list = value;
        break;
      }
    }
  }

  if (!list) {
    let bestScore = 0;
    candidates.forEach((candidate) => {
      const arrays = findCandidateArrays(candidate);
      arrays.forEach((arr) => {
        const score = scoreArray(arr);
        if (score > bestScore) {
          bestScore = score;
          list = arr;
        }
      });
    });
  }

  if (!list) {
    return parseHtmlTable(html, url);
  }

  const mapped = list
    .filter((item) => item && typeof item === "object")
    .map((item) => mapItem(item, url))
    .filter((item) => item.nameZh || item.nameEn || item.ticker);

  return mapped;
}

module.exports = {
  fetchMoomooCalendar
};
