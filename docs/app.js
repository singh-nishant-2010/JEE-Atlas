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

document.getElementById("clearMd").addEventListener("click", () => {
  const box = document.getElementById("add_body");

  if (!box.value.trim()) return;

  const confirmClear = confirm("Clear the markdown text?");
  if (!confirmClear) return;

  box.value = "";
  document.getElementById("mdPreview").textContent = "";
});

setupVoice();
loadIndex();

// ---------------- Theme Toggle (slider) ----------------
const themeToggle = document.getElementById("themeToggle");

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);

  // keep slider state in sync
  themeToggle.checked = (theme === "dark");
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

themeToggle.addEventListener("change", () => {
  setTheme(themeToggle.checked ? "dark" : "light");
});

initTheme();


function getSelectedSubject() {
  // Your existing subject filter dropdown
  const sel = document.getElementById("subject");
  return sel ? (sel.value || "").trim() : "";
}

function basePromptForSubject(subject) {
  // subject values in your UI are like: "Physics", "Chemistry", "Maths", "English", "Computer Science"
  // If empty -> general tutor
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
  const q = (document.getElementById("q")?.value || "").trim(); // search box text
  const subject = getSelectedSubject();

  const base = basePromptForSubject(subject);

  // User adds rest of the prompt (their query). If empty, leave a placeholder.
  const userPart = q ? q : "(Type your doubt/question here)";

  return `${base}\n\nUser question/topic:\n${userPart}`;
}

function openSelectedAI() {
  const provider = document.getElementById("aiProvider").value;
  const prompt = buildPrompt();
  const encoded = encodeURIComponent(prompt);

  // NOTE:
  // Some apps support query params (Perplexity). Some don't (ChatGPT/Claude/Gemini often change deep links).
  // We will open the service and also copy the prompt to clipboard for reliability.

  const links = {
    chatgpt: "https://chat.openai.com/",
    claude: "https://claude.ai/",
    gemini: "https://gemini.google.com/",
    copilot: "https://copilot.microsoft.com/",
    perplexity: `https://www.perplexity.ai/?q=${encoded}`
  };

  const url = links[provider] || links.chatgpt;

  // Copy prompt so user can paste immediately
  navigator.clipboard?.writeText(prompt).catch(() => {});

  window.open(url, "_blank");
  alert("Prompt copied to clipboard. Paste it in the opened AI chat.");
}

document.getElementById("askAiBtn").addEventListener("click", openSelectedAI);