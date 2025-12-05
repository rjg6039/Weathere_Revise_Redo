import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || "weathere";

// Bot users for demo
const BOT_USERS = [
    { email: "weather_bot1@demo.com", password: "bot1pass123", displayName: "WeatherBot1" },
    { email: "weather_bot2@demo.com", password: "bot2pass123", displayName: "WeatherBot2" },
    { email: "weather_bot3@demo.com", password: "bot3pass123", displayName: "WeatherBot3" },
    { email: "weather_bot4@demo.com", password: "bot4pass123", displayName: "WeatherBot4" }
];

// Sample comments for bots
const SAMPLE_COMMENTS = [
    "The forecast was quite accurate today!",
    "Temperature seems a bit off from what was predicted.",
    "Rain started earlier than expected.",
    "Perfect weather matching the forecast!",
    "Wind is stronger than what was forecasted.",
    "Sunny just as predicted, great job!",
    "Cloud cover is more than expected.",
    "Humidity feels higher than the forecast indicated.",
    "Spot on with the temperature prediction!",
    "Weather changed faster than the hourly forecast showed."
];

async function seedDemoBots() {
    try {
        await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });
        console.log("Connected to MongoDB");

        const User = mongoose.model("User", new mongoose.Schema({
            email: { type: String, required: true, unique: true },
            passwordHash: { type: String, required: true },
            displayName: { type: String, required: true },
            favorites: Array
        }, { timestamps: true }));

        const Location = mongoose.model("Location", new mongoose.Schema({
            name: { type: String, required: true, unique: true },
            latitude: Number,
            longitude: Number,
            timezone: String
        }, { timestamps: true }));

        const Feedback = mongoose.model("Feedback", new mongoose.Schema({
            userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
            locationId: { type: mongoose.Schema.Types.ObjectId, ref: "Location", required: true },
            forecastTime: { type: Date, required: true },
            rating: { type: String, enum: ["like", "dislike"], required: true },
            commentText: { type: String, default: "" },
            aiSentiment: Object,
            reactionCounts: Object
        }, { timestamps: true }));

        // Ensure San Francisco location exists
        let sfLocation = await Location.findOne({ name: "San Francisco, CA, USA" });
        if (!sfLocation) {
            sfLocation = await Location.create({
                name: "San Francisco, CA, USA",
                latitude: 37.7749,
                longitude: -122.4194,
                timezone: "America/Los_Angeles"
            });
            console.log("Created San Francisco location");
        }

        // Create bot users
        const botUsers = [];
        for (const botData of BOT_USERS) {
            let user = await User.findOne({ email: botData.email });
            if (!user) {
                const passwordHash = await bcrypt.hash(botData.password, 10);
                user = await User.create({
                    email: botData.email,
                    passwordHash,
                    displayName: botData.displayName
                });
                console.log(`Created bot user: ${botData.displayName}`);
            }
            botUsers.push(user);
        }

        console.log("Demo bots seeded successfully!");
        process.exit(0);
    } catch (error) {
        console.error("Error seeding demo bots:", error);
        process.exit(1);
    }
}

seedDemoBots();