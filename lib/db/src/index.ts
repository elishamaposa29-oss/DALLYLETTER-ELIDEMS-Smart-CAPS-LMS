import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractPostgresError(value: unknown, seen = new Set<unknown>()): Record<string, unknown> | undefined {
  if (!isObject(value) || seen.has(value)) return undefined;
  seen.add(value);

  const record = value as Record<string, unknown>;
  const extracted: Record<string, unknown> = {};
  const fields = [
    "code",
    "message",
    "detail",
    "hint",
    "constraint",
    "table",
    "column",
    "schema",
  ];

  for (const field of fields) {
    if (field in record) {
      extracted[field] = record[field];
    }
  }

  for (const nestedKey of ["cause", "originalError", "driverError", "error"]) {
    if (nestedKey in record) {
      const nested = extractPostgresError(record[nestedKey], seen);
      if (nested) {
        extracted[nestedKey] = nested;
      }
    }
  }

  return Object.keys(extracted).length ? extracted : undefined;
}

function printPostgresError(error: unknown, indent = 2): void {
  const details = extractPostgresError(error);
  if (!details) {
    console.error("Database error without PostgreSQL metadata:", error);
    return;
  }

  const prefix = " ".repeat(indent);
  const print = (value: unknown, currentIndent: number): void => {
    if (!isObject(value)) {
      console.error(prefix + value);
      return;
    }

    for (const [key, fieldValue] of Object.entries(value)) {
      const currentPrefix = " ".repeat(currentIndent);
      if (isObject(fieldValue)) {
        console.error(`${currentPrefix}- ${key}:`);
        print(fieldValue, currentIndent + 2);
      } else {
        console.error(`${currentPrefix}- ${key}:`, fieldValue);
      }
    }
  };

  console.error("PostgreSQL error details:");
  print(details, indent);
}

function wrapQuery<T extends (...args: unknown[]) => unknown>(queryFn: T): T {
  return ((...args: unknown[]) => {
    const result = queryFn(...args);
    if (result && typeof (result as { catch?: unknown }).catch === "function") {
      return (result as Promise<unknown>).catch((error) => {
        printPostgresError(error);
        throw error;
      });
    }
    return result;
  }) as T;
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const originalPoolQuery = pool.query.bind(pool);
pool.query = wrapQuery(originalPoolQuery);

const originalPoolConnect = pool.connect.bind(pool);
pool.connect = async (...args: unknown[]) => {
  const client = await originalPoolConnect(...args);
  const originalClientQuery = client.query.bind(client);
  client.query = wrapQuery(originalClientQuery);
  return client;
};

export const db = drizzle(pool, { schema });

export * from "./schema";
