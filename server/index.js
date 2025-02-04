import Fastify from "fastify";

const fastify = Fastify({
  logger: true,
});

fastify.get("/users", (_req, reply) => {
  //query pglite in here
  reply.send("HelloWorld");
});

fastify.get("/users/:userId", (req, reply) => {
  const { userId } = req.params;
  //query pglite in here
  reply.send(`Identifying user as ${userId}`);
});

fastify.listen({ port: 3000 }, (err, _add) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
