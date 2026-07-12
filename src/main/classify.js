const URL_RE = /^https?:\/\/\S+$/i;

const CODE_SIGNALS = [
  /^(?: {2,}|\t)\S/m,
  /[{};]\s*$/m,
  /=>|===|!==|::|->|<\/[a-z]/i,
  /\b(function|const|let|var|def|import|export|class|return)\b/,
];

function isHttpUrl(t) {
  if (!URL_RE.test(t)) return false;
  try {
    const u = new URL(t);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.length > 0;
  } catch {
    return false;
  }
}

function classifyText(text) {
  const t = text.trim();
  if (!t) return null;
  if (isHttpUrl(t)) return 'url';
  if (!text.includes('\n')) return null;
  let hits = 0;
  for (const re of CODE_SIGNALS) if (re.test(text)) hits++;
  return hits >= 2 ? 'code' : null;
}

module.exports = { classifyText };
