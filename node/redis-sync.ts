import { createClient } from "redis";
import { Resource } from "sst";
import {
  ShapeStream,
  Message,
  isChangeMessage,
  Row,
  ControlMessage,
  isControlMessage,
} from "@electric-sql/client";

function isUpToDateMessage<T extends Row<unknown> = Row>(
  message: Message<T>,
): message is ControlMessage & { up_to_date: true } {
  return isControlMessage(message) && message.headers.control === `up-to-date`;
}

let url: string = ``;
if (Resource.App.stage !== `production`) {
  url = `redis://localhost:6379`;
} else {
  url = `redis://${Resource.redis.username}:${encodeURIComponent(Resource.redis.password)}@${Resource.redis.host}:${Resource.redis.port}`;
}

// Create a Redis client
const client = createClient({
  url,
});

client.connect().then(async () => {
  console.log(`Connected to Redis server`);

  // Clear out old data on the hash.
  client.del(`users`);

  // Lua script for updating hash field. We need to merge in partial updates
  // from the shape log.
  const script = `
      local current = redis.call('HGET', KEYS[1], KEYS[2])
      local parsed = {}
      if current then
        parsed = cjson.decode(current)
      end
      for k, v in pairs(cjson.decode(ARGV[1])) do
        parsed[k] = v
      end
      local updated = cjson.encode(parsed)
      return redis.call('HSET', KEYS[1], KEYS[2], updated)
    `;

  // Load the script into Redis and get its SHA1 digest
  const updateKeyScriptSha1 = await client.SCRIPT_LOAD(script);

  const usersStream = new ShapeStream({
    url: `https://api.electric-sql.cloud/v1/shape`,
    params: {
      table: `users`,
      source_id: process.env.SOURCE_ID,
      source_secret: process.env.SOURCE_SECRET,
    },
  });

  let totalCommands = 0;
  let initialSyncStart = Date.now();
  usersStream.subscribe(async (messages: Message[]) => {
    // Helper function to execute a batch with retries
    async function executeBatch(
      pipeline: any,
      batchNum: number,
      commandCount: number,
    ) {
      const maxRetries = 3;
      const retryDelay = 1000; // 1 second

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const startTime = Date.now();
          await pipeline.exec();
          const duration = Date.now() - startTime;

          console.log(
            `[${new Date().toISOString()}] inserting ${commandCount} operations in ${duration}ms. Total operations executed is now ${totalCommands}`,
          );

          return true;
        } catch (error) {
          const isNetworkError =
            error instanceof Error &&
            (error.message.includes("ECONNREFUSED") ||
              error.message.includes("ETIMEDOUT") ||
              error.message.includes("ECONNRESET"));

          console.error({
            event: "batch_error",
            batchNumber: batchNum,
            attempt,
            error: error instanceof Error ? error.message : String(error),
            willRetry: isNetworkError && attempt < maxRetries,
            timestamp: new Date().toISOString(),
          });

          if (!isNetworkError || attempt === maxRetries) {
            return false;
          }

          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }
      return false;
    }

    let pipeline = client.multi();
    let counter = 0;
    let batchNumber = 1;

    for (const message of messages) {
      if (!isChangeMessage(message)) continue;

      // Upsert/delete
      switch (message.headers.operation) {
        case `delete`:
          pipeline.hDel(`users`, message.key);
          break;

        case `insert`:
          pipeline.hSet(
            `users`,
            String(message.key),
            JSON.stringify(message.value),
          );
          break;

        case `update`: {
          pipeline.evalSha(updateKeyScriptSha1, {
            keys: [`users`, String(message.key)],
            arguments: [JSON.stringify(message.value)],
          });
          break;
        }
      }

      counter++;
      totalCommands++;
      if (counter >= 10000) {
        const success = await executeBatch(pipeline, batchNumber, counter);
        if (!success) {
          console.error({
            event: "batch_failed",
            batchNumber,
            commandCount: counter,
            timestamp: new Date().toISOString(),
          });
        }
        // Reset pipeline and counter
        pipeline = client.multi();
        counter = 0;
        batchNumber++;
      }
    }

    if (isUpToDateMessage(messages.at(-1))) {
      const duration = Date.now() - initialSyncStart;

      console.log(
        `Did the initial sync of ${totalCommands} operations into Redis in ${(duration / 1000).toFixed(2)}s for a rate of ${((totalCommands / duration) * 1000).toFixed(2)} operations/second `,
      );
    }

    if (counter > 0) {
      // Execute any remaining commands
      const success = await executeBatch(pipeline, batchNumber, counter);
      if (!success) {
        console.error({
          event: "final_batch_failed",
          batchNumber,
          commandCount: counter,
          timestamp: new Date().toISOString(),
        });
      }
    }
  });
});
