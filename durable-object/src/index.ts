import { DurableObject } from "cloudflare:workers"
import { match } from "path-to-regexp"
import {
  ShapeStream,
  Shape,
  isChangeMessage,
  Message,
  Offset,
} from "@electric-sql/client"

export interface Env {
  ELECTRIC_SQLITE_DEMO: DurableObjectNamespace;
  ELECTRIC_URL: string;
}

export class ElectricSqliteDemo extends DurableObject {
  sql: SqlStorage
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.sql = ctx.storage.sql

    this.sql.exec(`CREATE TABLE IF NOT EXISTS users (
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
);`)

    this.sql.exec(`CREATE TABLE IF NOT EXISTS shape_sync_metadata (
  shape_name TEXT UNIQUE,
  offset TEXT,
  shape_id TEXT
);`)
  }

  /*
   * Sync all users from Electric & then return info for specific user
   */
  async getUserInfo(id: string): Promise<string> {
    const USER_SHAPE = `user_shape`

    // Get shape info
    const shapeMetadata = this.sql
      .exec(`SELECT * FROM shape_sync_metadata where shape_id;`)
      .toArray()

    const userStreamMetadata =
      shapeMetadata.find((s) => s.shape_name === USER_SHAPE) || {}

    let userLastOffset = (userStreamMetadata?.offset || -1) as Offset
    let userShapeId = userStreamMetadata?.shape_id as string | undefined

    const userStream = new ShapeStream({
      url: `${env.ELECTRIC_URL}/v1/shape/users`,
      subscribe: false,
      shapeId: userShapeId,
      offset: userLastOffset,
    })

    userStream.subscribe(async (messages) => {
      for (const message of messages) {
        if (isChangeMessage(message)) {
          userLastOffset = message.offset
          if (message.headers.operation === `insert`) {
            this.sql.exec(
              `
  INSERT INTO users (
    id, email, password_hash, first_name, last_name, 
    phone, email_verified, two_factor_enabled, last_login_at,
    failed_login_attempts, status, created_at, updated_at
  )
  VALUES (
    '${message.value.id}', '${message.value.email}', '${message.value.password_hash}',
    '${message.value.first_name}', '${message.value.last_name}', '${message.value.phone}',
    ${message.value.email_verified ? 1 : 0}, ${message.value.two_factor_enabled ? 1 : 0},
    '${message.value.last_login_at}', ${message.value.failed_login_attempts},
    '${message.value.status}', '${message.value.created_at}', '${message.value.updated_at}'
  )
`
            )
          } else if (message.headers.operation === `update`) {
            // Build the SET clause from the patch object
            const setClause = Object.entries(message.value)
              .map(([key, value]) => {
                if (key === 'email_verified' || key === 'two_factor_enabled') {
                  return `${key} = ${value ? 1 : 0}`
                }
                return `${key} = '${value}'`
              })
              .join(', ')

            this.sql.exec(
              `
  UPDATE users 
  SET ${setClause}
  WHERE id = '${message.value.id}'
`
            )
          } else if (message.headers.operation === `delete`) {
            this.sql.exec(
              `
  DELETE FROM users
  WHERE id = '${message.value.id}'
`
            )
          }
        }
      }
      userShapeId = userStream.shapeId
    })

    const userShape = new Shape(userStream)

    const startTime = Date.now()
    await userShape.value
    const endTime = Date.now()
    const elapsedTime = endTime - startTime
    console.log(`Syncing time: ${elapsedTime} ms`)

    // Upsert shape metadata
    this.sql.exec(`
INSERT OR REPLACE INTO shape_sync_metadata (shape_name, offset, shape_id)
VALUES ('${USER_SHAPE}', '${userLastOffset}', '${userShapeId}');
`)

    // Get specific user
    const users = this.sql
      .exec(`SELECT * from users WHERE id = '${id}';`)
      .toArray()

    return JSON.stringify({ users }, null, 4)
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const fn = match(`/user/:id`)

    const pathname = new URL(request.url).pathname
    const matches = fn(pathname)

    if (!matches || !matches.params?.id) {
      return new Response(`no user id`, { status: 400 })
    }

    // Always use the same ID for the Durable Object to ensure we use the same instance
    const id = env.ELECTRIC_SQLITE_DEMO.idFromName("global")
    const stub = env.ELECTRIC_SQLITE_DEMO.get(id) as DurableObjectStub<ElectricSqliteDemo>

    const response = await stub.getUserInfo(matches.params.id)

    return new Response(response)
  },
} satisfies ExportedHandler<Env>
