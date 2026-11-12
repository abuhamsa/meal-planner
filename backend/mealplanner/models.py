from datetime import datetime, timezone

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import CheckConstraint, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase


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

    def to_dict(self, usage_count=None, last_planned=None):
        data = {
            "id": self.id,
            "name": self.name,
            "recipe_url": self.recipe_url,
            "notes": self.notes,
            "favorite": self.favorite,
        }
        if usage_count is not None:
            data["usage_count"] = usage_count
            data["last_planned"] = last_planned.isoformat() if last_planned else None
        return data


class PlanEntry(db.Model):
    """One person eats one meal in one slot on one day."""

    __tablename__ = "plan_entry"
    __table_args__ = (
        UniqueConstraint("date", "slot", "person_id", name="uq_plan_entry_date_slot_person"),
        CheckConstraint("slot IN ('lunch', 'dinner')", name="ck_plan_entry_slot"),
    )

    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False, index=True)
    slot = db.Column(db.String(10), nullable=False)
    person_id = db.Column(
        db.Integer, db.ForeignKey("person.id", ondelete="CASCADE"), nullable=False, index=True
    )
    meal_id = db.Column(
        db.Integer, db.ForeignKey("meal.id", ondelete="CASCADE"), nullable=False, index=True
    )

    person = db.relationship("Person", back_populates="entries")
    meal = db.relationship("Meal", back_populates="entries")

    def to_dict(self):
        return {
            "id": self.id,
            "date": self.date.isoformat(),
            "slot": self.slot,
            "person_id": self.person_id,
            "meal": self.meal.to_dict(),
        }
