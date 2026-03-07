// =====================
// JEE Atlas - app.js
// =====================

let KB = [];
let fuse = null;

const PAGE_SIZE = 10;
let currentPage = 1;
let currentItems = [];

let suggestionFuse = null;

// ---------------- Suggestion Index ----------------
function buildSuggestionIndex() {
  const pool = [];

  KB.forEach(item => {
    if (item.title) {
      pool.push({
        kind: "title",
        value: item.title,
        meta: `${item.subject || ""} • ${item.topic || ""}`.trim(),
        path: item.path || ""
      });
    }

    if (item.topic) {
      pool.push({
        kind: "topic",
        value: item.topic,
        meta: item.subject || "",
        path: item.path || ""
      });
    }

    if (item.filename) {
      pool.push({
        kind: "file",
        value: item.filename.replace(/\.md$/i, ""),
        meta: item.subject || "",
        path: item.path || ""
      });
    }

    if (item.slug) {
      pool.push({
        kind: "slug",
        value: item.slug,
        meta: item.subject || "",
        path: item.path || ""
      });
    }
  });

  suggestionFuse = new Fuse(pool, {
    includeScore: true,
    threshold: 0.3,
    keys: ["value", "meta"]
  });
}

function uniqueSuggestions(results, limit = 5) {
  const seen = new Set();
  const out = [];

  for (const r of results) {
    const key = `${r.item.kind}::${r.item.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r.item);
    if (out.length >= limit) break;
  }

  return out;
}

function getSuggestions(query, limit = 5) {
  if (!query || !suggestionFuse) return [];
  const results = suggestionFuse.search(query);
  return uniqueSuggestions(results, limit);
}

function renderSuggestionBox(boxId, suggestions, handlerName) {
  const box = document.getElementById(boxId);
  if (!box) return;

  if (!suggestions.length) {
    closeSuggestionBox(boxId);
    return;
  }

  box.innerHTML = suggestions.map((s, idx) => `
    <div class="suggestion-item" data-box="${boxId}" data-idx="${idx}">
      <div class="suggestion-title">${escapeHtml(s.value)}</div>
      <div class="suggestion-meta">${escapeHtml(s.kind)}${s.meta ? " • " + escapeHtml(s.meta) : ""}</div>
    </div>
  `).join("");

  box._items = suggestions;
  box._handlerName = handlerName;
  box.classList.add("open");
}

function closeSuggestionBox(boxId) {
  const box = document.getElementById(boxId);
  if (!box) return;
  box.classList.remove("open");
  box.innerHTML = "";
  box._items = [];
  box._handlerName = "";
}

function applySearchSuggestion(item) {
  const q = document.getElementById("q");
  if (!q) return;

  q.value = item.value;
  closeSuggestionBox("searchSuggestions");
  doSearch();
}

function applyTitleSuggestion(item) {
  const title = document.getElementById("add_title");
  const topic = document.getElementById("add_topic");

  if (title) title.value = item.value;

  if (topic && item.meta && !topic.value.trim()) {
    const parts = item.meta.split("•").map(x => x.trim()).filter(Boolean);
    if (parts.length > 1) topic.value = parts[1];
  }

  closeSuggestionBox("titleSuggestions");
}

function applyBodySuggestion(item) {
  const box = document.getElementById("add_body");
  if (!box) return;

  const insert = `\n\n## Related Suggestion\n- ${item.value}\n`;
  box.value = (box.value + insert).trim();

  closeSuggestionBox("bodySuggestions");
}

function updateSearchSuggestions() {
  const q = document.getElementById("q")?.value.trim() || "";
  if (!q) {
    closeSuggestionBox("searchSuggestions");
    return;
  }

  const suggestions = getSuggestions(q, 5);
  renderSuggestionBox("searchSuggestions", suggestions, "applySearchSuggestion");
}

function updateTitleSuggestions() {
  const q = document.getElementById("add_title")?.value.trim() || "";
  if (!q) {
    closeSuggestionBox("titleSuggestions");
    return;
  }

  const suggestions = getSuggestions(q, 5);
  renderSuggestionBox("titleSuggestions", suggestions, "applyTitleSuggestion");
}

function updateBodySuggestions() {
  const body = document.getElementById("add_body")?.value.trim() || "";
  if (!body) {
    closeSuggestionBox("bodySuggestions");
    return;
  }

  const tail = body.split(/\s+/).slice(-6).join(" ");
  const suggestions = getSuggestions(tail, 5);
  renderSuggestionBox("bodySuggestions", suggestions, "applyBodySuggestion");
}

// ---------------- Index + Search ----------------
async function loadIndex() {
  const res = await fetch("./kb_index.json");
  KB = await res.json();

  fuse = new Fuse(KB, {
    includeScore: true,
    threshold: 0.35,
    keys: ["title", "subject", "exam", "topic", "tags", "text", "filename", "path", "slug"]
  });

  buildSuggestionIndex();

  currentPage = 1;
  renderResults(KB);
}

function renderResults(items) {
  currentItems = items || [];
  const total = currentItems.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = currentItems.slice(start, start + PAGE_SIZE);

  const el = document.getElementById("results");
  const manageMode = document.getElementById("manageMode")?.checked;

  if (!pageItems.length) {
    el.innerHTML = `<p class="muted">No results.</p>`;
  } else {
    el.innerHTML = pageItems.map(x => {
      const p = x.path || x.path_in_pages || "";
      const href = x.url || (p ? `./view.html?path=${encodeURIComponent(p)}` : "#");

      return `
        <div class="result">
          <div class="result-header">
            <div class="result-left">
              ${manageMode ? `
                <label class="note-check">
                  <input type="checkbox" class="noteSelector" data-path="${escapeHtml(p)}" />
                </label>
              ` : ""}
              <a href="${href}"><b>${escapeHtml(x.title)}</b></a>
            </div>

            ${manageMode ? `
              <button class="delete-note" data-path="${escapeHtml(p)}" title="Delete this note">
                🗑
              </button>
            ` : ""}
          </div>

          <div class="meta">${escapeHtml(x.subject)} • ${escapeHtml(x.exam)} • ${escapeHtml(x.topic)}</div>
          <div class="snippet">${escapeHtml((x.text || "").slice(0, 180))}...</div>
        </div>
      `;
    }).join("");
  }

  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const pageInfo = document.getElementById("pageInfo");

  if (prevBtn) prevBtn.disabled = currentPage <= 1;
  if (nextBtn) nextBtn.disabled = currentPage >= totalPages;

  if (pageInfo) {
    pageInfo.textContent = total
      ? `Page ${currentPage} / ${totalPages} • ${total} results`
      : `Page 1 / 1 • 0 results`;
  }

  updateDeleteSelectedButton();
}

function getSelectedNotePaths() {
  return Array.from(document.querySelectorAll(".noteSelector:checked"))
    .map(cb => cb.getAttribute("data-path"))
    .filter(Boolean);
}

function updateDeleteSelectedButton() {
  const btn = document.getElementById("deleteSelectedBtn");
  if (!btn) return;

  const selected = getSelectedNotePaths();
  btn.disabled = selected.length === 0;
  btn.textContent = selected.length ? `Delete Selected (${selected.length})` : "Delete Selected";
}

function openGitHubDeletePage(filePath) {
  const OWNER = "singh-nishant-2010";
  const REPO = "JEE-Atlas";

  const repoPath = `docs/${filePath}`;
  const githubDeleteURL = `https://github.com/${OWNER}/${REPO}/delete/main/${repoPath}`;

  window.open(githubDeleteURL, "_blank");
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

  currentPage = 1;
  renderResults(items);
}

// ---------------- Voice to text ----------------
let recognition = null;
let finalText = "";

function setupVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    const mic = document.getElementById("mic");
    if (mic) {
      mic.disabled = true;
      mic.textContent = "🎙 Voice not supported";
    }
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
    if (!box) return;

    box.value = (box.value + "\n\n" + (finalText || interim)).trim();
    updateBodySuggestions();
  };

  recognition.onend = () => {
    const mic = document.getElementById("mic");
    const stopMicBtn = document.getElementById("stopMic");
    if (mic) mic.disabled = false;
    if (stopMicBtn) stopMicBtn.disabled = true;
  };
}

