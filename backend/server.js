import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

dotenv.config();

const PORT = process.env.PORT || 4000;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || "weathere";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || null;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const JWT_SECRET = process.env.JWT_SECRET || "insecure-dev-secret-change-me";

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI in .env or environment");
  process.exit(1);
}

// ---------- Mongo connection ----------
let mongoConnected = false;
try {
  await mongoose.connect(MONGODB_URI, {
    dbName: DB_NAME,
    serverSelectionTimeoutMS: 5000, // 5 second timeout
    socketTimeoutMS: 45000, // 45 second socket timeout
  });
  mongoConnected = true;
  console.log("✅ Connected to MongoDB:", DB_NAME);
} catch (err) {
  console.error("❌ Failed to connect to MongoDB:", err.message);
  // Don't exit process - allow server to start but show errors in API responses
}

// Add connection event handlers
mongoose.connection.on('error', err => {
  console.error('MongoDB connection error:', err);
  mongoConnected = false;
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
  mongoConnected = false;
});

mongoose.connection.on('connected', () => {
  console.log('MongoDB connected');
  mongoConnected = true;
});

// ---------- Schemas & models ----------

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    displayName: { type: String, required: true },

    // Favorites tied to this account
    favorites: [
      {
        locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location" },
        name: String,
        latitude: Number,
        longitude: Number,
        timezone: String
      }
    ]
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

const locationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    latitude: Number,
    longitude: Number,
    timezone: String
  },
  { timestamps: true }
);

const Location = mongoose.model("Location", locationSchema);

const feedbackSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", required: true },
    forecastTime: { type: Date, required: true },
    rating: {
      type: String,
      enum: ["like", "dislike"],
      required: true
    },
    commentText: {
      type: String,
      default: "",
      maxlength: [1500, "Comment cannot exceed 1500 characters"]
    },
    aiSentiment: {
      label: {
        type: String,
        enum: ["positive", "negative", "mixed", "neutral"],
        default: "mixed"
      },
      score: Number,
      model: String,
      processedAt: Date
    },
    reactionCounts: {
      likes: { type: Number, default: 0 },
      dislikes: { type: Number, default: 0 }
    }
  },
  { timestamps: true }
);

feedbackSchema.index(
  { userId: 1, locationId: 1, forecastTime: 1 },
  { unique: true }
);

const Feedback = mongoose.model("Feedback", feedbackSchema);

const aiSummarySchema = new mongoose.Schema(
  {
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", required: true },
    forecastTime: { type: Date, required: true },
    window: { type: String, default: "hour" },
    stats: {
      totalFeedback: Number,
      likes: Number,
      dislikes: Number,
      uniqueUsers: Number
    },
    summaryText: String,
    model: String,
    generatedAt: Date
  },
  { timestamps: true }
);

aiSummarySchema.index(
  { locationId: 1, forecastTime: 1, window: 1 },
  { unique: true }
);

const AISummary = mongoose.model("AISummary", aiSummarySchema);

// ---------- Express app ----------
const app = express();
app.use(cors());
app.use(express.json());

// ---------- Helpers ----------

function normalizeToHour(date) {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d;
}

function createToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      displayName: user.displayName
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return res.status(401).json({ error: "Missing Authorization header" });
  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Invalid Authorization header" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      id: payload.sub,
      email: payload.email,
      displayName: payload.displayName
    };
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

async function getOrCreateLocation({ name, latitude, longitude, timezone }) {
  let loc = await Location.findOne({ name });
  if (!loc) {
    loc = await Location.create({
      name,
      latitude,
      longitude,
      timezone
    });
  }
  return loc;
}

// ---------- Bot Control Variables ----------

// Global bot state and frequency
let botSchedulerActive = process.env.ENABLE_DEMO_BOTS === 'true';
let botCommentFrequency = 2 * 60 * 1000; // Default: 2 minutes in milliseconds
let botInterval;

// ---------- Bot Control Helper Functions ----------

function getNextBotRunTime() {
  if (!botSchedulerActive) return null;
  const nextRun = new Date(Date.now() + botCommentFrequency);
  return nextRun.toISOString();
}

async function getTotalBotComments() {
  try {
    if (!mongoConnected) return 0;
    const botUsers = await User.find({ email: { $regex: /weather_bot\d@demo\.com/ } });
    if (botUsers.length === 0) return 0;

    const botUserIds = botUsers.map(user => user._id);
    const commentCount = await Feedback.countDocuments({
      userId: { $in: botUserIds }
    });

    return commentCount;
  } catch (error) {
    console.error("Error counting bot comments:", error);
    return 0;
  }
}

