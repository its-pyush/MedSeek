"""
Mayo Clinic symptoms scraper — Selenium version.

Confirmed: plain requests gets a 403 (Mayo's WAF blocks non-browser
clients, likely on TLS fingerprint, not just headers). A real browser
via Selenium clears that. Everything downstream — the BeautifulSoup
parsing logic — is unchanged from the requests version; only get_soup()
now drives a real browser instead of making an HTTP call directly.
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

BASE = "https://www.mayoclinic.org"
LIST_URL = f"{BASE}/symptoms"

REQUEST_DELAY = (1.5, 3.0)  # polite randomized delay between page loads, seconds


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


def scrape_symptom_list(driver):
    soup = get_soup(driver, LIST_URL)
    entries = []

    for letter in string.ascii_uppercase:
        anchor = soup.find(id=f"{letter}_section")
        if anchor is None:
            continue  # letter has no entries (O, Q, X, Z as of writing)

        ul = anchor.find_next("ul")
        if ul is None:
            continue

        for li in ul.find_all("li", recursive=False):
            a_tag = li.find("a")
            if a_tag is None:
                continue

            full_text = li.get_text(" ", strip=True)
            canonical_name = a_tag.get_text(strip=True)
            url = a_tag.get("href")
            if url and url.startswith("/"):
                url = BASE + url

            is_cross_ref = "See:" in full_text
            display_name = full_text.split("See:")[0].strip() if is_cross_ref else canonical_name

            entries.append({
                "letter": letter,
                "display_name": display_name,
                "canonical_name": canonical_name,
                "url": url,
                "is_cross_reference": is_cross_ref,
            })

    return entries


def extract_section(soup, heading_text):
    heading = None
    for tag in soup.find_all(["h2", "h3"]):
        if tag.get_text(strip=True).lower() == heading_text.lower():
            heading = tag
            break
    if heading is None:
        return None

    level = heading.name
    content = []
    for sibling in heading.find_next_siblings():
        if sibling.name == level:
            break
        text = sibling.get_text(" ", strip=True)
        if text:
            content.append(text)
    return "\n".join(content) if content else None


def scrape_detail_page(driver, url):
    soup = get_soup(driver, url)
    title_tag = soup.find("h1")
    title = title_tag.get_text(strip=True) if title_tag else None

    return {
        "title": title,
        "definition": extract_section(soup, "Definition"),
        "causes": extract_section(soup, "Causes"),
        "when_to_see_a_doctor": extract_section(soup, "When to see a doctor"),
    }


def main():
    driver = build_driver(headless=True)
    try:
        print("Stage 1: scraping symptom list...")
        entries = scrape_symptom_list(driver)
        print(f"  Found {len(entries)} entries across {len(set(e['letter'] for e in entries))} letters")

        unique_urls = sorted(set(e["url"] for e in entries if e["url"]))
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
            detail = detail_cache.get(entry["url"])
            results.append({**entry, **(detail or {})})

        with open("mayo_symptoms.json", "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)

        fieldnames = ["letter", "display_name", "canonical_name", "url",
                      "is_cross_reference", "title", "definition", "causes",
                      "when_to_see_a_doctor"]
        with open("mayo_symptoms.csv", "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(results)

        print(f"\nDone. {len(results)} entries written to mayo_symptoms.json / .csv")
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
