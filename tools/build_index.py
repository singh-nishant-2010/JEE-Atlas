import json
import re
import os
from pathlib import Path

KB_DIR = Path("docs/kb")
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
    md = re.sub(r"```.*?```", "", md, flags=re.S)
    md = re.sub(r"`[^`]*`", "", md)
    md = re.sub(r"#+\s+", "", md)
    md = re.sub(r"\[(.*?)\]\((.*?)\)", r"\1", md)
    md = re.sub(r"\s+", " ", md).strip()
    return md[:2000]

def main():
    print("=== DEBUG START ===")
    print("CWD:", os.getcwd())
    print("Repo root listing:", [p.name for p in Path(".").iterdir()])
    print("KB_DIR exists?", KB_DIR.exists(), "is_dir?", KB_DIR.is_dir())
    if KB_DIR.exists():
        # show first few levels
        sample = list(KB_DIR.rglob("*"))[:25]
        print("KB sample entries (first 25):", [s.as_posix() for s in sample])

    md_files = list(KB_DIR.rglob("*.md"))
    print("Found .md files:", len(md_files))
    print("First 10 md files:", [f.as_posix() for f in md_files[:10]])
    print("=== DEBUG END ===")

    items = []
    for f in md_files:
        rel_path = f.as_posix().replace("docs/", "", 1)  # docs/kb/... -> kb/...
        
        items.append({
            "title": read_title(strip_frontmatter(md)),
            "subject": guess_subject(f),
            "exam": "",
            "topic": topic_path(f),
            "tags": "",
            "text": extract_text(md),
            "filename": f.name,
            "path": rel_path,              # kb/physics/.../newton-laws.md
            "url": f"./view.html?path={rel_path}",  # viewer link
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT} with {len(items)} items")

if __name__ == "__main__":
    main()