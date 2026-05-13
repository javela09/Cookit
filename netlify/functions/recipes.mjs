import { Buffer } from "node:buffer";
import { z } from "zod";
import { getCurrentUser } from "./_lib/auth.mjs";
import { sql } from "./_lib/db.mjs";
import { ensureDomainSchema, toArray } from "./_lib/domain.mjs";

const jsonHeaders = { "content-type": "application/json" };
const uuidSchema = z.string().uuid();
const MAX_SUMMARY_LIMIT = 12;

const recipeSchema = z.object({
  title: z.string().trim().min(1).max(140),
  description: z.string().trim().min(1),
  timeMinutes: z.number().int().min(1).max(1440).nullable().optional(),
  difficulty: z.string().trim().max(20).nullable().optional(),
  categories: z.array(z.string().trim().min(1).max(60)).max(40).default([]),
  ingredients: z.array(z.string().trim().min(1).max(400)).min(1).max(200),
  steps: z.array(z.string().trim().min(1).max(2000)).min(1).max(200),
  imageUrl: z.string().max(4_500_000).nullable().optional(),
  parentRecipeId: z.string().uuid().nullable().optional()
});

class HttpError extends Error {
  // Representa errores HTTP controlados con estado y detalles opcionales.
  constructor(message, status = 400, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

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

// Normaliza fechas de PostgreSQL a ISO.
function toIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

// Normaliza listas almacenadas como JSON o texto.
function toStringArray(value) {
  return toArray(value).map(item => String(item).trim()).filter(Boolean);
}

// Extrae minutos desde número o texto de formulario.
function parseTimeMinutes(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/\d+/);
    if (!match) return Number.NaN;
    return Number.parseInt(match[0], 10);
  }

  return Number.NaN;
}

// Construye una URL válida incluso en entornos de desarrollo.
function getRequestUrl(req) {
  try {
    return new URL(req.url);
  } catch {
    return new URL(req.url, "http://localhost");
  }
}

// Convierte una fila SQL al contrato público de receta.
function mapRecipeRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    author: row.author,
    authorId: row.author_id,
    date: toIsoDate(row.created_at),
    votes: Number(row.votes || 0),
    time: row.time_minutes,
    categories: toStringArray(row.categories),
    ingredients: toStringArray(row.ingredients),
    steps: toStringArray(row.steps),
    image: row.image_url || null,
    saved: Boolean(row.saved),
    voted: Boolean(row.voted),
    parentRecipeId: row.parent_recipe_id || null,
    isVariant: Boolean(row.parent_recipe_id)
  };
}

