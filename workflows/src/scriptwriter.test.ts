import assert from "node:assert/strict";
import test from "node:test";
import { finalPrompt, specialistPrompt } from "./scriptwriter";

test("specialist prompts preserve the user's video idea", () => {
  const topic = "Why local-first software is coming back";
  assert.match(specialistPrompt("research", topic), new RegExp(topic));
  assert.match(specialistPrompt("hooks", topic), new RegExp(topic));
  assert.match(specialistPrompt("outline", topic), new RegExp(topic));
  assert.match(specialistPrompt("audience", topic), new RegExp(topic));
});

test("the lead writer receives every specialist output", () => {
  const prompt = finalPrompt("A video idea", {
    research: "FACTS",
    hooks: "OPENINGS",
    outline: "BEATS",
    audience: "VIEWER",
  });
  for (const value of ["FACTS", "OPENINGS", "BEATS", "VIEWER"]) {
    assert.match(prompt, new RegExp(value));
  }
});
