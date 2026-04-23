# SecAI+ Study Lab

Local-first study tool for the **CompTIA SecurityAI+ (CY0-001)** certification exam. Powered by Ollama + Gemma for private, on-device AI — no cloud APIs, no data leaving your machine.

Four ways to study:
- **MCP Server** — 6 AI-powered tools accessible from Claude Code
- **Web App** — Interactive quiz UI with progress tracking and 6 tabs at `http://localhost:3000`
- **Seed Question Bank** — 45 curated multiple-choice questions across all 4 exam domains
- **Transcript Processing** — Paste your course lesson transcripts and let a local Gemma agent generate exam questions and flashcards from them automatically

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Ollama](https://ollama.com/) installed and running
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (for MCP tools)

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Pull the Gemma 3 model (3.3 GB download, one-time)
ollama pull gemma3

# 3. Build the TypeScript project
npm run build

# 4. Start the web app
npm run web
# → Open http://localhost:3000

# 5. (Optional) Use MCP tools in Claude Code
#    The .mcp.json file auto-registers the server.
#    Restart Claude Code in this directory and approve the MCP server when prompted.
```

## Daily Study Workflow

A typical day using SecAI+ Study Lab:

1. **Watch a lesson** in your Udemy/training course
2. **Open the Transcripts tab** at `http://localhost:3000` and paste the lesson transcript with the title and domain
3. **Click "Process All"** — the local Gemma agent generates questions and flashcards from the lesson (skips already-processed lessons)
4. **Switch to the Quiz tab** and quiz yourself on the domain you just studied — the new questions will be there
5. **Check the Progress tab** to see how you're tracking against the 600/900 passing threshold
6. **Tomorrow:** add more lessons and click "Process All" again — only the new transcripts get processed

## Web Application

Start with `npm run web`, then open **http://localhost:3000**.

### Dashboard

Overview of your question bank and study progress:
- Total seed questions across all domains
- Study session count, average score, estimated exam score (out of 900)
- Quick-start buttons to jump into domain-specific quizzes

### Quiz

Interactive, exam-style practice:
1. Select a domain (or all), question count (5–45), and difficulty level
2. Answer one question at a time with A/B/C/D choices
3. Get instant feedback — correct/incorrect highlighting + explanations
4. View full results with domain breakdown and question review
5. Scores auto-save to progress tracking

### Progress

Tracks all quiz sessions over time:
- Per-domain score breakdown with pass/fail status (67% threshold = 600/900)
- Weighted estimated exam score
- Full session history table
- Reset button to start fresh

### Resources Checklist

Track which study resources you've reviewed:
- **40 resources** organized by category: Official CompTIA, Study Guides & Books, Frameworks & Standards, SANS Institute, Cloud Provider Guides, ENISA, Academic & Research, Practice Exams, Industry Reports, Tools
- Clickable checkboxes that persist across sessions
- Green/yellow tags showing which sources were already scraped for question content

### Transcripts

Paste lesson transcripts from your course (e.g., the Chapple & Nwanganga Udemy course) and let a local Gemma agent automatically generate exam-quality study material from them:

1. **Add a transcript** — paste the text, set the title, choose the domain, optionally add a module number
2. **Click "Process All"** — kicks off a background job that runs locally using Ollama + Gemma
3. **The agent does the rest:**
   - Detects the domain (or uses your selection)
   - Extracts the most important topics covered in the lesson
   - Generates **5 exam-quality questions** grounded strictly in the transcript content
   - Generates **8 flashcards** (term/definition pairs) from the lesson
   - Appends the questions to the seed question bank so they appear in quizzes immediately
4. **Idempotent processing** — already-processed transcripts are skipped on re-runs. Add new transcripts tomorrow and only the new ones get processed.

The Transcripts tab shows live progress (X / Y processed, currently working on...) and aggregate stats (transcripts, processed count, total questions generated, total flashcards generated).

**Click "View" on any transcript** to see the questions and flashcards generated from that specific lesson.

### Docs

Renders this README inside the web app with full markdown support — headings, code blocks, tables, links, lists.

## MCP Tools (Claude Code)

The `.mcp.json` file registers the MCP server automatically. After restarting Claude Code in this directory, you'll have 6 tools available:

### `secai_quiz` — Practice Questions

Generate multiple-choice questions by domain and topic.

```
"Quiz me on 5 questions about adversarial attacks"
"Give me 3 beginner questions on AI governance"
```

**Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| domain | basic-ai, securing-ai, ai-security, ai-grc | random | Exam domain |
| topic | string | random | Specific topic |
| count | 1–10 | 5 | Number of questions |
| difficulty | beginner, intermediate, advanced | intermediate | Difficulty level |
| source | seed, generated, mixed | mixed | Seed bank, AI-generated, or both |

### `secai_explain` — Concept Explanations

Get detailed, exam-focused explanations of any SecAI+ concept.

```
"Explain prompt injection for the SecAI+ exam"
"Give me a brief explanation of federated learning"
```

**Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| concept | string | (required) | The concept to explain |
| domain | enum | auto | Domain context |
| depth | brief, detailed, exam-focused | exam-focused | Level of detail |

### `secai_flashcard` — Flashcard Sets

Generate term/definition flashcard sets for review.

```
"Generate 10 flashcards for AI governance"
"Make flashcards about adversarial attacks"
```

**Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| domain | enum | random | Domain |
| topic | string | random | Specific topic |
| count | 3–25 | 10 | Number of flashcards |

### `secai_scenario` — PBQ Simulations

Simulate performance-based question scenarios like the real exam.

```
"Give me a PBQ scenario about securing AI infrastructure"
"Create an advanced scenario about data poisoning"
```

**Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| domain | enum | random | Domain |
| topic | string | random | Specific topic |
| difficulty | intermediate, advanced | intermediate | Complexity |

### `secai_assess` — Mini-Assessments

Run a weighted assessment matching real exam domain proportions.

```
"Run a 20-question mini assessment"
"Give me a full 60-question practice exam"
```

**Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| totalQuestions | 10–60 | 20 | Total questions |
| difficulty | beginner, intermediate, advanced, mixed | mixed | Difficulty |

Question distribution follows exam weights:
- Basic AI Concepts: 17%
- Securing AI Systems: 40%
- AI-Assisted Security: 24%
- AI GRC: 19%

### `secai_progress` — Progress Tracking

Track scores and identify weak areas.

```
"Show my study progress"
"Record 8 out of 10 correct for securing-ai"
```

**Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| action | record, report, reset | What to do |
| domain | enum | Domain (for record) |
| totalQuestions | number | Questions attempted (for record) |
| correctAnswers | number | Correct answers (for record) |

## Exam Overview

| Domain | Weight | Seed Questions |
|--------|--------|----------------|
| 1.0 Basic AI Concepts Related to Cybersecurity | 17% | 10 |
| 2.0 Securing AI Systems | 40% | 15 |
| 3.0 AI-Assisted Security | 24% | 10 |
| 4.0 AI Governance, Risk, and Compliance | 19% | 10 |

- **Exam Code:** CY0-001
- **Questions:** Up to 60 (multiple-choice + performance-based)
- **Duration:** 90 minutes
- **Passing Score:** 600/900 (approximately 67%)
- **Prerequisites:** 3–4 years IT experience, 2+ years cybersecurity recommended

## Project Structure

```
├── src/
│   ├── index.ts              # MCP server entry point (stdio)
│   ├── web-server.ts         # Express web server (port 3000)
│   ├── config.ts             # Domain definitions, weights, model config
│   ├── ollama.ts             # Ollama client wrapper
│   ├── processor.ts          # Transcript processing pipeline (Gemma agent)
│   ├── tools/                # 6 MCP tool implementations
│   │   ├── quiz.ts           # Uses transcripts as context
│   │   ├── explain.ts
│   │   ├── flashcard.ts      # Uses transcripts as context
│   │   ├── scenario.ts       # Uses transcripts as context
│   │   ├── assess.ts
│   │   └── progress.ts
│   └── data/
│       ├── types.ts          # Shared TypeScript interfaces
│       └── store.ts          # JSON file read/write helpers
├── web/public/               # Web app frontend
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── data/
│   ├── questions/            # Seed question banks (JSON)
│   │   ├── domain1-basic-ai.json
│   │   ├── domain2-securing-ai.json
│   │   ├── domain3-ai-security.json
│   │   └── domain4-ai-grc.json
│   ├── transcripts/          # Course lesson transcripts (auto-created)
│   │   ├── index.json        # List of all transcripts
│   │   ├── {id}.json         # Each transcript with metadata + text
│   │   ├── {id}-questions.json   # Generated questions per transcript
│   │   ├── {id}-flashcards.json  # Generated flashcards per transcript
│   │   └── processed.json    # Tracks which transcripts have been processed
│   ├── progress.json         # Study progress (auto-created)
│   └── resource-state.json   # Resource checklist state (auto-created)
├── .mcp.json                 # Claude Code MCP server config
├── package.json
└── tsconfig.json
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `build/` |
| `npm run web` | Start the web app on port 3000 |
| `npm start` | Start the MCP server (stdio, used by Claude Code) |
| `npm run dev` | Watch mode — recompile on file changes |

## Customization

**Change the AI model:** Edit `OLLAMA_MODEL` in `src/config.ts`. Any Ollama-compatible model works (e.g., `gemma3:1b` for faster responses, `llama3.2` for variety).

**Add questions:** Edit the JSON files in `data/questions/`. Follow the existing format:

```json
{
  "id": "unique-id",
  "domain": "securing-ai",
  "topic": "Adversarial attacks",
  "difficulty": "intermediate",
  "question": "Your question text?",
  "choices": [
    { "label": "A", "text": "Option A" },
    { "label": "B", "text": "Option B" },
    { "label": "C", "text": "Option C" },
    { "label": "D", "text": "Option D" }
  ],
  "correctAnswer": "B",
  "explanation": "Why B is correct.",
  "source": "seed"
}
```

**Change the web port:** Set the `PORT` environment variable: `PORT=8080 npm run web`

## Built With

- [Ollama](https://ollama.com/) + [Gemma 3](https://ai.google.dev/gemma) — Local AI inference
- [Model Context Protocol SDK](https://modelcontextprotocol.io/) — MCP server framework
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) — Development and study interface
- [Express 5](https://expressjs.com/) — Web server
- [TypeScript](https://www.typescriptlang.org/) + [Zod](https://zod.dev/) — Type safety and validation
