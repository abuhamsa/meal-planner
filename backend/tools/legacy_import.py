"""Import meals from the old (v1) meal planner database.

The v1 database stored free text per person and slot ("Reste Pizza", "zNacht bei X",
"???", "Spaghetti (Seite 78)", ...). This module turns that into a clean meal library:

1. analyze: read the old database (read-only), clean and classify every text, merge
   spelling variants and write a review CSV.
2. apply:   read the (possibly hand-edited) review CSV and create the meals.

Only meals are imported, not the old plan history.
"""

from __future__ import annotations

import csv
import json
import difflib
import math
import re
import sqlite3
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse

# --- text cleanup -------------------------------------------------------------------

LEFTOVER_PREFIX = re.compile(r"^(?:reste|resten|rest)\b\s*[:/\-]?\s*", re.I)
LEFTOVER_SUFFIX = re.compile(r"\s+(?:reste|resten)$", re.I)
SPLIT = re.compile(r"\s+/\s+|\s*\|\s*|\s+oder\s+", re.I)  # spaced "/" only: "Erbsli/Rüebli" stays
PORTIONS = re.compile(r"^\d+\s*g(?:r|ramm)?\b", re.I)
PLACEHOLDER = re.compile(r"^[\s?!.\-–—_*x]*$", re.I)

# Annotations in () or [] that describe where a recipe comes from become notes.
SOURCE_NOTE = re.compile(r"^(?:seite\s*\d+|s\.\s*\d+|swissmilk|betty bossi|fooby|insta.*|aus insta.*|chefkoch|migusto|hellofresh)$", re.I)
# Annotations that are just context and can be dropped.
NOISE_NOTE = re.compile(
    r"selbst|selber|frisch|unterwegs|auswärts|besuch|bsuech|mitbringsel|gottesdienst|jahrestag|"
    r"hochzeit|geburi|geburtstag|kirche|mama|mami|papi|grossi|\?|lieferant|bestell|bsteue|^\s*\d+\s*h\s*$",
    re.I,
)

# Words that mark an entry as an event / outing rather than something to cook.
EVENT = re.compile(
    r"\bbei\b|\bbi\b|besuch|bsuech|hochzeit|geburi|geburtstag|weihnacht|ostern|ferien|lager|kantine|"
    r"restaurant|auswärts|bestell|bsteue|unterwegs|ap[ée]ro|fest\b|festival|party|essen\b|z?nacht|"
    r"zmittag|abgmacht|kino|einsegnung|taufe|poltertag|musical|picknick|livestream|datenight|"
    r"date night|abschied|dankes|märit|grilliere|bräteln|brätlä|\bmit (?:mami|papi|mama|grossi|grosi)\b|"
    r"^evtl\.|^\?|\?$|mcdonald|mc donald|burger king|take ?out|lieferando|eat\.ch",
    re.I,
)
SKIP_EXACT = {"ww", "reste", "rest", "nix", "nichts", "fasten", "offen", "noch offen", "tbd", "frei"}

# Side dishes that don't make a different meal: "Pizza mit Salat" is "Pizza".
SIDE_SUFFIX = re.compile(r"\s+(?:mit|und|&|\+)\s+(?:gemischtem\s+|grünem\s+|etwas\s+)?salat$", re.I)


def fix_mojibake(text: str) -> str:
    """'HÃ¶rnlisalat' (UTF-8 bytes read as Latin-1) -> 'Hörnlisalat'."""
    if "Ã" in text or "â€" in text:
        try:
            return text.encode("cp1252").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    return text


EMOTICON = re.compile(r"(?:[;:=8]-?[)(\]\[DPp]+|[\U0001F000-\U0001FFFF\u2600-\u27BF])")
DANGLING = re.compile(r"\s+(?:und|mit|&|\+|u\.?|oder)$", re.I)


def tidy(text: str) -> str:
    text = fix_mojibake(text)
    text = EMOTICON.sub(" ", text)
    text = re.sub(r"[(\[]\s*[)\]]", " ", text)  # empty brackets left behind
    text = " ".join(text.split())
    text = text.strip(" -–—,;:/")
    while DANGLING.search(text):
        text = DANGLING.sub("", text).strip(" -–—,;:/")
    return text


