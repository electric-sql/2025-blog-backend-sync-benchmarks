import createPool, { sql } from "@databases/pg";
import { runMigrations, generateUsers } from "./generate_data.js";

if (!process.env.DATABASE_URL) {
  throw new Error(`DATABASE_URL is not set`);
}

const DATABASE_URL = process.env.DATABASE_URL;
const USERS_TO_LOAD = parseInt(process.env.USERS_TO_LOAD, 10) || 1000000;

if (isNaN(USERS_TO_LOAD)) {
  throw new Error("USERS_TO_LOAD must be a valid number");
}

const users = generateUsers(USERS_TO_LOAD);

console.info(`Connecting to Postgres at ${DATABASE_URL}`);
const db = createPool(DATABASE_URL);

async function makeInsertQuery(db, table, data) {
  const columns = Object.keys(data);
  const columnsNames = columns.join(`, `);
  const values = columns.map((column) => data[column]);
  return await db.query(sql`
    INSERT INTO ${sql.ident(table)} (${sql(columnsNames)})
    VALUES (${sql.join(values.map(sql.value), `, `)})
  `);
}

async function applyMigrations() {
  console.info("Running migrations...");
  await runMigrations(db);
  console.info("Migrations completed.");
}

async function importUser(db, user) {
  const { ...rest } = user;
  return await makeInsertQuery(db, `users`, rest);
}

async function main() {
  await applyMigrations();

  const userCount = users.length;
  const batchSize = 100;
  for (let i = 0; i < userCount; i += batchSize) {
    await db.tx(async (db) => {
      db.query(sql`SET CONSTRAINTS ALL DEFERRED;`); // disable FK checks
      for (let j = i; j < i + batchSize && j < userCount; j++) {
        if ((j + 1) % 100 === 0 || j + 1 === userCount) {
          process.stdout.write(`Loading user ${j + 1} of ${userCount}\r`);
        }
        const user = users[j];
        try {
          await importUser(db, user);
        } catch (err) {
          console.error(err);
        }
      }
    });
  }
  process.stdout.write(`\n`);

  db.dispose();
  console.info(`Loaded ${userCount} users.`);
}

main().catch((err) => {
  console.error("Error during the process:", err);
  process.exit(1);
});
