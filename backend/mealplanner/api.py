import re
from datetime import date, timedelta
from urllib.parse import urlparse

from flask import Blueprint, abort, current_app, jsonify, request
from sqlalchemy import func

from . import __version__
from .models import SLOTS, Meal, Person, PlanEntry, db

api = Blueprint("api", __name__, url_prefix="/api")

MAX_PLAN_DAYS = 62
HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


# --- auth -------------------------------------------------------------------


@api.before_request
def require_proxy_auth():
    """Authentication itself happens in the reverse proxy (SWAG + Authentik forward auth).

    The proxy only forwards a request after Authentik has confirmed a valid session, and it
    sets the user headers itself. Rejecting requests without the header makes the backend fail
    closed if it is ever reached without going through the proxy.
    """
    if current_app.config["AUTH_MODE"] == "proxy":
        if not request.headers.get(current_app.config["AUTH_USER_HEADER"]):
            abort(401, "Not authenticated")
    if request.method in ("POST", "PUT", "PATCH") and not request.is_json:
        abort(415, "Expected a JSON body")


def current_user():
    if current_app.config["AUTH_MODE"] == "none":
        return {"username": current_app.config["DEV_USER"], "name": current_app.config["DEV_USER"], "email": None}
    username = request.headers.get(current_app.config["AUTH_USER_HEADER"])
    return {
        "username": username,
        "name": request.headers.get("X-authentik-name") or username,
        "email": request.headers.get("X-authentik-email") or None,
    }


# --- validation helpers -----------------------------------------------------


def body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        abort(400, "Expected a JSON object")
    return data


def parse_date(value, field="date"):
    try:
        return date.fromisoformat(value)
    except (TypeError, ValueError):
        abort(400, f"'{field}' must be a date in YYYY-MM-DD format")


def clean_str(value, field, max_len, required=False):
    if value is None:
        if required:
            abort(400, f"'{field}' is required")
        return None
    if not isinstance(value, str):
        abort(400, f"'{field}' must be a string")
    value = " ".join(value.split()) if field == "name" else value.strip()
    if not value:
        if required:
            abort(400, f"'{field}' must not be empty")
        return None
    if len(value) > max_len:
        abort(400, f"'{field}' must be at most {max_len} characters")
    return value


def clean_url(value):
    value = clean_str(value, "recipe_url", 500)
    if value is None:
        return None
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        abort(400, "'recipe_url' must be an http(s) URL")
    return value


def name_key(name):
    return " ".join(name.split()).casefold()


def get_or_404(model, obj_id):
    obj = db.session.get(model, obj_id)
    if obj is None:
        abort(404, f"{model.__name__} {obj_id} not found")
    return obj


# --- misc -------------------------------------------------------------------


@api.get("/me")
def me():
    return jsonify(user=current_user(), version=__version__)


# --- people -----------------------------------------------------------------


@api.get("/people")
def list_people():
    people = Person.query.order_by(Person.position, Person.id).all()
    return jsonify([p.to_dict() for p in people])


def apply_person_fields(person, data):
    if "name" in data:
        person.name = clean_str(data["name"], "name", 50, required=True)
    if "color" in data:
        if not isinstance(data["color"], str) or not HEX_COLOR.match(data["color"]):
            abort(400, "'color' must be a hex color like #6366f1")
        person.color = data["color"].lower()
    if "position" in data:
        if not isinstance(data["position"], int) or isinstance(data["position"], bool):
            abort(400, "'position' must be an integer")
        person.position = data["position"]


@api.post("/people")
def create_person():
    data = body()
    if "name" not in data:
        abort(400, "'name' is required")
    next_position = (db.session.query(func.max(Person.position)).scalar() or 0) + 1
    person = Person(position=next_position)
    apply_person_fields(person, data)
    db.session.add(person)
    db.session.commit()
    return jsonify(person.to_dict()), 201


@api.patch("/people/<int:person_id>")
def update_person(person_id):
    person = get_or_404(Person, person_id)
    apply_person_fields(person, body())
    db.session.commit()
    return jsonify(person.to_dict())


