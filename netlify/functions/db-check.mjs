import { sql } from "./_lib/db.mjs";

export default async () => {
  try {
    const result = await sql`select now() as server_time`;
    return new Response(JSON.stringify(result[0]), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: "No se pudo conectar a la base de datos" }),
      {
        status: 500,
        headers: { "content-type": "application/json" }
      }
    );
  }
};

export const config = {
  path: "/api/db-check"
};