import json
import re
from pathlib import Path

KB_DIR = Path("kb")
OUT = Path("docs/kb_index.json")

def read_title(md: str) -> str:
  for line in md.splitlines():
    if line.startswith("# "):
      return line[2:].strip()
  return "Untitled"

def strip_frontmatter(md: str) -> str:
  if md.startswith("---"):
    parts = md.split("---", 2)
    if len(parts) == 3:
      return parts[2]
  return md

def guess_subject(p: Path) -> str:
  # kb/physics/...
  if len(p.parts) >= 2:
    s = p.parts[1]
    return {
      "physics": "Physics",
      "chemistry": "Chemistry",
      "maths": "Maths",
      "english": "English",
      "computer_science": "Computer Science",
    }.get(s, s.title())
  return "Unknown"

def topic_path(p: Path) -> str:
  # kb/physics/mechanics/newton-laws.md -> mechanics
  parts = list(p.parts[2:-1])
  return "/".join([x.replace("_"," ").title() for x in parts]) or "General"

def extract_text(md: str) -> str:
  md = strip_frontmatter(md)
  md = re.sub(r"```.*?```", "", md, flags=re.S)
  md = re.sub(r"`[^`]*`", "", md)
  md = re.sub(r"#+\s+", "", md)
  md = re.sub(r"\[(.*?)\]\((.*?)\)", r"\1", md)
  md = re.sub(r"\s+", " ", md).strip()
  return md[:3000]

def main():
  items = []
  for f in KB_DIR.rglob("*.md"):
    md = f.read_text(encoding="utf-8", errors="ignore")
    subject = guess_subject(f)
    topic = topic_path(f)
    title = read_title(strip_frontmatter(md))
    text = extract_text(md)

    # GitHub Pages serves /docs, but kb is at repo root.
    # We'll link to GitHub view by default (works always).
    url = f"https://github.com/{{OWNER}}/{{REPO}}/blob/main/{f.as_posix()}"

    items.append({
      "title": title,
      "subject": subject,
      "exam": "",      # optional: later parse from frontmatter
      "topic": topic,
      "tags": "",
      "text": text,
      "url": url
    })

  OUT.parent.mkdir(parents=True, exist_ok=True)
  OUT.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
  print(f"Wrote {OUT} with {len(items)} items")

if __name__ == "__main__":
  main()