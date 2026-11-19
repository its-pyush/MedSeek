"""
Mayo Clinic Diseases & Conditions scraper — Selenium version.

Structural differences from the Symptoms scraper:
  - No single page with anchor jumps. Each letter is its own URL:
    /diseases-conditions/index?letter=A ... Z, plus letter=# for
    numeric/symbol entries. 27 page loads just to build the list.
  - The list itself is much bigger (1000+ entries vs ~150 for Symptoms).
    A full run will take a while even with Selenium — budget for it,
    or use --letter / --limit below to test on a slice first.
  - Detail pages use different section headings: Overview, Symptoms,
    When to see a doctor, Causes, Risk factors, Complications, Prevention.
    Not every disease page has every section — that's normal, not a bug.

Entries are filtered by URL pattern (must match .../diseases-conditions/
<slug>/symptoms-causes/...) rather than by DOM position, so nav/footer
links never leak into the results regardless of page structure quirks.
"""

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, WebDriverException
from bs4 import BeautifulSoup
import string
import time
import json
import csv
import random
import re
import argparse

BASE = "https://www.mayoclinic.org"
LETTERS = list(string.ascii_uppercase) + ["#"]

REQUEST_DELAY = (1.5, 3.0)  # polite randomized delay between page loads, seconds

DETAIL_LINK_RE = re.compile(r"/diseases-conditions/[^/]+/symptoms-causes/")

DETAIL_SECTIONS = [
    "Overview",
    "Symptoms",
    "When to see a doctor",
    "Causes",
    "Risk factors",
    "Complications",
    "Prevention",
]


def build_driver(headless=True):
    options = webdriver.ChromeOptions()
    if headless:
        options.add_argument("--headless=new")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)
    options.add_argument("--window-size=1920,1080")
    options.add_argument(
        "user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    driver = webdriver.Chrome(options=options)
    driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {
        "source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
    })
    return driver


def get_soup(driver, url, wait_selector="body"):
    driver.get(url)
    WebDriverWait(driver, 15).until(
        EC.presence_of_element_located((By.CSS_SELECTOR, wait_selector))
    )
    return BeautifulSoup(driver.page_source, "html.parser")


def scrape_letter_page(driver, letter):
    """One letter = one URL here, unlike the Symptoms page's anchor jumps."""
    url = f"{BASE}/diseases-conditions/index?letter={letter}"
    soup = get_soup(driver, url)

    entries = []
    for li in soup.find_all("li"):
        a_tag = li.find("a", href=DETAIL_LINK_RE)
        if a_tag is None:
            continue  # not a real disease entry (nav/footer links won't match)

        full_text = li.get_text(" ", strip=True)
        canonical_name = a_tag.get_text(strip=True)
        href = a_tag.get("href")
        detail_url = BASE + href if href.startswith("/") else href

        is_cross_ref = "See" in full_text and full_text.split("See")[0].strip() != canonical_name
        display_name = full_text.split("See")[0].strip() if is_cross_ref else canonical_name

        entries.append({
            "letter": letter,
            "display_name": display_name,
            "canonical_name": canonical_name,
            "url": detail_url,
            "is_cross_reference": is_cross_ref,
        })

    return entries


def scrape_disease_list(driver, letters=None):
    letters = letters or LETTERS
    all_entries = []
    for letter in letters:
        entries = scrape_letter_page(driver, letter)
        print(f"  Letter '{letter}': {len(entries)} entries")
        all_entries.extend(entries)
        time.sleep(random.uniform(*REQUEST_DELAY))
    return all_entries


def extract_section(soup, heading_text):
    heading = None
    for tag in soup.find_all(["h2", "h3"]):
        if tag.get_text(strip=True).lower() == heading_text.lower():
            heading = tag
            break
    if heading is None:
        return None  # normal — not every disease page has every section

    level = heading.name
    content = []
    for sibling in heading.find_next_siblings():
        if sibling.name in ("h2", "h3") and sibling.name <= level:
            break
        text = sibling.get_text(" ", strip=True)
        if text:
            content.append(text)
    return "\n".join(content) if content else None


def scrape_detail_page(driver, url):
    soup = get_soup(driver, url)
    title_tag = soup.find("h1")
    title = title_tag.get_text(strip=True) if title_tag else None

    result = {"title": title}
    for section in DETAIL_SECTIONS:
        key = section.lower().replace(" ", "_")
        result[key] = extract_section(soup, section)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--letter", help="Scrape only this one letter (e.g. A), for testing")
    parser.add_argument("--limit", type=int, help="Only scrape detail pages for the first N entries, for testing")
    args = parser.parse_args()

    letters = [args.letter.upper()] if args.letter else None

    driver = build_driver(headless=True)
    try:
        print("Stage 1: scraping disease list...")
        entries = scrape_disease_list(driver, letters=letters)
        print(f"  Found {len(entries)} entries total")

        unique_urls = sorted(set(e["url"] for e in entries if e["url"]))
        if args.limit:
            unique_urls = unique_urls[:args.limit]
        print(f"  {len(unique_urls)} unique detail pages to fetch")

        print("Stage 2: scraping detail pages...")
        detail_cache = {}
        for i, url in enumerate(unique_urls, 1):
            try:
                detail_cache[url] = scrape_detail_page(driver, url)
                print(f"  [{i}/{len(unique_urls)}] {detail_cache[url]['title']}")
            except (TimeoutException, WebDriverException) as e:
                print(f"  [{i}/{len(unique_urls)}] FAILED {url}: {e}")
                detail_cache[url] = None
            time.sleep(random.uniform(*REQUEST_DELAY))

        results = []
        for entry in entries:
            if entry["url"] not in detail_cache:
                continue  # skipped due to --limit
            detail = detail_cache.get(entry["url"])
            results.append({**entry, **(detail or {})})

        with open("mayo_diseases.json", "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)

        fieldnames = ["letter", "display_name", "canonical_name", "url",
                      "is_cross_reference", "title"] + \
                     [s.lower().replace(" ", "_") for s in DETAIL_SECTIONS]
        with open("mayo_diseases.csv", "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(results)

        print(f"\nDone. {len(results)} entries written to mayo_diseases.json / .csv")
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
