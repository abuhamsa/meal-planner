""""What are we eating next?" as one German sentence, for Siri via Apple Shortcuts.

Always German, whatever language the asking device uses. The Shortcut speaks the `text` field.
"""

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from flask import current_app

from .models import Person, PlanEntry, PlanSlot, db

# Lunch is "next" until 13:00, then dinner until 21:00, then tomorrow's lunch.
LUNCH_UNTIL = time(13, 0)
DINNER_UNTIL = time(21, 0)


def local_now():
    return datetime.now(ZoneInfo(current_app.config["TIMEZONE"]))


def next_slot(now):
    if now.time() < LUNCH_UNTIL:
        return now.date(), "lunch"
    if now.time() < DINNER_UNTIL:
        return now.date(), "dinner"
    return now.date() + timedelta(days=1), "lunch"


def join_names(names):
    if len(names) == 1:
        return names[0]
    return f"{', '.join(names[:-1])} und {names[-1]}"


def resolve_entries(day, slot):
    """[(person, entry)] in display order. Kids without their own entry eat what the person
    they follow eats; people with nothing planned are left out."""
    people = Person.query.order_by(Person.position, Person.id).all()
    entries = {
        e.person_id: e
        for e in PlanEntry.query.options(db.joinedload(PlanEntry.meal)).filter_by(date=day, slot=slot)
    }
    resolved = []
    for person in people:
        entry = entries.get(person.id) or entries.get(person.follows_person_id)
        if entry is not None:
            resolved.append((person, entry))
    return resolved


def group_entries(resolved):
    """Groups people who eat the same thing, in order of first appearance.

    Returns [(kind, label, [names])], kind "meal" or "out"; label is the dish or the
    eating-out note.
    """
    groups = {}
    for person, entry in resolved:
        if entry.eating_out:
            key, kind, label = ("out", entry.note), "out", entry.note
        else:
            key, kind = ("meal", entry.meal_id, entry.leftovers), "meal"
            label = f"Reste von {entry.meal.name}" if entry.leftovers else entry.meal.name
        groups.setdefault(key, (kind, label, []))[2].append(person.name)
    return list(groups.values())


def build_text(when, groups, guests=None):
    """`when` is e.g. "Heute Abend". `guests` is the PlanSlot row, if any."""
    if not groups:
        return f"{when} ist noch nichts geplant."

    meals = [g for g in groups if g[0] == "meal"]
    outs = [g for g in groups if g[0] == "out"]
    sentences = []

    if len(meals) == 1 and not outs:
        sentences.append(f"{when} gibt es {meals[0][1]}.")
    elif meals:
        parts = [f"{dish} für {join_names(names)}" for _, dish, names in meals]
        sentences.append(f"{when} gibt es {join_names(parts)}.")

    for i, (_, note, names) in enumerate(outs):
        verb = "isst" if len(names) == 1 else "essen"
        where = f", {note}" if note else ""
        if not meals and i == 0:
            sentences.append(f"{when} {verb} {join_names(names)} auswärts{where}.")
        else:
            sentences.append(f"{join_names(names)} {verb} auswärts{where}.")

    if guests is not None and guests.guests:
        sentences.append(f"Es kommen Gäste: {guests.guests_note}." if guests.guests_note else "Es kommen Gäste.")

    return " ".join(sentences)


def next_meal(now=None):
    now = now or local_now()
    day, slot = next_slot(now)
    when = f"{'Heute' if day == now.date() else 'Morgen'} {'Mittag' if slot == 'lunch' else 'Abend'}"
    guests = PlanSlot.query.filter_by(date=day, slot=slot).first()
    text = build_text(when, group_entries(resolve_entries(day, slot)), guests)
    return {"text": text, "date": day.isoformat(), "slot": slot}
