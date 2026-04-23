// === State ===
let quizQuestions = [];
let currentQuestionIndex = 0;
let selectedAnswer = null;
let quizAnswers = []; // { questionId, selected, correct, domain }
let quizStartDomain = null;

const DOMAIN_NAMES = {
  "basic-ai": "1.0 Basic AI Concepts",
  "securing-ai": "2.0 Securing AI Systems",
  "ai-security": "3.0 AI-Assisted Security",
  "ai-grc": "4.0 AI GRC",
};
const DOMAIN_WEIGHTS = {
  "basic-ai": 0.17,
  "securing-ai": 0.40,
  "ai-security": 0.24,
  "ai-grc": 0.19,
};
const DOMAIN_COLORS = {
  "basic-ai": "#818cf8",
  "securing-ai": "#f472b6",
  "ai-security": "#34d399",
  "ai-grc": "#fbbf24",
};

// === Tab Navigation ===
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
  document.querySelector(`.tab[data-tab="${name}"]`).classList.add("active");
  document.getElementById(name).classList.add("active");

  if (name === "dashboard") loadDashboard();
  if (name === "flashcards") loadFlashcards();
  if (name === "progress") loadProgress();
  if (name === "resources") loadResources();
  if (name === "transcripts") loadTranscripts();
  if (name === "docs") loadDocs();
}

// === Dashboard ===
async function loadDashboard() {
  const [stats, progress] = await Promise.all([
    fetch("/api/stats").then((r) => r.json()),
    fetch("/api/progress").then((r) => r.json()),
  ]);

  const totalQ = Object.values(stats).reduce((s, d) => s + d.total, 0);
  document.getElementById("dash-total-questions").textContent = totalQ;

  const sessions = progress.sessions || [];
  document.getElementById("dash-sessions").textContent = sessions.length;

  if (sessions.length > 0) {
    const totalAttempted = sessions.reduce((s, r) => s + r.totalQuestions, 0);
    const totalCorrect = sessions.reduce((s, r) => s + r.correctAnswers, 0);
    const avg = ((totalCorrect / totalAttempted) * 100).toFixed(0);
    document.getElementById("dash-avg-score").textContent = avg + "%";

    let weighted = 0, covered = 0;
    for (const [did, w] of Object.entries(DOMAIN_WEIGHTS)) {
      const ds = sessions.filter((s) => s.domain === did);
      const dt = ds.reduce((s, r) => s + r.totalQuestions, 0);
      const dc = ds.reduce((s, r) => s + r.correctAnswers, 0);
      if (dt > 0) { weighted += (dc / dt) * w; covered += w; }
    }
    const est = covered > 0 ? Math.round((weighted / covered) * 900) : 0;
    document.getElementById("dash-readiness").textContent = est + "/900";
  } else {
    document.getElementById("dash-avg-score").textContent = "—";
    document.getElementById("dash-readiness").textContent = "—";
  }

  // Domain bars
  const barsEl = document.getElementById("dash-domains");
  barsEl.innerHTML = "";
  for (const [did, info] of Object.entries(stats)) {
    const weight = Math.round(DOMAIN_WEIGHTS[did] * 100);
    const color = DOMAIN_COLORS[did];
    barsEl.innerHTML += `
      <div class="domain-bar-row">
        <span class="domain-bar-label">${DOMAIN_NAMES[did]}</span>
        <div class="domain-bar-track">
          <div class="domain-bar-fill" style="width:${weight}%;background:${color}"></div>
        </div>
        <span class="domain-bar-value" style="color:${color}">${info.total} Qs</span>
      </div>`;
  }
}

// === Quick Start ===
function startQuickQuiz(domain) {
  document.getElementById("quiz-domain").value = domain;
  document.getElementById("quiz-count").value = "10";
  document.getElementById("quiz-difficulty").value = "all";
  switchTab("quiz");
  startQuiz();
}

