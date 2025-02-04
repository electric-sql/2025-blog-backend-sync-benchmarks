import { PGlite } from "@electric-sql/pglite";
import Fastify from "fastify";
import { populate } from "./populate-pglite.js";

const fastify = Fastify({
  logger: true,
});

//instantiate pglite
const db = new PGlite();

console.log("Waiting for db to be ready");
await db.waitReady;
await populate(db);

fastify.get("/users", async (_req, reply) => {
  //query pglite in here
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
  //query pglite in here
  const res = await db.exec(
    `
    SELECT * from users WHERE id = '${userId}'
  `,
  );
  const rows = res[0].rows;
  console.log(rows);
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
