export type DomainId = "basic-ai" | "securing-ai" | "ai-security" | "ai-grc";

export interface DomainInfo {
  id: DomainId;
  name: string;
  weight: number;
  topics: string[];
}

export const DOMAINS: DomainInfo[] = [
  {
    id: "basic-ai",
    name: "1.0 Basic AI Concepts Related to Cybersecurity",
    weight: 0.17,
    topics: [
      "Machine learning fundamentals",
      "Neural networks and deep learning",
      "Natural language processing",
      "Generative AI and LLMs",
      "AI/ML pipeline stages",
      "Training data and datasets",
      "Model types and architectures",
    ],
  },
  {
    id: "securing-ai",
    name: "2.0 Securing AI Systems",
    weight: 0.4,
    topics: [
      "AI threat landscape",
      "Adversarial attacks (evasion, poisoning, extraction)",
      "Prompt injection and jailbreaking",
      "Model security and access controls",
      "Data protection for AI systems",
      "Supply chain security for AI/ML",
      "AI infrastructure security",
      "Secure AI development lifecycle",
      "Red teaming AI systems",
      "AI vulnerability management",
    ],
  },
  {
    id: "ai-security",
    name: "3.0 AI-Assisted Security",
    weight: 0.24,
    topics: [
      "AI for threat detection",
      "AI-powered SOC operations",
      "Automated incident response",
      "AI in vulnerability management",
      "AI for malware analysis",
      "AI-driven threat intelligence",
      "AI for identity and access management",
    ],
  },
  {
    id: "ai-grc",
    name: "4.0 AI Governance, Risk, and Compliance",
    weight: 0.19,
    topics: [
      "AI ethics and responsible use",
      "AI regulatory frameworks (GDPR, NIST AI RMF)",
      "AI risk assessment",
      "AI bias and fairness",
      "AI transparency and explainability",
      "AI audit and compliance",
      "AI policy development",
    ],
  },
];

export const OLLAMA_MODEL = "gemma3";

export function getDomain(id: DomainId): DomainInfo {
  return DOMAINS.find((d) => d.id === id)!;
}

export function getRandomDomain(): DomainInfo {
  return DOMAINS[Math.floor(Math.random() * DOMAINS.length)];
}

export function getRandomTopic(domainId: DomainId): string {
  const domain = getDomain(domainId);
  return domain.topics[Math.floor(Math.random() * domain.topics.length)];
}