// === Quiz ===
async function startQuiz() {
  const domain = document.getElementById("quiz-domain").value;
  const count = document.getElementById("quiz-count").value;
  const difficulty = document.getElementById("quiz-difficulty").value;

  const params = new URLSearchParams({ count });
  if (domain !== "all") params.set("domain", domain);
  if (difficulty !== "all") params.set("difficulty", difficulty);

  quizQuestions = await fetch(`/api/quiz?${params}`).then((r) => r.json());

  if (quizQuestions.length === 0) {
    alert("No questions found for this selection. Try different filters.");
    return;
  }

  quizStartDomain = domain === "all" ? null : domain;
  currentQuestionIndex = 0;
  selectedAnswer = null;
  quizAnswers = [];

  document.getElementById("quiz-setup").classList.add("hidden");
  document.getElementById("quiz-results").classList.add("hidden");
  document.getElementById("quiz-active").classList.remove("hidden");

  renderQuestion();
}

function renderQuestion() {
  const q = quizQuestions[currentQuestionIndex];
  const total = quizQuestions.length;

  document.getElementById("quiz-counter").textContent = `Question ${currentQuestionIndex + 1} of ${total}`;
  const answered = quizAnswers.length;
  const correct = quizAnswers.filter((a) => a.correct).length;
  document.getElementById("quiz-score-live").textContent = `Score: ${correct}/${answered}`;
  document.getElementById("quiz-progress-fill").style.width = `${((currentQuestionIndex) / total) * 100}%`;

  const domainLabel = DOMAIN_NAMES[q.domain] || q.domain;
  document.getElementById("question-badge").textContent = `${domainLabel} — ${q.difficulty}`;
  document.getElementById("question-text").textContent = q.question;

  const container = document.getElementById("choices-container");
  container.innerHTML = "";
  selectedAnswer = null;

  q.choices.forEach((c) => {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.innerHTML = `<span class="choice-label">${c.label}</span><span>${c.text}</span>`;
    btn.onclick = () => selectChoice(c.label, btn);
    container.appendChild(btn);
  });

  document.getElementById("submit-answer-btn").disabled = true;
  document.getElementById("submit-answer-btn").classList.remove("hidden");
  document.getElementById("next-question-btn").classList.add("hidden");
  document.getElementById("explanation-box").classList.add("hidden");
}

function selectChoice(label, btn) {
  if (document.querySelector(".choice-btn.correct")) return; // already submitted
  document.querySelectorAll(".choice-btn").forEach((b) => b.classList.remove("selected"));
  btn.classList.add("selected");
  selectedAnswer = label;
  document.getElementById("submit-answer-btn").disabled = false;
}

function submitAnswer() {
  if (!selectedAnswer) return;
  const q = quizQuestions[currentQuestionIndex];
  const isCorrect = selectedAnswer === q.correctAnswer;

  quizAnswers.push({
    questionId: q.id,
    question: q.question,
    selected: selectedAnswer,
    correctAnswer: q.correctAnswer,
    correct: isCorrect,
    domain: q.domain,
    explanation: q.explanation,
  });

  // Highlight choices
  document.querySelectorAll(".choice-btn").forEach((btn) => {
    btn.classList.add("disabled");
    const label = btn.querySelector(".choice-label").textContent;
    if (label === q.correctAnswer) {
      btn.classList.remove("selected");
      btn.classList.add("correct");
    } else if (label === selectedAnswer && !isCorrect) {
      btn.classList.add("incorrect");
    }
    if (label === q.correctAnswer && label !== selectedAnswer) {
      btn.classList.add("was-correct");
    }
  });

  // Show explanation
  const box = document.getElementById("explanation-box");
  box.classList.remove("hidden");
  document.getElementById("explanation-verdict").textContent = isCorrect ? "Correct!" : "Incorrect";
  document.getElementById("explanation-verdict").style.color = isCorrect ? "var(--green)" : "var(--red)";
  document.getElementById("explanation-text").textContent = q.explanation;

  document.getElementById("submit-answer-btn").classList.add("hidden");
  document.getElementById("next-question-btn").classList.remove("hidden");

  // Update live score
  const correct = quizAnswers.filter((a) => a.correct).length;
  document.getElementById("quiz-score-live").textContent = `Score: ${correct}/${quizAnswers.length}`;
}

