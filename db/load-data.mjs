import postgres from 'postgres';
import { generateUsers } from "./generate-data.mjs";

async function makeInsertQuery(sql, data) {
  const columns = Object.keys(data);
  const values = columns.map(column => data[column]);
  const columnsList = columns.join(', ');
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  
  // Using raw string for column names (they're safe as they come from our code)
  // and parameterized values for the actual data
  return await sql.unsafe(`
    INSERT INTO users (${columnsList})
    VALUES (${placeholders})
  `, values);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(`DATABASE_URL is not set`);
  }

  const DATABASE_URL = process.env.DATABASE_URL;
  const USERS_TO_LOAD = parseInt(process.env.USERS_TO_LOAD, 10) || 100000;

  const sql = postgres(DATABASE_URL, {
    max: 10, // Max number of connections
    idle_timeout: 20, // Idle connection timeout in seconds
  });

  try {
    // Update table statistics
    await sql`ANALYZE users`;

    // Get current row count estimate
    const [result] = await sql`
      SELECT reltuples::bigint AS estimate 
      FROM pg_class 
      WHERE relname = 'users'
    `;
    const currentCount = parseInt(result.estimate, 10);

    console.log(`Current row count of the users table:`, currentCount);

    if (currentCount < USERS_TO_LOAD) {
      const usersToAdd = USERS_TO_LOAD - currentCount;
      console.log(`Adding ${usersToAdd} users...`);

      const batchSize = 100;
      const batches = Math.ceil(usersToAdd / batchSize);

      for (let i = 0; i < batches; i++) {
        const size = Math.min(batchSize, usersToAdd - i * batchSize);
        const users = generateUsers(size);
        
        console.log(`Inserting batch ${i + 1}/${batches} (${size} users)...`);
        
        // Process users in parallel within each batch, ignoring duplicate key errors
        await Promise.all(users.map(async user => {
          try {
            await makeInsertQuery(sql, user);
          } catch (err) {
            // Ignore duplicate key errors
            if (!err.message.includes('duplicate key value')) {
              throw err;
            }
          }
        }));
        console.log(`done with batch`)
      }

      console.log(`Finished adding users`);
    } else {
      console.log(`Already have enough users (${currentCount} >= ${USERS_TO_LOAD})`);
    }
  } finally {
    await sql.end();
  }
}

await main().catch((err) => {
  console.error("Error during the process:", err);
  process.exit(1);
});
