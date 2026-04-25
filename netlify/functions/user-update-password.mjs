import { z } from "zod";
import { sql } from "./_lib/db.mjs";
import { getCurrentUser, hashPassword } from "./_lib/auth.mjs";

const schema = z.object({
  password: z.string().min(6).max(100)
});

// Actualiza la contraseña del usuario autenticado.
export default async (req) => {
  if (req.method !== "PUT") {
    return new Response(JSON.stringify({ error: "Metodo no permitido" }), {
      status: 405,
      headers: { "content-type": "application/json" }
    });
  }

  try {
    const user = await getCurrentUser(req);

    if (!user) {
      return new Response(JSON.stringify({ error: "No autenticado" }), {
        status: 401,
        headers: { "content-type": "application/json" }
      });
    }

    const body = await req.json();
    const data = schema.parse(body);
    const passwordHash = await hashPassword(data.password);

    await sql`
      update app_users
      set password_hash = ${passwordHash}
      where id = ${user.id}
    `;

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch (error) {
    console.error("USER UPDATE PASSWORD ERROR:", error);
    return new Response(JSON.stringify({ error: "Datos invalidos" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }
};

export const config = {
  path: "/api/user/password"
};
