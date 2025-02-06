import { createClient } from "redis";
import postgres from "postgres";
import { Resource } from "sst";
import {
  ShapeStream,
  Message,
  isChangeMessage,
  Row,
  ControlMessage,
  isControlMessage,
} from "@electric-sql/client";
import { Bench } from "tinybench";

console.log({ Resource });

function isUpToDateMessage<T extends Row<unknown> = Row>(
  message: Message<T>,
): message is ControlMessage & { up_to_date: true } {
  return isControlMessage(message) && message.headers.control === `up-to-date`;
}

const url = `redis://localhost:6379`;

// Create a Redis client
const client = createClient({
  url,
  socket: {
    reconnectStrategy: (retries: number) => {
      // Exponential backoff with max delay of 3s
      const delay = Math.min(retries * 100, 3000);
      return delay;
    },
  },
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

  console.log(`ShapeStream`, process.env.SOURCE_ID)
  const usersStream = new ShapeStream({
    url: `https://api.electric-sql.cloud/v1/shape`,
    params: {
      table: `users`,
      source_id: process.env.SOURCE_ID,
      source_secret: process.env.SOURCE_SECRET,
    },
  });

  let totalCommands = 0;
  let runBenchmarks = false;
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
          pipeline.hDel(`users`, message.value.id);
          break;

        case `insert`:
          pipeline.hSet(
            `users`,
            String(message.value.id),
            JSON.stringify(message.value),
          );
          break;

        case `update`: {
          pipeline.evalSha(updateKeyScriptSha1, {
            keys: [`users`, String(message.value.id)],
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

      if (!runBenchmarks) {
        runBenchmarks = true;
        console.log(
          `Did the initial sync of ${totalCommands} operations into Redis in ${(duration / 1000).toFixed(2)}s for a rate of ${((totalCommands / duration) * 1000).toFixed(2)} operations/second `,
        );
        runIncrementalBenchmark();
      }
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

async function runIncrementalBenchmark() {
  console.log("Starting benchmark setup");
  const bench = new Bench({ time: 2000 });
  const sql = postgres(Resource.postgres.url, {
    max: 10, // Max number of connections
    idle_timeout: 20, // Idle connection timeout in seconds
  });

  // Get a random user to update
  const result = await sql`SELECT id FROM users LIMIT 1`;
  console.log({ result });
  const userId = result[0].id;
  console.log(`Selected user ID for testing:`, userId);

  let newName: string;

  bench.add(
    "sync latency",
    async () => {
      await new Promise((resolve) => {
        const checkInterval = setInterval(async () => {
          const redisValue = await client.hGet(`users`, String(userId));
          if (redisValue && JSON.parse(redisValue).first_name === newName) {
            clearInterval(checkInterval);
            resolve(true);
          }
        }, 0);
      });
    },
    {
      beforeEach: async () => {
        newName = `User ${Date.now()}`;
        await sql`UPDATE users SET first_name = ${newName} WHERE id = ${userId}`;
      },
    },
  );

  console.log("\nStarting benchmark runs...");
  await bench.run();

  console.log("\nBenchmark Results:");
  console.table(bench.table());
}