async function nextQuestion() {
  currentQuestionIndex++;
  if (currentQuestionIndex >= quizQuestions.length) {
    await showResults();
  } else {
    renderQuestion();
  }
}

async function showResults() {
  document.getElementById("quiz-active").classList.add("hidden");
  document.getElementById("quiz-results").classList.remove("hidden");

  const total = quizAnswers.length;
  const correct = quizAnswers.filter((a) => a.correct).length;
  const pct = Math.round((correct / total) * 100);
  const passing = pct >= 67;

  document.getElementById("results-percentage").textContent = pct + "%";
  const circle = document.getElementById("results-circle");
  circle.className = "results-score-circle " + (passing ? "pass" : "fail");
  document.getElementById("results-summary").textContent =
    `${correct} of ${total} correct — ${passing ? "Above" : "Below"} passing threshold (67%)`;

  // Domain breakdown
  const domainResults = {};
  quizAnswers.forEach((a) => {
    if (!domainResults[a.domain]) domainResults[a.domain] = { total: 0, correct: 0 };
    domainResults[a.domain].total++;
    if (a.correct) domainResults[a.domain].correct++;
  });

  const domainsEl = document.getElementById("results-domains");
  domainsEl.innerHTML = "";
  for (const [did, data] of Object.entries(domainResults)) {
    const dpct = Math.round((data.correct / data.total) * 100);
    const color = DOMAIN_COLORS[did];
    domainsEl.innerHTML += `
      <div class="results-domain-card">
        <div class="domain-name">${DOMAIN_NAMES[did] || did}</div>
        <div class="domain-score" style="color:${color}">${dpct}% <span style="font-size:0.7rem;color:var(--text-muted)">(${data.correct}/${data.total})</span></div>
      </div>`;
  }

  // Review
  const reviewEl = document.getElementById("results-review");
  reviewEl.innerHTML = "<h3>Question Review</h3>";
  quizAnswers.forEach((a, i) => {
    const cls = a.correct ? "correct" : "incorrect";
    reviewEl.innerHTML += `
      <div class="review-item ${cls}">
        <div class="review-question">Q${i + 1}. ${a.question}</div>
        <div class="review-answer">
          Your answer: <span class="${a.correct ? "right" : "wrong"}">${a.selected}</span>
          ${!a.correct ? `— Correct: <span class="right">${a.correctAnswer}</span>` : ""}
        </div>
        <div class="review-answer" style="margin-top:0.25rem;font-style:italic">${a.explanation}</div>
      </div>`;
  });

  // Save progress for each domain
  for (const [did, data] of Object.entries(domainResults)) {
    await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain: did,
        topic: "general",
        totalQuestions: data.total,
        correctAnswers: data.correct,
        tool: "quiz",
      }),
    });
  }
}

// === Flashcards ===
let fcAll = [];
let fcFiltered = [];
let fcReviewState = {};
let fcStudyDeck = [];
let fcStudyIndex = 0;
let fcStudyKnown = 0;
let fcStudyReview = 0;

async function loadFlashcards() {
  const domain = document.getElementById("fc-domain").value;
  const params = domain !== "all" ? `?domain=${domain}` : "";

  [fcAll, fcReviewState] = await Promise.all([
    fetch(`/api/flashcards${params}`).then(r => r.json()),
    fetch("/api/flashcards/review-state").then(r => r.json()),
  ]);

  updateFcStats();
  applyFlashcardFilter();
}

