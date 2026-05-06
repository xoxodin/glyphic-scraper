import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Glyphic Scraper API is running!");
});

app.post("/api/crawl", async (req, res) => {
  try {
    const { urls, mode, maxPages } = req.body;
    const { runScraper } = await import("./scraper.mjs");
    const result = await runScraper(urls || [], mode || "both", maxPages || 20);
    res.json({ success: true, output: result });
  } catch (err) {
    console.error("CRAWL_ERROR:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/stop", (req, res) => {
  res.json({ status: "stopped" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("Backend running on http://localhost:" + PORT);
});
