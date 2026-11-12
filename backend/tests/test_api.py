import pytest

from mealplanner import DEFAULT_PEOPLE, create_app
from mealplanner.models import Person, db

AUTH = {"X-authentik-username": "alice", "X-authentik-name": "Alice A."}


@pytest.fixture
def app(tmp_path):
    app = create_app({"SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'test.db'}", "AUTH_MODE": "proxy"})
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


def people_ids(client):
    return [p["id"] for p in client.get("/api/people").json]


# --- auth -------------------------------------------------------------------


def test_api_rejects_requests_without_proxy_header(app):
    c = app.test_client()
    assert c.get("/api/people").status_code == 401
    assert c.get("/healthz").status_code == 200


def test_me_returns_proxy_user(client):
    res = client.get("/api/me")
    assert res.json["user"] == {"username": "alice", "name": "Alice A.", "email": None}


def test_auth_mode_none_allows_requests(tmp_path):
    app = create_app({"SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'x.db'}", "AUTH_MODE": "none"})
    with app.app_context():
        db.create_all()
    assert app.test_client().get("/api/people").status_code == 200


def test_post_requires_json(client):
    assert client.post("/api/meals", data="name=x").status_code == 415


# --- meals ------------------------------------------------------------------


def test_meal_crud_and_case_insensitive_uniqueness(client):
    res = client.post("/api/meals", json={"name": "  Spaghetti   Bolognese ", "recipe_url": "https://example.com/r"})
    assert res.status_code == 201
    meal = res.json
    assert meal["name"] == "Spaghetti Bolognese"
    assert meal["usage_count"] == 0

    assert client.post("/api/meals", json={"name": "spaghetti bolognese"}).status_code == 409

    res = client.patch(f"/api/meals/{meal['id']}", json={"notes": "Use fresh basil", "favorite": True})
    assert res.json["notes"] == "Use fresh basil"
    assert res.json["favorite"] is True

    assert client.delete(f"/api/meals/{meal['id']}").status_code == 204
    assert client.get(f"/api/meals/{meal['id']}").status_code == 404


def test_meal_rejects_non_http_url(client):
    res = client.post("/api/meals", json={"name": "X", "recipe_url": "javascript:alert(1)"})
    assert res.status_code == 400


def test_meal_search_and_sorting(client):
    p1, p2 = people_ids(client)
    for name in ["Pizza", "Pasta", "Curry"]:
        client.post("/api/meals", json={"name": name})
    client.put("/api/plan", json={"date": "2026-11-09", "slot": "dinner", "person_ids": [p1, p2], "meal_name": "Curry"})
    client.put("/api/plan", json={"date": "2026-11-10", "slot": "dinner", "person_ids": [p1], "meal_name": "Pasta"})

    assert [m["name"] for m in client.get("/api/meals?q=pa").json] == ["Pasta"]
    assert [m["name"] for m in client.get("/api/meals?q=%25").json] == []
    frequent = client.get("/api/meals?sort=frequent").json
    assert [(m["name"], m["usage_count"]) for m in frequent] == [("Curry", 2), ("Pasta", 1), ("Pizza", 0)]
    recent = client.get("/api/meals?sort=recent").json
    assert [m["name"] for m in recent] == ["Pasta", "Curry", "Pizza"]
    assert recent[0]["last_planned"] == "2026-11-10"


# --- plan -------------------------------------------------------------------


def test_assign_meal_reuses_existing_meal(client):
    p1, p2 = people_ids(client)
    meal = client.post("/api/meals", json={"name": "Risotto"}).json

    res = client.put("/api/plan", json={"date": "2026-11-12", "slot": "lunch", "person_ids": [p1, p2], "meal_name": "risotto"})
    assert res.status_code == 200
    assert {e["meal"]["id"] for e in res.json} == {meal["id"]}
    assert len(client.get("/api/meals").json) == 1


def test_assign_creates_meal_and_replaces_entry(client):
    p1, _ = people_ids(client)
    client.put("/api/plan", json={"date": "2026-11-12", "slot": "dinner", "person_ids": [p1], "meal_name": "Tacos"})
    client.put("/api/plan", json={"date": "2026-11-12", "slot": "dinner", "person_ids": [p1], "meal_name": "Sushi"})

    plan = client.get("/api/plan?start=2026-11-12&days=1").json
    assert len(plan) == 1
    assert plan[0]["meal"]["name"] == "Sushi"
    assert {m["name"] for m in client.get("/api/meals").json} == {"Tacos", "Sushi"}


def test_renaming_meal_updates_plan(client):
    p1, _ = people_ids(client)
    entry = client.put("/api/plan", json={"date": "2026-11-12", "slot": "dinner", "person_ids": [p1], "meal_name": "Chili"}).json[0]
    client.patch(f"/api/meals/{entry['meal']['id']}", json={"name": "Chili sin carne"})
    plan = client.get("/api/plan?start=2026-11-09").json
    assert plan[0]["meal"]["name"] == "Chili sin carne"


