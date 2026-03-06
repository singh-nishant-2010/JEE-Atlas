// =====================
// JEE Atlas - app.js
// =====================

let KB = [];
let fuse = null;

const PAGE_SIZE = 10;
let currentPage = 1;
let currentItems = []; // filtered results currently being viewed

// ---------------- Index + Search ----------------
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

  currentPage = 1;
  renderResults(items);
}

// ---------------- Voice to text (Web Speech API) ----------------
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

  // kb under docs
  const path = `docs/kb/${slugify(subject)}/${topic.split("/").map(slugify).join("/")}/${slugify(title)}.md`;

  const url =
    `https://github.com/${OWNER}/${REPO}/new/main/${encodeURIComponent(path)}`
    + `?value=${encodeURIComponent(generatedMd)}`;

  window.open(url, "_blank");
}

// ---------------- Theme Toggle (slider) ----------------
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

// ---------------- AI prompt (Subject-aware) ----------------
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

// ---------------- AI menu (FIXED: bind after DOM ready + open immediately) ----------------
function initAiMenu() {
  const askBtn = document.getElementById("askAiBtn");
  const aiMenu = document.getElementById("aiMenu");
  if (!askBtn || !aiMenu) return;

  const AI_LINKS = {
    chatgpt: "https://chat.openai.com/",
    claude: "https://claude.ai/",
    gemini: "https://gemini.google.com/",
    copilot: "https://copilot.microsoft.com/",
    // Perplexity supports prefill query
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

    // copy prompt
    try {
      await navigator.clipboard.writeText(prompt);
      toast("Prompt copied — paste in the opened AI chat");
    } catch {
      toast("Open AI — copy/paste prompt manually");
    }

    // open tab
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

  document.addEventListener("click", () => toggleAiMenu(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") toggleAiMenu(false);
  });
}

//-------- Content Validation ---------------------

function validateContent(content, subject, exam) {
    // Expanded forbidden words list
    const forbiddenWords = [
        "inappropriate", "insensitive", "offensive", "abuse", "harassment", "hate",
        "violence", "racism", "sexism", "profanity", "slur", "vulgar", "obscene",
        "discrimination", "bullying", "threat", "terrorism", "extremism", "illegal",
        "drugs", "weapon", "pornography", "explicit", "self-harm", "suicide",
        "misinformation", "fake news", "spam", "irrelevant", "nonsense", "trolling"
    ];

    // Check for forbidden words
    for (const word of forbiddenWords) {
        if (content.toLowerCase().includes(word)) {
            alert(`Your content contains forbidden words: "${word}". Please remove them.`);
            return false;
        }
    }

    // Additional validation for subject and exam
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


// ---------------- Wire everything safely after DOM is ready ----------------
window.addEventListener("DOMContentLoaded", () => {
  // Wiring search
  document.getElementById("q")?.addEventListener("input", doSearch);
  document.getElementById("subject")?.addEventListener("change", doSearch);
  document.getElementById("exam")?.addEventListener("change", doSearch);

  // Pager
  document.getElementById("prevBtn")?.addEventListener("click", () => {
    currentPage -= 1;
    renderResults(currentItems);
  });

  document.getElementById("nextBtn")?.addEventListener("click", () => {
    currentPage += 1;
    renderResults(currentItems);
  });

  // Add content
  document.getElementById("gen")?.addEventListener("click", generateMarkdown);
  document.getElementById("openGithub")?.addEventListener("click", openGithubCommit);

  // Clear markdown
  document.getElementById("clearMd")?.addEventListener("click", () => {
    const box = document.getElementById("add_body");
    if (!box || !box.value.trim()) return;

    const confirmClear = confirm("Clear the markdown text?");
    if (!confirmClear) return;

    box.value = "";
    const prev = document.getElementById("mdPreview");
    if (prev) prev.textContent = "";
  });

  // Voice
  document.getElementById("mic")?.addEventListener("click", startVoice);
  document.getElementById("stopMic")?.addEventListener("click", stopVoice);

  setupVoice();
  initTheme();
  initAiMenu();
  loadIndex();
});