function updateFcStats() {
  const total = fcAll.length;
  const known = fcAll.filter(c => fcReviewState[c.id] === "known").length;
  const review = fcAll.filter(c => fcReviewState[c.id] === "review").length;
  const unseen = total - known - review;

  document.getElementById("fc-stats").innerHTML = `
    <span><strong>${total}</strong> total cards</span>
    <span style="color:var(--green)"><strong>${known}</strong> known</span>
    <span style="color:var(--red)"><strong>${review}</strong> needs review</span>
    <span><strong>${unseen}</strong> unseen</span>
  `;
}

function applyFlashcardFilter() {
  const filter = document.getElementById("fc-filter").value;

  if (filter === "all") {
    fcFiltered = [...fcAll];
  } else if (filter === "known") {
    fcFiltered = fcAll.filter(c => fcReviewState[c.id] === "known");
  } else if (filter === "review") {
    fcFiltered = fcAll.filter(c => fcReviewState[c.id] === "review");
  } else {
    fcFiltered = fcAll.filter(c => !fcReviewState[c.id]);
  }

  renderFcBrowseList();
}

function renderFcBrowseList() {
  const listEl = document.getElementById("fc-list");
  if (fcFiltered.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><p>No flashcards match this filter.</p></div>';
    return;
  }

  // Group by domain
  const byDomain = {};
  fcFiltered.forEach(c => {
    const d = c.domain || "general";
    if (!byDomain[d]) byDomain[d] = [];
    byDomain[d].push(c);
  });

  let html = "";
  for (const [did, cards] of Object.entries(byDomain)) {
    const name = DOMAIN_NAMES[did] || "General";
    const color = DOMAIN_COLORS[did] || "var(--accent)";
    html += `<div class="fc-domain-group"><h3 style="color:${color}">${name} (${cards.length})</h3>`;
    cards.forEach(c => {
      const st = fcReviewState[c.id];
      const stClass = st || "unseen";
      const stLabel = st === "known" ? "Known" : st === "review" ? "Review" : "Unseen";
      html += `
        <div class="fc-browse-item">
          <span class="fc-browse-term">${c.term}</span>
          <span class="fc-browse-def">${c.definition}</span>
          <span class="fc-browse-status ${stClass}">${stLabel}</span>
        </div>`;
    });
    html += "</div>";
  }
  listEl.innerHTML = html;
}

function startStudyMode() {
  if (fcFiltered.length === 0) {
    alert("No flashcards to study with this filter. Try a different selection.");
    return;
  }

  // Shuffle the filtered deck
  fcStudyDeck = [...fcFiltered];
  for (let i = fcStudyDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [fcStudyDeck[i], fcStudyDeck[j]] = [fcStudyDeck[j], fcStudyDeck[i]];
  }

  fcStudyIndex = 0;
  fcStudyKnown = 0;
  fcStudyReview = 0;

  document.getElementById("fc-browse").classList.add("hidden");
  document.getElementById("fc-study").classList.remove("hidden");

  renderStudyCard();
}

function exitStudyMode() {
  document.getElementById("fc-study").classList.add("hidden");
  document.getElementById("fc-browse").classList.remove("hidden");
  loadFlashcards(); // refresh stats
}

function renderStudyCard() {
  const card = fcStudyDeck[fcStudyIndex];
  const total = fcStudyDeck.length;

  document.getElementById("fc-study-counter").textContent = `Card ${fcStudyIndex + 1} of ${total}`;
  document.getElementById("fc-study-score").textContent = `Known: ${fcStudyKnown} | Review: ${fcStudyReview}`;
  document.getElementById("fc-progress-fill").style.width = `${(fcStudyIndex / total) * 100}%`;

  document.getElementById("fc-card-term").textContent = card.term;
  document.getElementById("fc-card-def").textContent = card.definition;
  const domainName = DOMAIN_NAMES[card.domain] || "";
  document.getElementById("fc-card-topic").textContent = `${domainName}${card.topic ? " — " + card.topic : ""}`;

  // Reset flip
  document.getElementById("fc-card").classList.remove("flipped");
}

