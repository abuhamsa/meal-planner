from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest

from mealplanner import next_meal as nm
from tests.test_api import AUTH, app, client, people_ids  # noqa: F401 (fixtures)

ZURICH = ZoneInfo("Europe/Zurich")


def at(hour, minute=0, day=date(2026, 11, 17)):
    return datetime(day.year, day.month, day.day, hour, minute, tzinfo=ZURICH)


@pytest.fixture
def now(monkeypatch):
    """Set the clock the endpoint sees: now(hour, minute)."""

    def set_now(hour, minute=0):
        monkeypatch.setattr(nm, "local_now", lambda: at(hour, minute))

    set_now(18)
    return set_now


def plan(client, day, slot, person_ids, **kwargs):
    res = client.put("/api/plan", json={"date": day, "slot": slot, "person_ids": person_ids, **kwargs})
    assert res.status_code == 200, res.json


# --- which slot is next -------------------------------------------------------


@pytest.mark.parametrize(
    "hour, minute, expected",
    [
        (0, 0, (date(2026, 11, 17), "lunch")),
        (12, 59, (date(2026, 11, 17), "lunch")),
        (13, 0, (date(2026, 11, 17), "dinner")),
        (20, 59, (date(2026, 11, 17), "dinner")),
        (21, 0, (date(2026, 11, 18), "lunch")),
        (23, 59, (date(2026, 11, 18), "lunch")),
    ],
)
def test_next_slot_boundaries(hour, minute, expected):
    assert nm.next_slot(at(hour, minute)) == expected


# --- sentences ----------------------------------------------------------------


def test_join_names():
    assert nm.join_names(["A"]) == "A"
    assert nm.join_names(["A", "B"]) == "A und B"
    assert nm.join_names(["A", "B", "C"]) == "A, B und C"


def test_nothing_planned():
    assert nm.build_text("Heute Abend", []) == "Heute Abend ist noch nichts geplant."


def test_everyone_eats_the_same():
    groups = [("meal", "Pizza", ["Anna", "Ben"])]
    assert nm.build_text("Heute Abend", groups) == "Heute Abend gibt es Pizza."


def test_different_meals():
    groups = [("meal", "Pizza", ["Anna", "Ben"]), ("meal", "Salat", ["Clara"])]
    assert nm.build_text("Heute Abend", groups) == "Heute Abend gibt es Pizza für Anna und Ben und Salat für Clara."


def test_some_eat_out():
    groups = [("meal", "Pizza", ["Anna"]), ("out", "Restaurant Traube", ["Ben"])]
    assert nm.build_text("Heute Abend", groups) == "Heute Abend gibt es Pizza für Anna. Ben isst auswärts, Restaurant Traube."


def test_everyone_eats_out():
    groups = [("out", None, ["Anna", "Ben"])]
    assert nm.build_text("Morgen Mittag", groups) == "Morgen Mittag essen Anna und Ben auswärts."


# --- endpoint -----------------------------------------------------------------


def test_endpoint_requires_auth(app):  # noqa: F811
    assert app.test_client().get("/api/next-meal").status_code == 401


def test_endpoint_nothing_planned(client, now):  # noqa: F811
    res = client.get("/api/next-meal")
    assert res.json == {"text": "Heute Abend ist noch nichts geplant.", "date": "2026-11-17", "slot": "dinner"}


def test_endpoint_after_nine_is_tomorrows_lunch(client, now):  # noqa: F811
    p1, p2 = people_ids(client)
    plan(client, "2026-11-17", "dinner", [p1, p2], meal_name="Lasagne")
    plan(client, "2026-11-18", "lunch", [p1, p2], meal_name="Lasagne", leftovers=True)
    now(21, 30)
    res = client.get("/api/next-meal")
    assert res.json["text"] == "Morgen Mittag gibt es Reste von Lasagne."
    assert res.json["slot"] == "lunch"


def test_endpoint_kids_follow_and_guests(client, now):  # noqa: F811
    p1, p2 = people_ids(client)
    client.post("/api/people", json={"name": "Mia", "follows_person_id": p2})
    plan(client, "2026-11-17", "dinner", [p1], meal_name="Pizza")
    plan(client, "2026-11-17", "dinner", [p2], meal_name="Salat")
    client.put("/api/plan/slots", json={"date": "2026-11-17", "slot": "dinner", "guests": True, "guests_note": "Müllers"})
    res = client.get("/api/next-meal")
    assert res.json["text"] == (
        "Heute Abend gibt es Pizza für Person 1 und Salat für Person 2 und Mia. Es kommen Gäste: Müllers."
    )