def dedupe_key(name: str) -> str:
    """Key that ignores case, accents, hyphens and spacing: 'Café Complête' == 'cafe complete'."""
    s = unicodedata.normalize("NFKD", name.casefold())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[-_'’`.,]", " ", s)
    return " ".join(s.split())


def clean_url(url: str | None) -> str | None:
    if not url:
        return None
    url = url.strip().rstrip(").,;]}>")
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return None
    return url


@dataclass
class Parsed:
    kind: str  # meal | skip
    name: str = ""
    reason: str = ""
    leftovers: bool = False
    notes: list[str] = field(default_factory=list)


def strip_annotations(text: str) -> tuple[str, list[str], bool]:
    """Remove (..) and [..] parts. Returns (text, source notes, had_event_annotation)."""
    notes: list[str] = []
    eventish = False

    def repl(m: re.Match) -> str:
        nonlocal eventish
        inner = m.group(1).strip()
        if SOURCE_NOTE.match(inner):
            notes.append(inner[0].upper() + inner[1:])
            return " "
        if NOISE_NOTE.search(inner) or EVENT.search(inner):
            eventish = True
            return " "
        return m.group(0)  # meaningful, e.g. "Omelette (süss)"

    text = re.sub(r"[(\[]([^()\[\]]*)[)\]]", repl, text)
    text = re.sub(r"\s*[(\[][^()\[\]]*$", "", text)  # unclosed "Rindsragout [ 2h"
    text = re.sub(r"\s+-\s*$", "", text)
    return tidy(text), notes, eventish


def parse_part(part: str, *, merge_sides: bool) -> Parsed:
    text = tidy(part)
    if not text or PLACEHOLDER.match(text) or text.casefold() in SKIP_EXACT:
        return Parsed("skip", reason="placeholder")

    leftovers = False
    while LEFTOVER_PREFIX.match(text):
        text, leftovers = LEFTOVER_PREFIX.sub("", text, count=1), True
    if not leftovers and LEFTOVER_SUFFIX.search(text):
        text, leftovers = LEFTOVER_SUFFIX.sub("", text), True
    text = tidy(text)
    if not text or PLACEHOLDER.match(text) or text.casefold() in SKIP_EXACT:
        return Parsed("skip", reason="placeholder")

    text, notes, _ = strip_annotations(text)
    text = tidy(text.rstrip("?! "))
    if not text:
        return Parsed("skip", reason="placeholder")
    if EVENT.search(text):
        return Parsed("skip", reason="event / eating out")
    if PORTIONS.match(text):
        return Parsed("skip", reason="diet portions")
    if merge_sides:
        text = SIDE_SUFFIX.sub("", text)
    if len(text) < 2:
        return Parsed("skip", reason="placeholder")
    # Capitalize the first letter only: "griechischer Salat" -> "Griechischer Salat".
    text = text[0].upper() + text[1:]
    return Parsed("meal", name=text, leftovers=leftovers, notes=notes)


def parse_text(text: str, *, merge_sides: bool) -> list[Parsed]:
    text = tidy(text or "")
    if not text:
        return [Parsed("skip", reason="empty")]
    # Leftover prefix applies to the first alternative only: "Reste / Pizza" = leftovers or pizza.
    parts = [p for p in SPLIT.split(text) if p and p.strip()]
    if re.match(r"^(?:reste|rest)/", text, re.I):
        parts = ["Reste", text.split("/", 1)[1]]
    return [parse_part(p, merge_sides=merge_sides) for p in parts]


# --- analysis -----------------------------------------------------------------------


@dataclass
class Candidate:
    key: str
    variants: Counter = field(default_factory=Counter)
    occasions: set = field(default_factory=set)  # (date, slot)
    leftover_occasions: set = field(default_factory=set)
    urls: Counter = field(default_factory=Counter)
    notes: Counter = field(default_factory=Counter)
    last_date: str = ""
    raw_examples: Counter = field(default_factory=Counter)

    @property
    def name(self) -> str:
        # Most used spelling; prefer capitalized and accented variants on ties.
        return max(self.variants.items(), key=lambda kv: (kv[1], kv[0][:1].isupper(), sum(ord(ch) > 127 for ch in kv[0])))[0]

    @property
    def uses(self) -> int:
        return len(self.occasions)


def read_legacy(db_path: Path):
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        rows = con.execute(
            "SELECT date, meal_type, person1, person2, person1_url, person2_url FROM meal ORDER BY date"
        ).fetchall()
    finally:
        con.close()
    for date, slot, p1, p2, u1, u2 in rows:
        for text, url in ((p1, u1), (p2, u2)):
            # Some rows kept the URL inside the text, e.g. "Spätzligratin [http://bit.ly/..]".
            if text and (m := re.search(r"https?://[^\s\]\)]+", text)):
                url = url or m.group(0)
                text = text.replace(m.group(0), " ")
            yield date, slot, text or "", url


@dataclass
class Curation:
    """Hand-made decisions that rules can't make: places, people and events to drop,
    and renames/merges ('Pizza selbst gemacht' -> 'Pizza'). Matching ignores case/accents."""

    drop: set[str] = field(default_factory=set)
    rename: dict[str, str] = field(default_factory=dict)
    keep_separate: set[frozenset] = field(default_factory=set)

    @classmethod
    def load(cls, path: Path | None) -> "Curation":
        if not path or not path.exists():
            return cls()
        data = json.loads(path.read_text(encoding="utf-8"))
        return cls(
            drop={dedupe_key(n) for n in data.get("drop", [])},
            rename={dedupe_key(a): b for a, b in data.get("rename", {}).items()},
            keep_separate={frozenset(dedupe_key(n) for n in pair) for pair in data.get("keep_separate", [])},
        )

    def resolve(self, name: str) -> str | None:
        seen = set()
        while (key := dedupe_key(name)) in self.rename and key not in seen:
            seen.add(key)
            name = self.rename[key]
        return None if dedupe_key(name) in self.drop else name


def analyze(db_path: Path, *, merge_sides: bool = True, curation: Curation | None = None):
    curation = curation or Curation()
    candidates: dict[str, Candidate] = {}
    skipped: dict[str, Counter] = defaultdict(Counter)

    for date, slot, text, url in read_legacy(db_path):
        parsed = parse_text(text, merge_sides=merge_sides)
        for p in parsed:
            if p.kind == "meal":
                resolved = curation.resolve(p.name)
                if resolved is None:
                    p.kind, p.reason = "skip", "curated: not a meal"
                else:
                    p.name = resolved
        meals = [p for p in parsed if p.kind == "meal"]
        for p in parsed:
            if p.kind == "skip" and p.reason != "empty":
                skipped[p.reason][tidy(text)] += 1
        for p in meals:
            key = dedupe_key(p.name)
            c = candidates.setdefault(key, Candidate(key))
            c.variants[p.name] += 1
            c.raw_examples[tidy(text)] += 1
            (c.leftover_occasions if p.leftovers else c.occasions).add((date, slot))
            c.last_date = max(c.last_date, date)
            for n in p.notes:
                c.notes[n] += 1
            if len(meals) == 1 and (u := clean_url(url)):
                c.urls[u] += 1

    # A meal that only ever appeared as leftovers was still cooked at some point.
    for c in candidates.values():
        if not c.occasions:
            c.occasions = set(c.leftover_occasions)

    merges = {
        loser: (winner, ratio)
        for loser, (winner, ratio) in suggest_merges(candidates).items()
        if frozenset((loser, winner)) not in curation.keep_separate
    }
    return candidates, skipped, merges


def suggest_merges(candidates: dict[str, Candidate], threshold: float = 0.9):
    """Likely typos / plural forms, e.g. 'Lasage' -> 'Lasagne'.

    The spelling whose words are more common across all meals wins ('Schupfnudeln' over
    'Schupfnuden'), so a frequently repeated typo doesn't become the canonical name.
    """
    word_freq: Counter = Counter()
    for c in candidates.values():
        for w in c.key.split():
            word_freq[w] += c.uses

    def score(key: str):
        words = key.split()
        return (sum(math.log(word_freq[w] + 1) for w in words) / max(len(words), 1), candidates[key].uses)

    keys = sorted(candidates, key=lambda k: -candidates[k].uses)
    target_of: dict[str, tuple[str, float]] = {}
    for i, a in enumerate(keys):
        for b in keys[i + 1 :]:
            if a in target_of or b in target_of or abs(len(a) - len(b)) > 3:
                continue
            ratio = difflib.SequenceMatcher(None, a, b).ratio()
            if ratio >= threshold and not _differ_by_number(a, b):
                winner, loser = (a, b) if score(a) >= score(b) else (b, a)
                target_of[loser] = (winner, ratio)
    return target_of


def _differ_by_number(a: str, b: str) -> bool:
    return re.findall(r"\d+", a) != re.findall(r"\d+", b)


REVIEW_FIELDS = ["action", "name", "merge_into", "recipe_url", "notes", "uses", "last_eaten", "variants", "examples"]


def write_review(path: Path, candidates, merges, skipped):
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    for key, c in candidates.items():
        merge = merges.get(key)
        rows.append(
            {
                "action": "merge" if merge else "keep",
                "name": c.name,
                "merge_into": candidates[merge[0]].name if merge else "",
                "recipe_url": c.urls.most_common(1)[0][0] if c.urls else "",
                "notes": "; ".join(n for n, _ in c.notes.most_common()),
                "uses": c.uses,
                "last_eaten": c.last_date,
                "variants": " | ".join(v for v, _ in c.variants.most_common() if v != c.name),
                "examples": " | ".join(t for t, _ in c.raw_examples.most_common(4)),
            }
        )
    rows.sort(key=lambda r: (r["action"] != "merge", -r["uses"], r["name"].casefold()))
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=REVIEW_FIELDS)
        w.writeheader()
        w.writerows(rows)

    skipped_path = path.with_name("skipped_entries.csv")
    with skipped_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["reason", "text", "count"])
        for reason, texts in sorted(skipped.items()):
            for text, n in texts.most_common():
                w.writerow([reason, text, n])
    return rows, skipped_path


