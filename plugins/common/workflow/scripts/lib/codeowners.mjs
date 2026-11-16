// CODEOWNERS rules as GitHub reads them: the last matching pattern owns a path.
function patternRegex(pattern) {
  const directory = pattern.endsWith('/');
  const trimmed = pattern.replace(/\/+$/, '');
  const anchored = trimmed.startsWith('/') || trimmed.includes('/');
  const body = trimmed.replace(/^\//, '');
  let source = '';
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (char === '*' && body[i + 1] === '*') {
      i++;
      if (body[i + 1] === '/') { source += '(?:.*/)?'; i++; } else source += '.*';
    } else if (char === '*') source += '[^/]*';
    else if (char === '?') source += '[^/]';
    else source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${anchored ? '' : '(?:.*/)?'}${source}${directory ? '/.*' : '(?:/.*)?'}$`);
}
export function parseCodeowners(contents = '') {
  return String(contents).split(/\r?\n/).map(line => line.replace(/(^|\s)#.*/, '').trim().split(/\s+/).filter(Boolean)).filter(parts => parts.length)
    .map(([pattern, ...owners]) => ({ regex: patternRegex(pattern), owners: owners.map(owner => owner.replace(/^@/, '').toLowerCase()) }));
}
// The changed paths whose CODEOWNERS owners do not include `reviewer`: only those owners can approve them.
export function ownerPaths(contents, paths, reviewer) {
  const rules = parseCodeowners(contents);
  const reviewerLogin = String(reviewer || '').toLowerCase();
  return paths.filter(path => {
    const rule = [...rules].reverse().find(candidate => candidate.regex.test(path));
    return Boolean(rule?.owners.length) && !rule.owners.includes(reviewerLogin);
  });
}
