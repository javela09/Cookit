import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("Falta DATABASE_URL");
}

// Cliente SQL reutilizable para las funciones serverless.
export const sql = neon(databaseUrl);