def test_plan_week_range_and_delete(client):
    p1, _ = people_ids(client)
    for day in ["2026-11-08", "2026-11-09", "2026-11-15", "2026-11-16"]:
        client.put("/api/plan", json={"date": day, "slot": "lunch", "person_ids": [p1], "meal_name": "Soup"})
    plan = client.get("/api/plan?start=2026-11-09&days=7").json
    assert [e["date"] for e in plan] == ["2026-11-09", "2026-11-15"]

    assert client.delete(f"/api/plan/{plan[0]['id']}").status_code == 204
    assert len(client.get("/api/plan?start=2026-11-09").json) == 1


@pytest.mark.parametrize(
    "payload",
    [
        {"date": "nope", "slot": "lunch", "person_ids": [1], "meal_name": "x"},
        {"date": "2026-11-12", "slot": "breakfast", "person_ids": [1], "meal_name": "x"},
        {"date": "2026-11-12", "slot": "lunch", "person_ids": [], "meal_name": "x"},
        {"date": "2026-11-12", "slot": "lunch", "person_ids": [1]},
        {"date": "2026-11-12", "slot": "lunch", "person_ids": [1], "meal_name": "   "},
    ],
)
def test_assign_validation(client, payload):
    assert client.put("/api/plan", json=payload).status_code == 400


def test_assign_unknown_person_or_meal(client):
    assert client.put("/api/plan", json={"date": "2026-11-12", "slot": "lunch", "person_ids": [999], "meal_name": "x"}).status_code == 404
    assert client.put("/api/plan", json={"date": "2026-11-12", "slot": "lunch", "person_ids": [1], "meal_id": 999}).status_code == 404


def test_delete_used_meal_requires_force(client):
    p1, _ = people_ids(client)
    entry = client.put("/api/plan", json={"date": "2026-11-12", "slot": "lunch", "person_ids": [p1], "meal_name": "Toast"}).json[0]
    meal_id = entry["meal"]["id"]
    res = client.delete(f"/api/meals/{meal_id}")
    assert res.status_code == 409
    assert res.json["usage_count"] == 1
    assert client.delete(f"/api/meals/{meal_id}?force=true").status_code == 204
    assert client.get("/api/plan?start=2026-11-12&days=1").json == []


def test_copy_week(client):
    p1, p2 = people_ids(client)
    client.put("/api/plan", json={"date": "2026-11-02", "slot": "lunch", "person_ids": [p1, p2], "meal_name": "Salad"})
    client.put("/api/plan", json={"date": "2026-11-03", "slot": "dinner", "person_ids": [p1], "meal_name": "Stew"})
    client.put("/api/plan", json={"date": "2026-11-10", "slot": "dinner", "person_ids": [p1], "meal_name": "Keep me"})

    res = client.post("/api/plan/copy", json={"from": "2026-11-02", "to": "2026-11-09"})
    assert res.json["copied"] == 2
    week = client.get("/api/plan?start=2026-11-09").json
    assert sorted((e["date"], e["slot"], e["meal"]["name"]) for e in week) == [
        ("2026-11-09", "lunch", "Salad"),
        ("2026-11-09", "lunch", "Salad"),
        ("2026-11-10", "dinner", "Keep me"),
    ]

    client.post("/api/plan/copy", json={"from": "2026-11-02", "to": "2026-11-09", "overwrite": True})
    week = client.get("/api/plan?start=2026-11-09").json
    assert ("2026-11-10", "dinner", "Stew") in [(e["date"], e["slot"], e["meal"]["name"]) for e in week]


# --- people -----------------------------------------------------------------


def test_people_crud(client):
    res = client.post("/api/people", json={"name": "Kid", "color": "#22C55E"})
    assert res.status_code == 201
    assert res.json["color"] == "#22c55e"
    assert res.json["position"] == 2
    assert client.post("/api/people", json={"name": "X", "color": "red"}).status_code == 400

    pid = res.json["id"]
    assert client.patch(f"/api/people/{pid}", json={"name": "Lena"}).json["name"] == "Lena"
    assert len(client.get("/api/people").json) == 3
    assert client.delete(f"/api/people/{pid}").status_code == 204


def test_delete_person_with_entries_requires_force_and_keeps_one(client):
    p1, p2 = people_ids(client)
    client.put("/api/plan", json={"date": "2026-11-12", "slot": "lunch", "person_ids": [p2], "meal_name": "Wrap"})
    assert client.delete(f"/api/people/{p2}").status_code == 409
    assert client.delete(f"/api/people/{p2}?force=true").status_code == 204
    assert client.get("/api/plan?start=2026-11-12&days=1").json == []
    assert client.delete(f"/api/people/{p1}").status_code == 409
