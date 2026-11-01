function scalar(value) {
  const text = value.trim();
  if (!text) return '';
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null' || text === '~') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if (text.startsWith('"') && text.endsWith('"')) {
    try { return JSON.parse(text); } catch { return text.slice(1, -1); }
  }
  if (text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1).replaceAll("''", "'");
  if (text.startsWith('[') && text.endsWith(']')) return text.slice(1, -1).split(',').map(scalar);
  return text.replace(/\s+#.*$/, '').trim();
}

function keyValue(text) {
  let quoted = null;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if ((char === '"' || char === "'") && text[index - 1] !== '\\') quoted = quoted === char ? null : quoted || char;
    if (char === ':' && !quoted) return [scalar(text.slice(0, index)), text.slice(index + 1).trim()];
  }
  return null;
}

export function parseYaml(text) {
  const lines = text.split(/\r?\n/).map((raw, line) => ({ raw, line: line + 1 }))
    .filter(item => item.raw.trim() && !item.raw.trimStart().startsWith('#'));
  for (const item of lines) if (/\t/.test(item.raw.match(/^\s*/)[0])) throw new Error(`YAML tabs are not supported at line ${item.line}`);

  function parseBlock(start, indent) {
    const sequence = lines[start]?.raw.length - lines[start]?.raw.trimStart().length === indent && lines[start].raw.trimStart().startsWith('- ');
    const value = sequence ? [] : {};
    let index = start;
    while (index < lines.length) {
      const item = lines[index];
      const currentIndent = item.raw.length - item.raw.trimStart().length;
      if (currentIndent < indent) break;
      if (currentIndent > indent) throw new Error(`Unexpected indentation at line ${item.line}`);
      const content = item.raw.trim();
      if (sequence) {
        if (!content.startsWith('- ')) break;
        const body = content.slice(2).trim();
        if (!body) {
          if (index + 1 >= lines.length || lines[index + 1].raw.length - lines[index + 1].raw.trimStart().length <= indent) value.push(null);
          else { const [nested, next] = parseBlock(index + 1, lines[index + 1].raw.length - lines[index + 1].raw.trimStart().length); value.push(nested); index = next - 1; }
        } else value.push(scalar(body));
        index++;
        continue;
      }
      if (content.startsWith('- ')) break;
      const pair = keyValue(content);
      if (!pair || typeof pair[0] !== 'string' || !pair[0]) throw new Error(`Expected mapping entry at line ${item.line}`);
      const [key, rest] = pair;
      if (rest === '|' || rest === '>' || rest === '|-' || rest === '>-') {
        const chunks = [];
        index++;
        while (index < lines.length && lines[index].raw.length - lines[index].raw.trimStart().length > indent) {
          chunks.push(lines[index].raw.trimStart()); index++;
        }
        value[key] = rest.startsWith('>') ? chunks.join(' ').trim() : chunks.join('\n');
        continue;
      }
      if (!rest) {
        if (index + 1 >= lines.length || lines[index + 1].raw.length - lines[index + 1].raw.trimStart().length <= indent) value[key] = {};
        else { const [nested, next] = parseBlock(index + 1, lines[index + 1].raw.length - lines[index + 1].raw.trimStart().length); value[key] = nested; index = next - 1; }
      } else value[key] = scalar(rest);
      index++;
    }
    return [value, index];
  }

  if (!lines.length) return {};
  const indent = lines[0].raw.length - lines[0].raw.trimStart().length;
  const [result, end] = parseBlock(0, indent);
  if (end !== lines.length || !result || typeof result !== 'object' || Array.isArray(result)) throw new Error('YAML frontmatter must be a mapping');
  return result;
}