# --- apply --------------------------------------------------------------------------


def load_review(path: Path):
    """Resolve the review CSV into {name: {recipe_url, notes}}.

    action: keep | merge (into merge_into) | drop. Merged rows contribute their URL and
    notes to the target if it has none.
    """
    with path.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    by_name = {r["name"]: r for r in rows}
    meals: dict[str, dict] = {}
    problems: list[str] = []

    def resolve(name: str, seen=()):
        row = by_name.get(name)
        if row is None:
            return name  # merge target typed by hand: create it
        if (row["action"] or "keep").strip().lower() == "merge" and row["merge_into"].strip():
            if name in seen:
                problems.append(f"merge loop at {name!r}")
                return name
            return resolve(row["merge_into"].strip(), (*seen, name))
        return name

    for row in rows:
        action = (row["action"] or "keep").strip().lower()
        if action not in ("keep", "merge", "drop"):
            problems.append(f"unknown action {action!r} for {row['name']!r}")
            continue
        if action == "drop":
            continue
        if action == "merge" and not row["merge_into"].strip():
            problems.append(f"{row['name']!r} has action merge but no merge_into")
            continue
        target = resolve(row["name"])
        target_row = by_name.get(target, {})
        if (target_row.get("action") or "keep").strip().lower() == "drop":
            continue
        m = meals.setdefault(target, {"recipe_url": "", "notes": ""})
        m["recipe_url"] = m["recipe_url"] or target_row.get("recipe_url", "").strip() or row["recipe_url"].strip()
        m["notes"] = m["notes"] or target_row.get("notes", "").strip() or row["notes"].strip()
    return meals, problems


