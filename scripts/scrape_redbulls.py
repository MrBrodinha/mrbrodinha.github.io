import json
import time
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup


# ============================================================
# Configuration
# ============================================================

LINKS_FILE = "links.txt"
OUTPUT_FILE = "redbull_drinks.json"

BASE_URL = "https://www.energydrinkmania.net/en/red_bull/"

REQUEST_DELAY = 0.5
TIMEOUT = 20

session = requests.Session()

session.headers.update({
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/139.0 Safari/537.36"
    )
})


# ============================================================
# Helpers
# ============================================================

def clean_text(text):
    """Normalize whitespace."""
    if not text:
        return None

    text = " ".join(text.split())

    return text if text else None


def get_meta_content(soup, *names):
    """Get content from a meta tag."""
    for name in names:
        tag = soup.find(
            "meta",
            attrs={
                "name": name
            }
        )

        if tag and tag.get("content"):
            return clean_text(tag["content"])

        tag = soup.find(
            "meta",
            attrs={
                "property": name
            }
        )

        if tag and tag.get("content"):
            return clean_text(tag["content"])

    return None


def find_main_image(soup, page_url):
    """
    Try to find the main product image.

    Several fallbacks are used because the website may not
    use exactly the same structure on every page.
    """

    # --------------------------------------------------------
    # 1. OpenGraph image
    # --------------------------------------------------------

    og_image = soup.find(
        "meta",
        property="og:image"
    )

    if og_image and og_image.get("content"):
        return urljoin(page_url, og_image["content"])


    # --------------------------------------------------------
    # 2. Images inside main/article
    # --------------------------------------------------------

    main = soup.find("main")

    if main:
        images = main.find_all("img")

        for img in images:
            src = (
                img.get("src")
                or img.get("data-src")
                or img.get("data-original")
            )

            if not src:
                continue

            src_lower = src.lower()

            # Avoid obvious UI/navigation images
            if any(x in src_lower for x in [
                "logo",
                "banner",
                "icon",
                "button",
                "thumbnail",
            ]):
                continue

            return urljoin(page_url, src)


    # --------------------------------------------------------
    # 3. First reasonable image on the page
    # --------------------------------------------------------

    for img in soup.find_all("img"):

        src = (
            img.get("src")
            or img.get("data-src")
            or img.get("data-original")
        )

        if not src:
            continue

        src_lower = src.lower()

        if any(x in src_lower for x in [
            "logo",
            "banner",
            "icon",
            "button",
            "thumbnail",
        ]):
            continue

        return urljoin(page_url, src)


    return None


def find_description(soup):
    """
    Try to find the page's main description/review.
    """

    # --------------------------------------------------------
    # 1. Meta description
    # --------------------------------------------------------

    description = get_meta_content(
        soup,
        "description",
        "og:description"
    )

    if description:
        return description


    # --------------------------------------------------------
    # 2. Article / main content
    # --------------------------------------------------------

    main = soup.find("main")

    if not main:
        return None

    # Remove navigation / irrelevant elements
    for tag in main.find_all([
        "nav",
        "aside",
        "script",
        "style",
        "form",
    ]):
        tag.decompose()


    # Look for paragraphs
    paragraphs = []

    for p in main.find_all("p"):

        text = clean_text(p.get_text(" ", strip=True))

        if not text:
            continue

        # Ignore very short UI-like text
        if len(text) < 30:
            continue

        paragraphs.append(text)


    if paragraphs:
        return "\n\n".join(paragraphs)


    return None


