// API local aislada para `npm run local`. No se carga en produccion.
(function () {
  const KEYS = {
    recipes: "local_recipes",
    variants: "local_recipe_variants",
    recipeVotes: "local_recipe_votes",
    variantVotes: "local_recipe_variant_votes",
    comments: "local_comments",
    saves: "local_recipe_saves",
    user: "local_user",
    session: "local_session"
  };

  function read(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    window.localStorage.setItem(key, JSON.stringify(value));
  }

  function makeId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function apiError(message, status = 400, details = null) {
    const error = new Error(message);
    error.status = status;
    error.details = details;
    throw error;
  }

  function getUser() {
    if (window.localStorage.getItem(KEYS.session) !== "1") return null;
    return read(KEYS.user, null);
  }

  function requireUser() {
    const user = getUser();
    if (!user) apiError("No autenticado", 401);
    return user;
  }

  function toArray(value) {
    if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
    if (typeof value !== "string") return [];

    try {
      const parsed = JSON.parse(value);
      return toArray(parsed);
    } catch {
      return value
        .split("\n")
        .map(item => item.trim())
        .filter(Boolean);
    }
  }

  function readJsonBody(options) {
    if (!options.body) return {};
    if (typeof options.body === "string") {
      try {
        return JSON.parse(options.body);
      } catch {
        return {};
      }
    }
    return {};
  }

  function readFileAsDataUrl(file) {
    return new Promise(resolve => {
      if (!file || typeof FileReader === "undefined") {
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  async function readRecipeBody(options) {
    const body = options.body;
    if (body instanceof FormData) {
      const imageFile = body.get("imageFile");
      return {
        title: body.get("title") || "",
        description: body.get("description") || "",
        timeMinutes: body.get("timeMinutes") || "",
        categories: body.get("categories") || "[]",
        ingredients: body.get("ingredients") || "[]",
        steps: body.get("steps") || "[]",
        parentRecipeId: body.get("parentRecipeId") || null,
        image: await readFileAsDataUrl(imageFile)
      };
    }

    return readJsonBody(options);
  }

  function getRecipes() {
    return read(KEYS.recipes, []);
  }

  function setRecipes(recipes) {
    write(KEYS.recipes, recipes);
  }

  function getVariants() {
    return read(KEYS.variants, []);
  }

  function setVariants(variants) {
    write(KEYS.variants, variants);
  }

  function getComments() {
    return read(KEYS.comments, []);
  }

  function setComments(comments) {
    write(KEYS.comments, comments);
  }

  function getVoteMap(key) {
    return read(key, {});
  }

  function setVoteMap(key, value) {
    write(key, value);
  }

  function getSaves() {
    return read(KEYS.saves, []);
  }

  function setSaves(saves) {
    write(KEYS.saves, saves);
  }

  function voteCount(key, id) {
    return (getVoteMap(key)[id] || []).length;
  }

  function hasVote(key, id, userId) {
    return (getVoteMap(key)[id] || []).includes(userId);
  }

  function publicRecipe(recipe, user = getUser()) {
    return {
      ...recipe,
      votes: voteCount(KEYS.recipeVotes, recipe.id),
      voted: Boolean(user && hasVote(KEYS.recipeVotes, recipe.id, user.id)),
      saved: getSaves().includes(recipe.id),
      parentRecipeId: null,
      isVariant: false
    };
  }

  function publicVariant(variant, user = getUser()) {
    const parent = getRecipes().find(recipe => recipe.id === variant.recipeId);
    return {
      ...variant,
      image: parent?.image || null,
      votes: voteCount(KEYS.variantVotes, variant.id),
      voted: Boolean(user && hasVote(KEYS.variantVotes, variant.id, user.id)),
      saved: false,
      parentRecipeId: variant.recipeId,
      isVariant: true
    };
  }

  function sortByPopularity(list) {
    return [...list].sort(
      (a, b) => (b.votes || 0) - (a.votes || 0) || new Date(b.date) - new Date(a.date)
    );
  }

  function ensureLocalUser(body = {}) {
    const existing = read(KEYS.user, null);
    if (existing) return existing;

    const email = String(body.email || "local@cookit.test").trim();
    const username = String(body.username || email.split("@")[0] || "usuario-local").trim();
    const user = {
      id: makeId(),
      username,
      email
    };
    write(KEYS.user, user);
    return user;
  }

  function handleAuth(path, method, options) {
    if (path === "/api/auth/me") {
      const user = getUser();
      if (!user) apiError("No autenticado", 401);
      return user;
    }

    if (path === "/api/auth/logout" && method === "POST") {
      window.localStorage.setItem(KEYS.session, "0");
      return { ok: true };
    }

    if ((path === "/api/auth/login" || path === "/api/auth/register") && method === "POST") {
      const user = ensureLocalUser(readJsonBody(options));
      window.localStorage.setItem(KEYS.session, "1");
      return user;
    }

    apiError("Metodo no permitido", 405);
  }

  function handleUser(path, method, options) {
    if (method !== "PUT") apiError("Metodo no permitido", 405);

    const user = requireUser();
    const body = readJsonBody(options);

    if (path === "/api/user/email") {
      const nextUser = { ...user, email: String(body.email || "").trim() };
      write(KEYS.user, nextUser);
      return nextUser;
    }

    if (path === "/api/user/password") {
      return { ok: true };
    }

    apiError("Endpoint local no implementado", 404);
  }

  function validateRecipe(data) {
    return Boolean(
      data.title &&
      data.description &&
      Number.isFinite(data.time) &&
      data.time > 0 &&
      data.categories.length &&
      data.ingredients.length &&
      data.steps.length
    );
  }

  async function handleRecipes(url, method, options) {
    const user = getUser();

    if (method === "GET") {
      const parentRecipeId = url.searchParams.get("parentRecipeId") || url.searchParams.get("variantOf");
      const recipeId = url.searchParams.get("recipeId") || url.searchParams.get("id");

      if (parentRecipeId) {
        return sortByPopularity(
          getVariants()
            .filter(variant => variant.recipeId === parentRecipeId)
            .map(variant => publicVariant(variant, user))
        );
      }

      if (recipeId) {
        const recipe = getRecipes().find(item => item.id === recipeId);
        if (recipe) return publicRecipe(recipe, user);

        const variant = getVariants().find(item => item.id === recipeId);
        if (variant) return publicVariant(variant, user);

        apiError("Receta no encontrada", 404);
      }

      const list = getRecipes().map(recipe => publicRecipe(recipe, user));
      const sorted = url.searchParams.get("order") === "popular"
        ? sortByPopularity(list)
        : [...list].sort((a, b) => new Date(b.date) - new Date(a.date));
      const limit = Number.parseInt(url.searchParams.get("limit") || "0", 10);
      return limit > 0 ? sorted.slice(0, limit) : sorted;
    }

    if (method === "POST") {
      const currentUser = requireUser();
      const raw = await readRecipeBody(options);
      const data = {
        title: String(raw.title || "").trim(),
        description: String(raw.description || "").trim(),
        time: Number.parseInt(raw.timeMinutes || raw.time || "0", 10),
        categories: toArray(raw.categories),
        ingredients: toArray(raw.ingredients),
        steps: toArray(raw.steps),
        parentRecipeId: raw.parentRecipeId || raw.parent_recipe_id || raw.variantOf || null,
        image: raw.image || raw.imageUrl || null
      };

      if (!validateRecipe(data)) {
        apiError("Datos de receta invalidos", 400);
      }

      if (data.parentRecipeId) {
        if (getVariants().some(variant => variant.id === data.parentRecipeId)) {
          apiError("No se puede crear una variante de otra variante", 400);
        }

        const parent = getRecipes().find(recipe => recipe.id === data.parentRecipeId);
        if (!parent) {
          apiError("Receta original no encontrada para crear la variante", 404);
        }

        const variant = {
          id: makeId(),
          recipeId: parent.id,
          authorId: currentUser.id,
          author: currentUser.username,
          title: data.title,
          description: data.description,
          date: new Date().toISOString(),
          time: data.time,
          categories: data.categories,
          ingredients: data.ingredients,
          steps: data.steps,
          isVariant: true
        };
        setVariants([...getVariants(), variant]);
        return publicVariant(variant, currentUser);
      }

      const recipe = {
        id: makeId(),
        authorId: currentUser.id,
        author: currentUser.username,
        title: data.title,
        description: data.description,
        date: new Date().toISOString(),
        time: data.time,
        categories: data.categories,
        ingredients: data.ingredients,
        steps: data.steps,
        image: data.image,
        isVariant: false
      };
      setRecipes([...getRecipes(), recipe]);
      return publicRecipe(recipe, currentUser);
    }

    if (method === "DELETE") {
      const currentUser = requireUser();
      const recipeId = url.searchParams.get("recipeId") || url.searchParams.get("id");
      const recipes = getRecipes();
      const recipe = recipes.find(item => item.id === recipeId);

      if (!recipe || recipe.authorId !== currentUser.id) {
        apiError("Receta no encontrada", 404);
      }

      setRecipes(recipes.filter(item => item.id !== recipeId));
      setVariants(getVariants().filter(variant => variant.recipeId !== recipeId));
      setComments(getComments().filter(comment => comment.recipeId !== recipeId));
      setSaves(getSaves().filter(id => id !== recipeId));
      return { ok: true, id: recipeId };
    }

    apiError("Metodo no permitido", 405);
  }

  function toggleVote(key, id, idField, exists) {
    const user = requireUser();
    if (!exists) {
      apiError(idField === "variantId" ? "Variante no encontrada" : "Receta no encontrada", 404);
    }

    const votes = getVoteMap(key);
    const voters = votes[id] || [];
    const voted = !voters.includes(user.id);
    votes[id] = voted ? [...voters, user.id] : voters.filter(item => item !== user.id);
    setVoteMap(key, votes);

    return {
      ok: true,
      [idField]: id,
      voted,
      votes: votes[id].length
    };
  }

  function handleRecipeVotes(options) {
    const body = readJsonBody(options);
    const recipeId = body.recipeId;
    return toggleVote(
      KEYS.recipeVotes,
      recipeId,
      "recipeId",
      getRecipes().some(recipe => recipe.id === recipeId)
    );
  }

  function handleVariantVotes(options) {
    const body = readJsonBody(options);
    const variantId = body.variantId;
    return toggleVote(
      KEYS.variantVotes,
      variantId,
      "variantId",
      getVariants().some(variant => variant.id === variantId)
    );
  }

  function handleSaves(options) {
    requireUser();
    const body = readJsonBody(options);
    const recipeId = body.recipeId;

    if (!getRecipes().some(recipe => recipe.id === recipeId)) {
      apiError("Receta no encontrada", 404);
    }

    const saves = getSaves();
    const saved = !saves.includes(recipeId);
    setSaves(saved ? [...saves, recipeId] : saves.filter(id => id !== recipeId));
    return { ok: true, recipeId, saved };
  }

  function commentsForRecipe(recipeId, user = getUser()) {
    return getComments()
      .filter(comment => comment.recipeId === recipeId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map(comment => ({
        ...comment,
        canEdit: Boolean(user && user.id === comment.authorId && !comment.isDeleted)
      }));
  }

  function extractRecipeId(url, options, body) {
    return url.searchParams.get("recipeId") ||
      url.searchParams.get("id") ||
      options.headers?.["x-recipe-id"] ||
      body.recipeId ||
      null;
  }

  function handleComments(url, method, options) {
    const body = method === "GET" ? {} : readJsonBody(options);
    const recipeId = extractRecipeId(url, options, body);

    if (getVariants().some(variant => variant.id === recipeId)) {
      apiError("Las variantes no tienen comentarios propios", 400);
    }

    if (!getRecipes().some(recipe => recipe.id === recipeId)) {
      apiError("Receta no encontrada", 404);
    }

    if (method === "GET") {
      return commentsForRecipe(recipeId);
    }

    const user = requireUser();

    if (method === "POST") {
      const content = String(body.content || "").trim();
      if (!content) apiError("El contenido no puede estar vacio", 400);

      const comment = {
        id: makeId(),
        recipeId,
        authorId: user.id,
        author: user.username,
        content,
        parentCommentId: body.parentCommentId || null,
        isDeleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setComments([...getComments(), comment]);
      return commentsForRecipe(recipeId, user);
    }

    if (method === "PUT") {
      const comments = getComments();
      const comment = comments.find(item => item.id === body.commentId && item.recipeId === recipeId);

      if (!comment || comment.authorId !== user.id || comment.isDeleted) {
        apiError("Comentario no encontrado", 404);
      }

      comment.content = String(body.content || "").trim();
      comment.updatedAt = new Date().toISOString();
      setComments(comments);
      return commentsForRecipe(recipeId, user);
    }

    if (method === "DELETE") {
      const comments = getComments();
      const comment = comments.find(item => item.id === body.commentId && item.recipeId === recipeId);

      if (!comment || comment.authorId !== user.id || comment.isDeleted) {
        apiError("Comentario no encontrado", 404);
      }

      comment.content = "Comentario eliminado";
      comment.isDeleted = true;
      comment.updatedAt = new Date().toISOString();
      setComments(comments);
      return commentsForRecipe(recipeId, user);
    }

    apiError("Metodo no permitido", 405);
  }

  async function localApi(path, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const url = new URL(path, window.location.origin);

    if (url.pathname === "/api/ping") {
      return { ok: true, mode: "local-storage" };
    }

    if (url.pathname.startsWith("/api/auth/")) {
      return handleAuth(url.pathname, method, options);
    }

    if (url.pathname.startsWith("/api/user/")) {
      return handleUser(url.pathname, method, options);
    }

    if (url.pathname === "/api/recipes") {
      return handleRecipes(url, method, options);
    }

    if (url.pathname === "/api/recipe-votes" && method === "POST") {
      return handleRecipeVotes(options);
    }

    if (url.pathname === "/api/recipe-variant-votes" && method === "POST") {
      return handleVariantVotes(options);
    }

    if (url.pathname === "/api/recipe-saves" && method === "POST") {
      return handleSaves(options);
    }

    if (url.pathname === "/api/recipe-comments") {
      return handleComments(url, method, options);
    }

    apiError("Endpoint local no implementado", 404);
  }

  window.api = localApi;
})();
