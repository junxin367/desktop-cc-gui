const PARAGRAPH_BREAK_SPLIT_REGEX = /\r?\n[^\S\r\n]*\r?\n+/;

function compactComparableText(value: string) {
  return value
    .replace(/\s+/g, "")
    .replace(/[！!]/g, "!")
    .replace(/[？?]/g, "?")
    .replace(/[，,]/g, ",")
    .replace(/[。．.]/g, ".");
}

function splitParagraphs(value: string) {
  return value
    .split(PARAGRAPH_BREAK_SPLIT_REGEX)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function sharedPrefixLength(left: string, right: string) {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (index < max && left[index] === right[index]) {
    index += 1;
  }
  return index;
}

function sharedSuffixLength(left: string, right: string) {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (
    index < max &&
    left[left.length - 1 - index] === right[right.length - 1 - index]
  ) {
    index += 1;
  }
  return index;
}

function calculateEditDistance(left: string, right: string) {
  if (left === right) {
    return 0;
  }
  if (!left) {
    return right.length;
  }
  if (!right) {
    return left.length;
  }
  const previous = new Array<number>(right.length + 1);
  const current = new Array<number>(right.length + 1);
  for (let index = 0; index <= right.length; index += 1) {
    previous[index] = index;
  }
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    current[0] = leftIndex + 1;
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const substitutionCost =
        left[leftIndex] === right[rightIndex] ? 0 : 1;
      current[rightIndex + 1] = Math.min(
        current[rightIndex] + 1,
        previous[rightIndex + 1] + 1,
        previous[rightIndex] + substitutionCost,
      );
    }
    for (let column = 0; column <= right.length; column += 1) {
      previous[column] = current[column] ?? 0;
    }
  }
  return previous[right.length] ?? 0;
}

function calculateEditSimilarity(left: string, right: string) {
  const maxLength = Math.max(left.length, right.length);
  if (maxLength === 0) {
    return 1;
  }
  return 1 - calculateEditDistance(left, right) / maxLength;
}

function isNearDuplicateParagraph(left: string, right: string) {
  const leftCompact = compactComparableText(left.trim());
  const rightCompact = compactComparableText(right.trim());
  if (!leftCompact || !rightCompact) {
    return false;
  }
  if (leftCompact === rightCompact) {
    return true;
  }
  if (leftCompact.length < 12 || rightCompact.length < 12) {
    return false;
  }
  if (leftCompact.includes(rightCompact) || rightCompact.includes(leftCompact)) {
    return true;
  }
  const minLength = Math.min(leftCompact.length, rightCompact.length);
  const sharedPrefix = sharedPrefixLength(leftCompact, rightCompact);
  if (sharedPrefix >= Math.floor(minLength * 0.72)) {
    return true;
  }
  const sharedSuffix = sharedSuffixLength(leftCompact, rightCompact);
  if (sharedSuffix >= Math.floor(minLength * 0.72)) {
    return true;
  }
  if (sharedPrefix + sharedSuffix >= Math.floor(minLength * 0.82)) {
    return true;
  }
  return calculateEditSimilarity(leftCompact, rightCompact) >= 0.72;
}

function chooseReadableParagraph(left: string, right: string) {
  return right.length >= left.length ? right : left;
}

function mergeParagraphGroups(groups: string[][]) {
  const firstGroup = groups[0] ?? [];
  if (firstGroup.length < 2) {
    return null;
  }
  let comparableChars = 0;
  const merged: string[] = [];
  for (let index = 0; index < firstGroup.length; index += 1) {
    const variants = groups.map((group) => group[index] ?? "");
    const base = variants[0] ?? "";
    if (!base.trim()) {
      return null;
    }
    for (let variantIndex = 1; variantIndex < variants.length; variantIndex += 1) {
      if (!isNearDuplicateParagraph(base, variants[variantIndex] ?? "")) {
        return null;
      }
    }
    comparableChars += variants.reduce(
      (maxLength, candidate) =>
        Math.max(maxLength, compactComparableText(candidate).length),
      0,
    );
    merged.push(variants.reduce((best, candidate) => chooseReadableParagraph(best, candidate)));
  }
  return comparableChars >= Math.max(24, firstGroup.length * 12)
    ? merged.join("\n\n")
    : null;
}

export function mergeNearDuplicateParagraphVariants(left: string, right: string) {
  const leftParagraphs = splitParagraphs(left);
  const rightParagraphs = splitParagraphs(right);
  if (
    leftParagraphs.length < 2 ||
    leftParagraphs.length !== rightParagraphs.length
  ) {
    return null;
  }
  return mergeParagraphGroups([leftParagraphs, rightParagraphs]);
}

export function collapseNearDuplicateParagraphRepeats(value: string) {
  const paragraphs = splitParagraphs(value);
  if (paragraphs.length < 4) {
    return value;
  }
  if (paragraphs.length % 2 === 0) {
    const half = paragraphs.length / 2;
    const halves = mergeParagraphGroups([
      paragraphs.slice(0, half),
      paragraphs.slice(half),
    ]);
    if (halves) {
      return halves;
    }
  }
  for (const repeatCount of [3, 2]) {
    if (paragraphs.length % repeatCount !== 0) {
      continue;
    }
    const blockLength = paragraphs.length / repeatCount;
    if (blockLength < 2) {
      continue;
    }
    const groups = Array.from({ length: repeatCount }, (_, index) =>
      paragraphs.slice(index * blockLength, (index + 1) * blockLength),
    );
    const merged = mergeParagraphGroups(groups);
    if (merged) {
      return merged;
    }
  }
  return value;
}
