export function rateLimiter(limiter) {
    return async (req, res, next) => {
        try {
            const clientId = req.ip;

            const result = await limiter.consume(clientId);
            
            res.setHeader(
                "X-RateLimit-Limit",
                limiter.capacity
            );
            
            res.setHeader(
                "X-RateLimit-Remaining",
                Math.floor(result.remaining)
            );
            
            if (!result.allowed) {

                const retryAfterSeconds =
                    Math.ceil(result.retryAfterMs / 1000);

                res.setHeader(
                    "Retry-After",
                    retryAfterSeconds
                );

                return res.status(429).json({
                    error: "Too Many Requests",
                    retryAfterMs: result.retryAfterMs
                });
            }
            
            next();
            
        } catch (error) {
            next(error);
        }
    };
}