async function getBotUserCount() {
  try {
    if (!mongoConnected) return 0;
    const botUsers = await User.find({ email: { $regex: /weather_bot\d@demo\.com/ } });
    return botUsers.length;
  } catch (error) {
    console.error("Error counting bot users:", error);
    return 0;
  }
}

// Bot comment function
async function addBotComment() {
  try {
    if (!mongoConnected || !botSchedulerActive) {
      return "Skipped - MongoDB not connected or bot scheduler inactive";
    }

    const sfLocation = await Location.findOne({ name: "San Francisco, CA, USA" });
    if (!sfLocation) {
      return "Skipped - San Francisco location not found";
    }

    const botUsers = await User.find({ email: { $regex: /weather_bot\d@demo\.com/ } });
    if (botUsers.length === 0) {
      return "Skipped - No bot users found";
    }

    const randomBot = botUsers[Math.floor(Math.random() * botUsers.length)];
    const comments = [
      { text: "Accurate forecast! Temperature was spot on.", rating: "like" },
      { text: "Temperature was off by a few degrees today.", rating: "dislike" },
      { text: "Rain prediction was perfect - started right on time.", rating: "like" },
      { text: "Wind stronger than expected, forecast needs improvement.", rating: "dislike" },
      { text: "Beautiful sunny day just as predicted!", rating: "like" },
      { text: "Humidity feels much higher than forecast indicated.", rating: "dislike" },
      { text: "Cloud cover was exactly as forecasted - great job!", rating: "like" },
      { text: "Sunset timing was different from the prediction.", rating: "dislike" },
      { text: "Precipitation chance was accurate for today.", rating: "like" },
      { text: "UV index seems higher than forecasted.", rating: "dislike" }
    ];
    const randomComment = comments[Math.floor(Math.random() * comments.length)];

    const forecastTime = normalizeToHour(new Date());

    // Check if bot already commented this hour
    const existing = await Feedback.findOne({
      userId: randomBot._id,
      locationId: sfLocation._id,
      forecastTime
    });

    if (!existing) {
      await Feedback.create({
        userId: randomBot._id,
        locationId: sfLocation._id,
        forecastTime,
        rating: randomComment.rating,
        commentText: randomComment.text
      });
      return `✅ ${randomBot.displayName} commented: "${randomComment.text}"`;
    } else {
      return `⏸️ ${randomBot.displayName} already commented this hour`;
    }
  } catch (err) {
    console.error("❌ Bot comment error:", err);
    return `❌ Error: ${err.message}`;
  }
}

// Bot scheduler with variable frequency
function startBotScheduler() {
  if (botInterval) {
    clearInterval(botInterval);
  }

  botInterval = setInterval(async () => {
    if (botSchedulerActive && mongoConnected) {
      const result = await addBotComment();
      console.log(`🤖 ${result}`);
    }
  }, botCommentFrequency);
}

// ---------- Routes ----------