function flipCard() {
  document.getElementById("fc-card").classList.toggle("flipped");
}

async function markCard(status) {
  const card = fcStudyDeck[fcStudyIndex];

  // Save to server
  await fetch("/api/flashcards/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: card.id, status }),
  });

  fcReviewState[card.id] = status;
  if (status === "known") fcStudyKnown++;
  else fcStudyReview++;

  fcStudyIndex++;
  if (fcStudyIndex >= fcStudyDeck.length) {
    // Done
    const total = fcStudyDeck.length;
    const pct = Math.round((fcStudyKnown / total) * 100);
    document.getElementById("fc-progress-fill").style.width = "100%";
    document.getElementById("fc-study-counter").textContent = "Complete!";
    document.getElementById("fc-study-score").textContent = `Known: ${fcStudyKnown} | Review: ${fcStudyReview}`;

    document.getElementById("fc-card-container").innerHTML = `
      <div class="fc-card-front" style="position:relative;min-height:280px;display:flex;flex-direction:column;justify-content:center;align-items:center">
        <div class="fc-card-label">SESSION COMPLETE</div>
        <div class="fc-card-text" style="font-weight:700;color:${pct >= 67 ? "var(--green)" : "var(--red)"}">${pct}%</div>
        <div class="fc-card-hint">${fcStudyKnown} known / ${fcStudyReview} needs review / ${total} total</div>
      </div>`;
    document.querySelector(".fc-actions").classList.add("hidden");
    return;
  }

  renderStudyCard();
}

function resetQuiz() {
  document.getElementById("quiz-active").classList.add("hidden");
  document.getElementById("quiz-results").classList.add("hidden");
  document.getElementById("quiz-setup").classList.remove("hidden");
}

// === Progress ===
async function loadProgress() {
  const progress = await fetch("/api/progress").then((r) => r.json());
  const sessions = progress.sessions || [];

  if (sessions.length === 0) {
    document.getElementById("progress-empty").classList.remove("hidden");
    document.getElementById("progress-content").classList.add("hidden");
    return;
  }

  document.getElementById("progress-empty").classList.add("hidden");
  document.getElementById("progress-content").classList.remove("hidden");

  const totalQ = sessions.reduce((s, r) => s + r.totalQuestions, 0);
  const totalC = sessions.reduce((s, r) => s + r.correctAnswers, 0);
  const avgPct = Math.round((totalC / totalQ) * 100);

  let weighted = 0, covered = 0;
  for (const [did, w] of Object.entries(DOMAIN_WEIGHTS)) {
    const ds = sessions.filter((s) => s.domain === did);
    const dt = ds.reduce((s, r) => s + r.totalQuestions, 0);
    const dc = ds.reduce((s, r) => s + r.correctAnswers, 0);
    if (dt > 0) { weighted += (dc / dt) * w; covered += w; }
  }
  const estScore = covered > 0 ? Math.round((weighted / covered) * 900) : 0;

  document.getElementById("progress-overview").innerHTML = `
    <div class="progress-stat"><div class="value">${sessions.length}</div><div class="label">Sessions</div></div>
    <div class="progress-stat"><div class="value">${totalQ}</div><div class="label">Questions</div></div>
    <div class="progress-stat"><div class="value">${avgPct}%</div><div class="label">Avg Score</div></div>
    <div class="progress-stat"><div class="value" style="color:${estScore >= 600 ? "var(--green)" : "var(--red)"}">${estScore}/900</div><div class="label">Est. Score</div></div>
  `;

  // Domain breakdown
  const domainsEl = document.getElementById("progress-domains");
  domainsEl.innerHTML = "";
  for (const [did, name] of Object.entries(DOMAIN_NAMES)) {
    const ds = sessions.filter((s) => s.domain === did);
    const dt = ds.reduce((s, r) => s + r.totalQuestions, 0);
    const dc = ds.reduce((s, r) => s + r.correctAnswers, 0);
    const pct = dt > 0 ? Math.round((dc / dt) * 100) : 0;
    const color = DOMAIN_COLORS[did];
    const status = dt === 0 ? "none" : pct >= 67 ? "pass" : "fail";
    const statusLabel = dt === 0 ? "No data" : pct >= 67 ? "Passing" : "Needs work";

    domainsEl.innerHTML += `
      <div class="progress-domain-row">
        <span class="name">${name}</span>
        <div class="bar"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
        <span class="score">${dt > 0 ? pct + "%" : "—"}</span>
        <span class="status ${status}">${statusLabel}</span>
      </div>`;
  }

  // Session history
  const tbody = document.getElementById("session-tbody");
  tbody.innerHTML = "";
  [...sessions].reverse().forEach((s) => {
    const pct = Math.round(s.score);
    const color = pct >= 67 ? "var(--green)" : "var(--red)";
    tbody.innerHTML += `
      <tr>
        <td>${s.date}</td>
        <td>${DOMAIN_NAMES[s.domain] || s.domain}</td>
        <td>${s.topic}</td>
        <td style="color:${color};font-weight:600">${pct}%</td>
        <td>${s.correctAnswers}/${s.totalQuestions}</td>
      </tr>`;
  });
}

