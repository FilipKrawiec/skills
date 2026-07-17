import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const target = resolve(process.argv.at(-2));
const pluginRoot = resolve(target, "../..");
const sharedAuthority = join(target, "references", "autonomous-sdlc-specification.md");
const stages = ["sdlc-define", "sdlc-refine", "sdlc-execute", "sdlc-improve"];
const wordCount = (path) => readFileSync(path, "utf8").trim().split(/\s+/).filter(Boolean).length;
const checks = [];

checks.push({
  id: "sdlc-shared-authority-present",
  category: "authority",
  severity: "error",
  status: existsSync(sharedAuthority) ? "pass" : "fail",
  message: "The root SDLC skill ships one shared authority projection.",
  evidence: [sharedAuthority],
  remediation: ["Package the authority under skills/sdlc/references/."],
});

for (const stage of stages) {
  const skill = join(pluginRoot, "skills", stage, "SKILL.md");
  const localProjection = join(pluginRoot, "skills", stage, "references", "autonomous-sdlc-specification.md");
  const content = readFileSync(skill, "utf8");
  checks.push({
    id: `sdlc-${stage}-shared-authority-link`,
    category: "authority",
    severity: "error",
    status: content.includes("../sdlc/references/autonomous-sdlc-specification.md") && !existsSync(localProjection) ? "pass" : "fail",
    message: `${stage} resolves the shared authority without a local copy.`,
    evidence: [skill, localProjection],
    remediation: ["Link to ../sdlc/references/autonomous-sdlc-specification.md and remove any local projection."],
  });
}

const skillFiles = [join(target, "SKILL.md"), ...stages.map((stage) => join(pluginRoot, "skills", stage, "SKILL.md"))];
console.log(JSON.stringify({
  checks,
  metrics: [
    { id: "sdlc-skill-instruction-words", category: "budget", value: skillFiles.reduce((sum, path) => sum + wordCount(path), 0), unit: "words", band: "good" },
    { id: "sdlc-shared-contract-words", category: "dependency", value: wordCount(sharedAuthority), unit: "words", band: "informational" },
  ],
  artifacts: [{ id: "sdlc-evaluation-scope", type: "note", label: "Evaluation scope", description: "Shared contract words are reported as dependency cost, not duplicated skill instructions.", source: "sdlc-skill-rubric" }],
}));
