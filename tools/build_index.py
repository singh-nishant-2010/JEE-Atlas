import json
import re
from pathlib import Path

KB_DIR = Path("docs/kb")
OUT = Path("docs/kb_index.json")

def read_title(md: str) -> str:
    for line in md.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return "Untitled"

def strip_frontmatter(md: str) -> str:
    # YAML frontmatter:
    # ---
    # ...
    # ---
    if md.startswith("---"):
        parts = md.split("---", 2)
        if len(parts) == 3:
            return parts[2].lstrip()
    return md

def guess_subject(p: Path) -> str:
    # docs/kb/<subject>/...
    parts = p.parts
    if len(parts) >= 3:
        s = parts[2]
        return {
            "physics": "Physics",
            "chemistry": "Chemistry",
            "maths": "Maths",
            "english": "English",
            "computer_science": "Computer Science",
        }.get(s, s.replace("_", " ").title())
    return "Unknown"

def topic_path(p: Path) -> str:
    # docs/kb/<subject>/<topic...>/<file>.md
    parts = list(p.parts[3:-1])
    return "/".join([x.replace("_", " ").title() for x in parts]) or "General"

def extract_text(md: str) -> str:
    md = strip_frontmatter(md)

    # remove fenced code blocks
    md = re.sub(r"```.*?```", "", md, flags=re.S)

    # remove inline code
    md = re.sub(r"`[^`]*`", "", md)

    # strip headings markers
    md = re.sub(r"^#+\s+", "", md, flags=re.M)

    # convert markdown links to just text
    md = re.sub(r"\[(.*?)\]\((.*?)\)", r"\1", md)

    # collapse whitespace
    md = re.sub(r"\s+", " ", md).strip()

    return md[:2000]

def main() -> None:
    md_files = sorted(KB_DIR.rglob("*.md"))

    items = []
    for f in md_files:
        md = f.read_text(encoding="utf-8", errors="ignore")

        # Make path relative to docs/ so it works on GitHub Pages:
        # docs/kb/... -> kb/...
        rel_path = f.as_posix().replace("docs/", "", 1)

        items.append({
            "title": read_title(strip_frontmatter(md)),
            "subject": guess_subject(f),
            "exam": "",  # later you can parse from frontmatter if you want
            "topic": topic_path(f),
            "tags": "",  # later you can parse from frontmatter if you want
            "text": extract_text(md),
            "filename": f.name,
            "path": rel_path,                        # kb/physics/.../newton-laws.md
            "url": f"./view.html?path={rel_path}",   # clickable viewer link
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")

if __name__ == "__main__":
    main()