import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || "weathere";

const SAMPLE_COMMENTS = [
    { comment: "The forecast was quite accurate today!", rating: "like" },
    { comment: "Temperature seems a bit off from what was predicted.", rating: "dislike" },
    { comment: "Rain started earlier than expected.", rating: "dislike" },
    { comment: "Perfect weather matching the forecast!", rating: "like" },
    { comment: "Wind is stronger than what was forecasted.", rating: "dislike" },
    { comment: "Sunny just as predicted, great job!", rating: "like" },
    { comment: "Cloud cover is more than expected.", rating: "dislike" },
    { comment: "Humidity feels higher than the forecast indicated.", rating: "dislike" },
    { comment: "Spot on with the temperature prediction!", rating: "like" },
    { comment: "Weather changed faster than the hourly forecast showed.", rating: "dislike" }
];

function normalizeToHour(date) {
    const d = new Date(date);
    d.setMinutes(0, 0, 0);
    return d;
}

async function addBotComment() {
    try {
        await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });

        const User = mongoose.model("User");
        const Location = mongoose.model("Location");
        const Feedback = mongoose.model("Feedback");

        // Get San Francisco location
        const sfLocation = await Location.findOne({ name: "San Francisco, CA, USA" });
        if (!sfLocation) {
            console.log("San Francisco location not found");
            return;
        }

        // Get all bot users
        const botUsers = await User.find({
            email: { $regex: /weather_bot\d@demo\.com/ }
        });

        if (botUsers.length === 0) {
            console.log("No bot users found");
            return;
        }

        // Select a random bot and random comment
        const randomBot = botUsers[Math.floor(Math.random() * botUsers.length)];
        const randomCommentData = SAMPLE_COMMENTS[Math.floor(Math.random() * SAMPLE_COMMENTS.length)];

        const forecastTime = normalizeToHour(new Date());

        // Check if this bot has already commented in this hour
        const existingFeedback = await Feedback.findOne({
            userId: randomBot._id,
            locationId: sfLocation._id,
            forecastTime: forecastTime
        });

        if (existingFeedback) {
            console.log(`Bot ${randomBot.displayName} already commented this hour, skipping...`);
            return;
        }

        // Add the comment
        await Feedback.create({
            userId: randomBot._id,
            locationId: sfLocation._id,
            forecastTime: forecastTime,
            rating: randomCommentData.rating,
            commentText: randomCommentData.comment
        });

        console.log(`Added comment from ${randomBot.displayName}: "${randomCommentData.comment}"`);
    } catch (error) {
        console.error("Error adding bot comment:", error);
    } finally {
        await mongoose.connection.close();
    }
}

// Run every 10 minutes
console.log("Bot comment scheduler started - will run every 10 minutes");
addBotComment(); // Run immediately
setInterval(addBotComment, 10 * 60 * 1000);