function startVoice() {
  if (!recognition) return;
  finalText = "";

  const mic = document.getElementById("mic");
  const stopMicBtn = document.getElementById("stopMic");

  if (mic) mic.disabled = true;
  if (stopMicBtn) stopMicBtn.disabled = false;

  recognition.start();
}

function stopVoice() {
  if (!recognition) return;
  recognition.stop();
}

// ---------------- Add content ----------------
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

  if (!validateContent(body, subject, exam)) return;

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

/* Secure GitHub-native proposal flow:
   opens a prefilled GitHub Issue instead of direct repo write */
function openGithubCommit() {
  const OWNER = "singh-nishant-2010";
  const REPO = "JEE-Atlas";

  const subject = document.getElementById("add_subject").value;
  const topic = document.getElementById("add_topic").value.trim() || "general";
  const title = document.getElementById("add_title").value.trim() || "Untitled";

  if (!generatedMd.trim()) {
    alert("Generate the markdown first.");
    return;
  }

  const issueTitle = `[KB] ${subject}: ${title}`;
  const issueBody =
`### Proposed Knowledge Base Note

**Subject:** ${subject}
**Topic:** ${topic}

---

\`\`\`markdown
${generatedMd}
\`\`\`

---

Please review and merge this into the knowledge base.
`;

  const url =
    `https://github.com/${OWNER}/${REPO}/issues/new?title=${encodeURIComponent(issueTitle)}&body=${encodeURIComponent(issueBody)}`;

  window.open(url, "_blank");
}