@api.delete("/people/<int:person_id>")
def delete_person(person_id):
    person = get_or_404(Person, person_id)
    if Person.query.count() <= 1:
        abort(409, "You need at least one person")
    used = PlanEntry.query.filter_by(person_id=person.id).count()
    if used and request.args.get("force") != "true":
        return jsonify(error=f"{person.name} has {used} planned meals", usage_count=used), 409
    db.session.delete(person)
    db.session.commit()
    return "", 204


# --- meals ------------------------------------------------------------------


def meal_stats_query():
    return (
        db.session.query(
            Meal,
            func.count(PlanEntry.id).label("usage_count"),
            func.max(PlanEntry.date).label("last_planned"),
        )
        .outerjoin(PlanEntry, PlanEntry.meal_id == Meal.id)
        .group_by(Meal.id)
    )


def meal_with_stats(meal_id):
    row = meal_stats_query().filter(Meal.id == meal_id).one()
    return row[0].to_dict(row[1], row[2])


@api.get("/meals")
def list_meals():
    query = meal_stats_query()
    q = (request.args.get("q") or "").strip()
    if q:
        escaped = q.casefold().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.filter(Meal.name_key.like(f"%{escaped}%", escape="\\"))

    sort = request.args.get("sort", "name")
    if sort == "frequent":
        query = query.order_by(func.count(PlanEntry.id).desc(), Meal.name_key)
    elif sort == "recent":
        query = query.order_by(func.max(PlanEntry.date).desc().nulls_last(), Meal.name_key)
    elif sort == "name":
        query = query.order_by(Meal.favorite.desc(), Meal.name_key)
    else:
        abort(400, "'sort' must be one of name, frequent, recent")

    limit = request.args.get("limit", type=int)
    if limit:
        query = query.limit(min(max(limit, 1), 500))

    return jsonify([meal.to_dict(count, last) for meal, count, last in query.all()])


def apply_meal_fields(meal, data):
    if "name" in data:
        name = clean_str(data["name"], "name", 100, required=True)
        key = name_key(name)
        clash = Meal.query.filter(Meal.name_key == key, Meal.id != meal.id).first()
        if clash:
            abort(409, f"A meal called '{clash.name}' already exists")
        meal.name, meal.name_key = name, key
    if "recipe_url" in data:
        meal.recipe_url = clean_url(data["recipe_url"])
    if "notes" in data:
        meal.notes = clean_str(data["notes"], "notes", 5000)
    if "favorite" in data:
        if not isinstance(data["favorite"], bool):
            abort(400, "'favorite' must be true or false")
        meal.favorite = data["favorite"]


@api.post("/meals")
def create_meal():
    data = body()
    if "name" not in data:
        abort(400, "'name' is required")
    meal = Meal()
    apply_meal_fields(meal, data)
    db.session.add(meal)
    db.session.commit()
    return jsonify(meal_with_stats(meal.id)), 201


@api.get("/meals/<int:meal_id>")
def get_meal(meal_id):
    get_or_404(Meal, meal_id)
    return jsonify(meal_with_stats(meal_id))


@api.patch("/meals/<int:meal_id>")
def update_meal(meal_id):
    meal = get_or_404(Meal, meal_id)
    apply_meal_fields(meal, body())
    db.session.commit()
    return jsonify(meal_with_stats(meal.id))


@api.delete("/meals/<int:meal_id>")
def delete_meal(meal_id):
    meal = get_or_404(Meal, meal_id)
    used = PlanEntry.query.filter_by(meal_id=meal.id).count()
    if used and request.args.get("force") != "true":
        return jsonify(error=f"'{meal.name}' is used in {used} planned meals", usage_count=used), 409
    db.session.delete(meal)
    db.session.commit()
    return "", 204


# --- plan -------------------------------------------------------------------


