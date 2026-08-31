const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Parses JSON while preserving integers outside JavaScript's safe range as
 * decimal strings. Static evidence uses Java long values, so response.json()
 * would otherwise silently round values such as Long.MAX_VALUE before the Lab
 * can display or compare them.
 */
export function parseJsonPreservingIntegers(source: string): unknown {
  let normalized = "";
  let index = 0;
  let inString = false;
  let escaped = false;

  while (index < source.length) {
    const character = source[index];
    if (inString) {
      normalized += character;
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      index += 1;
      continue;
    }

    if (character === '"') {
      inString = true;
      normalized += character;
      index += 1;
      continue;
    }

    if (character === "-" || (character >= "0" && character <= "9")) {
      let end = index + 1;
      while (end < source.length && /[0-9eE+.-]/.test(source[end])) end += 1;
      const token = source.slice(index, end);
      if (/^-?(?:0|[1-9][0-9]*)$/.test(token)) {
        const value = BigInt(token);
        normalized +=
          value > MAX_SAFE_INTEGER || value < -MAX_SAFE_INTEGER
            ? `"${token}"`
            : token;
      } else {
        normalized += token;
      }
      index = end;
      continue;
    }

    normalized += character;
    index += 1;
  }

  return JSON.parse(normalized) as unknown;
}
