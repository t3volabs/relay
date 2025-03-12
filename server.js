const express = require("express");
const BetterSqlite3 = require("better-sqlite3");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 57303;
const dataDir = path.join(process.cwd(), "data");
const dbFile = path.join(dataDir, "storage.db");

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new BetterSqlite3(dbFile);

// Add created_at field to track when entries are added
db.exec(`
  CREATE TABLE IF NOT EXISTS objects (
    objectId TEXT PRIMARY KEY, 
    userId TEXT NOT NULL,
    entry BLOB NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

// Periodic cleanup to remove entries older than 10 days
const deleteOldEntries = () => {
  const now = Date.now();
  const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000; // 10 days in milliseconds

  db.prepare("DELETE FROM objects WHERE created_at < ?").run(tenDaysAgo);
  console.log("Deleted entries older than 10 days");
};

// Run cleanup every 24 hours
setInterval(deleteOldEntries, 24 * 60 * 60 * 1000);

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.use(express.json({ limit: "10mb" }));

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

const hashUserId = (userId) => crypto.createHash("sha256").update(userId).digest("hex");

app.use(express.static("dist"));

app.get("/server", (req, res) => {
  const totalEntries = db.prepare("SELECT COUNT(*) AS count FROM objects").get().count;
  const totalUsers = db.prepare("SELECT COUNT(DISTINCT userId) AS count FROM objects").get().count;
  const totalSize = db.prepare("SELECT SUM(LENGTH(entry)) AS size FROM objects").get().size;

  res.json({
    status: "ok",
    totalEntries,
    totalUsers,
    totalSize,
  });
});

app.post("/save/:userId", (req, res) => {
  try {
    const { userId } = req.params;
    const hashedUserId = hashUserId(userId);
    const data = JSON.stringify(req.body);

    if (!data || data.length === 0) {
      throw new Error("Data is empty or malformed");
    }

    const objectId = hashUserId(data + hashedUserId);
    const now = Date.now();

    db.prepare("INSERT OR REPLACE INTO objects (objectId, userId, entry, created_at) VALUES (?, ?, ?, ?)").run(objectId, hashedUserId, data, now);

    res.json({ success: true, objectId, expiresAt: new Date(now + 25 * 24 * 60 * 60 * 1000) });
  } catch (err) {
    console.error("Error storing object:", err);
    res.status(500).json({ error: "Failed to store object" });
  }
});

app.get("/fetch/:userId/:page", (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.params.page, 10) || 1; // Convert to integer, default to 1 if invalid
    const hashedUserId = hashUserId(userId);
    const limit = 30;
    const offset = (page - 1) * limit;

    const totalCount = db.prepare("SELECT COUNT(*) AS count FROM objects WHERE userId = ?").get(hashedUserId).count;
    const objects = db.prepare("SELECT entry FROM objects WHERE userId = ? ORDER BY created_at DESC LIMIT ? OFFSET ?").all(hashedUserId, limit, offset);

    if (!objects.length) return res.status(404).json({ error: "No data found" });

    res.json({
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
      totalCount,
      hasNextPage: offset + limit < totalCount,
      hasPreviousPage: page > 1,
      data: objects.map((obj) => JSON.parse(obj.entry)),
    });
  } catch (err) {
    console.error("Error fetching objects:", err);
    res.status(500).json({ error: "Failed to fetch objects" });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
