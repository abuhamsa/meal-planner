import re
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import urlparse

from flask import Blueprint, abort, current_app, jsonify, request, send_from_directory
from sqlalchemy import func

from . import __version__
from .models import SLOTS, Meal, Person, PlanEntry, PlanSlot, Recipe, db, utcnow
from .recipe_import import RecipeImportError, download_image, scrape

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
    if "follows_person_id" in data:
        target_id = data["follows_person_id"]
        if target_id is None:
            person.follows_person_id = None
            return
        if not isinstance(target_id, int) or isinstance(target_id, bool):
            abort(400, "'follows_person_id' must be an integer or null")
        target = get_or_404(Person, target_id)
        if person.id is not None and target.id == person.id:
            abort(400, "A person can't follow themselves")
        if target.follows_person_id is not None:
            abort(400, f"{target.name} already follows someone else; pick a person who plans their own meals")
        if person.id is not None and Person.query.filter_by(follows_person_id=person.id).count():
            abort(400, f"Others follow {person.name}, so {person.name} must keep planning their own meals")
        person.follows_person_id = target.id


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
        # Leftovers reuse a meal but aren't counted as having it planned again.
        .outerjoin(PlanEntry, (PlanEntry.meal_id == Meal.id) & PlanEntry.leftovers.is_(False))
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
    image = meal.recipe.image if meal.recipe else None
    db.session.delete(meal)
    db.session.commit()
    remove_image(image)
    return "", 204


# --- recipes ----------------------------------------------------------------


def images_dir():
    return Path(current_app.config["DATA_DIR"]) / "recipe-images"


def remove_image(name):
    if name:
        (images_dir() / name).unlink(missing_ok=True)


def import_recipe(meal):
    """Fetch the recipe behind meal.recipe_url and store it, replacing an earlier import.

    Raises RecipeImportError with a message for the user.
    """
    if not meal.recipe_url:
        raise RecipeImportError("Add a recipe link first")
    data = scrape(meal.recipe_url)
    image_source = data.pop("image_source")
    image = download_image(image_source, images_dir(), meal.id) if image_source else None

    recipe = meal.recipe or Recipe(meal=meal)
    old_image = recipe.image
    for field, value in data.items():
        setattr(recipe, field, value)
    recipe.source_url, recipe.image, recipe.imported_at = meal.recipe_url, image, utcnow()
    db.session.add(recipe)
    db.session.commit()
    if old_image != image:
        remove_image(old_image)
    return recipe


@api.get("/meals/<int:meal_id>/recipe")
def get_recipe(meal_id):
    meal = get_or_404(Meal, meal_id)
    if meal.recipe is None:
        abort(404, f"'{meal.name}' has no saved recipe")
    return jsonify(meal.recipe.to_dict())


@api.post("/meals/<int:meal_id>/recipe")
def create_recipe(meal_id):
    """Import (or re-import) the recipe from the meal's recipe link."""
    meal = get_or_404(Meal, meal_id)
    try:
        recipe = import_recipe(meal)
    except RecipeImportError as e:
        db.session.rollback()
        return jsonify(error=f"Couldn't import the recipe: {e}"), 422
    return jsonify(recipe.to_dict())


def clean_lines(value, field, max_items, max_len):
    """A list of non-empty strings; blank entries are dropped."""
    if not isinstance(value, list) or len(value) > max_items:
        abort(400, f"'{field}' must be a list of at most {max_items} entries")
    lines = [clean_str(line, field, max_len) for line in value]
    return [line for line in lines if line]


def clean_minutes(value, field):
    if value is None:
        return None
    if not isinstance(value, int) or isinstance(value, bool) or not 0 < value <= 10000:
        abort(400, f"'{field}' must be a number of minutes between 1 and 10000")
    return value


@api.put("/meals/<int:meal_id>/recipe")
def save_recipe(meal_id):
    """Write a recipe by hand, or edit a saved one. The picture and source link of an imported
    recipe are kept. Re-importing (POST) replaces hand-made changes."""
    meal = get_or_404(Meal, meal_id)
    data = body()

    groups_in = data.get("ingredient_groups", [])
    if not isinstance(groups_in, list) or len(groups_in) > 30:
        abort(400, "'ingredient_groups' must be a list of at most 30 groups")
    groups = []
    for group in groups_in:
        if not isinstance(group, dict):
            abort(400, "'ingredient_groups' entries must be objects")
        ingredients = clean_lines(group.get("ingredients", []), "ingredients", 200, 500)
        if ingredients:
            groups.append({"purpose": clean_str(group.get("purpose"), "purpose", 200), "ingredients": ingredients})
    instructions = clean_lines(data.get("instructions", []), "instructions", 100, 5000)
    if not groups and not instructions:
        abort(400, "Add at least one ingredient or step")

    recipe = meal.recipe or Recipe(meal=meal)
    recipe.yields = clean_str(data.get("yields"), "yields", 100)
    # One time field when writing by hand; it replaces the prep/cook split of an import.
    recipe.total_time = clean_minutes(data.get("total_time"), "total_time")
    recipe.prep_time = recipe.cook_time = None
    recipe.ingredient_groups = groups
    recipe.instructions = instructions
    recipe.imported_at = recipe.imported_at or utcnow()
    db.session.add(recipe)
    db.session.commit()
    return jsonify(recipe.to_dict())


