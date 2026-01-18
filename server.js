const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const dataPath = path.join(__dirname, "data", "ipos.json");
const publicDir = path.join(__dirname, "public");

function loadIpos() {
  const raw = fs.readFileSync(dataPath, "utf8");
  return JSON.parse(raw);
}

app.use(express.static(publicDir));

app.get("/api/ipos", (req, res) => {
  try {
    const ipos = loadIpos();
    res.json({ ipos });
  } catch (error) {
    res.status(500).json({ error: "Failed to load IPO data." });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`HK IPO Assistant running at http://localhost:${PORT}`);
});
