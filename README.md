# Cookit

Aplicacion web estatica de recetas.

## Ejecucion local

Esta opcion sirve para revisar interfaz, responsive y flujo basico sin Netlify y sin Neon. Arranca sin recetas iniciales y usa `localStorage` del navegador.

Requisitos previos:
- Node.js 
- npm instalado.

Instala dependencias:
npm install

Arranca la aplicacion local:
npm run local

URL local:
http://localhost:8888

Esta version local se implementa con `local-server.js` y `local-api.js`.

Claves locales usadas:
local_recipes
local_recipe_variants
local_recipe_votes
local_recipe_variant_votes
local_comments
local_recipe_saves
local_user
local_session