@api.delete("/meals/<int:meal_id>/recipe")
def delete_recipe(meal_id):
    meal = get_or_404(Meal, meal_id)
    if meal.recipe:
        image = meal.recipe.image
        db.session.delete(meal.recipe)
        db.session.commit()
        remove_image(image)
    return "", 204


@api.get("/recipe-images/<path:name>")
def recipe_image(name):
    # send_from_directory refuses paths that escape the folder.
    response = send_from_directory(images_dir(), name, max_age=31536000)
    response.headers["Cache-Control"] = "private, max-age=31536000, immutable"
    return response


# --- plan -------------------------------------------------------------------


def plan_range():
    start = parse_date(request.args.get("start"), "start")
    days = request.args.get("days", default=7, type=int)
    if not 1 <= days <= MAX_PLAN_DAYS:
        abort(400, f"'days' must be between 1 and {MAX_PLAN_DAYS}")
    return start, start + timedelta(days=days - 1)


@api.get("/plan")
def get_plan():
    start, end = plan_range()
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
    meal by name or create it on the fly, or {..., eating_out: true, note?} for eating out.
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

    eating_out = data.get("eating_out", False)
    if not isinstance(eating_out, bool):
        abort(400, "'eating_out' must be true or false")
    note = clean_str(data.get("note"), "note", 100) if eating_out else None

    meal = None
    if eating_out:
        if data.get("meal_id") is not None or data.get("meal_name") is not None or data.get("leftovers"):
            abort(400, "Eating out can't be combined with a meal or leftovers")
    elif data.get("meal_id") is not None:
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

    leftovers = data.get("leftovers", False)
    if not isinstance(leftovers, bool):
        abort(400, "'leftovers' must be true or false")

    existing = {
        e.person_id: e
        for e in PlanEntry.query.filter(
            PlanEntry.date == day, PlanEntry.slot == slot, PlanEntry.person_id.in_(person_ids)
        )
    }
    for pid in person_ids:
        entry = existing.get(pid)
        if entry is None:
            entry = PlanEntry(date=day, slot=slot, person_id=pid)
            db.session.add(entry)
        entry.meal, entry.leftovers, entry.eating_out, entry.note = meal, leftovers, eating_out, note
    db.session.commit()

    entries = PlanEntry.query.filter(PlanEntry.date == day, PlanEntry.slot == slot).all()
    return jsonify([e.to_dict() for e in entries])


LEFTOVER_LOOKBACK_DAYS = 7


@api.get("/plan/previous")
def previous_meal():
    """The most recent planned meal before a date + slot, as a source for leftovers.

    Query: date, slot, person_ids (comma-separated). Looks back up to a week. Returns
    {meal, date, slot} or {meal: null}.
    """
    day = parse_date(request.args.get("date"))
    slot = request.args.get("slot")
    if slot not in SLOTS:
        abort(400, f"'slot' must be one of {', '.join(SLOTS)}")
    try:
        person_ids = [int(i) for i in request.args.get("person_ids", "").split(",") if i]
    except ValueError:
        abort(400, "'person_ids' must be comma-separated ids")
    if not person_ids:
        abort(400, "'person_ids' is required")

    # Dinner comes after lunch on the same day.
    slot_order = db.case((PlanEntry.slot == "dinner", 1), else_=0)
    before = (PlanEntry.date < day) | ((PlanEntry.date == day) & (slot_order < SLOTS.index(slot)))
    entry = (
        PlanEntry.query.filter(
            PlanEntry.person_id.in_(person_ids),
            PlanEntry.meal_id.is_not(None),  # eating out leaves nothing over
            PlanEntry.date >= day - timedelta(days=LEFTOVER_LOOKBACK_DAYS),
            before,
        )
        .order_by(PlanEntry.date.desc(), slot_order.desc(), PlanEntry.leftovers)
        .first()
    )
    if entry is None:
        return jsonify(meal=None)
    return jsonify(meal=entry.meal.to_dict(), date=entry.date.isoformat(), slot=entry.slot)


@api.delete("/plan/<int:entry_id>")
def delete_plan_entry(entry_id):
    entry = get_or_404(PlanEntry, entry_id)
    db.session.delete(entry)
    db.session.commit()
    return "", 204


@api.get("/plan/slots")
def get_plan_slots():
    """Per-slot details (guests) for a date range. Slots without anything set are left out."""
    start, end = plan_range()
    slots = PlanSlot.query.filter(PlanSlot.date.between(start, end)).order_by(PlanSlot.date, PlanSlot.slot)
    return jsonify([s.to_dict() for s in slots])


@api.put("/plan/slots")
def set_plan_slot():
    """Body: {date, slot, guests: bool, guests_note?}."""
    data = body()
    day = parse_date(data.get("date"))
    slot = data.get("slot")
    if slot not in SLOTS:
        abort(400, f"'slot' must be one of {', '.join(SLOTS)}")
    guests = data.get("guests")
    if not isinstance(guests, bool):
        abort(400, "'guests' must be true or false")
    note = clean_str(data.get("guests_note"), "guests_note", 100) if guests else None

    row = PlanSlot.query.filter_by(date=day, slot=slot).first()
    if not guests:
        if row:
            db.session.delete(row)
            db.session.commit()
        return jsonify(date=day.isoformat(), slot=slot, guests=False, guests_note=None)
    if row is None:
        row = PlanSlot(date=day, slot=slot)
        db.session.add(row)
    row.guests, row.guests_note = True, note
    db.session.commit()
    return jsonify(row.to_dict())
