import type { Question } from "../shared/types";

const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export function speechText(markdown: string): string {
  const text = markdown
    .replace(/\$\$[\s\S]+?\$\$/g, "a formula on screen")
    .replace(/\$[^$\n]+\$/g, "a formula on screen")
    .replace(/^[ \t]*(```|~~~).*$/gm, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^[ \t]*([-*_][ \t]*){3,}$/gm, "")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]{0,3}>[ \t]?/gm, "")
    .replace(/^[ \t]*[-*+][ \t]+/gm, "")
    .replace(/\|/g, " ")
    .replace(/[*`~]/g, "")
    .replace(/_/g, " ");
  return text
    .split("\n")
    .map((line) => line.trim().replace(/[ \t]+/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function chunkSpeech(text: string, max: number): string[] {
  if (text.trim() === "") return [];
  const pieces: string[] = [];
  const sentences = text
    .trim()
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
  for (let sentence of sentences) {
    while (sentence.length > max) {
      const at = sentence.lastIndexOf(" ", max);
      const cut = at <= 0 ? max : at;
      pieces.push(sentence.slice(0, cut).trim());
      sentence = sentence.slice(cut).trim();
    }
    pieces.push(sentence);
  }
  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current === "") {
      current = piece;
    } else if (current.length + 1 + piece.length <= max) {
      current = `${current} ${piece}`;
    } else {
      chunks.push(current);
      current = piece;
    }
  }
  if (current !== "") chunks.push(current);
  return chunks;
}

export function spokenQuestion(question: Question): string {
  if (question.kind !== "choice") return question.prompt;
  const lines = question.options.map((o, i) => `Option ${"ABCDEF"[i]}: ${o}`);
  return [question.prompt, ...lines].join("\n");
}

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth"];
const ORDINAL_SHORT = ["1st", "2nd", "3rd", "4th", "5th", "6th"];

export function matchChoice(spoken: string, options: string[]): number | null {
  const said = norm(spoken);
  if (said === "") return null;
  const normed = options.map(norm);

  const exact = normed.flatMap((o, i) => (o === said ? [i] : []));
  if (exact.length === 1) return exact[0];

  const letter = /^(?:option )?([a-f])$/.exec(said);
  if (letter) {
    const i = letter[1].charCodeAt(0) - 97;
    if (i < options.length) return i;
  }

  const ordinal =
    /^(?:the )?(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|6th)(?: one| option| answer)?$/.exec(
      said,
    );
  if (ordinal) {
    const word = ordinal[1];
    const i = ORDINALS.includes(word) ? ORDINALS.indexOf(word) : ORDINAL_SHORT.indexOf(word);
    if (i < options.length) return i;
  }

  const padded = ` ${said} `;
  const inside = normed.flatMap((o, i) => (o !== "" && padded.includes(` ${o} `) ? [i] : []));
  return inside.length === 1 ? inside[0] : null;
}

export function voiceCommand(spoken: string): "continue" | "read" | null {
  const said = norm(spoken);
  if (said === "continue" || said === "next") return "continue";
  if (said === "read it") return "read";
  return null;
}
