import { electricSync } from "@electric-sql/pglite-sync";
import { PGlite } from "@electric-sql/pglite";
import { live } from "@electric-sql/pglite/live";
import dotenv from "dotenv";

dotenv.config();

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
  await generateAndSyncToElectric(
    db,
    "https://api.electric-sql.cloud", //Resource.ElectricUrl.url,
    process.env.SOURCE_ID, //Resource.ElectricUrl.sourceId,
    process.env.SOURCE_SECRET, //Resource.ElectricUrl.sourceSecret,
  );

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
