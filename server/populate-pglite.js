import { generateUsers } from "../db/generate-data.js";

const USERS_TO_LOAD = 1000000;

async function makeInsertQuery(db, data) {
  const columns = Object.keys(data);
  const columnNames = columns.join(`, `);
  const values = columns.map((column) => data[column]);
  const sql = `
    INSERT INTO users (${columnNames})
    VALUES (${values.map((value) => `'${value}'`)}) 
  `;
  console.log("Inserting data...");
  return await db.exec(sql);
}

//generate users//
export async function populate(db) {
  //run pglite queries
  await db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    email_verified INTEGER DEFAULT 0,
    two_factor_enabled INTEGER DEFAULT 0,
    last_login_at TEXT,
    failed_login_attempts INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

  const users = generateUsers(USERS_TO_LOAD);
  const userCount = users.length;
  const batchSize = 100;
  for (let i = 0; i < userCount; i += batchSize) {
    db.exec(`SET CONSTRAINTS ALL DEFERRED;`); // disable FK checks

    const batch = users.slice(i, i + batchSize);
    const promises = batch.map(async (user, index) => {
      if ((i + index + 1) % 100 === 0 || i + index + 1 === userCount) {
        process.stdout.write(`Loading user ${i + index + 1} of ${userCount}\r`);
      }
      return await makeInsertQuery(db, user);
    });
    try {
      await Promise.all(promises);
    } catch (err) {
      console.error("Batch failed", err);
    }
  }
}