@api.get("/plan")
def get_plan():
    start = parse_date(request.args.get("start"), "start")
    days = request.args.get("days", default=7, type=int)
    if not 1 <= days <= MAX_PLAN_DAYS:
        abort(400, f"'days' must be between 1 and {MAX_PLAN_DAYS}")
    end = start + timedelta(days=days - 1)
    entries = (
        PlanEntry.query.options(db.joinedload(PlanEntry.meal))
        .filter(PlanEntry.date.between(start, end))
        .order_by(PlanEntry.date, PlanEntry.slot)
        .all()
    )
    return jsonify([e.to_dict() for e in entries])


@api.put("/plan")
def set_plan():
    """Assign a meal to one or more people for a date + slot.

    Body: {date, slot, person_ids: [..], meal_id} or {..., meal_name} to pick an existing
    meal by name or create it on the fly.
    """
    data = body()
    day = parse_date(data.get("date"))
    slot = data.get("slot")
    if slot not in SLOTS:
        abort(400, f"'slot' must be one of {', '.join(SLOTS)}")

    person_ids = data.get("person_ids")
    if (
        not isinstance(person_ids, list)
        or not person_ids
        or not all(isinstance(i, int) and not isinstance(i, bool) for i in person_ids)
    ):
        abort(400, "'person_ids' must be a non-empty list of ids")
    person_ids = sorted(set(person_ids))
    found = {p.id for p in Person.query.filter(Person.id.in_(person_ids)).all()}
    missing = [i for i in person_ids if i not in found]
    if missing:
        abort(404, f"Unknown person ids: {missing}")

    if data.get("meal_id") is not None:
        if not isinstance(data["meal_id"], int) or isinstance(data["meal_id"], bool):
            abort(400, "'meal_id' must be an integer")
        meal = get_or_404(Meal, data["meal_id"])
    elif data.get("meal_name") is not None:
        name = clean_str(data["meal_name"], "name", 100, required=True)
        meal = Meal.query.filter_by(name_key=name_key(name)).first()
        if meal is None:
            meal = Meal(name=name, name_key=name_key(name))
            db.session.add(meal)
    else:
        abort(400, "Either 'meal_id' or 'meal_name' is required")

    existing = {
        e.person_id: e
        for e in PlanEntry.query.filter(
            PlanEntry.date == day, PlanEntry.slot == slot, PlanEntry.person_id.in_(person_ids)
        )
    }
    for pid in person_ids:
        entry = existing.get(pid)
        if entry:
            entry.meal = meal
        else:
            db.session.add(PlanEntry(date=day, slot=slot, person_id=pid, meal=meal))
    db.session.commit()

    entries = PlanEntry.query.filter(PlanEntry.date == day, PlanEntry.slot == slot).all()
    return jsonify([e.to_dict() for e in entries])


@api.delete("/plan/<int:entry_id>")
def delete_plan_entry(entry_id):
    entry = get_or_404(PlanEntry, entry_id)
    db.session.delete(entry)
    db.session.commit()
    return "", 204


@api.post("/plan/copy")
def copy_plan():
    """Copy a range of days onto another start date, e.g. last week onto this week.

    Body: {from, to, days=7, overwrite=false}. Existing entries in the target range are
    kept unless overwrite is true.
    """
    data = body()
    src = parse_date(data.get("from"), "from")
    dst = parse_date(data.get("to"), "to")
    days = data.get("days", 7)
    if not isinstance(days, int) or isinstance(days, bool) or not 1 <= days <= MAX_PLAN_DAYS:
        abort(400, f"'days' must be between 1 and {MAX_PLAN_DAYS}")
    overwrite = data.get("overwrite", False) is True
    offset = dst - src

    source = PlanEntry.query.filter(PlanEntry.date.between(src, src + timedelta(days=days - 1))).all()
    target = {
        (e.date, e.slot, e.person_id): e
        for e in PlanEntry.query.filter(PlanEntry.date.between(dst, dst + timedelta(days=days - 1)))
    }
    copied = 0
    for e in source:
        key = (e.date + offset, e.slot, e.person_id)
        if key in target:
            if not overwrite:
                continue
            target[key].meal_id = e.meal_id
        else:
            db.session.add(PlanEntry(date=key[0], slot=e.slot, person_id=e.person_id, meal_id=e.meal_id))
        copied += 1
    db.session.commit()
    return jsonify(copied=copied)
