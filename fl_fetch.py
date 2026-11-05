"""Робот GitHub: забирает новые проекты FL.ru из открытой RSS-ленты и кладёт их в fl.json.
Телефон читает ленту из этого файла (браузер не может читать сайт FL.ru напрямую)."""
import html
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

req = urllib.request.Request("https://www.fl.ru/rss/all.xml", headers={"User-Agent": "Mozilla/5.0 MyDashboard"})
root = ET.fromstring(urllib.request.urlopen(req, timeout=30).read())
items = []
for it in root.findall(".//item"):
    title = html.unescape(it.findtext("title") or "").strip()
    budget = None
    m = re.search(r"\(Бюджет:\s*([^)]+)\)", title)
    if m:
        budget, title = m.group(1).strip(), title[:m.start()].strip()
    desc = re.sub(r"<[^>]+>", " ", html.unescape(it.findtext("description") or ""))
    try:
        ts = int(parsedate_to_datetime(it.findtext("pubDate")).timestamp() * 1000)
    except Exception:
        ts = 0
    items.append({"title": title, "budget": budget, "link": it.findtext("link"),
                  "category": html.unescape(it.findtext("category") or ""),
                  "desc": re.sub(r"\s+", " ", desc).strip()[:220], "ts": ts})
with open("fl.json", "w", encoding="utf-8") as f:
    json.dump({"items": items[:100]}, f, ensure_ascii=False)
print(len(items), "проектов")
