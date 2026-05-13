import { z } from "zod";
import { getCurrentUser } from "./_lib/auth.mjs";
import { sql } from "./_lib/db.mjs";

const jsonHeaders = { "content-type": "application/json" };
const schema = z.object({
  variantId: z.string().uuid()
});

// Devuelve una respuesta JSON homogenea.
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

// Alterna el voto de una variante y devuelve el total actualizado.
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

    const { variantId } = parsed.data;

    const rows = await sql`
      with target_variant as (
        select id
        from recipe_variants
        where id = ${variantId}::uuid
          and deleted_at is null
          and is_published = true
        limit 1
      ),
      previous_count as (
        select count(*)::int as votes
        from recipe_variant_votes
        where variant_id = ${variantId}::uuid
      ),
      removed as (
        delete from recipe_variant_votes v
        using target_variant target
        where v.variant_id = target.id
          and v.user_id = ${user.id}::uuid
        returning v.variant_id
      ),
      inserted as (
        insert into recipe_variant_votes (variant_id, user_id)
        select id, ${user.id}::uuid
        from target_variant
        where not exists (select 1 from removed)
        on conflict (variant_id, user_id) do nothing
        returning variant_id
      )
      select
        exists(select 1 from target_variant) as variant_exists,
        case
          when exists(select 1 from removed) then false
          else exists(select 1 from target_variant)
        end as voted,
        greatest(
          0,
          (select votes from previous_count)
          - case when exists(select 1 from removed) then 1 else 0 end
          + case
              when exists(select 1 from target_variant)
               and not exists(select 1 from removed) then 1
              else 0
            end
        )::int as votes
    `;

    if (!rows[0]?.variant_exists) {
      return json({ error: "Variante no encontrada" }, 404);
    }

    return json(
      {
        ok: true,
        variantId,
        voted: Boolean(rows[0].voted),
        votes: rows[0]?.votes || 0
      },
      200
    );
  } catch (error) {
    console.error("RECIPE VARIANT VOTES ERROR:", error);

    if (error instanceof z.ZodError) {
      return json({ error: "Datos invalidos", details: zodDetails(error) }, 400);
    }

    return json({ error: "No se pudo actualizar el voto de la variante" }, 500);
  }
};

export const config = {
  path: "/api/recipe-variant-votes"
};