app.get("/api/health", (req, res) => {
  const mongoStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({
    ok: true,
    mongoConnected: mongoConnected,
    mongoStatus: mongoStatus,
    aiConfigured: !!OPENAI_API_KEY,
    timestamp: new Date().toISOString()
  });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: "Service temporarily unavailable - database connection issue" });
    }

    const { email, password, displayName } = req.body;
    if (!email || !password || !displayName) {
      return res.status(400).json({ error: "email, password, and displayName are required" });
    }
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ error: "Email is already registered" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, passwordHash, displayName });
    const token = createToken(user);
    res.json({
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName
      },
      token
    });
  } catch (err) {
    console.error("register error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: "Service temporarily unavailable - database connection issue" });
    }

    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: "Invalid email or password" });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(400).json({ error: "Invalid email or password" });
    }
    const token = createToken(user);
    res.json({
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName
      },
      token
    });
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/feedback", authMiddleware, async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: "Service temporarily unavailable - database connection issue" });
    }

    const {
      locationName,
      latitude,
      longitude,
      timezone,
      forecastTime,
      rating,
      commentText
    } = req.body;

    // EXPLICIT SERVER-SIDE VALIDATION
    if (commentText && commentText.length > 1500) {
      return res.status(400).json({
        error: "Comment cannot exceed 1500 characters. Current length: " + commentText.length
      });
    }

    if (!locationName || !forecastTime || !rating) {
      return res.status(400).json({ error: "locationName, forecastTime, and rating are required" });
    }

    if (!["like", "dislike"].includes(rating)) {
      return res.status(400).json({ error: "rating must be 'like' or 'dislike'" });
    }

    const location = await getOrCreateLocation({
      name: locationName,
      latitude,
      longitude,
      timezone
    });

    const normalizedForecastTime = normalizeToHour(forecastTime);

    try {
      const feedback = await Feedback.findOneAndUpdate(
        {
          userId: req.user.id,
          locationId: location._id,
          forecastTime: normalizedForecastTime
        },
        {
          $set: {
            rating,
            commentText: commentText || ""
          }
        },
        {
          upsert: true,
          new: true,
          runValidators: true
        }
      );

      res.json({ ok: true, feedbackId: feedback._id });
    } catch (err) {
      // IMPROVED VALIDATION ERROR HANDLING
      if (err.name === 'ValidationError') {
        const messages = Object.values(err.errors).map(e => e.message).join(', ');
        return res.status(400).json({ error: "Validation error: " + messages });
      }

      if (err.code === 11000) {
        return res.status(409).json({
          error: "User has already submitted feedback for this forecast hour."
        });
      }
      throw err;
    }
  } catch (err) {
    console.error("submit feedback error:", err);

    // BETTER ERROR MESSAGES FOR CLIENT
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: "Comment validation failed: " + err.message });
    }

    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/feedback/summary", async (req, res) => {
  try {
    // Check if MongoDB is connected
    if (!mongoConnected) {
      return res.status(503).json({
        error: "Service temporarily unavailable - database connection issue",
        stats: { likes: 0, dislikes: 0, totalFeedback: 0, uniqueUsers: 0 },
        comments: [],
        aiSummary: "Service unavailable - please try again later"
      });
    }

    const { locationName, forecastTime } = req.query;
    if (!locationName || !forecastTime) {
      return res.status(400).json({ error: "locationName and forecastTime are required" });
    }

    const location = await Location.findOne({ name: locationName });
    if (!location) {
      return res.json({
        stats: { likes: 0, dislikes: 0, totalFeedback: 0, uniqueUsers: 0 },
        comments: [],
        aiSummary: null
      });
    }

    const normalizedForecastTime = normalizeToHour(forecastTime);

    const feedbackDocs = await Feedback.find({
      locationId: location._id,
      forecastTime: normalizedForecastTime
    }).sort({ createdAt: -1 }).populate("userId", "displayName");

    const likes = feedbackDocs.filter(f => f.rating === "like").length;
    const dislikes = feedbackDocs.filter(f => f.rating === "dislike").length;
    const totalFeedback = feedbackDocs.length;
    const uniqueUsers = new Set(feedbackDocs.map(f => String(f.userId?._id || f.userId))).size;

    let summaryDoc = await AISummary.findOne({
      locationId: location._id,
      forecastTime: normalizedForecastTime,
      window: "hour"
    });

    let summaryText = summaryDoc ? summaryDoc.summaryText : null;

    if (!summaryText && totalFeedback > 0) {
  // Cheap spam / nonsense filter
  const rawComments = feedbackDocs
    .map(f => (f.commentText || "").trim())
    .filter(Boolean);

  const meaningfulComments = rawComments.filter(c =>
    c.length >= 10 && /[a-zA-Z]/.test(c) // at least 10 chars and contains letters
  );

  const MIN_MEANINGFUL_COMMENTS = 3;
  const MIN_UNIQUE_USERS_FOR_AI = 2;

  // If no AI key, or data is too thin / unreliable, fall back to a deterministic summary
  if (
    !OPENAI_API_KEY ||
    meaningfulComments.length < MIN_MEANINGFUL_COMMENTS ||
    uniqueUsers < MIN_UNIQUE_USERS_FOR_AI
  ) {
    summaryText =
      `Based on ${totalFeedback} feedback entr${totalFeedback === 1 ? "y" : "ies"} so far, ` +
      `${likes} like(s) and ${dislikes} dislike(s) have been recorded for this hour. ` +
      `There is not yet enough consistent commentary from multiple users to generate an AI summary.`;
  } else {
    // Robust prompt that includes stats + filtered comments
    const prompt = `
You are analyzing user comments about how accurate the current weather forecast is.

Location: ${location.name}
Forecast time (normalized hour): ${normalizedForecastTime.toISOString()}

Stats:
- Total feedback entries: ${totalFeedback}
- Likes (forecast accurate): ${likes}
- Dislikes (forecast inaccurate): ${dislikes}
- Unique users: ${uniqueUsers}

User comments (only a sample of meaningful ones):
${meaningfulComments.map((c, i) => `${i + 1}. ${c}`).join("\\n")}

Task:
Provide a concise 2–3 sentence summary that:
- describes how accurate the forecast seems compared to real conditions,
- clearly states the overall sentiment (positive, mixed, or negative),
- notes any recurring issues users mention (e.g. wrong temperature, wrong precipitation, timing off),
- and mentions when the sample size is small or feedback is sparse, instead of overgeneralizing.

Respond as plain text with no bullet points.
    `.trim();

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + OPENAI_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [
            { role: "system", content: "You summarize weather forecast accuracy based on user comments and basic statistics." },
            { role: "user", content: prompt }
          ],
          max_tokens: 220
        })
      });

      if (response.ok) {
        const data = await response.json();
        const aiText = data.choices?.[0]?.message?.content?.trim();
        if (aiText) {
          summaryText = aiText;
          summaryDoc = await AISummary.findOneAndUpdate(
            {
              locationId: location._id,
              forecastTime: normalizedForecastTime,
              window: "hour"
            },
            {
              $set: {
                summaryText: aiText,
                stats: { totalFeedback, likes, dislikes, uniqueUsers },
                model: OPENAI_MODEL,
                generatedAt: new Date()
              }
            },
            { new: true, upsert: true }
          );
        }
      } else {
        const err = await response.json().catch(() => ({}));
        console.error("OpenAI error:", err);
      }
    } catch (e) {
      console.error("OpenAI request failed:", e);
    }
  }
}

    const comments = feedbackDocs.map(f => ({
      id: f._id,
      userId: f.userId?._id || f.userId,
      userDisplayName: f.userId?.displayName || "User",
      commentText: f.commentText,
      rating: f.rating,
      createdAt: f.createdAt
    }));

    res.json({
      stats: { likes, dislikes, totalFeedback, uniqueUsers },
      comments,
      aiSummary: summaryText
    });
  } catch (err) {
    console.error("summary error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get favorites for the current user
app.get("/api/user/favorites", authMiddleware, async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: "Service temporarily unavailable - database connection issue" });
    }

    const user = await User.findById(req.user.id).populate("favorites.locationId");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const favorites = (user.favorites || []).map(f => {
      const locDoc = f.locationId;
      return {
        id: locDoc?._id || null,
        name: f.name || locDoc?.name,
        latitude: f.latitude ?? locDoc?.latitude,
        longitude: f.longitude ?? locDoc?.longitude,
        timezone: f.timezone ?? locDoc?.timezone
      };
    });

    res.json({ favorites });
  } catch (err) {
    console.error("get favorites error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Toggle favorite for current location (add/remove)
app.post("/api/user/favorites/toggle", authMiddleware, async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: "Service temporarily unavailable - database connection issue" });
    }

    const { locationName, latitude, longitude, timezone } = req.body;
    if (!locationName) {
      return res.status(400).json({ error: "locationName is required" });
    }

    // Normalize location through the Location collection
    const location = await getOrCreateLocation({
      name: locationName,
      latitude,
      longitude,
      timezone
    });

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (!user.favorites) user.favorites = [];

    const existingIndex = user.favorites.findIndex(
      (f) => String(f.locationId) === String(location._id)
    );

    let isFavorite;
    if (existingIndex >= 0) {
      // Remove from favorites
      user.favorites.splice(existingIndex, 1);
      isFavorite = false;
    } else {
      // Add to favorites
      user.favorites.push({
        locationId: location._id,
        name: location.name,
        latitude: location.latitude,
        longitude: location.longitude,
        timezone: location.timezone
      });
      isFavorite = true;
    }

    await user.save();

    const favorites = (user.favorites || []).map(f => ({
      id: f.locationId,
      name: f.name,
      latitude: f.latitude,
      longitude: f.longitude,
      timezone: f.timezone
    }));

    res.json({ favorites, isFavorite });
  } catch (err) {
    console.error("toggle favorites error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ---------- Bot Seeding Routes (GET and POST) ----------

// GET route for easy browser access
app.get("/api/scripts/seed-bots", async (req, res) => {
  await handleSeedBots(req, res);
});

// POST route for programmatic access
app.post("/api/scripts/seed-bots", async (req, res) => {
  await handleSeedBots(req, res);
});

// Common handler function
async function handleSeedBots(req, res) {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: "Service temporarily unavailable - database connection issue" });
    }

    const BOT_USERS = [
      { email: "weather_bot1@demo.com", password: "bot1pass123", displayName: "WeatherBot1" },
      { email: "weather_bot2@demo.com", password: "bot2pass123", displayName: "WeatherBot2" },
      { email: "weather_bot3@demo.com", password: "bot3pass123", displayName: "WeatherBot3" },
      { email: "weather_bot4@demo.com", password: "bot4pass123", displayName: "WeatherBot4" }
    ];

    // Ensure San Francisco location exists
    let sfLocation = await Location.findOne({ name: "San Francisco, CA, USA" });
    if (!sfLocation) {
      sfLocation = await Location.create({
        name: "San Francisco, CA, USA",
        latitude: 37.7749,
        longitude: -122.4194,
        timezone: "America/Los_Angeles"
      });
      console.log("✅ Created San Francisco location");
    }

    // Create bot users
    const createdBots = [];
    const existingBots = [];
    for (const botData of BOT_USERS) {
      let user = await User.findOne({ email: botData.email });
      if (!user) {
        const passwordHash = await bcrypt.hash(botData.password, 10);
        user = await User.create({
          email: botData.email,
          passwordHash,
          displayName: botData.displayName
        });
        createdBots.push(botData.displayName);
        console.log(`✅ Created bot user: ${botData.displayName}`);
      } else {
        existingBots.push(botData.displayName);
      }
    }

    res.json({
      success: true,
      message: "Demo bots processed successfully",
      botsCreated: createdBots,
      botsExisting: existingBots,
      totalBots: BOT_USERS.length
    });
  } catch (error) {
    console.error("❌ Error seeding bots:", error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ---------- Bot Control Routes ----------

// GET bot status
app.get("/api/bots/status", async (req, res) => {
  res.json({
    active: botSchedulerActive,
    frequency: botCommentFrequency / 1000, // Return in seconds
    frequencyMs: botCommentFrequency,
    nextRun: getNextBotRunTime(),
    totalComments: await getTotalBotComments(),
    botUsers: await getBotUserCount()
  });
});

// POST to control bots (activate/deactivate)
app.post("/api/bots/control", async (req, res) => {
  const { action, frequency } = req.body;

  if (action === 'activate') {
    botSchedulerActive = true;
    console.log("🤖 Bot scheduler activated");
  } else if (action === 'deactivate') {
    botSchedulerActive = false;
    console.log("🤖 Bot scheduler deactivated");
  }

  if (frequency && frequency > 0) {
    botCommentFrequency = frequency * 1000; // Convert seconds to milliseconds
    console.log(`🤖 Bot frequency set to ${frequency} seconds`);

    // Restart scheduler with new frequency
    startBotScheduler();
  }

  res.json({
    success: true,
    active: botSchedulerActive,
    frequency: botCommentFrequency / 1000,
    message: `Bot scheduler ${botSchedulerActive ? 'activated' : 'deactivated'}`
  });
});

// POST to trigger immediate bot comment
app.post("/api/bots/comment-now", async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: "Service temporarily unavailable" });
    }

    const result = await addBotComment();
    res.json({
      success: true,
      message: result || "Bot comment added successfully"
    });
  } catch (error) {
    console.error("❌ Immediate bot comment error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Weathere backend listening on port ${PORT}`);
  console.log(`📊 MongoDB connected: ${mongoConnected}`);
  console.log(`🤖 AI configured: ${!!OPENAI_API_KEY}`);
  console.log(`🚀 Bot seeding available at: /api/scripts/seed-bots`);
  console.log(`🎮 Bot control available at: /api/bots/status`);
});

// ---------- Demo Bot Scheduler ----------

if (process.env.NODE_ENV === 'production') {
    console.log(`🤖 Bot scheduler initializing: ${botSchedulerActive ? 'ACTIVE' : 'INACTIVE'}`);
    console.log(`🤖 Bot frequency: ${botCommentFrequency / 1000} seconds`);
    startBotScheduler();
}
