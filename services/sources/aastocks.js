const cheerio = require("cheerio");

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeDate(value) {
  if (!value) return "";
  const match = value.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (!match) return "";
  const year = match[1];
  const month = match[2].padStart(2, "0");
  const day = match[3].padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function extractDateRange(value) {
  if (!value) return { start: "", end: "" };
  const matches = value.match(/(\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})/g) || [];
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

function normalizeTicker(value) {
  if (!value) return "";
  const match = value.match(/\d{5}/);
  if (match) return match[0];
  return normalizeWhitespace(value);
}

function containsCjk(value) {
  return /[\u4e00-\u9fff]/.test(value);
}

function splitName(raw) {
  const cleaned = normalizeWhitespace(raw);
  if (!cleaned) return { nameZh: "", nameEn: "" };
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
    return { nameZh: left, nameEn: right };
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

function mapHeaders(headers) {
  const columns = {
    name: -1,
    ticker: -1,
    subscriptionRange: -1,
    subscriptionStart: -1,
    subscriptionEnd: -1,
    pricingDate: -1,
    allotmentDate: -1,
    listingDate: -1
  };

  headers.forEach((header, index) => {
    if (header.includes("\u4ee3\u865f") || header.includes("\u4ee3\u53f7") || header.includes("\u4ee3\u78bc") || header.includes("\u80a1\u4efd\u4ee3\u53f7")) {
      columns.ticker = index;
      return;
    }
    if (header.includes("\u516c\u53f8") || header.includes("\u80a1\u4efd\u540d\u7a31") || header.includes("\u80a1\u4efd\u540d\u79f0") || header.includes("\u540d\u7a31")) {
      columns.name = index;
      return;
    }
    if (header.includes("\u62db\u80a1") && (header.includes("\u671f") || header.includes("\u65e5\u671f"))) {
      columns.subscriptionRange = index;
      return;
    }
    if (header.includes("\u62db\u80a1") && (header.includes("\u958b\u59cb") || header.includes("\u5f00\u59cb"))) {
      columns.subscriptionStart = index;
      return;
    }
    if (header.includes("\u62db\u80a1") && header.includes("\u622a\u6b62")) {
      columns.subscriptionEnd = index;
      return;
    }
    if (header.includes("\u5b9a\u50f9") || header.includes("\u5b9a\u4ef7")) {
      columns.pricingDate = index;
      return;
    }
    if (header.includes("\u7d50\u679c") || header.includes("\u7ed3\u679c") || header.includes("\u914d\u552e") || header.includes("\u5206\u914d")) {
      columns.allotmentDate = index;
      return;
    }
    if (header.includes("\u4e0a\u5e02")) {
      columns.listingDate = index;
    }
  });

  return columns;
}

function pickTable($) {
  const tables = $("table");
  let selected = null;

  tables.each((_, table) => {
    const headerCells = $(table).find("tr").first().find("th,td");
    const headerText = headerCells.map((__, cell) => normalizeWhitespace($(cell).text())).get();
    const headerLine = headerText.join(" ");
    const hasListing = headerLine.includes("\u4e0a\u5e02");
    const hasSubscription = headerLine.includes("\u62db\u80a1") || headerLine.includes("\u8ba4\u8d2d");
    if (hasListing && hasSubscription) {
      selected = table;
      return false;
    }
    return true;
  });

  return selected;
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
    throw new Error(`AASTOCKS request failed: ${response.status}`);
  }
  return response.text();
}

async function fetchAastocksCalendar(url) {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const table = pickTable($);

  if (!table) {
    return [];
  }

  const rows = $(table).find("tr");
  if (!rows.length) return [];

  const headers = rows.first().find("th,td").map((_, cell) => normalizeWhitespace($(cell).text())).get();
  const columns = mapHeaders(headers);
  const items = [];

  rows.slice(1).each((_, row) => {
    const cells = $(row).find("td");
    if (!cells.length) return;

    const nameCell = columns.name >= 0 ? cells.eq(columns.name) : null;
    const nameRaw = nameCell ? normalizeWhitespace(nameCell.text()) : "";
    const tickerRaw = columns.ticker >= 0 ? normalizeWhitespace(cells.eq(columns.ticker).text()) : "";

    const { nameZh, nameEn } = splitName(nameRaw);
    const ticker = normalizeTicker(tickerRaw);

    if (!nameRaw && !ticker) return;

    let subscriptionStart = "";
    let subscriptionEnd = "";

    if (columns.subscriptionRange >= 0) {
      const rangeText = normalizeWhitespace(cells.eq(columns.subscriptionRange).text());
      const range = extractDateRange(rangeText);
      subscriptionStart = range.start;
      subscriptionEnd = range.end;
    }

    if (columns.subscriptionStart >= 0) {
      subscriptionStart = normalizeDate(normalizeWhitespace(cells.eq(columns.subscriptionStart).text())) || subscriptionStart;
    }

    if (columns.subscriptionEnd >= 0) {
      subscriptionEnd = normalizeDate(normalizeWhitespace(cells.eq(columns.subscriptionEnd).text())) || subscriptionEnd;
    }

    const pricingDate = columns.pricingDate >= 0
      ? normalizeDate(normalizeWhitespace(cells.eq(columns.pricingDate).text()))
      : "";

    const allotmentDate = columns.allotmentDate >= 0
      ? normalizeDate(normalizeWhitespace(cells.eq(columns.allotmentDate).text()))
      : "";

    const listingDate = columns.listingDate >= 0
      ? normalizeDate(normalizeWhitespace(cells.eq(columns.listingDate).text()))
      : "";

    const link = nameCell ? nameCell.find("a").attr("href") : "";
    const sourceUrls = [url];
    if (link) {
      try {
        sourceUrls.push(new URL(link, url).toString());
      } catch (error) {
        sourceUrls.push(link);
      }
    }

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
      subscriptionStart,
      subscriptionEnd,
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
      sourcePrimary: "AASTOCKS",
      sourceUrls,
      lastSeenAt: new Date().toISOString()
    });
  });

  return items;
}

module.exports = {
  fetchAastocksCalendar
};
