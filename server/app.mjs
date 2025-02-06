import { electricSync } from "@electric-sql/pglite-sync";
import { PGlite } from "@electric-sql/pglite";
import { live } from "@electric-sql/pglite/live";
import dotenv from "dotenv";

import postgres from "postgres";

dotenv.config();

import { Bench } from "tinybench";

import { Resource } from "sst";

import Fastify from "fastify";
import validate from "uuid-validate";

import { generateAndSyncToElectric } from "./populate-pglite.js";

const PORT = 8000;

const fastify = Fastify({
  logger: true,
});

//instantiate pglite electric sync
try {
  let runBenchmarks = false;

  const db = await PGlite.create({
    extensions: {
      live,
      electric: electricSync({
        debug: true,
      }),
    },
  });

  console.log("Waiting for db to be ready");
  await db.waitReady;

  console.log("Syncing shapes");

  let initialSyncStart = Date.now;
  await generateAndSyncToElectric(
    db,
    "https://api.electric-sql.cloud", //Resource.ElectricUrl.url,
    process.env.SOURCE_ID, //Resource.ElectricUrl.sourceId,
    process.env.SOURCE_SECRET, //Resource.ElectricUrl.sourceSecret,
    Bench,
  );

  //post sync
  const duration = Date.now() - initialSyncStart;
  if (!runBenchmarks) {
    runBenchmarks = true;
    console.log(`Did the initial sync in ${(duration / 1000).toFixed(2)}`);
    runIncrementalBenchmark();
  }

  fastify.get("/users", async (_req, reply) => {
    const res = await db.exec(
      `
        SELECT * FROM users;
      `,
    );
    console.log(res);
    reply.send(JSON.stringify(res.rows, null, 2));
  });

  fastify.get("/users/:userId", async (req, reply) => {
    const { userId } = req.params;

    //check if valid uuid
    if (!validate(userId)) {
      reply.send(`The id provided ${userId} is not a valid UUID`);
    }

    const res = await db.exec(
      `
      SELECT * from users WHERE id = '${userId}'
    `,
    );
    reply.send(JSON.stringify(res.rows, null, 2));
  });
} catch (err) {
  console.error(`Failed to create pglite electric sync instance ${err}`);
}

fastify.listen({ port: PORT }, () => {
  console.log(`Server is running on port ${PORT}`);
});

async function runIncrementalBenchmark() {
  console.log("Starting benchmark setup");
  const bench = new Bench({ time: 2000 });
  const sql = postgres(process.env.DATABASE_URL, {
    max: 10, // Max number of connections
    idle_timeout: 20, // Idle connection timeout in seconds
  });

  // Get a random user to update
  const result = await sql`SELECT id FROM users LIMIT 1`;
  console.log({ result });

  const userId = result[0].id;
  console.log(`Selected user ID for testing:`, userId);

  let newName = "";

  bench.add(
    "sync latency",
    async () => {
      await new Promise((resolve) => {
        const checkInterval = setInterval(async () => {
          //const redisValue = await client.hGet(`users`, String(userId));
          //query directly?
          const sqlVal = await sql`SELECT * from users where id = ${userId}`;
          console.log(sqlVal);
          console.log("this is a thingggg");
          if (sqlVal && sqlVal[0].first_name === newName) {
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
