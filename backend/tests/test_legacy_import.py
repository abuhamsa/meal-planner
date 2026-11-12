import csv
import json
import sqlite3

import pytest

from mealplanner import create_app
from mealplanner.models import Meal, db
from tools.legacy_import import Curation, analyze, apply, parse_text, write_review


def names(text):
    return [(p.kind, p.name or p.reason, p.leftovers) for p in parse_text(text, merge_sides=True)]


@pytest.mark.parametrize(
    "text, expected",
    [
        ("  Spaghetti   Bolognese ", [("meal", "Spaghetti Bolognese", False)]),
        ("Reste Pizza", [("meal", "Pizza", True)]),
        ("Reste Reste Pizza", [("meal", "Pizza", True)]),
        ("Curry Reste", [("meal", "Curry", True)]),
        ("Flöckli und Reste", [("meal", "Flöckli", True)]),
        ("Pizza ;-)", [("meal", "Pizza", False)]),
        ("HÃ¶rnlisalat", [("meal", "Hörnlisalat", False)]),
        ("griechischer Salat", [("meal", "Griechischer Salat", False)]),
        ("Pizza mit Salat", [("meal", "Pizza", False)]),
        ("Spaghetti Bolognese (Besuch bei Freunden)", [("meal", "Spaghetti Bolognese", False)]),
        ("Omelette (süss)", [("meal", "Omelette (süss)", False)]),
        ("Café Complête / Müesli", [("meal", "Café Complête", False), ("meal", "Müesli", False)]),
        ("Bratwurst mit Erbsli/Rüebli", [("meal", "Bratwurst mit Erbsli/Rüebli", False)]),
        ("???", [("skip", "placeholder", False)]),
        ("WW", [("skip", "placeholder", False)]),
        ("zNacht bei Freunden", [("skip", "event / eating out", False)]),
        ("Kantine", [("skip", "event / eating out", False)]),
        ("125gr Salat", [("skip", "diet portions", False)]),
    ],
)
def test_parse_text(text, expected):
    assert names(text) == expected


def test_source_annotation_becomes_note():
    (p,) = parse_text("Gefüllte Süsskartoffeln (Seite 92)", merge_sides=True)
    assert (p.name, p.notes) == ("Gefüllte Süsskartoffeln", ["Seite 92"])


@pytest.fixture
def legacy_db(tmp_path):
    path = tmp_path / "old.db"
    con = sqlite3.connect(path)
    con.execute(
        "CREATE TABLE meal (id INTEGER PRIMARY KEY, date DATE, meal_type TEXT, person1 TEXT, person2 TEXT,"
        " person1_url TEXT, person2_url TEXT)"
    )
    rows = [
        ("2024-01-01", "lunch", "Lasagne", "Lasagne", "https://example.com/lasagne)", None),
        ("2024-01-01", "dinner", "Reste Lasagne", "Lasage", None, None),
        ("2024-01-02", "lunch", "lasagne", "Kantine", None, None),
        ("2024-01-02", "dinner", "Spätzligratin [http://bit.ly/abc]", "London", None, None),
        ("2024-01-03", "lunch", "Pizza selbst gemacht", "???", None, None),
        ("2024-01-03", "dinner", "Reste Chili", "", None, None),
    ]
    con.executemany(
        "INSERT INTO meal (date, meal_type, person1, person2, person1_url, person2_url) VALUES (?,?,?,?,?,?)", rows
    )
    con.commit()
    con.close()
    return path


def test_analyze_merges_counts_and_urls(legacy_db, tmp_path):
    curation_file = tmp_path / "curation.json"
    curation_file.write_text(json.dumps({"drop": ["London"], "rename": {"Pizza selbst gemacht": "Pizza"}}))
    candidates, skipped, merges = analyze(legacy_db, curation=Curation.load(curation_file))

    by_name = {c.name: c for c in candidates.values()}
    assert by_name["Lasagne"].uses == 2  # two occasions; leftovers and duplicates per person don't add up
    assert by_name["Lasagne"].urls.most_common(1)[0][0] == "https://example.com/lasagne"
    assert by_name["Spätzligratin"].urls.most_common(1)[0][0] == "http://bit.ly/abc"
    assert "Pizza" in by_name and "Pizza selbst gemacht" not in by_name
    assert "Chili" in by_name  # only ever seen as leftovers, still a meal
    assert "London" in skipped["curated: not a meal"]
    assert {candidates[k].name for k in merges} == {"Lasage"}


def test_review_roundtrip_and_apply(legacy_db, tmp_path):
    candidates, skipped, merges = analyze(legacy_db)
    review = tmp_path / "review.csv"
    write_review(review, candidates, merges, skipped)

    # The user drops one meal by hand.
    rows = list(csv.DictReader(review.open(encoding="utf-8")))
    for r in rows:
        if r["name"] == "Chili":
            r["action"] = "drop"
    with review.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=rows[0].keys())
        w.writeheader()
        w.writerows(rows)

    app = create_app({"SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'new.db'}", "AUTH_MODE": "none"})
    with app.app_context():
        db.create_all()
        db.session.add(Meal(name="Pizza Selbst Gemacht", name_key="pizza selbst gemacht"))
        db.session.commit()

        created, updated, unchanged = apply(review, dry_run=True)
        assert Meal.query.count() == 1

        created, updated, unchanged = apply(review)
        # Without a curation file, rules can't know that "London" is a trip.
        assert sorted(created) == ["Lasagne", "London", "Spätzligratin"]
        assert unchanged == ["Pizza selbst gemacht"]
        assert Meal.query.filter_by(name="Lasagne").one().recipe_url == "https://example.com/lasagne"

        # Running it again creates nothing new.
        assert apply(review)[0] == []