// ---------------- Theme Toggle ----------------
function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);

  const themeToggle = document.getElementById("themeToggle");
  if (themeToggle) themeToggle.checked = (theme === "dark");
}

function initTheme() {
  const saved = localStorage.getItem("theme");
  if (saved) {
    setTheme(saved);
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(prefersDark ? "dark" : "light");
  }

  const themeToggle = document.getElementById("themeToggle");
  if (themeToggle) {
    themeToggle.addEventListener("change", () => {
      setTheme(themeToggle.checked ? "dark" : "light");
    });
  }
}

// ---------------- AI prompt ----------------
function getSelectedSubject() {
  const sel = document.getElementById("subject");
  return sel ? (sel.value || "").trim() : "";
}

function basePromptForSubject(subject) {
  const common =
    "Explain clearly, step-by-step. Include key formulas/rules, common mistakes, shortcuts, and 2-3 quick practice questions with answers.";

  switch (subject) {
    case "Physics":
      return `You are an expert IIT JEE (Main + Advanced) Physics tutor. Focus on concepts, derivations, free-body diagrams, units/dimensions, graphs, and common JEE traps. ${common}`;
    case "Chemistry":
      return `You are an expert IIT JEE (Main + Advanced) Chemistry tutor (Physical, Organic, Inorganic). Use mechanisms where needed, key trends, exceptions, and memory hacks. ${common}`;
    case "Maths":
      return `You are an expert IIT JEE (Main + Advanced) Mathematics tutor. Emphasize method selection, speed tricks, standard results, and clean step-by-step solutions. ${common}`;
    case "English":
      return `You are an expert Class 11-12 English teacher. Focus on grammar rules, writing formats, comprehension strategy, and examples. ${common}`;
    case "Computer Science":
      return `You are an expert Class 11-12 Computer Science teacher (Python + fundamentals). Provide clear explanations, code examples, common errors, and short practice problems. ${common}`;
    default:
      return `You are an expert teacher for IIT JEE (Main + Advanced) Physics, Chemistry, Maths and Class 11-12 English & Computer Science. ${common}`;
  }
}

function buildPrompt() {
  const q = (document.getElementById("q")?.value || "").trim();
  const subject = getSelectedSubject();
  const base = basePromptForSubject(subject);
  const userPart = q ? q : "(Type your doubt/question here)";
  return `${base}\n\nUser question/topic:\n${userPart}`;
}

// ---------------- AI menu ----------------
function initAiMenu() {
  const askBtn = document.getElementById("askAiBtn");
  const aiMenu = document.getElementById("aiMenu");
  if (!askBtn || !aiMenu) return;

  const AI_LINKS = {
    chatgpt: "https://chat.openai.com/",
    claude: "https://claude.ai/",
    gemini: "https://gemini.google.com/",
    copilot: "https://copilot.microsoft.com/",
    perplexity: (prompt) => `https://www.perplexity.ai/?q=${encodeURIComponent(prompt)}`
  };

  function toggleAiMenu(forceOpen = null) {
    const open = forceOpen ?? !aiMenu.classList.contains("open");
    aiMenu.classList.toggle("open", open);
    askBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function toast(msg) {
    let t = document.getElementById("toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.style.position = "fixed";
      t.style.left = "50%";
      t.style.bottom = "18px";
      t.style.transform = "translateX(-50%)";
      t.style.padding = "10px 12px";
      t.style.borderRadius = "999px";
      t.style.border = "1px solid var(--border)";
      t.style.background = "var(--card)";
      t.style.color = "var(--text)";
      t.style.boxShadow = "0 10px 30px rgba(0,0,0,0.25)";
      t.style.zIndex = "9999";
      t.style.fontWeight = "600";
      t.style.opacity = "0";
      t.style.transition = "opacity 0.2s ease";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    clearTimeout(t._timer);
    t._timer = setTimeout(() => (t.style.opacity = "0"), 1800);
  }

  async function openAiProvider(provider) {
    const prompt = buildPrompt();

    try {
      await navigator.clipboard.writeText(prompt);
      toast("Prompt copied — paste in the opened AI chat");
    } catch {
      toast("Open AI — copy/paste prompt manually");
    }

    let url = AI_LINKS[provider] || AI_LINKS.chatgpt;
    if (typeof url === "function") url = url(prompt);

    window.open(url, "_blank");
  }

  askBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleAiMenu();
  });

  aiMenu.addEventListener("click", (e) => {
    const btn = e.target.closest(".ai-item");
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const provider = btn.getAttribute("data-ai");
    toggleAiMenu(false);
    openAiProvider(provider);
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".ai")) toggleAiMenu(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") toggleAiMenu(false);
  });
}

