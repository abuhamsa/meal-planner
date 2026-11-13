"""Import a recipe from a web page.

Most recipe sites embed a schema.org Recipe as JSON-LD for search engines. `recipe-scrapers`
reads that (plus site-specific parsers for ~700 sites), so no AI or paid API is involved.

The server fetches URLs that users type in, so every request, including each redirect hop
(bit.ly links are common), is checked to go to a public address only. Otherwise the import
could be used to probe the internal Docker network or the home LAN.
"""

import io
import ipaddress
import secrets
import socket
import warnings
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from PIL import Image
from recipe_scrapers import scrape_html

USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
TIMEOUT = (5, 15)  # connect, read
MAX_REDIRECTS = 5
MAX_PAGE_BYTES = 5 * 1024 * 1024
MAX_IMAGE_BYTES = 10 * 1024 * 1024
IMAGE_MAX_SIZE = (1200, 1200)
Image.MAX_IMAGE_PIXELS = 40_000_000


class RecipeImportError(Exception):
    """Something the user should see, e.g. "No recipe found on this page"."""


def _check_public(url):
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise RecipeImportError("Only http(s) links can be imported")
    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
    except socket.gaierror:
        raise RecipeImportError(f"Can't find the site {parsed.hostname}") from None
    for info in infos:
        address = ipaddress.ip_address(info[4][0].split("%")[0])
        if not address.is_global:
            raise RecipeImportError("That link points to a private network address")


def fetch(url, max_bytes, accept="*/*"):
    """GET a public URL, following redirects by hand so each hop is checked.

    Returns (final_url, body bytes, content type header).
    """
    session = requests.Session()
    session.trust_env = False  # don't pick up proxy settings from the environment
    headers = {"User-Agent": USER_AGENT, "Accept": accept, "Accept-Language": "de-CH,de;q=0.9,en;q=0.8"}
    for _ in range(MAX_REDIRECTS + 1):
        _check_public(url)
        try:
            res = session.get(url, headers=headers, timeout=TIMEOUT, allow_redirects=False, stream=True)
        except requests.exceptions.SSLError:
            raise RecipeImportError("The site's security certificate is invalid") from None
        except requests.exceptions.Timeout:
            raise RecipeImportError("The site took too long to answer") from None
        except requests.exceptions.RequestException:
            raise RecipeImportError("Couldn't reach the site") from None
        with res:
            if res.is_redirect:
                url = urljoin(url, res.headers["Location"])
                continue
            if res.status_code == 404 or res.status_code == 410:
                raise RecipeImportError("The page doesn't exist anymore")
            if res.status_code >= 400:
                raise RecipeImportError(f"The site answered with an error ({res.status_code})")
            body = b""
            for chunk in res.iter_content(64 * 1024):
                body += chunk
                if len(body) > max_bytes:
                    raise RecipeImportError("The page is too large")
            return url, body, res.headers.get("Content-Type", "")
    raise RecipeImportError("Too many redirects")


def _decode(body, content_type):
    charset = requests.utils.get_encoding_from_headers({"content-type": content_type})
    # requests assumes ISO-8859-1 for text/* without a charset; most pages are UTF-8 anyway.
    if charset and charset.lower() != "iso-8859-1":
        try:
            return body.decode(charset, errors="replace")
        except LookupError:
            pass
    try:
        return body.decode("utf-8")
    except UnicodeDecodeError:
        return body.decode(charset or "cp1252", errors="replace")


def _try(fn):
    try:
        value = fn()
    except Exception:  # recipe-scrapers raises various errors for missing fields
        return None
    return value or None


def _minutes(value):
    return value if isinstance(value, int) and 0 < value < 7 * 24 * 60 else None


def _clean_lines(lines):
    return [" ".join(str(line).split()) for line in lines or [] if str(line).strip()]


def _truncate(value, length):
    return value[:length] if isinstance(value, str) else None


def scrape(url):
    """Fetch and parse a recipe. Returns a dict of fields; raises RecipeImportError."""
    final_url, body, content_type = fetch(url, MAX_PAGE_BYTES, accept="text/html,application/xhtml+xml")
    if "html" not in content_type and "xml" not in content_type:
        raise RecipeImportError("The link doesn't lead to a web page")
    html = _decode(body, content_type)
    try:
        scraper = scrape_html(html, org_url=final_url, supported_only=False)
    except Exception:
        raise RecipeImportError("No recipe found on this page") from None

    ingredients = _clean_lines(_try(scraper.ingredients))
    groups = []
    for group in _try(scraper.ingredient_groups) or []:
        items = _clean_lines(group.ingredients)
        if items:
            groups.append({"purpose": _truncate(group.purpose, 200) or None, "ingredients": items})
    # Some parsers return a single unnamed group, or groups that lose items; trust the flat list then.
    if not groups or sum(len(g["ingredients"]) for g in groups) < len(ingredients):
        groups = [{"purpose": None, "ingredients": ingredients}] if ingredients else []

    instructions = _clean_lines(_try(scraper.instructions_list))
    if not groups and not instructions:
        raise RecipeImportError("No recipe found on this page")

    host = urlparse(final_url).hostname or ""
    image = _try(scraper.image)
    return {
        "title": _truncate(_try(scraper.title), 200),
        "site": _truncate(_try(scraper.site_name) or host.removeprefix("www."), 100),
        "yields": _truncate(_try(scraper.yields), 100),
        "total_time": _minutes(_try(scraper.total_time)),
        "prep_time": _minutes(_try(scraper.prep_time)),
        "cook_time": _minutes(_try(scraper.cook_time)),
        "ingredient_groups": groups,
        "instructions": instructions,
        "image_source": urljoin(final_url, image) if isinstance(image, str) else None,
    }


def download_image(url, folder: Path, prefix):
    """Download, shrink and re-encode a recipe image as WebP. Returns the file name or None.

    Re-encoding means only real images end up on disk, whatever the site sent.
    """
    try:
        _, body, _ = fetch(url, MAX_IMAGE_BYTES, accept="image/*")
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(body)) as img:
                img.thumbnail(IMAGE_MAX_SIZE)
                img = img.convert("RGB")
                folder.mkdir(parents=True, exist_ok=True)
                name = f"{prefix}-{secrets.token_hex(6)}.webp"
                img.save(folder / name, "WEBP", quality=82)
                return name
    except Exception:
        # The recipe is still useful without its picture.
        return None
