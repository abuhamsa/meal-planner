import io
import json

import pytest
from PIL import Image

from mealplanner import DEFAULT_PEOPLE, create_app, recipe_import
from mealplanner.models import Person, db
from mealplanner.recipe_import import RecipeImportError

AUTH = {"X-authentik-username": "alice"}

RECIPE_PAGE = """<html><head><title>Rösti</title>
<script type="application/ld+json">{}</script></head><body></body></html>""".format(
    json.dumps(
        {
            "@context": "https://schema.org",
            "@type": "Recipe",
            "name": "Berner Rösti",
            "recipeYield": "4 Portionen",
            "totalTime": "PT45M",
            "image": "/img/roesti.jpg",
            "recipeIngredient": ["800 g Kartoffeln", "2 EL Butter", "Salz"],
            "recipeInstructions": [
                {"@type": "HowToStep", "text": "Kartoffeln raffeln."},
                {"@type": "HowToStep", "text": "In Butter goldbraun braten."},
            ],
        }
    )
)


def jpeg_bytes():
    buf = io.BytesIO()
    Image.new("RGB", (2000, 1000), "orange").save(buf, "JPEG")
    return buf.getvalue()


@pytest.fixture
def pages(monkeypatch):
    """Fake web: url -> (content type, body). Missing URLs raise like a dead link."""
    web = {}

    def fake_fetch(url, max_bytes, accept="*/*"):
        if url not in web:
            raise RecipeImportError("The page doesn't exist anymore")
        content_type, body = web[url]
        return url, body.encode() if isinstance(body, str) else body, content_type

    monkeypatch.setattr(recipe_import, "fetch", fake_fetch)
    return web


@pytest.fixture
def app(tmp_path):
    app = create_app(
        {"SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'test.db'}", "AUTH_MODE": "proxy", "DATA_DIR": str(tmp_path)}
    )
    with app.app_context():
        db.create_all()
        for position, (name, color) in enumerate(DEFAULT_PEOPLE):
            db.session.add(Person(name=name, color=color, position=position))
        db.session.commit()
    yield app


@pytest.fixture
def client(app):
    c = app.test_client()

    class Authed:
        def __getattr__(self, method):
            def call(*args, **kwargs):
                kwargs.setdefault("headers", AUTH)
                return getattr(c, method)(*args, **kwargs)

            return call

    return Authed()


def make_meal(client, url="https://example.com/roesti"):
    return client.post("/api/meals", json={"name": "Rösti", "recipe_url": url}).json


def test_import_recipe_with_image(client, pages, tmp_path):
    pages["https://example.com/roesti"] = ("text/html; charset=utf-8", RECIPE_PAGE)
    pages["https://example.com/img/roesti.jpg"] = ("image/jpeg", jpeg_bytes())
    meal = make_meal(client)
    assert meal["has_recipe"] is False

    res = client.post(f"/api/meals/{meal['id']}/recipe", json={})
    assert res.status_code == 200, res.json
    recipe = res.json
    assert recipe["title"] == "Berner Rösti"
    assert recipe["yields"].startswith("4")
    assert recipe["total_time"] == 45
    assert recipe["ingredient_groups"] == [{"purpose": None, "ingredients": ["800 g Kartoffeln", "2 EL Butter", "Salz"]}]
    assert recipe["instructions"] == ["Kartoffeln raffeln.", "In Butter goldbraun braten."]
    assert recipe["source_url"] == "https://example.com/roesti"

    # The image is stored locally, shrunk, as WebP.
    image = client.get(recipe["image_url"])
    assert image.status_code == 200
    assert Image.open(io.BytesIO(image.data)).size == (1200, 600)

    assert client.get(f"/api/meals/{meal['id']}").json["has_recipe"] is True
    assert client.get("/api/meals").json[0]["has_recipe"] is True
    assert client.get(f"/api/meals/{meal['id']}/recipe").json == recipe


