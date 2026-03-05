let KB = [];
let fuse = null;
const PAGE_SIZE = 10;
let currentPage = 1;
let currentItems = []; // filtered results currently being viewed

async function loadIndex() {
  const res = await fetch("./kb_index.json");
  KB = await res.json();

  fuse = new Fuse(KB, {
    includeScore: true,
    threshold: 0.35,
    keys: ["title", "subject", "exam", "topic", "tags", "text", "filename", "path", "slug"]
  });

  currentPage = 1;
  renderResults(KB);
}

function renderResults(items) {
  currentItems = items || [];
  const total = currentItems.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // clamp page
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = currentItems.slice(start, start + PAGE_SIZE);

  const el = document.getElementById("results");
  if (!pageItems.length) {
    el.innerHTML = `<p class="muted">No results.</p>`;
  } else {
    el.innerHTML = pageItems.map(x => {
      const p = x.path || x.path_in_pages || "";
      const href = x.url || (p ? `./view.html?path=${encodeURIComponent(p)}` : "#");
      return `
        <div class="result">
          <a href="${href}"><b>${escapeHtml(x.title)}</b></a>
          <div class="meta">${escapeHtml(x.subject)} • ${escapeHtml(x.exam)} • ${escapeHtml(x.topic)}</div>
          <div class="snippet">${escapeHtml((x.text || "").slice(0, 180))}...</div>
        </div>
      `;
    }).join("");
  }

  // pager UI
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const pageInfo = document.getElementById("pageInfo");

  prevBtn.disabled = currentPage <= 1;
  nextBtn.disabled = currentPage >= totalPages;

  pageInfo.textContent = total
    ? `Page ${currentPage} / ${totalPages} • ${total} results`
    : `Page 1 / 1 • 0 results`;
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[c]));
}

function doSearch() {
  const q = document.getElementById("q").value.trim();
  const subject = document.getElementById("subject").value;
  const exam = document.getElementById("exam").value;

  let base = KB;

  if (subject) base = base.filter(x => x.subject === subject);

  // forgiving exam filter
  if (exam) {
    base = base.filter(x => {
      if (!x.exam) return true;
      if (Array.isArray(x.exam)) return x.exam.includes(exam);
      return x.exam === exam;
    });
  }

  let items;
  if (!q) {
    items = base;
  } else {
    items = new Fuse(base, fuse.options)
      .search(q)
      .map(r => r.item);
  }

  currentPage = 1;        // ✅ reset to first page
  renderResults(items);   // pagination happens inside renderResults
}

// ---------------- Voice to text (Web Speech API) ----------------
let recognition = null;
let finalText = "";

function setupVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    document.getElementById("mic").disabled = true;
    document.getElementById("mic").textContent = "🎙 Voice not supported";
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "en-IN";
  recognition.interimResults = true;
  recognition.continuous = true;

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const text = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += text + " ";
      else interim += text;
    }
    const box = document.getElementById("add_body");
    box.value = (box.value + "\n\n" + (finalText || interim)).trim();
  };

  recognition.onend = () => {
    document.getElementById("mic").disabled = false;
    document.getElementById("stopMic").disabled = true;
  };
}

function startVoice() {
  if (!recognition) return;
  finalText = "";
  document.getElementById("mic").disabled = true;
  document.getElementById("stopMic").disabled = false;
  recognition.start();
}

function stopVoice() {
  if (!recognition) return;
  recognition.stop();
}

// ---------------- Add content -> generate Markdown + open GitHub ----------------
let generatedMd = "";

function slugify(s) {
  return (s || "")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function generateMarkdown() {
  const subject = document.getElementById("add_subject").value;
  const topic = document.getElementById("add_topic").value.trim() || "general";
  const exam = document.getElementById("add_exam").value;
  const tags = document.getElementById("add_tags").value.split(",").map(x => x.trim()).filter(Boolean);
  const title = document.getElementById("add_title").value.trim() || "Untitled";
  const body = document.getElementById("add_body").value.trim();

  const today = new Date().toISOString().slice(0, 10);
  const id = `${slugify(subject)}_${slugify(topic)}_${slugify(title)}_${today}`.replace(/-+/g, "_");

  generatedMd =
`---
id: ${id}
subject: ${subject}
exam: ${exam}
topic: ${topic}
tags: [${tags.join(", ")}]
last_updated: ${today}
---

# ${title}

${body || "Write your content here..."}
`;

  document.getElementById("mdPreview").textContent = generatedMd;
  document.getElementById("openGithub").disabled = false;
}

function openGithubCommit() {
  const OWNER = "singh-nishant-2010";
  const REPO = "JEE-Atlas";

  const subject = document.getElementById("add_subject").value;
  const topic = document.getElementById("add_topic").value.trim() || "general";
  const title = document.getElementById("add_title").value.trim() || "untitled";

  // IMPORTANT: since you moved kb under docs permanently (Option B)
  const path = `docs/kb/${slugify(subject)}/${topic.split("/").map(slugify).join("/")}/${slugify(title)}.md`;

  const url =
    `https://github.com/${OWNER}/${REPO}/new/main/${encodeURIComponent(path)}`
    + `?value=${encodeURIComponent(generatedMd)}`;

  window.open(url, "_blank");
}

// Wiring
document.getElementById("q").addEventListener("input", doSearch);
document.getElementById("subject").addEventListener("change", doSearch);
document.getElementById("exam").addEventListener("change", doSearch);

document.getElementById("gen").addEventListener("click", generateMarkdown);
document.getElementById("openGithub").addEventListener("click", openGithubCommit);

document.getElementById("mic").addEventListener("click", startVoice);
document.getElementById("stopMic").addEventListener("click", stopVoice);

document.getElementById("prevBtn").addEventListener("click", () => {
  currentPage -= 1;
  renderResults(currentItems);
});

document.getElementById("nextBtn").addEventListener("click", () => {
  currentPage += 1;
  renderResults(currentItems);
});

setupVoice();
loadIndex();

// ---------------- Theme Toggle ----------------

const themeToggle = document.getElementById("themeToggle");

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);

  themeToggle.textContent = theme === "dark" ? "☀️ Light" : "🌙 Dark";
}

function initTheme() {
  const saved = localStorage.getItem("theme");

  if (saved) {
    setTheme(saved);
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(prefersDark ? "dark" : "light");
  }
}

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  setTheme(current === "dark" ? "light" : "dark");
});

initTheme();