export interface FrontmatterResult {
  attributes: Record<string, string>;
  body: string;
}

export function parseFrontmatter(content: string): FrontmatterResult {
  const lines = content.split('\n');
  const attributes: Record<string, string> = {};
  let bodyStart = 0;

  if (lines.length === 0 || lines[0].trim() !== '---') {
    return { attributes, body: content };
  }

  let foundEnd = false;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      bodyStart = i + 1;
      foundEnd = true;
      break;
    }
    const colonIdx = lines[i].indexOf(':');
    if (colonIdx > 0) {
      const key = lines[i].slice(0, colonIdx).trim();
      let value = lines[i].slice(colonIdx + 1).trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key) {
        attributes[key] = value;
      }
    }
  }

  if (!foundEnd) {
    return { attributes: {}, body: content };
  }

  return {
    attributes,
    body: lines.slice(bodyStart).join('\n'),
  };
}
