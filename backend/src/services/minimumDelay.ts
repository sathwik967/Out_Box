
import { redisConnection } from "../redis";

interface DelayResult {
  allowed: boolean;
  retryAfterMs: number;
}

export async function checkMinimumDelay(
  jobId: string
): Promise<DelayResult> {
  const intervalSeconds = Math.max(
    1,
    Number(process.env.MIN_EMAIL_INTERVAL_SECONDS || 10)
  );

  const intervalMs = intervalSeconds * 1000;
  const now = Date.now();

  const nextSlotKey = "minimum-delay:next-slot";
  const reservationKey = `minimum-delay:reservation:${jobId}`;

  const luaScript = `
    local now = tonumber(ARGV[1])
    local interval = tonumber(ARGV[2])

    local reservation = redis.call("GET", KEYS[2])

    if reservation then
      local reservedSlot = tonumber(reservation)

      if reservedSlot <= now then
        redis.call("DEL", KEYS[2])
        return {1, 0}
      end

      return {0, reservedSlot - now}
    end

    local nextSlot = tonumber(redis.call("GET", KEYS[1]) or "0")
    local slot = math.max(now, nextSlot)

    redis.call("SET", KEYS[1], slot + interval, "PX", 86400000)

    if slot > now then
      redis.call("SET", KEYS[2], slot, "PX", 86400000)
      return {0, slot - now}
    end

    return {1, 0}
  `;

  const result = await redisConnection.eval(
    luaScript,
    2,
    nextSlotKey,
    reservationKey,
    now,
    intervalMs
  ) as [number, number];

  return {
    allowed: result[0] === 1,
    retryAfterMs: result[1],
  };
}
