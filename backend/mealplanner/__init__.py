import logging
import os
import sys
from pathlib import Path

import click
from flask import Flask, jsonify, request
from flask_migrate import Migrate
from sqlalchemy import event
from sqlalchemy.engine import Engine
from werkzeug.exceptions import HTTPException

from .models import Person, db

__version__ = "2.0.0"

migrate = Migrate()

DEFAULT_PEOPLE = [("Person 1", "#6366f1"), ("Person 2", "#f59e0b")]


@event.listens_for(Engine, "connect")
def _sqlite_pragmas(dbapi_connection, _record):
    # SQLite does not enforce foreign keys unless asked to on every connection.
    if dbapi_connection.__class__.__module__.startswith("sqlite3"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


def _data_dir():
    data_dir = Path(os.environ.get("DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def create_app(test_config=None):
    app = Flask(__name__)
    data_dir = _data_dir()
    app.config.update(
        DATA_DIR=str(data_dir),
        SQLALCHEMY_DATABASE_URI=os.environ.get("DATABASE_URL") or f"sqlite:///{data_dir / 'mealplanner.db'}",
        # "proxy": a reverse proxy (SWAG + Authentik) authenticates every request and
        #          forwards the user in headers; requests without that header are rejected.
        # "none":  no checks, for local development only.
        AUTH_MODE=os.environ.get("AUTH_MODE", "proxy").lower(),
        AUTH_USER_HEADER=os.environ.get("AUTH_USER_HEADER", "X-authentik-username"),
        DEV_USER=os.environ.get("DEV_USER", "dev"),
        JSON_SORT_KEYS=False,
    )
    if test_config:
        app.config.update(test_config)

    if app.config["AUTH_MODE"] not in ("proxy", "none"):
        raise RuntimeError("AUTH_MODE must be 'proxy' or 'none'")

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        stream=sys.stdout,
    )

    db.init_app(app)
    migrate.init_app(app, db, render_as_batch=True)

    from .api import api

    app.register_blueprint(api)

    @app.get("/healthz")
    def healthz():
        return jsonify(status="ok")

    @app.errorhandler(HTTPException)
    def http_error(e):
        return jsonify(error=e.description), e.code

    @app.after_request
    def log_request(response):
        if request.path != "/healthz":
            app.logger.info("%s %s %s", request.method, request.full_path.rstrip("?"), response.status_code)
        return response

    @app.cli.command("seed")
    def seed():
        """Create the two default people if the database has none."""
        if Person.query.count() == 0:
            for position, (name, color) in enumerate(DEFAULT_PEOPLE):
                db.session.add(Person(name=name, color=color, position=position))
            db.session.commit()
            click.echo("Created default people.")
        else:
            click.echo("People already exist, nothing to seed.")

    @app.cli.command("import-recipes")
    @click.option("--redo", is_flag=True, help="Also re-import meals that already have a recipe.")
    @click.option("--dry-run", is_flag=True, help="Only list the meals that would be imported.")
    def import_recipes(redo, dry_run):
        """Import recipes for meals that have a recipe link."""
        from .api import import_recipe
        from .models import Meal
        from .recipe_import import RecipeImportError

        meals = Meal.query.filter(Meal.recipe_url.is_not(None)).order_by(Meal.name_key).all()
        meals = [m for m in meals if redo or m.recipe is None]
        click.echo(f"{len(meals)} meals to import.")
        ok = failed = 0
        for meal in meals:
            if dry_run:
                click.echo(f"  {meal.name}: {meal.recipe_url}")
                continue
            try:
                recipe = import_recipe(meal)
            except RecipeImportError as e:
                db.session.rollback()
                failed += 1
                click.echo(f"  FAIL {meal.name}: {e}")
                continue
            ok += 1
            count = sum(len(g["ingredients"]) for g in recipe.ingredient_groups)
            click.echo(f"  ok   {meal.name}: {count} ingredients, {len(recipe.instructions)} steps{', image' if recipe.image else ''}")
        if not dry_run:
            click.echo(f"Imported {ok}, failed {failed}.")

    if app.config["AUTH_MODE"] == "none":
        app.logger.warning("AUTH_MODE=none: authentication is disabled. Do not use this in production.")

    return app