def find_flavor(soup):
    """
    Look for an explicit flavor field.

    Returns None if the page does not explicitly expose one.
    """

    # Common labels
    labels = [
        "Flavor",
        "Flavour",
        "Flavor:",
        "Flavour:",
    ]

    # --------------------------------------------------------
    # Search tables
    # --------------------------------------------------------

    for row in soup.find_all("tr"):

        cells = row.find_all(["th", "td"])

        if len(cells) < 2:
            continue

        label = clean_text(
            cells[0].get_text(" ", strip=True)
        )

        if label in labels:

            return clean_text(
                cells[1].get_text(" ", strip=True)
            )


    # --------------------------------------------------------
    # Search elements containing "Flavor"
    # --------------------------------------------------------

    for element in soup.find_all(
        string=lambda text: (
            text and
            text.strip().lower() in {
                "flavor",
                "flavour",
                "flavor:",
                "flavour:",
            }
        )
    ):

        parent = element.parent

        if not parent:
            continue

        text = clean_text(
            parent.parent.get_text(" ", strip=True)
            if parent.parent
            else parent.get_text(" ", strip=True)
        )

        if text:
            # Remove the label
            for label in labels:
                if text.lower().startswith(label.lower()):
                    value = text[len(label):].strip()
                    if value:
                        return value


    return None


def find_name(soup):
    """
    Find the drink name.
    """

    # --------------------------------------------------------
    # 1. itemprop=itemreviewed
    # --------------------------------------------------------

    itemreviewed = soup.find(
        attrs={
            "itemprop": "itemreviewed"
        }
    )

    if itemreviewed:
        name = clean_text(
            itemreviewed.get_text(" ", strip=True)
        )

        if name:
            return name


    # --------------------------------------------------------
    # 2. H1
    # --------------------------------------------------------

    h1 = soup.find("h1")

    if h1:
        name = clean_text(
            h1.get_text(" ", strip=True)
        )

        if name:
            return name


    # --------------------------------------------------------
    # 3. Page title
    # --------------------------------------------------------

    if soup.title:
        return clean_text(
            soup.title.get_text(" ", strip=True)
        )


    return None


# ============================================================
# Scrape one page
# ============================================================

def scrape_page(url):

    print(f"Downloading: {url}")

    response = session.get(
        url,
        timeout=TIMEOUT
    )

    response.raise_for_status()

    soup = BeautifulSoup(
        response.text,
        "html.parser"
    )

    name = find_name(soup)
    image_url = find_main_image(
        soup,
        url
    )
    description = find_description(soup)
    flavor = find_flavor(soup)

    return {
        "name": name,
        "url": url,
        "image_url": image_url,
        "description": description,
        "flavor": flavor,
    }


# ============================================================
# Read URLs
# ============================================================

links = [
    line.strip()
    for line in Path(LINKS_FILE).read_text(
        encoding="utf-8"
    ).splitlines()
    if line.strip()
]

# Remove duplicates
links = list(dict.fromkeys(links))

print(f"Found {len(links)} URLs.")
print()


# ============================================================
# Scrape everything
# ============================================================

results = []

for index, url in enumerate(
    links,
    start=1
):

    print(
        f"[{index}/{len(links)}]"
    )

    try:

        data = scrape_page(url)

        results.append(data)

        print(
            f"  Name:   {data['name']}"
        )

        print(
            f"  Image:  {data['image_url']}"
        )

        print(
            f"  Flavor: {data['flavor']}"
        )

        print()

    except Exception as e:

        print(
            f"  ERROR: {e}"
        )

        results.append({
            "name": None,
            "url": url,
            "image_url": None,
            "description": None,
            "flavor": None,
            "error": str(e),
        })

        print()

    time.sleep(REQUEST_DELAY)


# ============================================================
# Save JSON
# ============================================================

Path(OUTPUT_FILE).write_text(
    json.dumps(
        results,
        ensure_ascii=False,
        indent=2
    ),
    encoding="utf-8"
)


# ============================================================
# Summary
# ============================================================

successful = sum(
    1
    for x in results
    if "error" not in x
)

failed = len(results) - successful

print("=" * 60)
print("DONE")
print("=" * 60)

print(f"URLs:       {len(links)}")
print(f"Successful: {successful}")
print(f"Failed:     {failed}")
print(f"Output:     {OUTPUT_FILE}")