async function resetProgress() {
  if (!confirm("Reset all study progress? This cannot be undone.")) return;
  await fetch("/api/progress", { method: "DELETE" });
  loadProgress();
}

// === Resources ===
async function loadResources() {
  const [resources, state] = await Promise.all([
    fetch("/api/resources").then((r) => r.json()),
    fetch("/api/resources/state").then((r) => r.json()),
  ]);

  const byCategory = {};
  resources.forEach((r) => {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r);
  });

  const listEl = document.getElementById("resources-list");
  listEl.innerHTML = "";

  for (const [cat, items] of Object.entries(byCategory)) {
    let html = `<div class="resource-category"><h3>${cat}</h3>`;
    items.forEach((r) => {
      const checked = state[r.id] || false;
      html += `
        <div class="resource-item">
          <div class="resource-checkbox ${checked ? "checked" : ""}" onclick="toggleResource('${r.id}', this)"></div>
          <div class="resource-info">
            <div class="resource-name"><a href="${r.url}" target="_blank" rel="noopener">${r.name}</a></div>
            <div class="resource-desc">${r.description}</div>
            <div class="resource-tags">
              <span class="tag ${r.scraped ? "scraped" : "pending"}">${r.scraped ? "Scraped" : "Not yet scraped"}</span>
            </div>
          </div>
        </div>`;
    });
    html += "</div>";
    listEl.innerHTML += html;
  }
}

async function toggleResource(id, el) {
  const res = await fetch(`/api/resources/${id}/toggle`, { method: "POST" }).then((r) => r.json());
  if (res.checked) {
    el.classList.add("checked");
  } else {
    el.classList.remove("checked");
  }
}

// === Transcripts ===

async function saveTranscript() {
  const title = document.getElementById("tx-title").value.trim();
  const domain = document.getElementById("tx-domain").value;
  const module = document.getElementById("tx-module").value.trim();
  const text = document.getElementById("tx-text").value.trim();

  if (!title) { alert("Please enter a lesson title."); return; }
  if (!text) { alert("Please paste the transcript text."); return; }

  const statusEl = document.getElementById("tx-status");
  statusEl.textContent = "Saving...";

  const res = await fetch("/api/transcripts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, domain, module, text }),
  }).then((r) => r.json());

  if (res.success) {
    const words = res.meta.wordCount;
    statusEl.textContent = `Saved! (${words.toLocaleString()} words)`;
    statusEl.style.color = "var(--green)";
    document.getElementById("tx-title").value = "";
    document.getElementById("tx-module").value = "";
    document.getElementById("tx-text").value = "";
    loadTranscripts();
    setTimeout(() => { statusEl.textContent = ""; }, 3000);
  } else {
    statusEl.textContent = "Error saving transcript.";
    statusEl.style.color = "var(--red)";
  }
}

