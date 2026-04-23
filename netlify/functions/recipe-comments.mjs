import { z } from "zod";
import { getCurrentUser } from "./_lib/auth.mjs";
import { sql } from "./_lib/db.mjs";
import { ensureDomainSchema } from "./_lib/domain.mjs";

const jsonHeaders = { "content-type": "application/json" };
const uuidSchema = z.string().uuid();
const contentSchema = z.string().trim().min(1).max(1000);

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

function getRequestUrl(req) {
  try {
    return new URL(req.url);
  } catch {
    return new URL(req.url, "http://localhost");
  }
}

function toIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function extractRecipeId(req, bodyRecipeId = null) {
  const url = getRequestUrl(req);
  const fromQuery = url.searchParams.get("recipeId") || url.searchParams.get("id");
  if (fromQuery) return fromQuery;

  const fromHeader = req.headers.get("x-recipe-id");
  if (fromHeader) return fromHeader;

  if (bodyRecipeId) return bodyRecipeId;

  const referer = req.headers.get("referer");
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      return refererUrl.searchParams.get("recipeId") || refererUrl.searchParams.get("id");
    } catch {
      return null;
    }
  }

  return null;
}

function extractCommentId(req, body = {}) {
  const fromQuery = getRequestUrl(req).searchParams.get("commentId");
  if (fromQuery) return fromQuery;
  return body.commentId || body.id || null;
}

async function assertPublishedRecipe(recipeId) {
  const rows = await sql`
    select id
    from recipes
    where id = ${recipeId}::uuid
      and deleted_at is null
      and is_published = true
    limit 1
  `;

  return rows.length > 0;
}

async function fetchComments(recipeId, currentUserId = null) {
  const rows = await sql`
    select
      c.id::text as id,
      c.recipe_id::text as recipe_id,
      c.user_id::text as user_id,
      u.username as author,
      c.body,
      c.parent_comment_id::text as parent_comment_id,
      c.deleted_at,
      c.created_at,
      c.updated_at
    from recipe_comments c
    join app_users u on u.id = c.user_id
    where c.recipe_id = ${recipeId}::uuid
    order by c.created_at asc
  `;

  return rows.map(row => ({
    id: row.id,
    recipeId: row.recipe_id,
    authorId: row.user_id,
    author: row.author,
    content: row.body,
    parentCommentId: row.parent_comment_id || null,
    isDeleted: Boolean(row.deleted_at),
    createdAt: toIsoDate(row.created_at),
    updatedAt: toIsoDate(row.updated_at),
    canEdit: Boolean(currentUserId && currentUserId === row.user_id && !row.deleted_at)
  }));
}

