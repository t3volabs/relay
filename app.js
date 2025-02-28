const express = require("express")
const BetterSqlite3 = require("better-sqlite3")
const path = require("path")
const crypto = require("crypto")
const fs = require("fs")

const app = express()
const PORT = 57303

const fileLimit = "10mb"

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Methods", "GET, POST")
  res.header("Access-Control-Allow-Headers", "Content-Type")
  next()
})

// Middleware to parse raw bodies
app.use(
  express.raw({
    type: "*/*",
    limit: fileLimit,
  }),
)

// Ensure data directory exists
const dataDir = path.join(process.cwd(), "data")
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

// Initialize SQLite database
const db = new BetterSqlite3(path.join(dataDir, "storage.db"))

// Set up database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS objects (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), 
    objectId TEXT NOT NULL,
    userId TEXT NOT NULL,
    type TEXT NOT NULL,
    data BLOB NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_objectId ON objects(objectId);
  CREATE INDEX IF NOT EXISTS idx_userId_type ON objects(userId, type);
  CREATE INDEX IF NOT EXISTS idx_created_at ON objects(created_at);
`)

// Validate type string
function validateType(type) {
  if (!type || typeof type !== "string" || type.length === 0 || type.length > 20) {
    throw new Error("Type must be a string between 1 and 20 characters")
  }
  // Only allow alphanumeric and underscore
  if (!/^[a-zA-Z0-9_]+$/.test(type)) {
    throw new Error("Type must contain only letters, numbers, and underscores")
  }
  return type
}

function getTTLTimestamp() {
  const now = new Date()
  // Set TTL to 25 days instead of 1 month
  now.setDate(now.getDate() - 25)
  return now.getTime()
}

// Clean up expired items (run periodically)
function cleanupExpiredItems() {
  const ttlTimestamp = getTTLTimestamp()
  const stmt = db.prepare("DELETE FROM objects WHERE created_at < ?")
  const result = stmt.run(ttlTimestamp)
  console.log(`Cleaned up ${result.changes} expired items`)
}

// Run cleanup on startup and every day
cleanupExpiredItems()
setInterval(cleanupExpiredItems, 24 * 60 * 60 * 1000)

// dbsize to human readable format

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes"

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"]

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i]
}

app.get("/", (req, res) => {
  try {
    const data = {
      fileLimit: fileLimit,
      storageUsed: formatBytes(fs.statSync(path.join(dataDir, "storage.db")).size),
    }

    res.json(data)
  } catch (err) {
    console.error("Error fetching object:", err)
    res.status(500).json({ error: "Failed to fetch object" })
  }
})

// Save raw data with specific type, userID and objectID
app.post("/save/:type/:userId/:objectId", (req, res) => {
  try {
    let { type, userId, objectId } = req.params
    const data = req.body // Raw data buffer

    // Validate input
    if (!data || data.length === 0) {
      return res.status(400).json({ error: "No data provided" })
    }

    try {
      type = validateType(type)
    } catch (err) {
      return res.status(400).json({ error: err.message })
    }

    // Ensure userId is a SHA256 hash
    if (userId.length !== 64) {
      userId = crypto.createHash("sha256").update(userId).digest("hex")
    }

    // Store the object
    const stmt = db.prepare(
      "INSERT OR REPLACE INTO objects (objectId, userId, type, data, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    const now = Date.now()

    stmt.run(objectId, userId, type, data, now)

    res.status(201).json({
      success: true,
      message: "Object stored successfully",
      type,
      userId,
      objectId,
      size: data.length,
      expiresAt: new Date(now + 25 * 24 * 60 * 60 * 1000).toISOString(),
    })
  } catch (err) {
    console.error("Error storing object:", err)
    res.status(500).json({ error: "Failed to store object" })
  }
})

// Fetch all objectIDs for a userID and type
app.get("/fetch/:type/:userId", (req, res) => {
  try {
    let { type, userId } = req.params
    const page = Number.parseInt(req.query.page) || 1
    const limit = 10 // Fixed page size of 10
    const offset = (page - 1) * limit

    try {
      type = validateType(type)
    } catch (err) {
      return res.status(400).json({ error: err.message })
    }

    // Ensure userId is a SHA256 hash
    if (userId.length !== 64) {
      userId = crypto.createHash("sha256").update(userId).digest("hex")
    }

    // Get TTL timestamp
    const ttlTimestamp = getTTLTimestamp()

    // Count total objects for this userId and type (not expired)
    const countStmt = db.prepare(
      "SELECT COUNT(*) as count FROM objects WHERE userId = ? AND type = ? AND created_at >= ?",
    )
    const { count } = countStmt.get(userId, type, ttlTimestamp)

    // Fetch objectIds with pagination
    const fetchStmt = db.prepare(`
      SELECT objectId, created_at, length(data) as size
      FROM objects 
      WHERE userId = ? AND type = ? AND created_at >= ? 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `)

    const objects = fetchStmt.all(userId, type, ttlTimestamp, limit, offset)

    // Format the response
    const objectList = objects.map((obj) => ({
      objectId: obj.objectId,
      size: obj.size,
      createdAt: new Date(obj.created_at).toISOString(),
      expiresAt: new Date(obj.created_at + 25 * 24 * 60 * 60 * 1000).toISOString(),
    }))

    // Calculate pagination info
    const totalPages = Math.ceil(count / limit)

    res.json({
      type,
      userId,
      objects: objectList,
      pagination: {
        page,
        limit,
        totalObjects: count,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    })
  } catch (err) {
    console.error("Error fetching objects:", err)
    res.status(500).json({ error: "Failed to fetch objects" })
  }
})

// Get specific object by objectID
app.get("/object/:objectId", (req, res) => {
  try {
    const { objectId } = req.params

    // Get TTL timestamp
    const ttlTimestamp = getTTLTimestamp()

    // Fetch the object
    const stmt = db.prepare(`
      SELECT data, created_at, userId, type
      FROM objects 
      WHERE objectId = ? AND created_at >= ?
    `)

    const object = stmt.get(objectId, ttlTimestamp)

    if (!object) {
      return res.status(404).json({ error: "Object not found or expired" })
    }

    // Send raw data with appropriate headers
    res.set("Content-Type", "application/octet-stream")
    res.set("Content-Length", object.data.length)
    res.send(object.data)
  } catch (err) {
    console.error("Error fetching object:", err)
    res.status(500).json({ error: "Failed to fetch object" })
  }
})

// Start server
app.listen(PORT, () => {
  console.log(`Server running : ${PORT}`)
})

