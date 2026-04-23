import { z } from "zod";
import { getCurrentUser } from "./_lib/auth.mjs";
import { sql } from "./_lib/db.mjs";

const jsonHeaders = { "content-type": "application/json" };
const schema = z.object({
  recipeId: z.string().uuid()
});

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: jsonHeaders
  });
}

function zodDetails(error) {
  return error.issues?.map(issue => ({
    path: issue.path.join("."),
    message: issue.message,
    code: issue.code
  })) || [];
}

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

    const recipeRows = await sql`
      select id
      from recipes
      where id = ${recipeId}::uuid
        and deleted_at is null
        and is_published = true
      limit 1
    `;

    if (recipeRows.length === 0) {
      return json({ error: "Receta no encontrada" }, 404);
    }

    const removed = await sql`
      delete from recipe_votes
      where recipe_id = ${recipeId}::uuid
        and user_id = ${user.id}::uuid
      returning recipe_id
    `;

    let voted = false;

    if (removed.length === 0) {
      await sql`
        insert into recipe_votes (recipe_id, user_id)
        values (${recipeId}::uuid, ${user.id}::uuid)
        on conflict (recipe_id, user_id) do nothing
      `;
      voted = true;
    }

    const voteRows = await sql`
      select count(*)::int as votes
      from recipe_votes
      where recipe_id = ${recipeId}::uuid
    `;

    return json(
      {
        ok: true,
        recipeId,
        voted,
        votes: voteRows[0]?.votes || 0
      },
      200
    );
  } catch (error) {
    console.error("RECIPE VOTES ERROR:", error);

    if (error instanceof z.ZodError) {
      return json({ error: "Datos invalidos", details: zodDetails(error) }, 400);
    }

    return json({ error: "No se pudo actualizar el voto" }, 500);
  }
};

export const config = {
  path: "/api/recipe-votes"
};
