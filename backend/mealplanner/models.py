from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import CheckConstraint, UniqueConstraint, exists
from sqlalchemy.orm import DeclarativeBase, column_property


class Base(DeclarativeBase):
    pass


db = SQLAlchemy(model_class=Base)

SLOTS = ("lunch", "dinner")


def utcnow():
    return datetime.now(timezone.utc)


class Person(db.Model):
    __tablename__ = "person"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    color = db.Column(db.String(7), nullable=False, default="#6366f1")
    position = db.Column(db.Integer, nullable=False, default=0)
    # Kids follow another person: without their own plan entry they eat what that person eats.
    follows_person_id = db.Column(
        db.Integer, db.ForeignKey("person.id", name="fk_person_follows_person_id", ondelete="SET NULL")
    )
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    entries = db.relationship(
        "PlanEntry", back_populates="person", cascade="all, delete-orphan", passive_deletes=True
    )

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "color": self.color,
            "position": self.position,
            "follows_person_id": self.follows_person_id,
        }


class Meal(db.Model):
    """A reusable dish. Plan entries reference meals instead of storing free text."""

    __tablename__ = "meal"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    # Lower-cased, whitespace-collapsed name, used to keep names unique regardless of case.
    name_key = db.Column(db.String(100), nullable=False, unique=True, index=True)
    recipe_url = db.Column(db.String(500))
    notes = db.Column(db.Text)
    favorite = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    entries = db.relationship(
        "PlanEntry", back_populates="meal", cascade="all, delete-orphan", passive_deletes=True
    )
    recipe = db.relationship(
        "Recipe", back_populates="meal", uselist=False, cascade="all, delete-orphan", passive_deletes=True
    )

    def to_dict(self, usage_count=None, last_planned=None):
        data = {
            "id": self.id,
            "name": self.name,
            "recipe_url": self.recipe_url,
            "notes": self.notes,
            "favorite": self.favorite,
            "has_recipe": bool(self.has_recipe),
        }
        if usage_count is not None:
            data["usage_count"] = usage_count
            data["last_planned"] = last_planned.isoformat() if last_planned else None
        return data


class Recipe(db.Model):
    """A recipe imported from a meal's recipe URL. At most one per meal."""

    __tablename__ = "recipe"

    meal_id = db.Column(db.Integer, db.ForeignKey("meal.id", ondelete="CASCADE"), primary_key=True)
    source_url = db.Column(db.String(500), nullable=False)
    title = db.Column(db.String(200))
    site = db.Column(db.String(100))
    # Free text as the site gives it, e.g. "4 servings".
    yields = db.Column(db.String(100))
    # Minutes.
    total_time = db.Column(db.Integer)
    prep_time = db.Column(db.Integer)
    cook_time = db.Column(db.Integer)
    # [{"purpose": "Für den Teig" | null, "ingredients": ["140 g Salsiz", ...]}, ...]
    ingredient_groups = db.Column(db.JSON, nullable=False, default=list)
    # ["Step one...", "Step two..."]
    instructions = db.Column(db.JSON, nullable=False, default=list)
    # File name inside DATA_DIR/recipe-images, downloaded at import time.
    image = db.Column(db.String(100))
    imported_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    meal = db.relationship("Meal", back_populates="recipe")

    def to_dict(self):
        return {
            "meal_id": self.meal_id,
            "source_url": self.source_url,
            "title": self.title,
            "site": self.site,
            "yields": self.yields,
            "total_time": self.total_time,
            "prep_time": self.prep_time,
            "cook_time": self.cook_time,
            "ingredient_groups": self.ingredient_groups or [],
            "instructions": self.instructions or [],
            "image_url": f"/api/recipe-images/{self.image}" if self.image else None,
            "imported_at": self.imported_at.isoformat() if self.imported_at else None,
        }


# Lets meal lists say whether a recipe exists without loading it.
Meal.has_recipe = column_property(exists().where(Recipe.meal_id == Meal.id))


class PlanEntry(db.Model):
    """One person eats one meal in one slot on one day, or eats out (no meal)."""

    __tablename__ = "plan_entry"
    __table_args__ = (
        UniqueConstraint("date", "slot", "person_id", name="uq_plan_entry_date_slot_person"),
        CheckConstraint("slot IN ('lunch', 'dinner')", name="ck_plan_entry_slot"),
        CheckConstraint(
            "(eating_out = 1 AND meal_id IS NULL AND leftovers = 0) OR (eating_out = 0 AND meal_id IS NOT NULL)",
            name="ck_plan_entry_meal_or_out",
        ),
    )

    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False, index=True)
    slot = db.Column(db.String(10), nullable=False)
    person_id = db.Column(
        db.Integer, db.ForeignKey("person.id", ondelete="CASCADE"), nullable=False, index=True
    )
    meal_id = db.Column(
        db.Integer, db.ForeignKey("meal.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # Eating the rest of an earlier meal. Shown as "Leftovers: <meal>" and not counted in stats.
    leftovers = db.Column(db.Boolean, nullable=False, default=False, server_default=db.false())
    # Restaurant, invitation, canteen...: planned, but not a meal from the library.
    eating_out = db.Column(db.Boolean, nullable=False, default=False, server_default=db.false())
    # Where, for eating out, e.g. "Restaurant Traube".
    note = db.Column(db.String(100))

    person = db.relationship("Person", back_populates="entries")
    meal = db.relationship("Meal", back_populates="entries")

    def to_dict(self):
        return {
            "id": self.id,
            "date": self.date.isoformat(),
            "slot": self.slot,
            "person_id": self.person_id,
            "leftovers": self.leftovers,
            "eating_out": self.eating_out,
            "note": self.note,
            "meal": self.meal.to_dict() if self.meal else None,
        }


class PlanSlot(db.Model):
    """Things about a whole lunch or dinner, independent of who eats what, e.g. guests."""

    __tablename__ = "plan_slot"
    __table_args__ = (
        UniqueConstraint("date", "slot", name="uq_plan_slot_date_slot"),
        CheckConstraint("slot IN ('lunch', 'dinner')", name="ck_plan_slot_slot"),
    )

    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False, index=True)
    slot = db.Column(db.String(10), nullable=False)
    guests = db.Column(db.Boolean, nullable=False, default=False, server_default=db.false())
    # Who's coming, e.g. "Müllers".
    guests_note = db.Column(db.String(100))

    def to_dict(self):
        return {"date": self.date.isoformat(), "slot": self.slot, "guests": self.guests, "guests_note": self.guests_note}