def test_reimport_replaces_recipe_and_image(client, pages, tmp_path):
    pages["https://example.com/roesti"] = ("text/html", RECIPE_PAGE)
    pages["https://example.com/img/roesti.jpg"] = ("image/jpeg", jpeg_bytes())
    meal = make_meal(client)
    first = client.post(f"/api/meals/{meal['id']}/recipe", json={}).json
    second = client.post(f"/api/meals/{meal['id']}/recipe", json={}).json
    assert first["image_url"] != second["image_url"]
    assert sorted(p.name for p in (tmp_path / "recipe-images").iterdir()) == [second["image_url"].rsplit("/", 1)[1]]


def test_import_without_image_still_works(client, pages):
    pages["https://example.com/roesti"] = ("text/html", RECIPE_PAGE)  # image URL is missing
    meal = make_meal(client)
    res = client.post(f"/api/meals/{meal['id']}/recipe", json={})
    assert res.status_code == 200
    assert res.json["image_url"] is None


def test_import_failures_are_reported_and_keep_the_meal(client, pages):
    pages["https://example.com/plain"] = ("text/html", "<html><body>Just a blog post</body></html>")
    meal = make_meal(client, "https://example.com/plain")
    res = client.post(f"/api/meals/{meal['id']}/recipe", json={})
    assert res.status_code == 422
    assert res.json["error"] == "Couldn't import the recipe: No recipe found on this page"

    dead = client.post("/api/meals", json={"name": "Dead", "recipe_url": "https://example.com/gone"}).json
    res = client.post(f"/api/meals/{dead['id']}/recipe", json={})
    assert res.json["error"] == "Couldn't import the recipe: The page doesn't exist anymore"

    no_link = client.post("/api/meals", json={"name": "No link"}).json
    assert client.post(f"/api/meals/{no_link['id']}/recipe", json={}).json["error"].endswith("Add a recipe link first")
    assert client.get(f"/api/meals/{meal['id']}").json["has_recipe"] is False
    assert client.get(f"/api/meals/{meal['id']}/recipe").status_code == 404


def test_deleting_recipe_or_meal_removes_image(client, pages, tmp_path):
    pages["https://example.com/roesti"] = ("text/html", RECIPE_PAGE)
    pages["https://example.com/img/roesti.jpg"] = ("image/jpeg", jpeg_bytes())
    meal = make_meal(client)
    client.post(f"/api/meals/{meal['id']}/recipe", json={})
    assert client.delete(f"/api/meals/{meal['id']}/recipe").status_code == 204
    assert client.get(f"/api/meals/{meal['id']}").json["has_recipe"] is False
    assert list((tmp_path / "recipe-images").iterdir()) == []

    client.post(f"/api/meals/{meal['id']}/recipe", json={})
    assert client.delete(f"/api/meals/{meal['id']}").status_code == 204
    assert list((tmp_path / "recipe-images").iterdir()) == []


def test_recipe_image_route_stays_in_its_folder(client, tmp_path):
    (tmp_path / "secret.txt").write_text("x")
    assert client.get("/api/recipe-images/../secret.txt").status_code == 404
    assert client.get("/api/recipe-images/..%2Fsecret.txt").status_code == 404


def test_recipe_endpoints_need_auth(app):
    c = app.test_client()
    assert c.get("/api/meals/1/recipe").status_code == 401
    assert c.get("/api/recipe-images/x.webp").status_code == 401


@pytest.mark.parametrize(
    "url",
    ["http://127.0.0.1/", "http://localhost:8000/", "http://10.0.0.5/", "http://192.168.1.1/", "http://[::1]/", "http://169.254.169.254/", "ftp://example.com/"],
)
def test_fetch_blocks_private_addresses(url):
    with pytest.raises(RecipeImportError):
        recipe_import.fetch(url, 1000)


def test_decode_prefers_utf8_without_charset():
    assert recipe_import._decode("Rösti".encode(), "text/html") == "Rösti"
    assert recipe_import._decode("Rösti".encode("latin-1"), "text/html; charset=iso-8859-1") == "Rösti"
