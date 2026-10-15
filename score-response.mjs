export function parseScoringResponse(raw) {
  const text = String(raw || '').trim();
  for (let start = text.indexOf('['); start >= 0; start = text.indexOf('[', start + 1)) {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let end = start; end < text.length; end++) {
      const char = text[end];
      if (escaped) { escaped = false; continue; }
      if (char === '\\' && quoted) { escaped = true; continue; }
      if (char === '"') { quoted = !quoted; continue; }
      if (quoted) continue;
      if (char === '[') depth++;
      if (char === ']') depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(text.slice(start, end + 1));
          if (Array.isArray(parsed) && parsed.every((item) => item && typeof item === 'object' && 'n' in item)) return parsed;
        } catch {}
        break;
      }
    }
  }
  throw new Error('Scoring response did not contain a valid jobs JSON array.');
}
