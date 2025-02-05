import { electricSync } from "@electric-sql/pglite-sync";
import Fastify from "fastify";
import validate from "uuid-validate";

import { populate } from "./populate-pglite.js";

const fastify = Fastify({
  logger: true,
});

//instantiate pglite electric sync
const db = await PGlite.create({
  extensions: {
    electric: electricSync(),
  },
});

console.log("Waiting for db to be ready");
await db.waitReady;
await populate(db);

fastify.get("/users", async (_req, reply) => {
  const res = await db.exec(
    `
      SELECT * FROM users;
    `,
  );
  const rows = res[0].rows;
  reply.send(JSON.stringify(rows));
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
  const rows = res[0].rows;

  if (rows.length == 0) {
    reply.send("User doesnt exist");
  } else {
    reply.send(JSON.stringify(rows));
  }
});

fastify.listen({ port: 3000 }, (err, _add) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
