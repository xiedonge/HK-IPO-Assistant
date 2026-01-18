const express = require("express");
const path = require("path");
const { getIpos } = require("./services/ipoService");

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "public");

app.use(express.static(publicDir));

app.get("/api/ipos", async (req, res) => {
  try {
    const { ipos, source, updatedAt } = await getIpos();
    res.json({ ipos, source, updatedAt });
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
