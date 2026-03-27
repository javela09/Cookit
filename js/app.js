// Cookit MVP interactions and state management
(function () {
  const STORAGE_KEY = 'cookitState';
  const PAGE_SIZE = 12;

  const sampleRecipes = [];

  const defaultState = {
    user: null,
    recipes: sampleRecipes,
    userVotes: {}
  };

  // Da formato a la fecha.
  function formatDate(dateStr) {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  let state = loadState();
  const pageState = { currentPage: 1, filter: '', order: 'popular', search: '' };
  const isLoginPage = () => window.location.pathname.toLowerCase().includes('login.html');

  // Recupera el estado guardado en localStorage o arranca con el estado por defecto.
  function loadState() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return {
          ...defaultState,
          ...parsed,
          user: parsed.user || null,
          recipes: parsed.recipes || sampleRecipes,
          userVotes: parsed.userVotes || {}
        };
      } catch (e) {
        return { ...defaultState };
      }
    }
    return { ...defaultState };
  }

  // Persistencia sencilla del estado global.
  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // Cierra sesión y vuelve a la pantalla de login.
  async function logout() {
    try {
      await logoutUser();
    } catch (error) {
      console.error('No se pudo cerrar sesion en API:', error.message);
    }

    state.user = null;
    saveState();
    window.location.href = 'login.html';
  }
  
  // Redirige a login si no hay usuario autenticado.
  function requireUser() {
    if (!state.user) {
      window.location.href = 'login.html';
      return false;
    }
    return true;
  }

  // Pinta el botón de usuario/login en el header según el estado actual.
  function renderHeaderUser() {
    const btn = document.getElementById('userButton');
    if (!btn) return;
    if (state.user) {
      btn.textContent = state.user.username;
      btn.dataset.mode = 'user';
      btn.classList.add('navUserHasMenu');
      btn.onclick = () => window.location.href = 'user.html';
      attachLogoutMenu(btn);
    } else {
      btn.textContent = 'Login';
      btn.dataset.mode = 'login';
      btn.classList.remove('navUserHasMenu');
      btn.onmouseenter = null;
      btn.onmouseleave = null;
      btn.onclick = () => window.location.href = 'login.html';
    }
  }

  // Despliega un menú de logout anclado al botón de usuario.
  function attachLogoutMenu(btn) {
    let menu = document.getElementById('logoutMenu');
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'logoutMenu';
      menu.className = 'logoutMenu';
      const item = document.createElement('button');
      item.textContent = 'Logout';
      item.type = 'button';
      item.onclick = async (e) => {
        e.stopPropagation();
        await logout();
      };
      menu.appendChild(item);
      document.body.appendChild(menu);
    }
    const showMenu = () => {
      const rect = btn.getBoundingClientRect();
      menu.style.top = `${rect.bottom + window.scrollY + 6}px`;
      menu.style.minWidth = `${rect.width}px`;
      menu.classList.add('open');
      const menuWidth = menu.offsetWidth || rect.width;
      menu.style.left = `${rect.right + window.scrollX - menuWidth}px`;
    };
    const hideMenu = (e) => {
      if (!menu.contains(e.target) && e.target !== btn) {
        menu.classList.remove('open');
      }
    };
    btn.onmouseenter = showMenu;
    btn.onmouseleave = () => setTimeout(() => { if (!menu.matches(':hover')) menu.classList.remove('open'); }, 150);
    menu.onmouseleave = () => menu.classList.remove('open');
    if (!btn.dataset.logoutBound) {
      document.addEventListener('click', hideMenu);
      btn.dataset.logoutBound = '1';
    }
  }

  // Renderiza las recetas destacadas en la home.
  function renderBestValued() {
    const container = document.getElementById('bestValuedList');
    if (!container) return;
    const top = [...state.recipes]
      .filter(r => !r.deleted)
      .sort((a, b) => b.votes - a.votes)
      .slice(0, 3);
    container.innerHTML = '';
    if (!top.length) {
      container.innerHTML = '<p>No hay recetas destacadas todavia.</p>';
      return;
    }
    top.forEach((recipe) => {
      const article = document.createElement('article');
      article.className = 'recipeCard';
      const mediaStyle = recipe.image ? `style="background-image:url('${recipe.image}')"` : '';
      article.innerHTML = `
        <div class="recipeMedia" ${mediaStyle} aria-hidden="true"></div>
        <div class="cardInfo">
          <h3>${recipe.title}</h3>
          <p class="author">por ${recipe.author}</p>
          <p class="description">${recipe.description}</p>
          <div class="cardMeta">
            <span>Publicada el ${formatDate(recipe.date)}</span>
            <span class="votes">${recipe.votes} votos</span>
          </div>
        </div>`;
      article.addEventListener('click', () => goToDetail(recipe.id));
      container.appendChild(article);
    });
  }

  // Aplica búsqueda/filtros/orden y pinta la cuadrícula de recetas.
  function applyFiltersAndRender() {
    const grid = document.getElementById('recipesGrid');
    if (!grid) return;
    const searchInput = document.getElementById('searchInput');
    const filterSelect = document.getElementById('filterSelect');
    const orderSelect = document.getElementById('orderSelect');
    if (searchInput) pageState.search = searchInput.value.toLowerCase();
    if (filterSelect) pageState.filter = filterSelect.value;
    if (orderSelect) pageState.order = orderSelect.value;

    let list = state.recipes.filter(r => !r.deleted);
    if (pageState.search) {
      list = list.filter(r => (r.title + r.description).toLowerCase().includes(pageState.search));
    }
    if (pageState.filter) {
      list = list.filter(r => r.categories && r.categories.includes(pageState.filter));
    }
    if (pageState.order === 'popular') list.sort((a, b) => b.votes - a.votes);
    if (pageState.order === 'nuevas') list.sort((a, b) => new Date(b.date) - new Date(a.date));
    if (pageState.order === 'valoradas') list.sort((a, b) => b.votes - a.votes);

    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (pageState.currentPage > totalPages) pageState.currentPage = totalPages;
    const start = (pageState.currentPage - 1) * PAGE_SIZE;
    const pageItems = list.slice(start, start + PAGE_SIZE);

    grid.innerHTML = '';
    if (!pageItems.length) {
      grid.innerHTML = '<p>No hay recetas publicadas todavia.</p>';
    }
    pageItems.forEach((recipe) => {
      const article = document.createElement('article');
      article.className = 'recipeTile';
      const userVote = state.user && state.userVotes[state.user.username] && state.userVotes[state.user.username][recipe.id];
      const mediaStyle = recipe.image ? `style="background-image:url('${recipe.image}')"` : '';
      article.innerHTML = `
        <div class="tileMedia" ${mediaStyle} aria-hidden="true"></div>
        <h3>${recipe.title}</h3>
        <p class="tileAuthor">por ${recipe.author}</p>
        <p class="tileDescription">${recipe.description}</p>
        <div class="tileMeta">
          <span>${formatDate(recipe.date)}</span>
          <span class="votes">${recipe.votes} votos</span>
        </div>
        <div class="tileActions">
          <button class="secondaryButton" data-action="save">${recipe.saved ? 'Guardado' : 'Guardar'}</button>
          <button class="ghostButton" data-action="vote">${userVote ? 'Retirar voto' : 'Votar'}</button>
        </div>`;
      article.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        goToDetail(recipe.id);
      });
      article.querySelector('[data-action="save"]').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSave(recipe.id);
      });
      article.querySelector('[data-action="vote"]').addEventListener('click', (e) => {
        e.stopPropagation();
        voteRecipe(recipe.id);
      });
      grid.appendChild(article);
    });

    renderPagination(totalPages);
  }

  // Construye la paginación numérica y los botones anterior/siguiente.
  function renderPagination(totalPages) {
    const pagination = document.getElementById('pagination');
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    if (!pagination || !prevBtn || !nextBtn) return;
    pagination.innerHTML = '';
    for (let i = 1; i <= totalPages; i++) {
      const btn = document.createElement('button');
      btn.className = 'pageBtn' + (i === pageState.currentPage ? ' active' : '');
      btn.textContent = i;
      btn.addEventListener('click', () => {
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

  // Guarda o desguarda una receta para el usuario actual.
  function toggleSave(id) {
    if (!requireUser()) return;
    const recipe = state.recipes.find(r => r.id === id);
    if (!recipe) return;
    recipe.saved = !recipe.saved;
    saveState();
    renderAll();
  }

  // Botón de voto por receta.
  function voteRecipe(id) {
    const recipe = state.recipes.find(r => r.id === id);
    if (!recipe) return;
    if (!requireUser()) return;
    const username = state.user.username;
    const votesMap = state.userVotes[username] || {};
    if (votesMap[id]) {
      recipe.votes = Math.max(0, (recipe.votes || 0) - 1);
      delete votesMap[id];
    } else {
      recipe.votes = (recipe.votes || 0) + 1;
      votesMap[id] = true;
    }
    state.userVotes[username] = votesMap;
    saveState();
    renderAll();
  }

  // Elimina una receta publicada por el usuario.
  function deletePublished(id) {
    const recipe = state.recipes.find(r => r.id === id);
    if (!recipe) return;
    if (!state.user || recipe.author !== state.user.username) return;
    recipe.deleted = true;
    saveState();
    renderAll();
  }

  // Borra una receta de guardadas.
  function deleteSaved(id) {
    const recipe = state.recipes.find(r => r.id === id);
    if (!recipe) return;
    recipe.saved = false;
    saveState();
    renderAll();
  }

  // Rellena las secciones de "Mis recetas" y "Guardadas" en el panel de usuario.
  function renderUserLists() {
    const myContainer = document.getElementById('myRecipes');
    const savedContainer = document.getElementById('savedRecipes');
    const usernameField = document.getElementById('usernameField');
    const emailField = document.getElementById('emailField');
    if ((myContainer || savedContainer) && !state.user) return;
    if (usernameField) usernameField.value = state.user ? state.user.username : '';
    if (emailField) emailField.value = state.user ? state.user.email : '';
    if (!myContainer || !savedContainer) return;

    const myRecipes = state.recipes.filter(r => !r.deleted && state.user && r.author === state.user.username);
    const savedRecipes = state.recipes.filter(r => !r.deleted && r.saved);
    myContainer.innerHTML = '';
    savedContainer.innerHTML = '';

    myRecipes.forEach((recipe) => {
      const card = createUserRecipeCard(recipe, true);
      myContainer.appendChild(card);
    });
    savedRecipes.forEach((recipe) => {
      const card = createUserRecipeCard(recipe, false);
      savedContainer.appendChild(card);
    });
  }

  // Plantilla reutilizable para tarjetas de recetas en el área de usuario.
  function createUserRecipeCard(recipe, isMine) {
    const card = document.createElement('article');
    card.className = 'userRecipeCard';
    const mediaStyle = recipe.image ? `style="background-image:url('${recipe.image}')"` : '';
    card.innerHTML = `
      <div class="tileMedia" ${mediaStyle} aria-hidden="true"></div>
      <h3>${recipe.title}</h3>
      <p class="tileAuthor">${isMine ? 'Publicado por ti' : 'de ' + recipe.author}</p>
      <p class="tileDescription">${recipe.description}</p>
      <div class="tileMeta">
        <span>${formatDate(recipe.date)}</span>
        <span class="votes">${recipe.votes} votos</span>
      </div>
      <div class="tileActions">
        <button class="dangerButton">${isMine ? 'Eliminar publicacion' : 'Eliminar de guardadas'}</button>
      </div>`;
    card.addEventListener('click', () => goToDetail(recipe.id));
    card.querySelector('.dangerButton').addEventListener('click', (e) => {
      e.stopPropagation();
      if (isMine) deletePublished(recipe.id); else deleteSaved(recipe.id);
    });
    return card;
  }

  // Conecta el botón de aplicar filtros con el render de la cuadrícula.
  function bindFilters() {
    const applyBtn = document.querySelector('.filtersBar .primaryButton');
    if (applyBtn) {
      applyBtn.onclick = (e) => {
        e.preventDefault();
        pageState.currentPage = 1;
        applyFiltersAndRender();
      };
    }
  }

  // Maneja acciones del panel.
  function bindUserPanel() {
    const updateEmailBtn = document.getElementById('updateEmail');
    const updatePasswordBtn = document.getElementById('updatePassword');
    const emailField = document.getElementById('emailField');
    const passwordField = document.getElementById('passwordField');
    if (updateEmailBtn && emailField) {
      updateEmailBtn.onclick = async () => {
        if (!requireUser()) return;
        const nextEmail = emailField.value.trim();
        if (!nextEmail) {
          alert('Introduce un correo valido');
          return;
        }
        try {
          const user = await updateUserEmail(nextEmail);
          state.user = {
            ...state.user,
            email: user.email
          };
          saveState();
          alert('Correo actualizado');
        } catch (error) {
          alert(error.message || 'No se pudo actualizar el correo');
        }
      };
    }
    if (updatePasswordBtn && passwordField) {
      updatePasswordBtn.onclick = async () => {
        if (!requireUser()) return;
        const nextPassword = passwordField.value.trim();
        if (!nextPassword) {
          alert('Introduce una contrasena valida');
          return;
        }
        try {
          await updateUserPassword(nextPassword);
          passwordField.value = '';
          alert('Contrasena actualizada');
        } catch (error) {
          alert(error.message || 'No se pudo actualizar la contrasena');
        }
      };
    }
  }

  // Navega a la ficha de detalle para una receta concreta.
  function goToDetail(id) {
    window.location.href = `recipe.html?id=${encodeURIComponent(id)}`;
  }

  // Pinta la ficha de detalle.
  function renderRecipeDetail() {
    const detail = document.getElementById('recipeDetail');
    if (!detail) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const recipe = state.recipes.find(r => r.id === id && !r.deleted);
    if (!recipe) {
      detail.innerHTML = '<p>No se encontro la receta.</p>';
      return;
    }
    const titleEl = document.getElementById('detailTitle');
    const descEl = document.getElementById('detailDescription');
    const authorEl = document.getElementById('detailAuthor');
    const timeEl = document.getElementById('detailTime');
    const votesEl = document.getElementById('detailVotes');
    const tagsEl = document.getElementById('detailTags');
    const ingEl = document.getElementById('detailIngredients');
    const stepsEl = document.getElementById('detailSteps');
    if (titleEl) titleEl.textContent = recipe.title;
    if (descEl) descEl.textContent = recipe.description;
    if (authorEl) authorEl.textContent = 'por ' + recipe.author;
    if (timeEl) timeEl.textContent = recipe.time;
    if (votesEl) votesEl.textContent = recipe.votes + ' votos';
    if (tagsEl) {
      tagsEl.innerHTML = '';
      (recipe.categories || []).forEach((cat) => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.textContent = cat;
        tagsEl.appendChild(span);
      });
    }
    if (ingEl) {
      ingEl.innerHTML = '';
      (recipe.ingredients || []).forEach((ing) => {
        const li = document.createElement('li');
        li.textContent = ing;
        ingEl.appendChild(li);
      });
    }
    if (stepsEl) {
      stepsEl.innerHTML = '';
      (recipe.steps || []).forEach((step) => {
        const li = document.createElement('li');
        li.textContent = step;
        stepsEl.appendChild(li);
      });
    }
    const mediaEl = document.getElementById('detailMedia');
    if (mediaEl && recipe.image) {
      mediaEl.style.backgroundImage = `url('${recipe.image}')`;
    }
  }

  // Renderizado al cargar la página.
  function renderAll() {
    renderHeaderUser();
    renderBestValued();
    applyFiltersAndRender();
    renderUserLists();
    renderRecipeDetail();
    renderAuthPage();
  }

  // Funciones al cargar cualquier página.
  document.addEventListener('DOMContentLoaded', async () => {
    await initSession();
    guardSessionOnEntry();
    bindFilters();
    bindUserPanel();
    bindAuthForms();
    bindNewRecipeForm();
    renderAll();
  });

  // ---------- Auth ----------

  // Enlaza los botones de login/registro en login.html.
  function bindAuthForms() {
    const loginBtn = document.getElementById('loginSubmit');
    const registerBtn = document.getElementById('registerSubmit');

    if (loginBtn) {
      loginBtn.onclick = async (e) => {
        e.preventDefault();
        await handleLogin();
      };
    }

    if (registerBtn) {
      registerBtn.onclick = async (e) => {
        e.preventDefault();
        await handleRegister();
      };
    }
  }

  // Si ya hay sesión en login.html, avisa y redirige.
  function renderAuthPage() {
    const title = document.getElementById('authTitle');
    if (!title) return;
    if (state.user) {
      title.textContent = 'Ya estas autenticado';
      const feedback = document.getElementById('authFeedback');
      if (feedback) feedback.textContent = 'Redirigiendo a tu panel...';
      setTimeout(() => { window.location.href = 'user.html'; }, 800);
    }
  }

  // Obtiene los valores de los campos de login/registro.
  function getAuthFields() {
    const username = document.getElementById('authUsername')?.value.trim() || '';
    const email = document.getElementById('authEmail')?.value.trim() || '';
    const password = document.getElementById('authPassword')?.value.trim() || '';
    return { username, email, password };
  }

  // Mensaje en el formulario de auth.
  function showAuthFeedback(msg, isError = true) {
    const feedback = document.getElementById('authFeedback');
    if (!feedback) return;
    feedback.style.color = isError ? '#7b1e1e' : '#2f3a18';
    feedback.textContent = msg;
  }

  // Registra al usuario en la base de datos.
  async function registerUser(username, email, password) {
    return window.api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password })
    });
  }

  // Loguea al usuario.
  async function loginUser(email, password) {
    return window.api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  }

  // Carga al usuario actual.
  async function loadCurrentUser() {
    try {
      return await window.api('/api/auth/me');
    } catch {
      return null;
    }
  }

  // Desconecta al usuario actual.
  async function logoutUser() {
    return window.api('/api/auth/logout', {
      method: 'POST'
    });
  }

  // Actualiza el email del usuario autenticado.
  async function updateUserEmail(email) {
    return window.api('/api/user/email', {
      method: 'PUT',
      body: JSON.stringify({ email })
    });
  }

  // Actualiza la contrasena del usuario autenticado.
  async function updateUserPassword(password) {
    return window.api('/api/user/password', {
      method: 'PUT',
      body: JSON.stringify({ password })
    });
  }

  // Inicia la sesión.
  async function initSession() {
    const user = await loadCurrentUser();

    if (user) {
      state.user = {
        id: user.id,
        username: user.username,
        email: user.email
      };
    } else {
      state.user = null;
    }

    saveState();
  }

  // Valida login contra la API.
  async function handleLogin() {
    const { email, password } = getAuthFields();
    if (!email || !password) {
      showAuthFeedback('Completa correo y contrasena');
      return;
    }

    try {
      const user = await loginUser(email, password);
      state.user = {
        id: user.id,
        username: user.username,
        email: user.email
      };
      saveState();
      showAuthFeedback('Login correcto, entrando...', false);
      setTimeout(() => { window.location.href = 'index.html'; }, 600);
    } catch (error) {
      showAuthFeedback(error.message || 'Credenciales incorrectas');
    }
  }

  // Registra un nuevo usuario vía API y abre sesión.
  async function handleRegister() {
    const { username, email, password } = getAuthFields();

    if (!username || !email || !password) {
      showAuthFeedback('Completa usuario, correo y contrasena');
      return;
    }

    try {
      await registerUser(username, email, password);

      state.user = null;
      saveState();

      showAuthFeedback('Registro correcto. Ahora inicia sesion con tu correo y contrasena.', false);

      const passwordInput = document.getElementById('authPassword');
      if (passwordInput) passwordInput.value = '';
    } catch (error) {
      showAuthFeedback(error.message || 'No se pudo completar el registro');
    }
  }

  // Protege cualquier página, redirigiendo si no hay sesión.
  function guardSessionOnEntry() {
    if (isLoginPage()) return;
    if (!state.user) {
      window.location.href = 'login.html';
    }
  }

  // ---------- New Recipe ----------

  // Gestiona el envío del formulario de nueva receta.
  function bindNewRecipeForm() {
    const form = document.getElementById('newRecipeForm');
    if (!form) return;
    if (!state.user) {
      window.location.href = 'login.html';
      return;
    }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = document.getElementById('newTitle')?.value.trim();
      const description = document.getElementById('newDescription')?.value.trim();
      const time = document.getElementById('newTime')?.value.trim();
      const categoriesNodes = Array.from(document.querySelectorAll('#newCategories input[type=\"checkbox\"]:checked'));
      const categories = categoriesNodes.map(c => c.value);
      const ingredientsRaw = document.getElementById('newIngredients')?.value.trim();
      const stepsRaw = document.getElementById('newSteps')?.value.trim();
      const imageFile = document.getElementById('newImage')?.files?.[0] || null;
      if (!title || !description || !time || !categories.length || !ingredientsRaw || !stepsRaw) {
        alert('Completa todos los campos');
        return;
      }
      const now = new Date();
      const newRecipe = {
        id: 'r' + now.getTime(),
        title,
        description,
        author: state.user.username,
        date: now.toISOString().slice(0, 10),
        votes: 0,
        time,
        categories,
        ingredients: ingredientsRaw.split('\n').map(c => c.trim()).filter(Boolean),
        steps: stepsRaw.split('\n').map(c => c.trim()).filter(Boolean),
        saved: false,
        deleted: false
      };
      if (imageFile) {
        readImageFile(imageFile)
          .then((dataUrl) => {
            newRecipe.image = dataUrl;
            saveNewRecipe(newRecipe);
          })
          .catch(() => saveNewRecipe(newRecipe));
      } else {
        saveNewRecipe(newRecipe);
      }
    });
  }

  // Inserta una receta en el listado y redirige a recipes.
  function saveNewRecipe(recipe) {
    state.recipes = [recipe, ...state.recipes];
    saveState();
    window.location.href = 'recipes.html';
  }

  // Archivo de imagen.
  function readImageFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
})();
