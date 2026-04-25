import { z } from "zod";
import { sql } from "./_lib/db.mjs";
import { verifyPassword, createSessionToken } from "./_lib/auth.mjs";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(100)
});

// Valida credenciales y crea una cookie de sesión.
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

    const users = await sql`
      select id, username, email, password_hash
      from app_users
      where email = ${data.email}
      limit 1
    `;

    const user = users[0];

    if (!user) {
      return new Response(JSON.stringify({ error: "Credenciales inválidas" }), {
        status: 401,
        headers: { "content-type": "application/json" }
      });
    }

    const validPassword = await verifyPassword(data.password, user.password_hash);

    if (!validPassword) {
      return new Response(JSON.stringify({ error: "Credenciales inválidas" }), {
        status: 401,
        headers: { "content-type": "application/json" }
      });
    }

    const sessionToken = createSessionToken();

    await sql`
      insert into user_sessions (user_id, session_token, expires_at)
      values (
        ${user.id},
        ${sessionToken},
        now() + interval '7 days'
      )
    `;

    return new Response(
      JSON.stringify({
        id: user.id,
        username: user.username,
        email: user.email
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": `session_token=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`
        }
      }
    );
  } catch (error) {
    console.error("LOGIN ERROR:", error);
    return new Response(JSON.stringify({ error: "Datos inválidos" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }
};

export const config = {
  path: "/api/auth/login"
};
