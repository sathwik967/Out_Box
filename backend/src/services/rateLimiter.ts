
import { redisConnection } from "../redis";

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export async function checkRateLimit(
  campaignId: number,
  sender: string,
  campaignHourlyLimit: number,
  senderHourlyLimit: number,
  jobId: string
): Promise<RateLimitResult> {
  const now = Date.now();

  const currentHour = Math.floor(now / 3600000);
  const nextHour = (currentHour + 1) * 3600000;

  const campaignKey =
    `rate-limit:campaign:${campaignId}:${currentHour}`;

  const senderKey =
    `rate-limit:sender:${sender}:${currentHour}`;

  const reservationKey =
    `rate-limit:reservation:${jobId}`;

  if (
    !Number.isInteger(campaignHourlyLimit) ||
    campaignHourlyLimit < 1 ||
    !Number.isInteger(senderHourlyLimit) ||
    senderHourlyLimit < 1
  ) {
    throw new Error("Hourly rate limits must be positive integers");
  }

  const luaScript = `
    local campaignCount =
      tonumber(redis.call("GET", KEYS[1]) or "0")

    local senderCount =
      tonumber(redis.call("GET", KEYS[2]) or "0")

    local campaignLimit = tonumber(ARGV[1])
    local senderLimit = tonumber(ARGV[2])
    local nextHour = tonumber(ARGV[3])
    local now = tonumber(ARGV[4])
    local currentHour = math.floor(now / 3600000)

    -- Check whether this job already reserved capacity
    local reservation = redis.call("GET", KEYS[3])

    if reservation and tonumber(reservation) == currentHour then
      local remainingCampaign =
        math.max(0, campaignLimit - campaignCount)

      local remainingSender =
        math.max(0, senderLimit - senderCount)

      return {
        1,
        math.min(remainingCampaign, remainingSender),
        0
      }
    end

    -- Check both limits before incrementing either counter
    if campaignCount >= campaignLimit
      or senderCount >= senderLimit then

      local remainingCampaign =
        math.max(0, campaignLimit - campaignCount)

      local remainingSender =
        math.max(0, senderLimit - senderCount)

      local retryAfter =
        math.ceil((nextHour - now) / 1000)

      return {
        0,
        math.min(remainingCampaign, remainingSender),
        retryAfter
      }
    end

    -- Reserve capacity in both counters atomically
    campaignCount = redis.call("INCR", KEYS[1])
    senderCount = redis.call("INCR", KEYS[2])

    -- Expire counters at the next hourly boundary
    redis.call("PEXPIREAT", KEYS[1], nextHour)
    redis.call("PEXPIREAT", KEYS[2], nextHour)

    -- Remember this job's reservation for 48 hours
    redis.call(
      "SET",
      KEYS[3],
      tostring(currentHour),
      "EX",
      172800
    )

    local remainingCampaign =
      math.max(0, campaignLimit - campaignCount)

    local remainingSender =
      math.max(0, senderLimit - senderCount)

    return {
      1,
      math.min(remainingCampaign, remainingSender),
      0
    }
  `;

  const result = await redisConnection.eval(
    luaScript,
    3,
    campaignKey,
    senderKey,
    reservationKey,
    campaignHourlyLimit,
    senderHourlyLimit,
    nextHour,
    now
  ) as [number, number, number];

  return {
    allowed: result[0] === 1,
    remaining: result[1],
    retryAfterSeconds: result[2],
  };
}
