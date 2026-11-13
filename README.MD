# Meal Planner v2 🍽️

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A self-hosted weekly meal planner for a household. Meals are saved once in a library and
reused across the plan, so "Spaghetti Bolognese" is one meal with its recipe link and notes,
no matter how often you eat it.

## Features

- **Weekly plan:** lunch and dinner for every day, with week navigation (← / → keys work too).
- **Reusable meal library:** search as you type, pick an existing meal, or create a new one inline.
  Meal names are unique (ignoring case), and renaming a meal updates the whole plan.
- **Per-person plans:** start with two people and add more any time. People who eat the same
  meal are shown together; anyone can get something different.
- **Meal details:** recipe link, notes, and favorites, plus how often and when a meal was planned.
- **Recipes:** import ingredients, steps and picture from a meal's recipe link, or write the recipe yourself.
  The library can be sorted A–Z, by most planned, or by recently planned.
- **Login through your reverse proxy:** no auth code in the app. SWAG + Authentik decide who gets in.
- Light and dark mode, works on phones, dates formatted in the browser's language.

## Architecture

```
Browser ──HTTPS──▶ SWAG ──(Authentik forward auth)──▶ meal-planner (nginx) ──/api──▶ backend (Flask + SQLite)
                   checks the session,                serves the React app        internal network only
                   adds X-authentik-* headers
```

| Part     | Stack |
|----------|-------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4, TanStack Query, served by nginx |
| Backend  | Flask 3, SQLAlchemy, Flask-Migrate (Alembic), SQLite, gunicorn |

### Data model

| Table        | Purpose |
|--------------|---------|
| `meal`       | A reusable dish: name (unique, case-insensitive), recipe URL, notes, favorite |
| `person`     | Someone who eats along: name, color, sort position |
| `plan_entry` | Person × day × slot (lunch/dinner) → meal. One meal per person per slot |

### Authentication

The app has no login of its own. In production (`AUTH_MODE=proxy`) the backend only accepts
API calls carrying the `X-authentik-username` header, which SWAG sets after Authentik approves
the session. This is safe **only because the backend can't be reached without going through
SWAG**: no ports are published, and the backend is only on the internal Docker network. Don't
add a `ports:` mapping to the backend.

When the Authentik session expires, the frontend notices the redirect on its next API call and
reloads the page, so you land on the Authentik login.

## Deployment (Docker + SWAG + Authentik)

1. **Authentik:** create a **Proxy Provider** in *Forward auth (single application)* mode with the
   external host `https://mealplanner.your-domain`, create an **Application** for it, bind the
   users/groups that may use it, and add it to your outpost (e.g. the embedded outpost).
2. **SWAG:** copy [`swag/mealplanner.subdomain.conf.sample`](swag/mealplanner.subdomain.conf.sample)
   to `/config/nginx/proxy-confs/mealplanner.subdomain.conf` and adjust `server_name` if needed.
   Check that `/config/nginx/authentik-server.conf` points to your Authentik container.
3. **Start the app** next to SWAG:
   ```bash
   mkdir -p data              # SQLite lives here; must be writable by uid 1000
   SWAG_NETWORK=<the docker network SWAG is on> docker compose up -d --build
   ```
   `SWAG_NETWORK` defaults to `swag`. Find yours with `docker inspect swag -f '{{json .NetworkSettings.Networks}}'`.

   Instead of building on the server, you can use the prebuilt images (see below):
   `docker compose pull && docker compose up -d`.
4. Restart SWAG and open `https://mealplanner.your-domain`.

### Prebuilt images

GitHub Actions ([`.github/workflows/docker.yml`](.github/workflows/docker.yml)) runs the tests
and builds both images (linux/amd64) on every push and pull request. Pushes to `main` and
version tags publish them to Docker Hub (`abuhamsa/meal-planner-backend`, `-frontend`) and
GitHub (`ghcr.io/abuhamsa/meal-planner-*`):

| Tag              | Updated by                         |
| ---------------- | ---------------------------------- |
| `latest`, `main` | every push to `main`               |
| `2`, `2.0`, `2.0.0` | tag `v2.0.0` (compose uses `2`) |
| `sha-<commit>`   | every push, for rollbacks          |

To release: `git tag v2.2.0 && git push origin v2.2.0`. The tag is also the version shown in the
app (People page footer); builds from `main` show `main-<commit>`, a local checkout shows `dev`.

Database migrations run automatically when the backend container starts. The database is
stored in `./data/mealplanner.db`; back up that folder.

## Local development

Backend (port 8000, auth disabled):
```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
export FLASK_APP=wsgi.py AUTH_MODE=none
flask db upgrade && flask seed
flask run --port 8000 --debug
```

Frontend (port 5173, proxies `/api` to the backend):
```bash
cd frontend
npm install
npm run dev
```

Tests and checks:
```bash
cd backend && pytest
cd frontend && npm run build   # type-checks and builds
```

After changing models: `flask db migrate -m "describe change"` and commit the new file in
`backend/migrations/versions/`.

### Backend configuration

| Variable           | Default                | Description |
|--------------------|------------------------|-------------|
| `AUTH_MODE`        | `proxy`                | `proxy` requires the proxy's user header; `none` disables checks (dev only) |
| `AUTH_USER_HEADER` | `X-authentik-username` | Header that carries the logged-in user |
| `DATA_DIR`         | `backend/data`         | Folder for `mealplanner.db` (`/app/data` in Docker) |
| `DATABASE_URL`     | –                      | Overrides the SQLite location completely |

## API

All endpoints are under `/api` and use JSON.

| Method & path | Description |
|---|---|
| `GET /me` | Logged-in user (from proxy headers) and app version |
| `GET /people` · `POST /people` · `PATCH /people/:id` · `DELETE /people/:id[?force=true]` | Manage people |
| `GET /meals?q=&sort=name\|frequent\|recent&limit=` | Search the library, with `usage_count` and `last_planned` |
| `POST /meals` · `GET/PATCH /meals/:id` · `DELETE /meals/:id[?force=true]` | Manage meals |
| `GET /plan?start=YYYY-MM-DD&days=7` | Plan entries in a date range |
| `PUT /plan` | `{date, slot, person_ids, meal_id \| meal_name}`: assign a meal (`meal_name` reuses or creates) |
| `DELETE /plan/:id` | Remove one entry |
| `GET /meals/:id/recipe` | The meal's saved recipe (`404` if none) |
| `POST /meals/:id/recipe` | Import (or re-import) the recipe from the meal's recipe link; `422` with a message if that fails |
| `PUT /meals/:id/recipe` | `{yields, total_time, ingredient_groups, instructions}`: write a recipe by hand or edit a saved one (keeps an imported picture and source link) |
| `DELETE /meals/:id/recipe` | Remove the recipe |

Deleting a person or a meal that's still in the plan returns `409` with `usage_count`. Repeat
the request with `?force=true` to delete it together with its plan entries.

## License

MIT
