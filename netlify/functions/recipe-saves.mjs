import { z } from "zod";
import { getCurrentUser } from "./_lib/auth.mjs";
import { sql } from "./_lib/db.mjs";

const jsonHeaders = { "content-type": "application/json" };
const schema = z.object({
  recipeId: z.string().uuid()
});

// Devuelve una respuesta JSON homogénea.
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: jsonHeaders
  });
}

// Convierte errores de Zod en detalles seguros para el cliente.
function zodDetails(error) {
  return error.issues?.map(issue => ({
    path: issue.path.join("."),
    message: issue.message,
    code: issue.code
  })) || [];
}

// Alterna el guardado de una receta para el usuario autenticado.
export default async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Metodo no permitido" }, 405);
  }

  try {
    const user = await getCurrentUser(req);

    if (!user) {
      return json({ error: "No autenticado" }, 401);
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return json({ error: "Datos invalidos", details: zodDetails(parsed.error) }, 400);
    }

    const { recipeId } = parsed.data;

    const rows = await sql`
      with target_recipe as (
        select id
        from recipes
        where id = ${recipeId}::uuid
          and deleted_at is null
          and is_published = true
        limit 1
      ),
      removed as (
        delete from recipe_saves s
        using target_recipe r
        where s.recipe_id = r.id
          and s.user_id = ${user.id}::uuid
        returning s.recipe_id
      ),
      inserted as (
        insert into recipe_saves (recipe_id, user_id)
        select id, ${user.id}::uuid
        from target_recipe
        where not exists (select 1 from removed)
        on conflict (recipe_id, user_id) do nothing
        returning recipe_id
      )
      select
        exists(select 1 from target_recipe) as recipe_exists,
        case
          when exists(select 1 from removed) then false
          else exists(select 1 from target_recipe)
        end as saved
    `;

    if (!rows[0]?.recipe_exists) {
      return json({ error: "Receta no encontrada" }, 404);
    }

    return json({ ok: true, recipeId, saved: Boolean(rows[0].saved) }, 200);
  } catch (error) {
    console.error("RECIPE SAVES ERROR:", error);

    if (error instanceof z.ZodError) {
      return json({ error: "Datos invalidos", details: zodDetails(error) }, 400);
    }

    return json({ error: "No se pudo actualizar guardados" }, 500);
  }
};

export const config = {
  path: "/api/recipe-saves"
};