// Limita parámetros numéricos de consulta para evitar respuestas grandes.
function parsePositiveLimit(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

// Normaliza y valida los datos recibidos para crear una receta.
function normalizeInput(raw, imageUrlOverride) {
  const title = raw.title ?? raw.newTitle ?? "";
  const description = raw.description ?? raw.newDescription ?? "";
  const parsedTime = parseTimeMinutes(
    raw.timeMinutes ?? raw.time_minutes ?? raw.time ?? raw.newTime ?? null
  );
  const categories = toStringArray(raw.categories ?? raw.newCategories ?? []);
  const ingredients = toStringArray(raw.ingredients ?? raw.newIngredients ?? []);
  const steps = toStringArray(raw.steps ?? raw.newSteps ?? []);
  const difficulty = raw.difficulty ?? null;
  const imageUrl = imageUrlOverride ?? raw.imageUrl ?? raw.image_url ?? raw.image ?? null;
  const parentRecipeId = raw.parentRecipeId ?? raw.parent_recipe_id ?? raw.variantOf ?? null;

  if (Number.isNaN(parsedTime)) {
    throw new HttpError("El tiempo debe ser un numero entero en minutos", 400, [
      {
        path: "timeMinutes",
        message: "El tiempo debe contener minutos validos",
        code: "invalid_type"
      }
    ]);
  }

  const parsed = recipeSchema.safeParse({
    title,
    description,
    timeMinutes: parsedTime,
    difficulty: typeof difficulty === "string" ? difficulty.trim() || null : null,
    categories,
    ingredients,
    steps,
    imageUrl: typeof imageUrl === "string" && imageUrl.trim() ? imageUrl.trim() : null,
    parentRecipeId: typeof parentRecipeId === "string" && parentRecipeId.trim()
      ? parentRecipeId.trim()
      : null
  });

  if (!parsed.success) {
    throw new HttpError("Datos de receta invalidos", 400, zodDetails(parsed.error));
  }

  return parsed.data;
}

// Lee una receta enviada como multipart y convierte la imagen a data URL.
async function parseMultipartRecipe(req) {
  const formData = await req.formData();
  const payload = Object.fromEntries(formData.entries());
  const isVariant = Boolean(payload.parentRecipeId || payload.parent_recipe_id || payload.variantOf);
  const file = formData.get("imageFile");
  let imageUrl = null;

  if (!isVariant && file && typeof file === "object" && typeof file.arrayBuffer === "function") {
    if (!file.type || !file.type.startsWith("image/")) {
      throw new HttpError("La imagen debe ser de tipo image/*", 400, [
        { path: "imageFile", message: "Tipo de archivo no permitido", code: "invalid_type" }
      ]);
    }

    const maxBytes = 3 * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new HttpError("La imagen supera el limite de 3MB", 400, [
        { path: "imageFile", message: "Archivo demasiado grande", code: "too_big" }
      ]);
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    imageUrl = `data:${file.type};base64,${bytes.toString("base64")}`;
  }

  return normalizeInput(payload, imageUrl);
}

// Lee una receta enviada como JSON.
async function parseJsonRecipe(req) {
  let body;

  try {
    body = await req.json();
  } catch {
    throw new HttpError("El cuerpo JSON no es valido", 400);
  }

  return normalizeInput(body || {}, null);
}

// Lista recetas resumidas para portada sin estado personalizado de usuario.
async function listRecipeSummaries(req) {
  const url = getRequestUrl(req);
  const limit = parsePositiveLimit(url.searchParams.get("limit"), 3, MAX_SUMMARY_LIMIT);

  const rows = await sql`
    select
      r.id::text as id,
      r.author_id::text as author_id,
      u.username as author,
      r.title,
      r.description,
      r.time_minutes,
      r.image_url,
      r.categories,
      null::jsonb as ingredients,
      null::jsonb as steps,
      r.parent_recipe_id::text as parent_recipe_id,
      r.created_at,
      coalesce(v.vote_count, 0)::int as votes,
      false as saved,
      false as voted
    from recipes r
    join app_users u on u.id = r.author_id
    left join (
      select recipe_id, count(*)::int as vote_count
      from recipe_votes
      group by recipe_id
    ) v on v.recipe_id = r.id
    where r.deleted_at is null
      and r.is_published = true
      and r.parent_recipe_id is null
    order by coalesce(v.vote_count, 0) desc, r.created_at desc
    limit ${limit}
  `;

  return json(rows.map(mapRecipeRow), 200);
}

// Obtiene una única receta con el mismo contrato que el listado.
async function getRecipe(req, recipeId) {
  const parsedId = uuidSchema.safeParse(recipeId);
  if (!parsedId.success) {
    return json(
      { error: "recipeId invalido", details: zodDetails(parsedId.error) },
      400
    );
  }

  const user = await getCurrentUser(req);
  const userId = user?.id || null;

  const rows = await sql`
    select
      r.id::text as id,
      r.author_id::text as author_id,
      u.username as author,
      r.title,
      r.description,
      r.time_minutes,
      case
        when r.parent_recipe_id is null then r.image_url
        else parent_r.image_url
      end as image_url,
      r.categories,
      r.ingredients,
      r.steps,
      r.parent_recipe_id::text as parent_recipe_id,
      r.created_at,
      coalesce(v.vote_count, 0)::int as votes,
      case when rs.user_id is null then false else true end as saved,
      case when rv.user_id is null then false else true end as voted
    from recipes r
    left join recipes parent_r
      on parent_r.id = r.parent_recipe_id
     and parent_r.deleted_at is null
     and parent_r.is_published = true
    join app_users u on u.id = r.author_id
    left join (
      select recipe_id, count(*)::int as vote_count
      from recipe_votes
      group by recipe_id
    ) v on v.recipe_id = r.id
    left join recipe_saves rs
      on rs.recipe_id = r.id
     and rs.user_id = ${userId}::uuid
    left join recipe_votes rv
      on rv.recipe_id = r.id
     and rv.user_id = ${userId}::uuid
    where r.deleted_at is null
      and r.is_published = true
      and r.id = ${parsedId.data}::uuid
    limit 1
  `;

  if (rows.length === 0) {
    return json({ error: "Receta no encontrada" }, 404);
  }

  return json(mapRecipeRow(rows[0]), 200);
}

// Lista variantes asociadas a una receta principal, ordenadas por votos.
async function listRecipeVariants(req, parentRecipeId) {
  const parsedId = uuidSchema.safeParse(parentRecipeId);
  if (!parsedId.success) {
    return json(
      { error: "parentRecipeId invalido", details: zodDetails(parsedId.error) },
      400
    );
  }

  const user = await getCurrentUser(req);
  const userId = user?.id || null;

  const rows = await sql`
    select
      r.id::text as id,
      r.author_id::text as author_id,
      u.username as author,
      r.title,
      r.description,
      r.time_minutes,
      parent_r.image_url,
      r.categories,
      r.ingredients,
      r.steps,
      r.parent_recipe_id::text as parent_recipe_id,
      r.created_at,
      coalesce(v.vote_count, 0)::int as votes,
      case when rs.user_id is null then false else true end as saved,
      case when rv.user_id is null then false else true end as voted
    from recipes r
    join recipes parent_r
      on parent_r.id = r.parent_recipe_id
     and parent_r.deleted_at is null
     and parent_r.is_published = true
    join app_users u on u.id = r.author_id
    left join (
      select recipe_id, count(*)::int as vote_count
      from recipe_votes
      group by recipe_id
    ) v on v.recipe_id = r.id
    left join recipe_saves rs
      on rs.recipe_id = r.id
     and rs.user_id = ${userId}::uuid
    left join recipe_votes rv
      on rv.recipe_id = r.id
     and rv.user_id = ${userId}::uuid
    where r.deleted_at is null
      and r.is_published = true
      and r.parent_recipe_id = ${parsedId.data}::uuid
    order by coalesce(v.vote_count, 0) desc, r.created_at desc
  `;

  return json(rows.map(mapRecipeRow), 200);
}

// Lista todas las recetas publicadas para vistas que necesitan filtros completos.
async function listRecipes(req) {
  const url = getRequestUrl(req);
  const parentRecipeId = url.searchParams.get("parentRecipeId") || url.searchParams.get("variantOf");
  const recipeId = url.searchParams.get("recipeId") || url.searchParams.get("id");

  if (parentRecipeId) {
    return listRecipeVariants(req, parentRecipeId);
  }

  if (recipeId) {
    return getRecipe(req, recipeId);
  }

  if (url.searchParams.get("view") === "summary") {
    return listRecipeSummaries(req);
  }

  const user = await getCurrentUser(req);
  const userId = user?.id || null;

  const rows = await sql`
    select
      r.id::text as id,
      r.author_id::text as author_id,
      u.username as author,
      r.title,
      r.description,
      r.time_minutes,
      r.image_url,
      r.categories,
      r.ingredients,
      r.steps,
      r.parent_recipe_id::text as parent_recipe_id,
      r.created_at,
      coalesce(v.vote_count, 0)::int as votes,
      case when rs.user_id is null then false else true end as saved,
      case when rv.user_id is null then false else true end as voted
    from recipes r
    join app_users u on u.id = r.author_id
    left join (
      select recipe_id, count(*)::int as vote_count
      from recipe_votes
      group by recipe_id
    ) v on v.recipe_id = r.id
    left join recipe_saves rs
      on rs.recipe_id = r.id
     and rs.user_id = ${userId}::uuid
    left join recipe_votes rv
      on rv.recipe_id = r.id
     and rv.user_id = ${userId}::uuid
    where r.deleted_at is null
      and r.is_published = true
      and r.parent_recipe_id is null
    order by r.created_at desc
  `;

  return json(rows.map(mapRecipeRow), 200);
}

// Crea una receta nueva para el usuario autenticado.
async function createRecipe(req) {
  const user = await getCurrentUser(req);

  if (!user) {
    return json({ error: "No autenticado" }, 401);
  }

  const contentType = req.headers.get("content-type") || "";
  const payload = contentType.includes("multipart/form-data")
    ? await parseMultipartRecipe(req)
    : await parseJsonRecipe(req);

  if (payload.parentRecipeId) {
    const parentRows = await sql`
      select id
      from recipes
      where id = ${payload.parentRecipeId}::uuid
        and deleted_at is null
        and is_published = true
        and parent_recipe_id is null
      limit 1
    `;

    if (parentRows.length === 0) {
      throw new HttpError("Receta original no encontrada para crear la variante", 404);
    }
  }

  // Las variantes conservan image_url a null y heredan la imagen de la receta original al consultarse.
  const rows = await sql`
    insert into recipes (
      author_id,
      title,
      description,
      time_minutes,
      difficulty,
      image_url,
      categories,
      ingredients,
      steps,
      parent_recipe_id,
      is_published
    )
    values (
      ${user.id}::uuid,
      ${payload.title},
      ${payload.description},
      ${payload.timeMinutes ?? null},
      ${payload.difficulty ?? null},
      ${payload.parentRecipeId ? null : payload.imageUrl ?? null},
      ${JSON.stringify(payload.categories)}::jsonb,
      ${JSON.stringify(payload.ingredients)}::jsonb,
      ${JSON.stringify(payload.steps)}::jsonb,
      ${payload.parentRecipeId ?? null}::uuid,
      true
    )
    returning
      id::text as id,
      author_id::text as author_id,
      title,
      description,
      time_minutes,
      image_url,
      categories,
      ingredients,
      steps,
      parent_recipe_id::text as parent_recipe_id,
      created_at
  `;

  const recipe = mapRecipeRow({
    ...rows[0],
    author: user.username,
    votes: 0,
    saved: false,
    voted: false
  });

  return json(recipe, 201);
}

// Elimina lógicamente una receta propia.
async function deleteRecipe(req) {
  const user = await getCurrentUser(req);

  if (!user) {
    return json({ error: "No autenticado" }, 401);
  }

  const url = getRequestUrl(req);
  let recipeId = url.searchParams.get("recipeId") || url.searchParams.get("id");

  if (!recipeId && (req.headers.get("content-type") || "").includes("application/json")) {
    try {
      const body = await req.json();
      recipeId = body?.recipeId || body?.id || null;
    } catch {
      recipeId = null;
    }
  }

  const parsedId = uuidSchema.safeParse(recipeId);
  if (!parsedId.success) {
    return json(
      { error: "recipeId invalido", details: zodDetails(parsedId.error) },
      400
    );
  }

  const deleted = await sql`
    update recipes
    set deleted_at = now(),
        updated_at = now()
    where id = ${parsedId.data}::uuid
      and author_id = ${user.id}::uuid
      and deleted_at is null
    returning id::text as id
  `;

  if (deleted.length === 0) {
    const existing = await sql`
      select author_id::text as author_id, deleted_at
      from recipes
      where id = ${parsedId.data}::uuid
      limit 1
    `;

    if (existing.length === 0) {
      return json({ error: "Receta no encontrada" }, 404);
    }

    if (existing[0].author_id !== user.id) {
      return json({ error: "No puedes eliminar una receta de otro autor" }, 403);
    }

    return json({ error: "La receta ya estaba eliminada" }, 409);
  }

  return json({ ok: true, id: deleted[0].id }, 200);
}

// Enruta las operaciones disponibles sobre recetas.
export default async (req) => {
  try {
    await ensureDomainSchema();

    if (req.method === "GET") {
      return await listRecipes(req);
    }

    if (req.method === "POST") {
      return await createRecipe(req);
    }

    if (req.method === "DELETE") {
      return await deleteRecipe(req);
    }

    return json({ error: "Metodo no permitido" }, 405);
  } catch (error) {
    console.error("RECIPES ERROR:", error);

    if (error instanceof HttpError) {
      return json(
        error.details ? { error: error.message, details: error.details } : { error: error.message },
        error.status
      );
    }

    if (error instanceof z.ZodError) {
      return json({ error: "Datos invalidos", details: zodDetails(error) }, 400);
    }

    return json({ error: "Error interno al procesar recetas" }, 500);
  }
};

export const config = {
  path: "/api/recipes"
};
