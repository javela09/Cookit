import { z } from "zod";
import { sql } from "./_lib/db.mjs";
import { hashPassword } from "./_lib/auth.mjs";

const schema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(6).max(100)
});

// Registra un usuario nuevo tras validar duplicados y contraseña.
export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), {
      status: 405,
      headers: { "content-type": "application/json" }
    });
  }

  try {
    const body = await req.json();
    const data = schema.parse(body);

    const existing = await sql`
      select id
      from app_users
      where username = ${data.username}
         or email = ${data.email}
      limit 1
    `;

    if (existing.length > 0) {
      return new Response(
        JSON.stringify({ error: "El usuario o email ya existe" }),
        {
          status: 409,
          headers: { "content-type": "application/json" }
        }
      );
    }

    const passwordHash = await hashPassword(data.password);

    const rows = await sql`
      insert into app_users (username, email, password_hash)
      values (${data.username}, ${data.email}, ${passwordHash})
      returning id, username, email
    `;

    return new Response(JSON.stringify(rows[0]), {
      status: 201,
      headers: { "content-type": "application/json" }
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error);
    return new Response(JSON.stringify({ error: "Datos inválidos" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }
};

export const config = {
  path: "/api/auth/register"
};