def apply(review_path: Path, *, dry_run: bool = False):
    """Create the meals from the review CSV in the app's database. Existing meals (same name,
    ignoring case) are kept; only an empty recipe URL / notes is filled in."""
    from mealplanner.api import name_key
    from mealplanner.models import Meal, db

    meals, problems = load_review(review_path)
    if problems:
        raise SystemExit("Fix these rows in the review CSV first:\n  " + "\n  ".join(problems))

    created, updated, unchanged = [], [], []
    for name, fields in sorted(meals.items(), key=lambda kv: kv[0].casefold()):
        name = " ".join(name.split())[:100]
        url = clean_url(fields["recipe_url"]) if fields["recipe_url"] else None
        notes = fields["notes"][:5000] or None
        meal = Meal.query.filter_by(name_key=name_key(name)).first()
        if meal is None:
            db.session.add(Meal(name=name, name_key=name_key(name), recipe_url=url, notes=notes))
            created.append(name)
        elif (url and not meal.recipe_url) or (notes and not meal.notes):
            meal.recipe_url = meal.recipe_url or url
            meal.notes = meal.notes or notes
            updated.append(name)
        else:
            unchanged.append(name)
    if dry_run:
        db.session.rollback()
    else:
        db.session.commit()
    return created, updated, unchanged


def main(argv=None):
    import argparse

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    a = sub.add_parser("analyze", help="read the old database and write a review CSV")
    a.add_argument("old_db", type=Path)
    a.add_argument("--curation", type=Path, help="JSON with hand-made drop/rename decisions")
    a.add_argument("--out", type=Path, default=Path("data/import/meals_review.csv"))
    a.add_argument("--keep-sides", action="store_true", help="don't merge 'X mit Salat' into 'X'")

    b = sub.add_parser("apply", help="create the meals listed in the review CSV")
    b.add_argument("review_csv", type=Path)
    b.add_argument("--dry-run", action="store_true")

    args = parser.parse_args(argv)
    if args.command == "analyze":
        candidates, skipped, merges = analyze(
            args.old_db, merge_sides=not args.keep_sides, curation=Curation.load(args.curation)
        )
        rows, skipped_path = write_review(args.out, candidates, merges, skipped)
        keep = sum(1 for r in rows if r["action"] == "keep")
        print(f"{keep} meals, {len(rows) - keep} suggested merges -> {args.out}")
        print(f"skipped entries -> {skipped_path}")
    else:
        from mealplanner import create_app

        with create_app().app_context():
            created, updated, unchanged = apply(args.review_csv, dry_run=args.dry_run)
        prefix = "[dry run] would create" if args.dry_run else "created"
        print(f"{prefix} {len(created)} meals, updated {len(updated)}, {len(unchanged)} already existed")


if __name__ == "__main__":
    main()
