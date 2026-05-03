import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
export * from "./audit";
// Re-export the drizzle-orm SQL helpers so consumers always pick up
// the exact version that @workspace/db is compiled against — pnpm can
// otherwise hoist a second copy (e.g. when a sibling pulls in
// `@opentelemetry/api`) and TypeScript treats the two as incompatible.
export {
  eq,
  and,
  or,
  not,
  desc,
  asc,
  inArray,
  notInArray,
  isNull,
  isNotNull,
  sql,
  lt,
  lte,
  gt,
  gte,
  ne,
  like,
  ilike,
} from "drizzle-orm";
