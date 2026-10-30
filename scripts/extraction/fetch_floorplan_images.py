#!/usr/bin/env python3
"""
Fetch floorplan images from the 60 source URLs.
Attempts to extract image URLs from the HTML pages and download them.
"""

import os
import json
import re
import time
import requests
from pathlib import Path
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
import hashlib

# Load the floorplan links
with open(r"C:\1_SAJID\ArchResidenceBD\repo\floorplan_links.json", "r", encoding="utf-8") as f:
    links = json.load(f)

# Output directory
out_dir = Path(r"C:\1_SAJID\ArchResidenceBD\repo\public\floorplans")
out_dir.mkdir(parents=True, exist_ok=True)

# Session with headers
session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,bn;q=0.8",
})

def fetch_page(url: str, timeout: int = 15) -> str | None:
    """Fetch HTML content from URL."""
    try:
        resp = session.get(url, timeout=timeout)
        resp.raise_for_status()
        return resp.text
    except Exception as e:
        print(f"  [X] Failed to fetch {url[:80]}: {type(e).__name__}")
        return None

def extract_images(html: str, base_url: str) -> list[str]:
    """Extract image URLs from HTML."""
    soup = BeautifulSoup(html, "html.parser")
    images = []
    
    # Try various selectors for floorplan images
    selectors = [
        "img[src*='floor']",
        "img[src*='plan']",
        "img[src*='blueprint']",
        "img[src*='layout']",
        "img[src*='house']",
        "img[src*='design']",
        "img[src*='drawing']",
        ".floor-plan img",
        ".plan-image img",
        ".gallery img",
        "article img",
        ".content img",
        "#main img",
        ".post img",
    ]
    
    for selector in selectors:
        for img in soup.select(selector):
            src = img.get("src") or img.get("data-src") or img.get("data-lazy") or img.get("data-original")
            if src:
                full_url = urljoin(base_url, src)
                if full_url not in images:
                    images.append(full_url)
    
    # Also check og:image
    og = soup.find("meta", property="og:image")
    if og and og.get("content"):
        images.insert(0, urljoin(base_url, og["content"]))
    
    # Twitter card
    tc = soup.find("meta", property="twitter:image")
    if tc and tc.get("content"):
        images.insert(0, urljoin(base_url, tc["content"]))
    
    return images

def download_image(url: str, dest: Path, timeout: int = 15) -> bool:
    """Download an image to destination."""
    try:
        resp = session.get(url, timeout=timeout, stream=True)
        resp.raise_for_status()
        
        # Check content type
        ct = resp.headers.get("content-type", "")
        if not ct.startswith("image/"):
            return False
        
        # Check file size
        size = int(resp.headers.get("content-length", 0))
        if size > 10 * 1024 * 1024:  # > 10 MB
            return False
        
        with open(dest, "wb") as f:
            for chunk in resp.iter_content(chunk_size=8192):
                f.write(chunk)
        
        # Verify it's a valid image
        try:
            from PIL import Image
            with Image.open(dest) as im:
                im.verify()
            return True
        except Exception:
            dest.unlink(missing_ok=True)
            return False
            
    except Exception as e:
        print(f"    [X] Download failed: {e}")
        return False

def process_floorplan(link: dict) -> dict:
    """Process a single floorplan link."""
    plan_id = f"bd-{link['group']}-{link['index']:03d}"
    url = link["url"]
    group = link["group"]
    
    print(f"\nProcessing {plan_id}: {link['title'][:50]}...")
    
    # Skip non-HTML sources (YouTube, Facebook videos, etc.)
    if any(x in url for x in ["youtube.com", "facebook.com", "tiktok.com", "pinterest.com/pin", "pinterest.com/pin/"]):
        print(f"  -> Skipping video/social media link")
        return {**link, "local_image": None, "image_url": None}
    
    # Skip Scribd (requires login)
    if "scribd.com" in url:
        print(f"  -> Skipping Scribd (requires login)")
        return {**link, "local_image": None, "image_url": None}
    
    # Fetch page
    html = fetch_page(url)
    if not html:
        return {**link, "local_image": None, "image_url": None}
    
    # Extract image URLs
    images = extract_images(html, url)
    print(f"  Found {len(images)} candidate images")
    
    # Try to download the best candidate
    dest = out_dir / f"{plan_id}.jpg"
    for i, img_url in enumerate(images[:5]):  # Try first 5
        print(f"  Trying image {i+1}: {img_url[:80]}...")
        if download_image(img_url, dest):
            print(f"  [OK] Downloaded: {dest.name}")
            return {**link, "local_image": f"/floorplans/{dest.name}", "image_url": img_url}
    
    print(f"  [X] Could not download any valid image")
    return {**link, "local_image": None, "image_url": None}

def main():
    print(f"Processing {len(links)} floorplan links...")
    
    results = []
    for link in links:
        try:
            result = process_floorplan(link)
        except Exception as e:
            print(f"  [X] Error processing {link.get('index', '?')}: {e}")
            result = {**link, "local_image": None, "image_url": None}
        results.append(result)
        time.sleep(1)  # Be polite
    
    # Save results
    with open(r"C:\1_SAJID\ArchResidenceBD\repo\floorplan_images.json", "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    
    # Summary
    downloaded = sum(1 for r in results if r.get("local_image"))
    print(f"\n=== SUMMARY ===")
    print(f"Total: {len(results)}")
    print(f"Downloaded: {downloaded}")
    print(f"Failed: {len(results) - downloaded}")

if __name__ == "__main__":
    main()