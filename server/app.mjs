import { electricSync } from "@electric-sql/pglite-sync";
import { PGlite } from "@electric-sql/pglite";
import { live } from "@electric-sql/pglite/live";

import { Resource } from "sst";

import Fastify from "fastify";
import validate from "uuid-validate";

import { generateAndSyncToElectric } from "./populate-pglite.mjs";

const PORT = 8000;

//still not sure about env vars
const fastify = Fastify({
  logger: true,
});

//instantiate pglite electric sync
(async () => {
  try {
    const db = await PGlite.create({
      extensions: {
        live,
        electric: electricSync({ debug: true }),
      },
    });

    console.log("Waiting for db to be ready");
    await db.waitReady;

    console.log("Syncing shapes");
    await generateAndSyncToElectric(
      db,
      Resource.electricUrlLink.url,
      Resource.electricUrlLink.sourceId,
      Resource.electricUrlLink.sourceSecret,
    );

    fastify.get("/users", async (_req, reply) => {
      await db.live.query(
        `
        SELECT * FROM users;
      `,
        null,
        (res) => {
          reply.send(JSON.stringify(res.rows, null, 2));
        },
      );
    });

    fastify.get("/users/:userId", async (req, reply) => {
      const { userId } = req.params;

      //check if valid uuid
      if (!validate(userId)) {
        reply.send(`The id provided ${userId} is not a valid UUID`);
      }

      await db.live.query(
        `
      SELECT * from users WHERE id = '${userId}'
    `,
        null,
        (res) => {
          if (res.rows.length == 0) {
            reply.send("User doesnt exist");
          } else {
            JSON.stringify(res.rows, null, 2);
          }
        },
      );
    });
  } catch (err) {
    console.error(`Failed to create pglite electric sync instance ${err}`);
  }
})();

fastify.listen({ port: PORT }, () => {
  console.log(`Server is running on port ${PORT}`);
});
