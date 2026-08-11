import { readFile } from "fs/promises"; 

export class TokenBucketLimiter { 
    constructor(redis, options = {}) { 
        this.redis = redis; 
        this.capacity = options.capacity ?? 10; 
        this.refillRate = options.refillRate ?? 2; 
        this.scriptSha = null;
    }

    async initialize() { 
        const luaScript = await readFile( 
            new URL("./tokenBucket.lua", import.meta.url), 
            "utf-8" 
        );
        // Load script into Redis script cache once
        this.scriptSha = await this.redis.scriptLoad(luaScript);
    }

    async consume(clientId, requestedTokens = 1) { 
        if (!this.scriptSha) {
            throw new Error("Limiter has not been initialized"); 
        }

        const key = `rate_limit:${clientId}`; 

        const result = await this.redis.evalSha(this.scriptSha, {
            keys: [key], 
            arguments: [
                this.capacity.toString(), 
                this.refillRate.toString(), 
                requestedTokens.toString() 
            ]
        });

        const [allowed, remaining, retryAfterMs] = result;

        return {
            allowed: allowed === 1,
            remaining,
            retryAfterMs // Fixed naming consistency
        };
    }
}