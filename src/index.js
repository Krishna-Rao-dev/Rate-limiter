import express from "express";
import { createClient } from "redis";

import { TokenBucketLimiter } from "./limiter/tokenBucket.js";
import { rateLimiter } from "./middleware/rateLimiter.js";

const app = express();

const redis = createClient({
    url: "redis://localhost:6379"
});

redis.on("error", (err) => {
    console.error("Redis Client Error:", err);
});

await redis.connect();

console.log("Connected to Redis");

const limiter = new TokenBucketLimiter(redis, {
    capacity: 10,
    refillRate: 2
});

await limiter.initialize();

app.use(rateLimiter(limiter));

app.get("/test", (req, res) => {
    res.json({
        message: "Request allowed!"
    });
});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});