// ---------------- Content Validation ----------------
function validateContent(content, subject, exam) {
  const forbiddenWords = [
    "inappropriate", "insensitive", "offensive", "abuse", "harassment", "hate",
    "violence", "racism", "sexism", "profanity", "slur", "vulgar", "obscene",
    "discrimination", "bullying", "threat", "terrorism", "extremism", "illegal",
    "drugs", "weapon", "pornography", "explicit", "self-harm", "suicide",
    "misinformation", "fake news", "spam", "irrelevant", "nonsense", "trolling"
  ];

  for (const word of forbiddenWords) {
    if (content.toLowerCase().includes(word)) {
      alert(`Your content contains forbidden words: "${word}". Please remove them.`);
      return false;
    }
  }

  const allowedSubjects = ["Physics", "Chemistry", "Maths", "English", "Computer Science"];
  const allowedExams = ["School", "JEE_Main", "JEE_Advanced"];

  if (!allowedSubjects.includes(subject)) {
    alert("Invalid subject. Please select a valid subject.");
    return false;
  }

  if (!allowedExams.includes(exam)) {
    alert("Invalid exam level. Please select a valid exam.");
    return false;
  }

  return true;
}

// ---------------- Global delegated click handlers ----------------
document.addEventListener("click", (e) => {
  const itemEl = e.target.closest(".suggestion-item");
  if (itemEl) {
    const boxId = itemEl.getAttribute("data-box");
    const box = document.getElementById(boxId);
    if (!box || !box._items) return;

    const idx = Number(itemEl.getAttribute("data-idx"));
    const item = box._items[idx];
    if (!item) return;

    if (box._handlerName === "applySearchSuggestion") applySearchSuggestion(item);
    if (box._handlerName === "applyTitleSuggestion") applyTitleSuggestion(item);
    if (box._handlerName === "applyBodySuggestion") applyBodySuggestion(item);
    return;
  }

  const btn = e.target.closest(".delete-note");
  if (btn) {
    const filePath = btn.getAttribute("data-path");
    if (!filePath) return;

    const confirmDelete = confirm(`Delete this note from the repository?\n\n${filePath}`);
    if (!confirmDelete) return;

    openGitHubDeletePage(filePath);
    return;
  }

  if (!e.target.closest(".search-wrap")) closeSuggestionBox("searchSuggestions");
  if (!e.target.closest("#add_title")) closeSuggestionBox("titleSuggestions");
  if (!e.target.closest("#add_body")) closeSuggestionBox("bodySuggestions");
});

// ---------------- Wire everything after DOM ready ----------------
window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("q")?.addEventListener("input", () => {
    doSearch();
    updateSearchSuggestions();
  });

  document.getElementById("subject")?.addEventListener("change", doSearch);
  document.getElementById("exam")?.addEventListener("change", doSearch);

  document.getElementById("add_title")?.addEventListener("input", updateTitleSuggestions);
  document.getElementById("add_body")?.addEventListener("input", updateBodySuggestions);

  document.getElementById("prevBtn")?.addEventListener("click", () => {
    currentPage -= 1;
    renderResults(currentItems);
  });

  document.getElementById("nextBtn")?.addEventListener("click", () => {
    currentPage += 1;
    renderResults(currentItems);
  });

  document.getElementById("gen")?.addEventListener("click", generateMarkdown);
  document.getElementById("openGithub")?.addEventListener("click", openGithubCommit);

  document.getElementById("clearMd")?.addEventListener("click", () => {
    const box = document.getElementById("add_body");
    if (!box || !box.value.trim()) return;

    const confirmClear = confirm("Clear the markdown text?");
    if (!confirmClear) return;

    box.value = "";
    const prev = document.getElementById("mdPreview");
    if (prev) prev.textContent = "";

    closeSuggestionBox("bodySuggestions");
    closeSuggestionBox("titleSuggestions");
  });

  document.getElementById("mic")?.addEventListener("click", startVoice);
  document.getElementById("stopMic")?.addEventListener("click", stopVoice);

  document.getElementById("manageMode")?.addEventListener("change", () => {
    renderResults(currentItems);
  });

  document.addEventListener("change", (e) => {
    if (e.target.classList.contains("noteSelector")) {
      updateDeleteSelectedButton();
    }
  });

  document.getElementById("deleteSelectedBtn")?.addEventListener("click", () => {
    const selected = getSelectedNotePaths();
    if (!selected.length) return;

    const confirmDelete = confirm(
      `Delete ${selected.length} selected note(s)?\n\n${selected.join("\n")}`
    );
    if (!confirmDelete) return;

    selected.forEach((path, idx) => {
      setTimeout(() => openGitHubDeletePage(path), idx * 300);
    });
  });

  setupVoice();
  initTheme();
  initAiMenu();
  loadIndex();
});