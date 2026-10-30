from docx import Document
import json, re

doc = Document(r"C:\Users\User\Downloads\bangladesh_60_floor_plans_links.docx")

# Join all paragraphs with newlines, then parse
full = "\n".join(p.text for p in doc.paragraphs)

links = []
current_group = None
for line in full.split("\n"):
    text = line.strip()
    if not text:
        continue
    if "1-Unit" in text:
        current_group = "1-unit"
    elif "2-Unit" in text:
        current_group = "2-unit"
    elif "3-Unit" in text:
        current_group = "3-unit"
    else:
        m = re.match(r"^(\d+)\.\s+(.*)", text)
        if m and current_group:
            num = int(m.group(1))
            rest = m.group(2)
            url_match = re.search(r"(https?://[^\s]+)", rest)
            url = url_match.group(1) if url_match else ""
            title = rest[:url_match.start()].strip() if url_match else rest
            links.append({
                "index": num,
                "group": current_group,
                "title": title,
                "url": url
            })

with open(r"C:\1_SAJID\ArchResidenceBD\repo\floorplan_links.json", "w", encoding="utf-8") as f:
    json.dump(links, f, indent=2, ensure_ascii=False)

print(f"Extracted {len(links)} links")
for g in ["1-unit", "2-unit", "3-unit"]:
    group_links = [l for l in links if l["group"] == g]
    print(f"  {g}: {len(group_links)}")
    for l in group_links:
        print(f"    {l['index']}. {l['title'][:50]} -> {l['url'][:90]}")