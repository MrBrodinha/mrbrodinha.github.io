from pathlib import Path
from urllib.parse import urljoin

from bs4 import BeautifulSoup


# =========================
# Configuration
# =========================

HTML_FILE = "html.txt"
OUTPUT_FILE = "links.txt"

BASE_URL = "https://www.energydrinkmania.net/en/red_bull/"


# =========================
# Read HTML
# =========================

html = Path(HTML_FILE).read_text(
    encoding="utf-8",
    errors="ignore"
)

soup = BeautifulSoup(html, "html.parser")


# =========================
# Extract links
# =========================

links = []

for section in soup.find_all("section", class_="flex_box"):
    for a in section.find_all("a", href=True):
        href = a["href"].strip()

        if not href:
            continue

        # Convert relative links to absolute URLs
        url = urljoin(BASE_URL, href)

        links.append(url)


# Remove duplicates while preserving order
links = list(dict.fromkeys(links))


# =========================
# Save links
# =========================

Path(OUTPUT_FILE).write_text(
    "\n".join(links) + "\n",
    encoding="utf-8"
)


# =========================
# Summary
# =========================

print(f"Found {len(links)} unique links.")
print(f"Saved to: {OUTPUT_FILE}")