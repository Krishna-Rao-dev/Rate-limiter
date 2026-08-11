local key = KEYS[1]

local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local requested_tokens = tonumber(ARGV[3])

-- Get current time from Redis server (Seconds, Microseconds)
local redis_time = redis.call("TIME")
local now = (tonumber(redis_time[1]) * 1000) + math.floor(tonumber(redis_time[2]) / 1000)

-- Fetch both fields in a single call
local data = redis.call("HMGET", key, "tokens", "last_refill")
local tokens = tonumber(data[1])
local last_refill = tonumber(data[2])

if tokens == nil then
    tokens = capacity
    last_refill = now
end

local elapsed = (now - last_refill) / 1000
tokens = math.min(capacity, tokens + (elapsed * refill_rate))

local allowed = 0
local retry_after_ms = 0

if tokens >= requested_tokens then
    tokens = tokens - requested_tokens
    allowed = 1
else
    local tokens_needed = requested_tokens - tokens
    retry_after_ms = math.ceil((tokens_needed / refill_rate) * 1000)
end

-- Save updated state and set dynamic TTL
redis.call("HMSET", key, "tokens", tokens, "last_refill", now)
redis.call("EXPIRE", key, 3600) -- Clean up idle keys after 1hr

return { allowed, tokens, retry_after_ms }