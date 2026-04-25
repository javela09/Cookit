import { z } from "zod";
import { sql } from "./_lib/db.mjs";
import { getCurrentUser } from "./_lib/auth.mjs";

const schema = z.object({
  email: z.string().email()
});

// Actualiza el correo del usuario autenticado si no está en uso.
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

    const emailInUse = await sql`
      select id
      from app_users
      where email = ${data.email}
        and id <> ${user.id}
      limit 1
    `;

    if (emailInUse.length > 0) {
      return new Response(JSON.stringify({ error: "El email ya esta en uso" }), {
        status: 409,
        headers: { "content-type": "application/json" }
      });
    }

    const rows = await sql`
      update app_users
      set email = ${data.email}
      where id = ${user.id}
      returning id, username, email
    `;

    return new Response(JSON.stringify(rows[0]), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch (error) {
    console.error("USER UPDATE EMAIL ERROR:", error);
    return new Response(JSON.stringify({ error: "Datos invalidos" }), {
      status: 400,
      headers: { "content-type": "application/json" }
    });
  }
};

export const config = {
  path: "/api/user/email"
};
