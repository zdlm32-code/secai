import type { DomainId } from "../config.js";

export interface Question {
  id: string;
  domain: DomainId;
  topic: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  question: string;
  choices: { label: string; text: string }[];
  correctAnswer: string;
  explanation: string;
  source: "seed" | "generated";
}

export interface Scenario {
  id: string;
  domain: DomainId;
  topic: string;
  difficulty: "intermediate" | "advanced";
  narrative: string;
  tasks: string[];
  questions: Question[];
  solutionGuide: string;
  source: "seed" | "generated";
}

export interface Flashcard {
  term: string;
  definition: string;
  domain: DomainId;
  topic: string;
}

export interface ProgressRecord {
  date: string;
  tool: "quiz" | "assess" | "scenario";
  domain: DomainId;
  topic: string;
  totalQuestions: number;
  correctAnswers: number;
  score: number;
}

export interface ProgressData {
  sessions: ProgressRecord[];
  lastUpdated: string;
}