async function loadTranscripts() {
  const [transcripts, summary] = await Promise.all([
    fetch("/api/transcripts").then((r) => r.json()),
    fetch("/api/transcripts/summary").then((r) => r.json()),
  ]);

  // Update summary stats
  const summaryEl = document.getElementById("tx-summary");
  if (summary.totalTranscripts > 0) {
    summaryEl.innerHTML = `
      <div class="tx-summary-stat"><div class="value">${summary.totalTranscripts}</div><div class="label">Transcripts</div></div>
      <div class="tx-summary-stat"><div class="value">${summary.processedCount}</div><div class="label">Processed</div></div>
      <div class="tx-summary-stat"><div class="value">${summary.totalQuestions}</div><div class="label">Questions Generated</div></div>
      <div class="tx-summary-stat"><div class="value">${summary.totalFlashcards}</div><div class="label">Flashcards Generated</div></div>
    `;
  } else {
    summaryEl.innerHTML = "";
  }

  const emptyEl = document.getElementById("tx-empty");
  const listEl = document.getElementById("tx-list");

  if (transcripts.length === 0) {
    emptyEl.classList.remove("hidden");
    listEl.innerHTML = "";
    return;
  }

  emptyEl.classList.add("hidden");

  // Group by domain
  const byDomain = {};
  transcripts.forEach((t) => {
    const key = t.domain || "general";
    if (!byDomain[key]) byDomain[key] = [];
    byDomain[key].push(t);
  });

  let html = "";
  const totalWords = transcripts.reduce((s, t) => s + t.wordCount, 0);
  html += `<div class="tx-meta" style="margin-bottom:1rem;font-size:0.85rem">
    <span><strong>${transcripts.length}</strong> transcripts</span>
    <span><strong>${totalWords.toLocaleString()}</strong> words total</span>
  </div>`;

  for (const [domainId, items] of Object.entries(byDomain)) {
    const domainName = DOMAIN_NAMES[domainId] || "General";
    const color = DOMAIN_COLORS[domainId] || "var(--accent)";
    html += `<h3 style="color:${color};margin:1rem 0 0.5rem;font-size:0.82rem;text-transform:uppercase;letter-spacing:0.05em">${domainName}</h3>`;

    items.forEach((t) => {
      const date = new Date(t.createdAt).toLocaleDateString();
      html += `
        <div class="tx-item" id="tx-${t.id}">
          <div class="tx-icon">${t.module ? t.module.replace(/[^0-9.]/g, "").slice(0, 3) || "T" : "T"}</div>
          <div class="tx-info">
            <div class="tx-title">${t.title}</div>
            <div class="tx-meta">
              ${t.module ? `<span>${t.module}</span>` : ""}
              <span>${t.wordCount.toLocaleString()} words</span>
              <span>${date}</span>
            </div>
            <div class="tx-artifacts hidden" id="tx-artifacts-${t.id}"></div>
          </div>
          <button class="tx-view-btn" onclick="viewTranscriptArtifacts('${t.id}')">View</button>
          <button class="tx-delete" onclick="deleteTranscript('${t.id}')" title="Delete">Delete</button>
        </div>`;
    });
  }

  listEl.innerHTML = html;
}

async function deleteTranscript(id) {
  if (!confirm("Delete this transcript?")) return;
  await fetch(`/api/transcripts/${id}`, { method: "DELETE" });
  loadTranscripts();
}

// === Transcript processing ===

let processingPollInterval = null;

