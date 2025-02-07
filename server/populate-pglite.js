//generate table and sync to electric//
export async function generateAndSyncToElectric(
  db,
  electricUrl,
  sourceId,
  sourceSecret,
) {
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

  const shape = await db.electric.syncShapeToTable({
    shape: {
      url: `${electricUrl}/v1/shape`,
      params: {
        table: "users",
        source_id: sourceId,
        source_secret: sourceSecret,
      },
    },
    table: "users",
    primaryKey: ["id"],
    shapeKey: "",
  });

  return shape;
}
