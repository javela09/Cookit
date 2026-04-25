import { sql } from "./_lib/db.mjs";
import { parseCookies } from "./_lib/auth.mjs";

// Elimina la sesión activa y limpia la cookie del navegador.
export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método no permitido" }), {
      status: 405,
      headers: { "content-type": "application/json" }
    });
  }

  const cookies = parseCookies(req);
  const token = cookies.session_token;

  if (token) {
    await sql`
      delete from user_sessions
      where session_token = ${token}
    `;
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": "session_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
    }
  });
};

export const config = {
  path: "/api/auth/logout"
};
