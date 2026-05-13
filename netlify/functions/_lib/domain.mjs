import { sql } from "./db.mjs";

let schemaReadyPromise = null;

// Normaliza arrays recibidos como JSON, texto multilínea o arrays reales.
export function toArray(value) {
  if (Array.isArray(value)) {
    return value
      .map(item => (typeof item === "string" ? item.trim() : item))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map(item => (typeof item === "string" ? item.trim() : item))
          .filter(Boolean);
      }
    } catch {
      return trimmed
        .split("\n")
        .map(item => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

// Ejecuta la comprobación real de columnas e índices del dominio.
async function ensureDomainSchemaInternal() {
  const recipesTableRows = await sql`
    select exists(
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'recipes'
    ) as exists
  `;

  if (recipesTableRows[0]?.exists) {
    const parentColumnRows = await sql`
      select exists(
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'recipes'
          and column_name = 'parent_recipe_id'
      ) as exists
    `;

    if (!parentColumnRows[0]?.exists) {
      await sql`
        alter table recipes
        add column parent_recipe_id uuid null
      `;
    }

    const parentFkRows = await sql`
      select exists(
        select 1
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
          on tc.constraint_name = kcu.constraint_name
         and tc.table_schema = kcu.table_schema
        where tc.table_schema = 'public'
          and tc.table_name = 'recipes'
          and tc.constraint_type = 'FOREIGN KEY'
          and kcu.column_name = 'parent_recipe_id'
      ) as exists
    `;

    if (!parentFkRows[0]?.exists) {
      await sql`
        alter table recipes
        add constraint recipes_parent_recipe_id_fkey
        foreign key (parent_recipe_id)
        references recipes(id)
        on delete set null
      `;
    }

    await sql`
      create index if not exists idx_recipes_parent_recipe
      on recipes(parent_recipe_id, created_at desc)
    `;
  }

  const tableRows = await sql`
    select exists(
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = 'recipe_comments'
    ) as exists
  `;

  if (!tableRows[0]?.exists) {
    return;
  }

  const columnRows = await sql`
    select exists(
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'recipe_comments'
        and column_name = 'parent_comment_id'
    ) as exists
  `;

  if (!columnRows[0]?.exists) {
    await sql`
      alter table recipe_comments
      add column parent_comment_id uuid null
    `;
  }

  const fkRows = await sql`
    select exists(
      select 1
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
       and tc.table_schema = kcu.table_schema
      where tc.table_schema = 'public'
        and tc.table_name = 'recipe_comments'
        and tc.constraint_type = 'FOREIGN KEY'
        and kcu.column_name = 'parent_comment_id'
    ) as exists
  `;

  if (!fkRows[0]?.exists) {
    await sql`
      alter table recipe_comments
      add constraint recipe_comments_parent_comment_id_fkey
      foreign key (parent_comment_id)
      references recipe_comments(id)
      on delete set null
    `;
  }

  await sql`
    create index if not exists idx_recipe_comments_parent
    on recipe_comments(parent_comment_id, created_at desc)
  `;
}

// Garantiza el esquema de comentarios una sola vez por instancia serverless caliente.
export async function ensureDomainSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = ensureDomainSchemaInternal().catch(error => {
      schemaReadyPromise = null;
      throw error;
    });
  }

  return schemaReadyPromise;
}