async function readJsonBody(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

export default async (req) => {
  try {
    await ensureDomainSchema();

    if (req.method === "GET") {
      const recipeIdRaw = extractRecipeId(req);
      const parsedRecipe = uuidSchema.safeParse(recipeIdRaw);

      if (!parsedRecipe.success) {
        return json(
          { error: "recipeId invalido", details: zodDetails(parsedRecipe.error) },
          400
        );
      }

      const recipeExists = await assertPublishedRecipe(parsedRecipe.data);
      if (!recipeExists) {
        return json({ error: "Receta no encontrada" }, 404);
      }

      const user = await getCurrentUser(req);
      const comments = await fetchComments(parsedRecipe.data, user?.id || null);
      return json(comments, 200);
    }

    if (req.method === "POST") {
      const user = await getCurrentUser(req);
      if (!user) {
        return json({ error: "No autenticado" }, 401);
      }

      const body = await readJsonBody(req);
      const recipeIdRaw = extractRecipeId(req, body.recipeId);
      const parsedRecipe = uuidSchema.safeParse(recipeIdRaw);
      const parsedContent = contentSchema.safeParse(body.content ?? "");
      const parsedParent = body.parentCommentId
        ? uuidSchema.safeParse(body.parentCommentId)
        : { success: true, data: null };

      if (!parsedRecipe.success || !parsedContent.success || !parsedParent.success) {
        const details = [
          ...(parsedRecipe.success ? [] : zodDetails(parsedRecipe.error)),
          ...(parsedContent.success ? [] : zodDetails(parsedContent.error)),
          ...(parsedParent.success ? [] : zodDetails(parsedParent.error))
        ];
        return json({ error: "Datos invalidos", details }, 400);
      }

      const recipeExists = await assertPublishedRecipe(parsedRecipe.data);
      if (!recipeExists) {
        return json({ error: "Receta no encontrada" }, 404);
      }

      if (parsedParent.data) {
        const parentRows = await sql`
          select id
          from recipe_comments
          where id = ${parsedParent.data}::uuid
            and recipe_id = ${parsedRecipe.data}::uuid
          limit 1
        `;

        if (parentRows.length === 0) {
          return json({ error: "El comentario padre no pertenece a la misma receta" }, 400);
        }
      }

      await sql`
        insert into recipe_comments (
          recipe_id,
          user_id,
          body,
          parent_comment_id,
          deleted_at
        )
        values (
          ${parsedRecipe.data}::uuid,
          ${user.id}::uuid,
          ${parsedContent.data},
          ${parsedParent.data}::uuid,
          null
        )
      `;

      const comments = await fetchComments(parsedRecipe.data, user.id);
      return json(comments, 201);
    }

    if (req.method === "PUT") {
      const user = await getCurrentUser(req);
      if (!user) {
        return json({ error: "No autenticado" }, 401);
      }

      const body = await readJsonBody(req);
      const recipeIdRaw = extractRecipeId(req, body.recipeId);
      const commentIdRaw = extractCommentId(req, body);
      const parsedRecipe = uuidSchema.safeParse(recipeIdRaw);
      const parsedComment = uuidSchema.safeParse(commentIdRaw);
      const parsedContent = contentSchema.safeParse(body.content ?? "");

      if (!parsedRecipe.success || !parsedComment.success || !parsedContent.success) {
        const details = [
          ...(parsedRecipe.success ? [] : zodDetails(parsedRecipe.error)),
          ...(parsedComment.success ? [] : zodDetails(parsedComment.error)),
          ...(parsedContent.success ? [] : zodDetails(parsedContent.error))
        ];
        return json({ error: "Datos invalidos", details }, 400);
      }

      const updated = await sql`
        update recipe_comments
        set body = ${parsedContent.data},
            updated_at = now()
        where id = ${parsedComment.data}::uuid
          and recipe_id = ${parsedRecipe.data}::uuid
          and user_id = ${user.id}::uuid
          and deleted_at is null
        returning id::text as id
      `;

      if (updated.length === 0) {
        const existing = await sql`
          select user_id::text as user_id, deleted_at
          from recipe_comments
          where id = ${parsedComment.data}::uuid
            and recipe_id = ${parsedRecipe.data}::uuid
          limit 1
        `;

        if (existing.length === 0) {
          return json({ error: "Comentario no encontrado" }, 404);
        }

        if (existing[0].user_id !== user.id) {
          return json({ error: "No puedes editar comentarios de otros usuarios" }, 403);
        }

        return json({ error: "No se puede editar un comentario eliminado" }, 409);
      }

      const comments = await fetchComments(parsedRecipe.data, user.id);
      return json(comments, 200);
    }

    if (req.method === "DELETE") {
      const user = await getCurrentUser(req);
      if (!user) {
        return json({ error: "No autenticado" }, 401);
      }

      const body = await readJsonBody(req);
      const recipeIdRaw = extractRecipeId(req, body.recipeId);
      const commentIdRaw = extractCommentId(req, body);
      const parsedRecipe = uuidSchema.safeParse(recipeIdRaw);
      const parsedComment = uuidSchema.safeParse(commentIdRaw);

      if (!parsedRecipe.success || !parsedComment.success) {
        const details = [
          ...(parsedRecipe.success ? [] : zodDetails(parsedRecipe.error)),
          ...(parsedComment.success ? [] : zodDetails(parsedComment.error))
        ];
        return json({ error: "Datos invalidos", details }, 400);
      }

      const deleted = await sql`
        update recipe_comments
        set body = 'Comentario eliminado',
            deleted_at = now(),
            updated_at = now()
        where id = ${parsedComment.data}::uuid
          and recipe_id = ${parsedRecipe.data}::uuid
          and user_id = ${user.id}::uuid
          and deleted_at is null
        returning id::text as id
      `;

      if (deleted.length === 0) {
        const existing = await sql`
          select user_id::text as user_id, deleted_at
          from recipe_comments
          where id = ${parsedComment.data}::uuid
            and recipe_id = ${parsedRecipe.data}::uuid
          limit 1
        `;

        if (existing.length === 0) {
          return json({ error: "Comentario no encontrado" }, 404);
        }

        if (existing[0].user_id !== user.id) {
          return json({ error: "No puedes eliminar comentarios de otros usuarios" }, 403);
        }

        return json({ error: "El comentario ya estaba eliminado" }, 409);
      }

      const comments = await fetchComments(parsedRecipe.data, user.id);
      return json(comments, 200);
    }

    return json({ error: "Metodo no permitido" }, 405);
  } catch (error) {
    console.error("RECIPE COMMENTS ERROR:", error);

    if (error instanceof z.ZodError) {
      return json({ error: "Datos invalidos", details: zodDetails(error) }, 400);
    }

    return json({ error: "No se pudieron procesar los comentarios" }, 500);
  }
};

export const config = {
  path: "/api/recipe-comments"
};
