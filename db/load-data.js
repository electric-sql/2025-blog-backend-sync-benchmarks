import createPool, { sql } from "@databases/pg";
import { generateUsers } from "./generate-data.js";

async function makeInsertQuery(db, data) {
  const columns = Object.keys(data);
  const columnsNames = columns.join(`, `);
  const values = columns.map((column) => data[column]);
  return await db.query(sql`
    INSERT INTO users (${sql(columnsNames)})
    VALUES (${sql.join(values.map(sql.value), `, `)})
  `);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(`DATABASE_URL is not set`);
  }

  const DATABASE_URL = process.env.DATABASE_URL;
  const USERS_TO_LOAD = parseInt(process.env.USERS_TO_LOAD, 10) || 1000000;

  if (isNaN(USERS_TO_LOAD)) {
    throw new Error("USERS_TO_LOAD must be a valid number");
  }
  console.info(`Connecting to Postgres at ${DATABASE_URL}`);
  const db = createPool(DATABASE_URL);

  const users = generateUsers(USERS_TO_LOAD);

  const userCount = users.length;
  const batchSize = 100;
  for (let i = 0; i < userCount; i += batchSize) {
    await db.tx(async (db) => {
      db.query(sql`SET CONSTRAINTS ALL DEFERRED;`); // disable FK checks
      const batch = users.slice(i, i + batchSize);
      const promises = batch.map(async (user, index) => {
        if ((i + index + 1) % 100 === 0 || i + index + 1 === userCount) {
          process.stdout.write(
            `Loading user ${i + index + 1} of ${userCount}\r`,
          );
        }
        return await makeInsertQuery(db, user);
      });
      try {
        await Promise.all(promises);
      } catch (err) {
        console.error("Batch failed", err);
      }
    });
  }
  process.stdout.write(`\n`);

  db.dispose();
  console.info(`Loaded ${userCount} users.`);
}

await main().catch((err) => {
  console.error("Error during the process:", err);
  process.exit(1);
});