async function startProcessing() {
  const btn = document.getElementById("tx-process-btn");
  btn.disabled = true;
  btn.textContent = "Starting...";

  await fetch("/api/transcripts/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  document.getElementById("tx-processing").classList.remove("hidden");
  pollProcessingStatus();
  if (processingPollInterval) clearInterval(processingPollInterval);
  processingPollInterval = setInterval(pollProcessingStatus, 1500);
}

async function pollProcessingStatus() {
  const state = await fetch("/api/transcripts/processing-status").then((r) => r.json());

  const fill = document.getElementById("tx-progress-fill");
  const text = document.getElementById("tx-processing-text");
  const count = document.getElementById("tx-processing-count");
  const current = document.getElementById("tx-processing-current");
  const btn = document.getElementById("tx-process-btn");

  const pct = state.total > 0 ? (state.processed / state.total) * 100 : 0;
  fill.style.width = pct + "%";
  count.textContent = `${state.processed} / ${state.total}`;

  if (state.status === "running") {
    text.textContent = "Processing...";
    current.textContent = state.current ? `Currently: ${state.current}` : "";
    btn.textContent = "Processing...";
    btn.disabled = true;
  } else if (state.status === "complete") {
    text.textContent = state.errors.length > 0
      ? `Done with ${state.errors.length} errors`
      : "Processing complete!";
    current.textContent = "";
    btn.textContent = "Process All";
    btn.disabled = false;
    if (processingPollInterval) {
      clearInterval(processingPollInterval);
      processingPollInterval = null;
    }
    loadTranscripts(); // refresh stats and list
  } else if (state.status === "error") {
    text.textContent = "Error during processing";
    btn.textContent = "Process All";
    btn.disabled = false;
    if (processingPollInterval) {
      clearInterval(processingPollInterval);
      processingPollInterval = null;
    }
  } else {
    text.textContent = "Idle";
    btn.textContent = "Process All";
    btn.disabled = false;
  }
}

async function viewTranscriptArtifacts(id) {
  const data = await fetch(`/api/transcripts/${id}/artifacts`).then((r) => r.json());
  const container = document.getElementById(`tx-artifacts-${id}`);
  if (container.classList.contains("hidden")) {
    let html = "";
    if (data.questions.length > 0) {
      html += `<strong>${data.questions.length} Questions:</strong><br>`;
      data.questions.forEach((q, i) => {
        html += `${i + 1}. ${q.question}<br>`;
      });
    }
    if (data.flashcards.length > 0) {
      html += `<br><strong>${data.flashcards.length} Flashcards:</strong><br>`;
      data.flashcards.forEach((f) => {
        html += `<strong>${f.term}:</strong> ${f.definition}<br>`;
      });
    }
    if (!html) html = "No artifacts generated yet. Click 'Process All' first.";
    container.innerHTML = html;
    container.classList.remove("hidden");
  } else {
    container.classList.add("hidden");
  }
}

// === Docs ===
let docsLoaded = false;

function renderMarkdown(md) {
  let html = md;

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<pre class="md-code-block"><code>${escaped}</code></pre>`;
  });

  // Tables
  html = html.replace(/^(\|.+\|)\n(\|[\s:|-]+\|)\n((?:\|.+\|\n?)*)/gm, (_m, header, _sep, body) => {
    const ths = header.split("|").filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join("");
    const rows = body.trim().split("\n").map(row => {
      const tds = row.split("|").filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join("");
      return `<tr>${tds}</tr>`;
    }).join("");
    return `<table class="md-table"><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;
  });

  // Headings
  html = html.replace(/^#### (.+)$/gm, '<h4 class="md-h4">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="md-h1">$1</h1>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr class="md-hr">');

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul class="md-list">$1</ul>');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Paragraphs — wrap remaining loose lines
  html = html.replace(/^(?!<[a-z])((?!<).+)$/gm, '<p>$1</p>');

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, "");

  return html;
}

async function loadDocs() {
  if (docsLoaded) return;
  const el = document.getElementById("docs-content");
  try {
    const md = await fetch("/api/readme").then((r) => r.text());
    el.innerHTML = renderMarkdown(md);
    docsLoaded = true;
  } catch {
    el.textContent = "Failed to load documentation.";
  }
}

// === Init ===
loadDashboard();
