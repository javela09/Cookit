// Gestiona la interacción de Cookit con JavaScript plano y APIs en Neon.
(function () {
  const PAGE_SIZE = 12;
  const MAX_IMAGE_SIZE_BYTES = 3 * 1024 * 1024;

  const state = {
    user: null,
    recipes: [],
    variants: [],
    comments: [],
    variantBaseRecipe: null
  };

  const pageState = {
    currentPage: 1,
    filter: "",
    order: "popular",
    search: ""
  };

  // Obtiene el nombre de la página actual para decidir qué datos cargar.
  function getPageName() {
    const path = window.location.pathname.toLowerCase().replace(/\/+$/, "");
    const name = path.split("/").pop() || "index";
    return name.endsWith(".html") ? name.slice(0, -5) : name;
  }

  // Indica si la página actual es el formulario de autenticación.
  function isLoginPage() {
    return getPageName() === "login";
  }

  // Indica si la página actual es la portada.
  function isHomePage() {
    return getPageName() === "index";
  }

  // Indica si la página actual muestra el listado completo.
  function isRecipesPage() {
    return getPageName() === "recipes";
  }

  // Indica si la página actual muestra una receta concreta.
  function isRecipeDetailPage() {
    return getPageName() === "recipe";
  }

  // Indica si la página actual muestra el panel de usuario.
  function isUserPage() {
    return getPageName() === "user";
  }

  // Indica si la pagina actual muestra el formulario de receta.
  function isNewRecipePage() {
    return getPageName() === "newrecipe";
  }

  // Comprueba si existe un bloque concreto en el DOM.
  function hasElement(id) {
    return Boolean(document.getElementById(id));
  }

  // Formatea una fecha como día, mes y año.
  function formatDate(dateStr) {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "";
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  // Formatea una fecha ISO incluyendo hora y minutos.
  function formatDateTime(dateStr) {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return "";
    const base = formatDate(dateStr);
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${base} ${hh}:${mm}`;
  }

  // Convierte un valor numérico en texto de minutos.
  function formatMinutes(value) {
    const minutes = Number(value);
    if (!Number.isFinite(minutes) || minutes <= 0) return "";
    return `${minutes} min`;
  }

  // Divide texto multilínea en elementos limpios.
  function splitLines(value) {
    return String(value || "")
      .split("\n")
      .map(item => item.trim())
      .filter(Boolean);
  }

  // Lee el identificador de receta desde la URL.
  function getCurrentRecipeId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id");
  }

  // Lee el identificador de receta original al crear una variante.
  function getVariantOfId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("variantOf");
  }

  // Busca una receta cargada en memoria por su identificador.
  function getRecipeById(id) {
    return state.recipes.find(recipe => recipe.id === id) || null;
  }

  // Obliga a tener sesión antes de ejecutar acciones privadas.
  function requireUser() {
    if (!state.user) {
      window.location.href = "login.html";
      return false;
    }
    return true;
  }

  // Registra un usuario nuevo en la API.
  async function registerUser(username, email, password) {
    return window.api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, email, password })
    });
  }

  // Inicia sesión con correo y contraseña.
  async function loginUser(email, password) {
    return window.api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
  }

  // Recupera la sesión actual si existe.
  async function loadCurrentUser() {
    try {
      return await window.api("/api/auth/me");
    } catch {
      return null;
    }
  }

  // Cierra la sesión activa en el backend.
  async function logoutUser() {
    return window.api("/api/auth/logout", {
      method: "POST"
    });
  }

  // Actualiza el correo del usuario autenticado.
  async function updateUserEmail(email) {
    return window.api("/api/user/email", {
      method: "PUT",
      body: JSON.stringify({ email })
    });
  }

  // Actualiza la contraseña del usuario autenticado.
  async function updateUserPassword(password) {
    return window.api("/api/user/password", {
      method: "PUT",
      body: JSON.stringify({ password })
    });
  }

  // Inicializa el estado local de sesión.
  async function initSession() {
    const user = await loadCurrentUser();
    state.user = user
      ? {
          id: user.id,
          username: user.username,
          email: user.email
        }
      : null;
  }

  // Redirige fuera de páginas privadas cuando no hay sesión.
  function guardSessionOnEntry() {
    if (isLoginPage()) return;
    if (!state.user) {
      window.location.href = "login.html";
    }
  }

  // Carga recetas desde la API usando el modo adecuado para cada vista.
  async function loadRecipes({ mode = "full" } = {}) {
    try {
      const path = mode === "home"
        ? "/api/recipes?view=summary&order=popular&limit=3"
        : "/api/recipes";
      const recipes = await window.api(path);
      state.recipes = Array.isArray(recipes) ? recipes : [];
    } catch (error) {
      console.error("No se pudieron cargar recetas:", error);
      state.recipes = [];
    }
  }

  // Carga solo la receta necesaria para la página de detalle.
  async function loadRecipeDetail(recipeId) {
    if (!recipeId) {
      state.recipes = [];
      return;
    }

    try {
      const recipe = await window.api(`/api/recipes?recipeId=${encodeURIComponent(recipeId)}`);
      state.recipes = recipe ? [recipe] : [];
    } catch (error) {
      console.error("No se pudo cargar la receta:", error);
      state.recipes = [];
    }
  }

  // Carga las variantes de una receta principal.
  async function loadRecipeVariants(parentRecipeId) {
    if (!parentRecipeId) {
      state.variants = [];
      return;
    }

    try {
      const variants = await window.api(
        `/api/recipes?parentRecipeId=${encodeURIComponent(parentRecipeId)}`
      );
      state.variants = Array.isArray(variants) ? variants : [];
    } catch (error) {
      console.error("No se pudieron cargar variantes:", error);
      state.variants = [];
    }
  }

  // Carga la receta base cuando el formulario se usa para crear una variante.
  async function loadVariantBaseRecipe(parentRecipeId) {
    if (!parentRecipeId) {
      state.variantBaseRecipe = null;
      return;
    }

    try {
      const recipe = await window.api(`/api/recipes?recipeId=${encodeURIComponent(parentRecipeId)}`);
      state.variantBaseRecipe = recipe || null;
    } catch (error) {
      console.error("No se pudo cargar la receta original:", error);
      state.variantBaseRecipe = null;
    }
  }

  // Carga los comentarios de una receta concreta.
  async function loadComments(recipeId) {
    if (!recipeId) {
      state.comments = [];
      return;
    }

    try {
      const comments = await window.api(
        `/api/recipe-comments?recipeId=${encodeURIComponent(recipeId)}`,
        {
          headers: { "x-recipe-id": recipeId }
        }
      );
      state.comments = Array.isArray(comments) ? comments : [];
    } catch (error) {
      console.error("No se pudieron cargar comentarios:", error);
      state.comments = [];
      showCommentFeedback(error.message || "No se pudieron cargar comentarios", true);
    }
  }

  // Cierra sesión local y remota, y vuelve al login.
  async function logout() {
    try {
      await logoutUser();
    } catch (error) {
      console.error("No se pudo cerrar sesion en API:", error.message);
    }
    state.user = null;
    window.location.href = "login.html";
  }

  // Pinta el botón de usuario según la sesión.
  function renderHeaderUser() {
    const btn = document.getElementById("userButton");
    if (!btn) return;

    if (state.user) {
      btn.textContent = state.user.username;
      btn.dataset.mode = "user";
      btn.classList.add("navUserHasMenu");
      btn.onclick = () => {
        window.location.href = "user.html";
      };
      attachLogoutMenu(btn);
      return;
    }

    btn.textContent = "Login";
    btn.dataset.mode = "login";
    btn.classList.remove("navUserHasMenu");
    btn.onmouseenter = null;
    btn.onmouseleave = null;
    btn.onclick = () => {
      window.location.href = "login.html";
    };
  }

  // Añade el menú flotante de logout al botón de usuario.
  function attachLogoutMenu(btn) {
    let menu = document.getElementById("logoutMenu");
    if (!menu) {
      menu = document.createElement("div");
      menu.id = "logoutMenu";
      menu.className = "logoutMenu";
      const item = document.createElement("button");
      item.textContent = "Logout";
      item.type = "button";
      item.onclick = async (event) => {
        event.stopPropagation();
        await logout();
      };
      menu.appendChild(item);
      document.body.appendChild(menu);
    }

    // Posiciona el menú junto al botón de usuario.
    const showMenu = () => {
      const rect = btn.getBoundingClientRect();
      menu.style.top = `${rect.bottom + window.scrollY + 6}px`;
      menu.style.minWidth = `${rect.width}px`;
      menu.classList.add("open");
      const menuWidth = menu.offsetWidth || rect.width;
      menu.style.left = `${rect.right + window.scrollX - menuWidth}px`;
    };

    // Oculta el menú cuando el clic queda fuera.
    const hideMenu = event => {
      if (!menu.contains(event.target) && event.target !== btn) {
        menu.classList.remove("open");
      }
    };

    btn.onmouseenter = showMenu;
    btn.onmouseleave = () => {
      setTimeout(() => {
        if (!menu.matches(":hover")) menu.classList.remove("open");
      }, 150);
    };
    menu.onmouseleave = () => {
      menu.classList.remove("open");
    };

    if (!btn.dataset.logoutBound) {
      document.addEventListener("click", hideMenu);
      btn.dataset.logoutBound = "1";
    }
  }

  // Navega al detalle de una receta.
  function goToDetail(id) {
    window.location.href = `recipe.html?id=${encodeURIComponent(id)}`;
  }

  // Obtiene la receta principal a la que debe asociarse una variante.
  function getParentRecipeId(recipe) {
    return recipe?.parentRecipeId || recipe?.id || null;
  }

  // Renderiza las recetas mejor valoradas en portada.
  function renderBestValued() {
    const container = document.getElementById("bestValuedList");
    if (!container) return;

    const top = [...state.recipes]
      .sort((a, b) => (b.votes || 0) - (a.votes || 0))
      .slice(0, 3);

    container.innerHTML = "";

    if (!top.length) {
      container.innerHTML = "<p>No hay recetas destacadas todavia.</p>";
      return;
    }

    top.forEach(recipe => {
      const article = document.createElement("article");
      article.className = "recipeCard";
      const mediaStyle = recipe.image ? `style="background-image:url('${recipe.image}')"` : "";
      article.innerHTML = `
        <div class="recipeMedia" ${mediaStyle} aria-hidden="true"></div>
        <div class="cardInfo">
          <h3>${recipe.title}</h3>
          <p class="author">por ${recipe.author}</p>
          <p class="description">${recipe.description}</p>
          <div class="cardMeta">
            <span>Publicada el ${formatDate(recipe.date)}</span>
            <span class="votes">${recipe.votes || 0} votos</span>
          </div>
        </div>`;
      article.addEventListener("click", () => goToDetail(recipe.id));
      container.appendChild(article);
    });
  }

  // Aplica búsqueda, filtros, ordenación y paginación al listado.
  function applyFiltersAndRender() {
    const grid = document.getElementById("recipesGrid");
    if (!grid) return;

    const searchInput = document.getElementById("searchInput");
    const filterSelect = document.getElementById("filterSelect");
    const orderSelect = document.getElementById("orderSelect");

    if (searchInput) pageState.search = searchInput.value.toLowerCase().trim();
    if (filterSelect) pageState.filter = filterSelect.value;
    if (orderSelect) pageState.order = orderSelect.value;

    let list = [...state.recipes];

    if (pageState.search) {
      list = list.filter(recipe => {
        const text = `${recipe.title} ${recipe.description} ${(recipe.ingredients || []).join(" ")}`.toLowerCase();
        return text.includes(pageState.search);
      });
    }

    if (pageState.filter) {
      list = list.filter(
        recipe => Array.isArray(recipe.categories) && recipe.categories.includes(pageState.filter)
      );
    }

    if (pageState.order === "popular" || pageState.order === "valoradas") {
      list.sort((a, b) => (b.votes || 0) - (a.votes || 0));
    } else if (pageState.order === "nuevas") {
      list.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (pageState.currentPage > totalPages) pageState.currentPage = totalPages;
    const start = (pageState.currentPage - 1) * PAGE_SIZE;
    const pageItems = list.slice(start, start + PAGE_SIZE);

    grid.innerHTML = "";

    if (!pageItems.length) {
      grid.innerHTML = "<p>No hay recetas publicadas todavia.</p>";
    }

    pageItems.forEach(recipe => {
      const article = document.createElement("article");
      article.className = "recipeTile";
      const mediaStyle = recipe.image ? `style="background-image:url('${recipe.image}')"` : "";
      article.innerHTML = `
        <div class="tileMedia" ${mediaStyle} aria-hidden="true"></div>
        <h3>${recipe.title}</h3>
        <p class="tileAuthor">por ${recipe.author}</p>
        <p class="tileDescription">${recipe.description}</p>
        <div class="tileMeta">
          <span>${formatDate(recipe.date)}</span>
          <span class="votes">${recipe.votes || 0} votos</span>
        </div>
        <div class="tileActions">
          <button class="secondaryButton" data-action="save">${recipe.saved ? "Guardado" : "Guardar"}</button>
          <button class="ghostButton" data-action="vote">${recipe.voted ? "Retirar voto" : "Votar"}</button>
        </div>`;

      article.addEventListener("click", event => {
        if (event.target.closest("button")) return;
        goToDetail(recipe.id);
      });

      article.querySelector("[data-action='save']").addEventListener("click", async event => {
        event.stopPropagation();
        await toggleSave(recipe.id);
      });

      article.querySelector("[data-action='vote']").addEventListener("click", async event => {
        event.stopPropagation();
        await voteRecipe(recipe.id);
      });

      grid.appendChild(article);
    });

    renderPagination(totalPages);
  }

  // Renderiza los controles de paginación del listado.
  function renderPagination(totalPages) {
    const pagination = document.getElementById("pagination");
    const prevBtn = document.getElementById("prevPage");
    const nextBtn = document.getElementById("nextPage");
    if (!pagination || !prevBtn || !nextBtn) return;

    pagination.innerHTML = "";

    for (let i = 1; i <= totalPages; i += 1) {
      const btn = document.createElement("button");
      btn.className = `pageBtn${i === pageState.currentPage ? " active" : ""}`;
      btn.textContent = i;
      btn.addEventListener("click", () => {
        pageState.currentPage = i;
        applyFiltersAndRender();
      });
      pagination.appendChild(btn);
    }

    prevBtn.disabled = pageState.currentPage === 1;
    nextBtn.disabled = pageState.currentPage === totalPages;

    prevBtn.onclick = () => {
      if (pageState.currentPage > 1) {
        pageState.currentPage -= 1;
        applyFiltersAndRender();
      }
    };

    nextBtn.onclick = () => {
      if (pageState.currentPage < totalPages) {
        pageState.currentPage += 1;
        applyFiltersAndRender();
      }
    };
  }

  // Alterna el estado de guardado de una receta.
  async function toggleSave(recipeId) {
    if (!requireUser()) return;

    try {
      const result = await window.api("/api/recipe-saves", {
        method: "POST",
        body: JSON.stringify({ recipeId })
      });

      const recipe = getRecipeById(recipeId);
      if (recipe) recipe.saved = Boolean(result.saved);
      renderAll();
    } catch (error) {
      alert(error.message || "No se pudo actualizar guardados");
    }
  }

  // Alterna el voto de una receta y actualiza el contador local.
  async function voteRecipe(recipeId) {
    if (!requireUser()) return;

    try {
      const result = await window.api("/api/recipe-votes", {
        method: "POST",
        body: JSON.stringify({ recipeId })
      });

      const recipe = getRecipeById(recipeId);
      if (recipe) {
        recipe.voted = Boolean(result.voted);
        recipe.votes = Number(result.votes || 0);
      }
      renderAll();
    } catch (error) {
      alert(error.message || "No se pudo actualizar el voto");
    }
  }

  // Alterna el voto de una variante y actualiza el contador local.
  async function voteVariant(variantId) {
    if (!requireUser()) return;

    try {
      const result = await window.api("/api/recipe-variant-votes", {
        method: "POST",
        body: JSON.stringify({ variantId })
      });

      const current = getRecipeById(variantId);
      if (current) {
        current.voted = Boolean(result.voted);
        current.votes = Number(result.votes || 0);
      }

      const variant = state.variants.find(item => item.id === variantId);
      if (variant) {
        variant.voted = Boolean(result.voted);
        variant.votes = Number(result.votes || 0);
      }
      renderAll();
    } catch (error) {
      alert(error.message || "No se pudo actualizar el voto de la variante");
    }
  }

  // Elimina de forma lógica una receta publicada por el usuario.
  async function deletePublished(recipeId) {
    if (!requireUser()) return;

    const recipe = getRecipeById(recipeId);
    if (!recipe) return;
    if (recipe.authorId !== state.user.id) return;

    const confirmed = window.confirm("Se eliminara la publicacion. Quieres continuar?");
    if (!confirmed) return;

    try {
      await window.api(`/api/recipes?recipeId=${encodeURIComponent(recipeId)}`, {
        method: "DELETE"
      });

      state.recipes = state.recipes.filter(item => item.id !== recipeId);
      renderAll();
    } catch (error) {
      alert(error.message || "No se pudo eliminar la receta");
    }
  }

  // Quita una receta de la lista de guardadas.
  async function deleteSaved(recipeId) {
    if (!requireUser()) return;
    const recipe = getRecipeById(recipeId);
    if (!recipe || !recipe.saved) return;
    await toggleSave(recipeId);
  }

  // Construye una tarjeta del panel de usuario.
  function createUserRecipeCard(recipe, isMine) {
    const card = document.createElement("article");
    card.className = "userRecipeCard";
    const mediaStyle = recipe.image ? `style="background-image:url('${recipe.image}')"` : "";
    card.innerHTML = `
      <div class="tileMedia" ${mediaStyle} aria-hidden="true"></div>
      <h3>${recipe.title}</h3>
      <p class="tileAuthor">${isMine ? "Publicado por ti" : `de ${recipe.author}`}</p>
      <p class="tileDescription">${recipe.description}</p>
      <div class="tileMeta">
        <span>${formatDate(recipe.date)}</span>
        <span class="votes">${recipe.votes || 0} votos</span>
      </div>
      <div class="tileActions">
        <button class="dangerButton">${isMine ? "Eliminar publicacion" : "Eliminar de guardadas"}</button>
      </div>`;

    card.addEventListener("click", () => goToDetail(recipe.id));
    card.querySelector(".dangerButton").addEventListener("click", async event => {
      event.stopPropagation();
      if (isMine) {
        await deletePublished(recipe.id);
      } else {
        await deleteSaved(recipe.id);
      }
    });

    return card;
  }

  // Renderiza recetas propias, guardadas y datos de perfil.
  function renderUserLists() {
    const myContainer = document.getElementById("myRecipes");
    const savedContainer = document.getElementById("savedRecipes");
    const usernameField = document.getElementById("usernameField");
    const emailField = document.getElementById("emailField");

    if (usernameField) usernameField.value = state.user ? state.user.username : "";
    if (emailField) emailField.value = state.user ? state.user.email : "";
    if (!myContainer || !savedContainer || !state.user) return;

    const myRecipes = state.recipes.filter(recipe => recipe.authorId === state.user.id);
    const savedRecipes = state.recipes.filter(recipe => recipe.saved);

    myContainer.innerHTML = "";
    savedContainer.innerHTML = "";

    if (!myRecipes.length) {
      myContainer.innerHTML = "<p>No has publicado recetas todavia.</p>";
    } else {
      myRecipes.forEach(recipe => {
        myContainer.appendChild(createUserRecipeCard(recipe, true));
      });
    }

    if (!savedRecipes.length) {
      savedContainer.innerHTML = "<p>No tienes recetas guardadas.</p>";
    } else {
      savedRecipes.forEach(recipe => {
        savedContainer.appendChild(createUserRecipeCard(recipe, false));
      });
    }
  }

  // Muestra mensajes breves de acciones del detalle.
  function showDetailFeedback(message, isError = false) {
    const feedback = document.getElementById("detailFeedback");
    if (!feedback) return;
    feedback.textContent = message || "";
    feedback.classList.toggle("isError", Boolean(message && isError));
    feedback.classList.toggle("isSuccess", Boolean(message && !isError));
  }

  // Ejecuta las acciones de compartir disponibles para una receta.
  async function shareRecipe(recipe, action) {
    const url = window.location.href;
    const title = recipe?.title || "Receta de Cookit";

    if (action === "whatsapp") {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`,
        "_blank",
        "noopener"
      );
      return;
    }

    if (action === "facebook") {
      window.open(
        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
        "_blank",
        "noopener"
      );
      return;
    }

    if (action === "copy") {
      if (!navigator.clipboard) {
        showDetailFeedback("Tu navegador no permite copiar el enlace automaticamente.", true);
        return;
      }

      try {
        await navigator.clipboard.writeText(url);
        showDetailFeedback("Enlace copiado", false);
      } catch {
        showDetailFeedback("No se pudo copiar el enlace automaticamente.", true);
      }
      return;
    }

    showDetailFeedback("Accion de compartir no disponible.", true);
  }

  // Renderiza la informacion principal de una receta.
  function renderRecipeDetail() {
    const detail = document.getElementById("recipeDetail");
    if (!detail) return null;

    const recipeId = getCurrentRecipeId();
    const recipe = getRecipeById(recipeId);

    if (!recipe) {
      detail.innerHTML = "<p>No se encontro la receta.</p>";
      const commentsList = document.getElementById("commentsList");
      if (commentsList) commentsList.innerHTML = "<p>No hay comentarios para mostrar.</p>";
      return null;
    }

    const titleEl = document.getElementById("detailTitle");
    const descEl = document.getElementById("detailDescription");
    const authorEl = document.getElementById("detailAuthor");
    const timeEl = document.getElementById("detailTime");
    const votesEl = document.getElementById("detailVotes");
    const tagsEl = document.getElementById("detailTags");
    const ingEl = document.getElementById("detailIngredients");
    const stepsEl = document.getElementById("detailSteps");
    const mediaEl = document.getElementById("detailMedia");
    const voteBtn = document.getElementById("detailVoteButton");
    const voteCountEl = document.getElementById("detailVoteCount");
    const newVariantBtn = document.getElementById("newVariantButton");

    if (titleEl) titleEl.textContent = recipe.title;
    if (descEl) descEl.textContent = recipe.description;
    if (authorEl) authorEl.textContent = `por ${recipe.author}`;
    if (timeEl) timeEl.textContent = formatMinutes(recipe.time);
    if (votesEl) votesEl.textContent = `${recipe.votes || 0} votos`;
    if (voteCountEl) voteCountEl.textContent = `${recipe.votes || 0} votos`;

    if (voteBtn) {
      voteBtn.textContent = recipe.voted ? "Retirar voto" : "Votar";
      voteBtn.onclick = async () => {
        if (recipe.isVariant) {
          await voteVariant(recipe.id);
        } else {
          await voteRecipe(recipe.id);
        }
      };
    }

    document.querySelectorAll("[data-share-action]").forEach(button => {
      button.onclick = async () => {
        await shareRecipe(recipe, button.dataset.shareAction);
      };
    });

    if (newVariantBtn) {
      const parentRecipeId = getParentRecipeId(recipe);
      newVariantBtn.href = parentRecipeId
        ? `newrecipe.html?variantOf=${encodeURIComponent(parentRecipeId)}`
        : "newrecipe.html";
    }

    if (tagsEl) {
      tagsEl.innerHTML = "";
      (recipe.categories || []).forEach(category => {
        const span = document.createElement("span");
        span.className = "tag";
        span.textContent = category;
        tagsEl.appendChild(span);
      });
    }

    if (ingEl) {
      ingEl.innerHTML = "";
      (recipe.ingredients || []).forEach(ingredient => {
        const li = document.createElement("li");
        li.textContent = ingredient;
        ingEl.appendChild(li);
      });
    }

    if (stepsEl) {
      stepsEl.innerHTML = "";
      (recipe.steps || []).forEach(step => {
        const li = document.createElement("li");
        li.textContent = step;
        stepsEl.appendChild(li);
      });
    }

    if (mediaEl) {
      mediaEl.style.backgroundImage = recipe.image ? `url('${recipe.image}')` : "";
    }

    return recipe;
  }

  // Construye una tarjeta de variante reutilizando la estructura visual del perfil.
  function createVariantRecipeCard(recipe) {
    const card = document.createElement("article");
    card.className = "userRecipeCard";
    const mediaStyle = recipe.image ? `style="background-image:url('${recipe.image}')"` : "";
    card.innerHTML = `
      <div class="tileMedia" ${mediaStyle} aria-hidden="true"></div>
      <h3>${recipe.title}</h3>
      <p class="tileAuthor">de ${recipe.author}</p>
      <p class="tileDescription">${recipe.description}</p>
      <div class="tileMeta">
        <span>${formatDate(recipe.date)}</span>
        <span class="votes">${recipe.votes || 0} votos</span>
      </div>`;

    card.addEventListener("click", () => goToDetail(recipe.id));
    return card;
  }

  // Renderiza la cinta horizontal de variantes asociadas a la receta principal.
  function renderRecipeVariants() {
    const container = document.getElementById("recipeVariantsList");
    if (!container) return;

    const recipe = getRecipeById(getCurrentRecipeId());
    const variants = [...state.variants]
      .filter(variant => !recipe || variant.id !== recipe.id)
      .sort((a, b) => (b.votes || 0) - (a.votes || 0));

    container.innerHTML = "";

    if (!variants.length) {
      container.innerHTML = "<p>Todavia no hay variantes para esta receta.</p>";
      return;
    }

    variants.forEach(variant => {
      container.appendChild(createVariantRecipeCard(variant));
    });
  }

  // Determina si un comentario fue editado tras crearse.
  function hasCommentBeenEdited(comment) {
    const created = new Date(comment.createdAt);
    const updated = new Date(comment.updatedAt);
    if (Number.isNaN(created.getTime()) || Number.isNaN(updated.getTime())) return false;
    return updated.getTime() - created.getTime() > 1000;
  }

  // Muestra mensajes generales del sistema de comentarios.
  function showCommentFeedback(message, isError = true) {
    const feedback = document.getElementById("commentFeedback");
    if (!feedback) return;
    feedback.textContent = message || "";
    feedback.classList.toggle("isError", Boolean(message && isError));
    feedback.classList.toggle("isSuccess", Boolean(message && !isError));
  }

  // Crea un mensaje de feedback para formularios inline.
  function createInlineFeedback(message, isError = true) {
    const feedback = document.createElement("p");
    feedback.className = "inlineCommentFeedback";
    feedback.textContent = message;
    feedback.classList.toggle("isError", isError);
    feedback.classList.toggle("isSuccess", !isError);
    return feedback;
  }

  // Actualiza o crea el feedback de un formulario inline.
  function setInlineFormFeedback(form, message, isError = true) {
    let feedback = form.querySelector(".inlineCommentFeedback");
    if (!feedback) {
      feedback = createInlineFeedback("", isError);
      form.appendChild(feedback);
    }
    feedback.textContent = message;
    feedback.classList.toggle("isError", isError);
    feedback.classList.toggle("isSuccess", !isError);
  }

  // Agrupa comentarios por comentario padre para renderizar respuestas.
  function buildCommentChildrenMap() {
    const map = new Map();
    state.comments.forEach(comment => {
      const key = comment.parentCommentId || "root";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(comment);
    });
    return map;
  }

  // Crea el formulario inline de respuesta o edición.
  function createInlineForm(comment, mode) {
    const form = document.createElement("form");
    form.className = "inlineCommentForm";
    form.dataset.mode = mode;
    form.dataset.commentId = comment.id;

    const textarea = document.createElement("textarea");
    textarea.maxLength = 1000;
    textarea.required = true;
    textarea.placeholder = mode === "reply" ? "Escribe tu respuesta..." : "Edita tu comentario...";
    textarea.value = mode === "edit" ? comment.content : "";
    form.appendChild(textarea);

    const actions = document.createElement("div");
    actions.className = "commentActions";

    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.className = "primaryButton commentActionBtn";
    submitBtn.textContent = mode === "reply" ? "Responder" : "Guardar";
    actions.appendChild(submitBtn);

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "ghostButton commentActionBtn";
    cancelBtn.dataset.commentAction = "cancel-inline";
    cancelBtn.dataset.commentId = comment.id;
    cancelBtn.textContent = "Cancelar";
    actions.appendChild(cancelBtn);

    form.appendChild(actions);
    return form;
  }

  // Crea un nodo visual de comentario con sus acciones.
  function createCommentItem(comment, childrenMap, depth = 0) {
    const item = document.createElement("article");
    item.className = "commentItem";
    item.dataset.commentId = comment.id;
    if (depth > 0) item.classList.add("isReply");
    if (comment.isDeleted) item.classList.add("isDeleted");

    const header = document.createElement("div");
    header.className = "commentHeader";

    const author = document.createElement("strong");
    author.textContent = comment.author || "Usuario";
    header.appendChild(author);

    const meta = document.createElement("span");
    const edited = !comment.isDeleted && hasCommentBeenEdited(comment);
    meta.textContent = `${formatDateTime(comment.createdAt)}${edited ? " (editado)" : ""}`;
    header.appendChild(meta);
    item.appendChild(header);

    const body = document.createElement("p");
    body.className = "commentBody";
    body.textContent = comment.content || "";
    item.appendChild(body);

    const actions = document.createElement("div");
    actions.className = "commentActions";

    if (state.user && !comment.isDeleted) {
      const replyBtn = document.createElement("button");
      replyBtn.type = "button";
      replyBtn.className = "ghostButton commentActionBtn";
      replyBtn.dataset.commentAction = "reply";
      replyBtn.dataset.commentId = comment.id;
      replyBtn.textContent = "Responder";
      actions.appendChild(replyBtn);

      const reportBtn = document.createElement("button");
      reportBtn.type = "button";
      reportBtn.className = "reportButton commentActionBtn";
      reportBtn.dataset.commentAction = "report";
      reportBtn.dataset.commentId = comment.id;
      reportBtn.textContent = "Reportar";
      actions.appendChild(reportBtn);
    }

    if (comment.canEdit) {
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "secondaryButton commentActionBtn";
      editBtn.dataset.commentAction = "edit";
      editBtn.dataset.commentId = comment.id;
      editBtn.textContent = "Editar";
      actions.appendChild(editBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "dangerButton commentActionBtn";
      deleteBtn.dataset.commentAction = "delete";
      deleteBtn.dataset.commentId = comment.id;
      deleteBtn.textContent = "Eliminar";
      actions.appendChild(deleteBtn);
    }

    if (actions.children.length > 0) {
      item.appendChild(actions);
    }

    const inlineHost = document.createElement("div");
    inlineHost.className = "inlineCommentHost";
    item.appendChild(inlineHost);

    const children = childrenMap.get(comment.id) || [];
    if (children.length > 0) {
      const childrenWrap = document.createElement("div");
      childrenWrap.className = "commentChildren";
      children.forEach(child => {
        childrenWrap.appendChild(createCommentItem(child, childrenMap, depth + 1));
      });
      item.appendChild(childrenWrap);
    }

    return item;
  }

  // Renderiza el árbol completo de comentarios.
  function renderComments() {
    const list = document.getElementById("commentsList");
    if (!list) return;

    list.innerHTML = "";

    if (!state.comments.length) {
      list.innerHTML = "<p>No hay comentarios todavia. Se el primero en comentar.</p>";
      return;
    }

    const childrenMap = buildCommentChildrenMap();
    const roots = childrenMap.get("root") || [];
    roots.forEach(comment => {
      list.appendChild(createCommentItem(comment, childrenMap, 0));
    });
  }

  // Publica un comentario o respuesta y refresca la lista.
  async function postComment({ recipeId, content, parentCommentId = null }) {
    const payload = {
      recipeId,
      content
    };

    if (parentCommentId) {
      payload.parentCommentId = parentCommentId;
    }

    const comments = await window.api("/api/recipe-comments", {
      method: "POST",
      headers: { "x-recipe-id": recipeId },
      body: JSON.stringify(payload)
    });

    state.comments = Array.isArray(comments) ? comments : [];
    renderComments();
  }

  // Edita un comentario propio y refresca la lista.
  async function editComment({ recipeId, commentId, content }) {
    const comments = await window.api("/api/recipe-comments", {
      method: "PUT",
      headers: { "x-recipe-id": recipeId },
      body: JSON.stringify({ recipeId, commentId, content })
    });

    state.comments = Array.isArray(comments) ? comments : [];
    renderComments();
  }

  // Elimina lógicamente un comentario propio y refresca la lista.
  async function deleteComment({ recipeId, commentId }) {
    const comments = await window.api("/api/recipe-comments", {
      method: "DELETE",
      headers: { "x-recipe-id": recipeId },
      body: JSON.stringify({ recipeId, commentId })
    });

    state.comments = Array.isArray(comments) ? comments : [];
    renderComments();
  }

  // Vincula el formulario principal de comentarios.
  function bindMainCommentForm() {
    const form = document.getElementById("mainCommentForm");
    if (!form || form.dataset.bound) return;

    form.dataset.bound = "1";
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (!requireUser()) return;

      const recipeId = getCurrentRecipeId();
      const input = document.getElementById("mainCommentInput");
      const content = input ? input.value.trim() : "";

      if (!recipeId) {
        showCommentFeedback("No se pudo identificar la receta", true);
        return;
      }

      if (!content) {
        showCommentFeedback("Escribe un comentario antes de publicar", true);
        return;
      }

      try {
        await postComment({ recipeId, content });
        if (input) input.value = "";
        showCommentFeedback("Comentario publicado", false);
      } catch (error) {
        showCommentFeedback(error.message || "No se pudo publicar el comentario", true);
      }
    });
  }

  // Abre o cierra un formulario inline para responder o editar.
  function openInlineCommentForm(commentId, mode) {
    const comment = state.comments.find(item => item.id === commentId);
    if (!comment) return;

    const item = document.querySelector(`.commentItem[data-comment-id="${commentId}"]`);
    if (!item) return;

    const host = item.querySelector(".inlineCommentHost");
    if (!host) return;

    if (host.dataset.mode === mode) {
      host.innerHTML = "";
      host.dataset.mode = "";
      return;
    }

    host.innerHTML = "";
    host.dataset.mode = mode;
    host.appendChild(createInlineForm(comment, mode));
  }

  // Vincula acciones delegadas de comentarios y formularios inline.
  function bindCommentsListInteractions() {
    const list = document.getElementById("commentsList");
    if (!list || list.dataset.bound) return;

    list.dataset.bound = "1";

    list.addEventListener("click", async event => {
      const button = event.target.closest("[data-comment-action]");
      if (!button) return;

      const action = button.dataset.commentAction;
      const commentId = button.dataset.commentId;
      const recipeId = getCurrentRecipeId();

      if (!recipeId || !commentId) return;

      if (action === "report") {
        showCommentFeedback("Reporte pendiente de implementar.", false);
        return;
      }

      if (action === "reply" || action === "edit") {
        openInlineCommentForm(commentId, action);
        return;
      }

      if (action === "cancel-inline") {
        const item = document.querySelector(`.commentItem[data-comment-id="${commentId}"]`);
        const host = item?.querySelector(".inlineCommentHost");
        if (host) {
          host.innerHTML = "";
          host.dataset.mode = "";
        }
        return;
      }

      if (action === "delete") {
        const confirmed = window.confirm("Este comentario se eliminara de forma logica. Continuar?");
        if (!confirmed) return;

        try {
          await deleteComment({ recipeId, commentId });
          showCommentFeedback("Comentario eliminado", false);
        } catch (error) {
          showCommentFeedback(error.message || "No se pudo eliminar el comentario", true);
        }
      }
    });

    list.addEventListener("submit", async event => {
      const form = event.target.closest(".inlineCommentForm");
      if (!form) return;
      event.preventDefault();

      const recipeId = getCurrentRecipeId();
      const commentId = form.dataset.commentId;
      const mode = form.dataset.mode;
      const textarea = form.querySelector("textarea");
      const content = textarea ? textarea.value.trim() : "";

      if (!recipeId || !commentId || !mode) return;
      if (!content) {
        setInlineFormFeedback(form, "El contenido no puede estar vacio", true);
        return;
      }

      try {
        if (mode === "reply") {
          await postComment({ recipeId, content, parentCommentId: commentId });
          showCommentFeedback("Respuesta publicada", false);
        } else if (mode === "edit") {
          await editComment({ recipeId, commentId, content });
          showCommentFeedback("Comentario actualizado", false);
        }
      } catch (error) {
        setInlineFormFeedback(
          form,
          error.message || "No se pudo completar la accion",
          true
        );
      }
    });
  }

  // Vincula el botón de filtros del listado.
  function bindFilters() {
    const applyBtn = document.querySelector(".filtersBar .primaryButton");
    if (!applyBtn || applyBtn.dataset.bound) return;

    applyBtn.dataset.bound = "1";
    applyBtn.onclick = event => {
      event.preventDefault();
      pageState.currentPage = 1;
      applyFiltersAndRender();
    };
  }

  // Vincula las acciones del panel de usuario.
  function bindUserPanel() {
    const updateEmailBtn = document.getElementById("updateEmail");
    const updatePasswordBtn = document.getElementById("updatePassword");
    const emailField = document.getElementById("emailField");
    const passwordField = document.getElementById("passwordField");

    if (updateEmailBtn && emailField && !updateEmailBtn.dataset.bound) {
      updateEmailBtn.dataset.bound = "1";
      updateEmailBtn.onclick = async () => {
        if (!requireUser()) return;

        const nextEmail = emailField.value.trim();
        if (!nextEmail) {
          alert("Introduce un correo valido");
          return;
        }

        try {
          const user = await updateUserEmail(nextEmail);
          state.user = { ...state.user, email: user.email };
          alert("Correo actualizado");
        } catch (error) {
          alert(error.message || "No se pudo actualizar el correo");
        }
      };
    }

    if (updatePasswordBtn && passwordField && !updatePasswordBtn.dataset.bound) {
      updatePasswordBtn.dataset.bound = "1";
      updatePasswordBtn.onclick = async () => {
        if (!requireUser()) return;

        const nextPassword = passwordField.value.trim();
        if (!nextPassword) {
          alert("Introduce una contrasena valida");
          return;
        }

        try {
          await updateUserPassword(nextPassword);
          passwordField.value = "";
          alert("Contrasena actualizada");
        } catch (error) {
          alert(error.message || "No se pudo actualizar la contrasena");
        }
      };
    }
  }

  // Vincula los botones de login y registro.
  function bindAuthForms() {
    const loginBtn = document.getElementById("loginSubmit");
    const registerBtn = document.getElementById("registerSubmit");

    if (loginBtn && !loginBtn.dataset.bound) {
      loginBtn.dataset.bound = "1";
      loginBtn.onclick = async event => {
        event.preventDefault();
        await handleLogin();
      };
    }

    if (registerBtn && !registerBtn.dataset.bound) {
      registerBtn.dataset.bound = "1";
      registerBtn.onclick = async event => {
        event.preventDefault();
        await handleRegister();
      };
    }
  }

  // Lee los campos del formulario de autenticación.
  function getAuthFields() {
    const username = document.getElementById("authUsername")?.value.trim() || "";
    const email = document.getElementById("authEmail")?.value.trim() || "";
    const password = document.getElementById("authPassword")?.value.trim() || "";
    return { username, email, password };
  }

  // Muestra mensajes del formulario de autenticación.
  function showAuthFeedback(message, isError = true) {
    const feedback = document.getElementById("authFeedback");
    if (!feedback) return;
    feedback.style.color = isError ? "#7b1e1e" : "#2f3a18";
    feedback.textContent = message;
  }

  // Gestiona el estado visual de la página de autenticación.
  function renderAuthPage() {
    const title = document.getElementById("authTitle");
    if (!title) return;

    if (state.user) {
      title.textContent = "Ya estas autenticado";
      showAuthFeedback("Redirigiendo a tu panel...", false);
      setTimeout(() => {
        window.location.href = "user.html";
      }, 800);
    }
  }

  // Procesa el envío de login.
  async function handleLogin() {
    const { email, password } = getAuthFields();

    if (!email || !password) {
      showAuthFeedback("Completa correo y contrasena");
      return;
    }

    try {
      const user = await loginUser(email, password);
      state.user = {
        id: user.id,
        username: user.username,
        email: user.email
      };

      showAuthFeedback("Login correcto, entrando...", false);
      setTimeout(() => {
        window.location.href = "index.html";
      }, 600);
    } catch (error) {
      showAuthFeedback(error.message || "Credenciales incorrectas");
    }
  }

  // Procesa el alta de nuevos usuarios.
  async function handleRegister() {
    const { username, email, password } = getAuthFields();

    if (!username || !email || !password) {
      showAuthFeedback("Completa usuario, correo y contrasena");
      return;
    }

    try {
      await registerUser(username, email, password);
      showAuthFeedback(
        "Registro correcto. Ahora inicia sesion con tu correo y contrasena.",
        false
      );
      const passwordInput = document.getElementById("authPassword");
      if (passwordInput) passwordInput.value = "";
    } catch (error) {
      showAuthFeedback(error.message || "No se pudo completar el registro");
    }
  }

  // Adapta el formulario de receta cuando se usa para crear una variante.
  function renderNewRecipeMode() {
    const form = document.getElementById("newRecipeForm");
    const variantOfId = getVariantOfId();
    if (!form || !variantOfId) return;

    const title = document.getElementById("newRecipeTitle");
    const lead = document.getElementById("newRecipeLead");
    const submitBtn = document.getElementById("newRecipeSubmit");
    const imageField = document.getElementById("newImageField");
    const imageInput = document.getElementById("newImage");

    if (title) title.textContent = "Nueva variante";
    if (lead) lead.textContent = "Revisa los datos base y ajusta tu variante. Se reutilizara la imagen de la receta original.";
    if (submitBtn) submitBtn.textContent = "Publicar variante";
    if (imageField) imageField.hidden = true;
    if (imageInput) {
      imageInput.required = false;
      imageInput.disabled = true;
      imageInput.value = "";
    }

    const baseRecipe = state.variantBaseRecipe;
    if (!baseRecipe || form.dataset.variantPrefilled) return;

    const titleField = document.getElementById("newTitle");
    const timeField = document.getElementById("newTime");
    const descriptionField = document.getElementById("newDescription");
    const ingredientsField = document.getElementById("newIngredients");
    const stepsField = document.getElementById("newSteps");

    if (titleField) titleField.value = `Variante de ${baseRecipe.title}`;
    if (timeField) timeField.value = formatMinutes(baseRecipe.time);
    if (descriptionField) descriptionField.value = baseRecipe.description || "";
    if (ingredientsField) ingredientsField.value = (baseRecipe.ingredients || []).join("\n");
    if (stepsField) stepsField.value = (baseRecipe.steps || []).join("\n");

    document.querySelectorAll("#newCategories input[type='checkbox']").forEach(node => {
      node.checked = Array.isArray(baseRecipe.categories) && baseRecipe.categories.includes(node.value);
    });

    form.dataset.variantPrefilled = "1";
  }

  // Vincula el formulario de creacion de receta.
  function bindNewRecipeForm() {
    const form = document.getElementById("newRecipeForm");
    if (!form || form.dataset.bound) return;
    form.dataset.bound = "1";

    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (!requireUser()) return;

      const title = document.getElementById("newTitle")?.value.trim() || "";
      const description = document.getElementById("newDescription")?.value.trim() || "";
      const timeRaw = document.getElementById("newTime")?.value.trim() || "";
      const categoriesNodes = Array.from(
        document.querySelectorAll("#newCategories input[type='checkbox']:checked")
      );
      const categories = categoriesNodes.map(node => node.value);
      const ingredients = splitLines(document.getElementById("newIngredients")?.value || "");
      const steps = splitLines(document.getElementById("newSteps")?.value || "");
      const imageFile = document.getElementById("newImage")?.files?.[0] || null;
      const variantOfId = getVariantOfId();
      const isVariant = Boolean(variantOfId);

      const timeMinutes = Number.parseInt(timeRaw, 10);

      if (!title || !description || !timeRaw || !categories.length || !ingredients.length || !steps.length) {
        alert("Completa todos los campos");
        return;
      }

      if (!Number.isFinite(timeMinutes) || timeMinutes <= 0) {
        alert("Introduce el tiempo en minutos");
        return;
      }

      if (!isVariant && !imageFile) {
        alert("Selecciona una imagen local para la receta");
        return;
      }

      if (!isVariant && (!imageFile.type || !imageFile.type.startsWith("image/"))) {
        alert("El archivo debe ser una imagen valida");
        return;
      }

      if (!isVariant && imageFile.size > MAX_IMAGE_SIZE_BYTES) {
        alert("La imagen no puede superar 3MB");
        return;
      }

      const submitBtn = form.querySelector("button[type='submit']");
      if (submitBtn) submitBtn.disabled = true;

      try {
        const payload = new FormData();
        payload.append("title", title);
        payload.append("description", description);
        payload.append("timeMinutes", String(timeMinutes));
        payload.append("categories", JSON.stringify(categories));
        payload.append("ingredients", JSON.stringify(ingredients));
        payload.append("steps", JSON.stringify(steps));
        if (isVariant) {
          payload.append("parentRecipeId", variantOfId);
        } else {
          payload.append("imageFile", imageFile);
        }

        const createdRecipe = await window.api("/api/recipes", {
          method: "POST",
          body: payload
        });

        window.location.href = `recipe.html?id=${encodeURIComponent(createdRecipe.id)}`;
      } catch (error) {
        alert(error.message || "No se pudo crear la receta");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Refresca todos los bloques visibles de la página actual.
  function renderAll() {
    renderHeaderUser();
    renderBestValued();
    applyFiltersAndRender();
    renderUserLists();
    renderRecipeDetail();
    renderRecipeVariants();
    renderComments();
    renderNewRecipeMode();
    renderAuthPage();
  }

  // Arranca la aplicación cuando el DOM está disponible.
  document.addEventListener("DOMContentLoaded", async () => {
    await initSession();
    guardSessionOnEntry();

    bindAuthForms();
    bindUserPanel();
    bindFilters();
    bindNewRecipeForm();
    bindMainCommentForm();
    bindCommentsListInteractions();

    if (!isLoginPage() && state.user) {
      const recipeId = getCurrentRecipeId();
      const variantOfId = getVariantOfId();

      if (isHomePage() || hasElement("bestValuedList")) {
        await loadRecipes({ mode: "home" });
      } else if (isRecipeDetailPage() || hasElement("recipeDetail")) {
        await loadRecipeDetail(recipeId);
      } else if (isNewRecipePage() && variantOfId) {
        await loadVariantBaseRecipe(variantOfId);
      } else if (isRecipesPage() || isUserPage() || hasElement("recipesGrid") || hasElement("myRecipes")) {
        await loadRecipes();
      }

      if (isRecipeDetailPage() && recipeId && getRecipeById(recipeId)) {
        await loadRecipeVariants(getParentRecipeId(getRecipeById(recipeId)));
        await loadComments(recipeId);
      }
    }

    renderAll();
  });
})();
