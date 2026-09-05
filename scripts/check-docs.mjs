import { readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const REQUIRED_FILES = Object.freeze([
  'README.md',
  'README.ar.md',
  'README.en.md',
  'CONTRIBUTING.md',
  'CONTRIBUTING.ar.md',
  'CONTRIBUTING.en.md',
  'SECURITY.md',
  'SECURITY.ar.md',
  'SECURITY.en.md',
  'docs/README.md',
  'docs/ar/README.md',
  'docs/ar/PROJECT_OVERVIEW.md',
  'docs/ar/CLOSED_BETA.md',
  'docs/ar/LOCAL_DEVELOPMENT.md',
  'docs/ar/TESTING.md',
  'docs/ar/HUMAN_INPUTS.md',
  'docs/en/README.md',
  'docs/status/README.md',
  'docs/status/CLOSED_BETA.md',
  'docs/archive/README.md',
  '.github/pull_request_template.md',
  '.github/ISSUE_TEMPLATE/bug.yml',
  '.github/ISSUE_TEMPLATE/feature.yml',
  '.github/ISSUE_TEMPLATE/beta-feedback.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
]);

export const GATEWAY_PAIRS = Object.freeze([
  {
    gateway: 'README.md',
    arabic: 'README.ar.md',
    english: 'README.en.md',
  },
  {
    gateway: 'CONTRIBUTING.md',
    arabic: 'CONTRIBUTING.ar.md',
    english: 'CONTRIBUTING.en.md',
  },
  {
    gateway: 'SECURITY.md',
    arabic: 'SECURITY.ar.md',
    english: 'SECURITY.en.md',
  },
  {
    gateway: 'docs/README.md',
    arabic: 'docs/ar/README.md',
    english: 'docs/en/README.md',
  },
]);

export const COUNTERPART_LINKS = Object.freeze([
  {
    source: 'docs/LOCAL_DEVELOPMENT.md',
    target: 'docs/ar/LOCAL_DEVELOPMENT.md',
  },
  {
    source: 'docs/ar/LOCAL_DEVELOPMENT.md',
    target: 'docs/LOCAL_DEVELOPMENT.md',
  },
  {
    source: 'docs/TESTING.md',
    target: 'docs/ar/TESTING.md',
  },
  {
    source: 'docs/ar/TESTING.md',
    target: 'docs/TESTING.md',
  },
  {
    source: 'docs/HUMAN_INPUTS.md',
    target: 'docs/ar/HUMAN_INPUTS.md',
  },
  {
    source: 'docs/ar/HUMAN_INPUTS.md',
    target: 'docs/HUMAN_INPUTS.md',
  },
  {
    source: 'docs/status/CLOSED_BETA.md',
    target: 'docs/ar/CLOSED_BETA.md',
  },
  {
    source: 'docs/ar/CLOSED_BETA.md',
    target: 'docs/status/CLOSED_BETA.md',
  },
]);

const IGNORED_DIRECTORIES = new Set([
  '.agents',
  '.expo',
  '.git',
  '.next',
  '.turbo',
  'artifacts',
  'coverage',
  'dist',
  'node_modules',
]);

function toRepositoryPath(value) {
  return value.split(path.sep).join('/');
}

function isWithinRepository(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}

async function inspectRepositoryPath(root, candidate) {
  const absolute = path.resolve(candidate);
  if (!isWithinRepository(root, absolute)) {
    return { exists: false, escapesRoot: true };
  }

  try {
    const resolved = await realpath(absolute);
    return {
      exists: true,
      escapesRoot: !isWithinRepository(root, resolved),
    };
  } catch {
    return { exists: false, escapesRoot: false };
  }
}

async function repositoryPathAvailable(root, repositoryPath) {
  const inspected = await inspectRepositoryPath(root, path.join(root, repositoryPath));
  return inspected.exists && !inspected.escapesRoot;
}

async function collectMarkdownFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (IGNORED_DIRECTORIES.has(entry.name)) {
      continue;
    }

    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(
        'Symbolic link is not allowed in the documentation tree: ' +
          toRepositoryPath(path.relative(root, absolute)),
      );
    } else if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(root, absolute)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(toRepositoryPath(path.relative(root, absolute)));
    }
  }

  return files.sort();
}

function extractMarkdownLinks(markdown) {
  const withoutFencedCode = markdown.replace(/```[\s\S]*?```/g, '');
  const links = [];
  const inlinePattern = /!?\[[^\]]*\]\(([^)\n]+)\)/g;
  const referenceDefinitionPattern = /^\s{0,3}\[[^\]\n]+\]:\s*(<[^>\n]+>|[^\s\n]+)/gmu;

  for (const match of withoutFencedCode.matchAll(inlinePattern)) {
    const raw = match[1]?.trim();
    if (raw) {
      links.push(raw);
    }
  }

  for (const match of withoutFencedCode.matchAll(referenceDefinitionPattern)) {
    const raw = match[1]?.trim();
    if (raw) {
      links.push(raw);
    }
  }

  return links;
}

function linkPath(rawTarget) {
  const target = rawTarget.startsWith('<')
    ? rawTarget.slice(1, rawTarget.indexOf('>'))
    : rawTarget.split(/\s+/u)[0];
  return target?.split(/[?#]/u)[0] ?? '';
}

function isIgnoredTarget(target) {
  return (
    target === '' ||
    target.startsWith('#') ||
    target.startsWith('/') ||
    target.startsWith('//') ||
    /^[a-z][a-z\d+.-]*:/iu.test(target)
  );
}

function resolveRepositoryTarget(root, source, rawTarget) {
  const target = linkPath(rawTarget);
  if (isIgnoredTarget(target)) {
    return null;
  }

  let decoded;
  try {
    decoded = decodeURIComponent(target);
  } catch {
    decoded = target;
  }

  const absolute = path.resolve(root, path.dirname(source), decoded);
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    return { absolute, repositoryPath: toRepositoryPath(relative), escapesRoot: true };
  }

  return {
    absolute,
    repositoryPath: toRepositoryPath(relative),
    escapesRoot: false,
  };
}

async function resolvedLinksForFile(root, repositoryPath) {
  const content = await readFile(path.join(root, repositoryPath), 'utf8');
  return extractMarkdownLinks(content)
    .map((target) => resolveRepositoryTarget(root, repositoryPath, target))
    .filter(Boolean);
}

function expectsLink(resolvedLinks, expectedPath) {
  return resolvedLinks.some((link) => link.repositoryPath === expectedPath);
}

export async function checkDocumentation({
  root = process.cwd(),
  requiredFiles = REQUIRED_FILES,
  gatewayPairs = GATEWAY_PAIRS,
  counterpartLinks = COUNTERPART_LINKS,
  indexedFiles,
} = {}) {
  const repositoryRoot = await realpath(path.resolve(root));
  const errors = [];

  for (const repositoryPath of requiredFiles) {
    const inspected = await inspectRepositoryPath(
      repositoryRoot,
      path.join(repositoryRoot, repositoryPath),
    );
    if (inspected.escapesRoot) {
      errors.push('Documentation path resolves outside the repository: ' + repositoryPath);
    } else if (!inspected.exists) {
      errors.push('Missing required documentation file: ' + repositoryPath);
    }
  }

  const markdownFiles = await collectMarkdownFiles(repositoryRoot);
  let relativeLinkCount = 0;

  for (const source of markdownFiles) {
    const content = await readFile(path.join(repositoryRoot, source), 'utf8');
    for (const rawTarget of extractMarkdownLinks(content)) {
      const resolved = resolveRepositoryTarget(repositoryRoot, source, rawTarget);
      if (!resolved) {
        continue;
      }

      relativeLinkCount += 1;
      const inspected = await inspectRepositoryPath(repositoryRoot, resolved.absolute);
      if (resolved.escapesRoot || inspected.escapesRoot) {
        errors.push(
          'Documentation path resolves outside the repository: ' + resolved.repositoryPath,
        );
      } else if (!inspected.exists) {
        errors.push(
          'Broken relative Markdown link in ' +
            source +
            ': ' +
            rawTarget +
            ' -> ' +
            resolved.repositoryPath,
        );
      }
    }
  }

  for (const pair of gatewayPairs) {
    if (
      !(await repositoryPathAvailable(repositoryRoot, pair.gateway)) ||
      !(await repositoryPathAvailable(repositoryRoot, pair.arabic)) ||
      !(await repositoryPathAvailable(repositoryRoot, pair.english))
    ) {
      continue;
    }

    const gatewayLinks = await resolvedLinksForFile(repositoryRoot, pair.gateway);
    const arabicLinks = await resolvedLinksForFile(repositoryRoot, pair.arabic);
    const englishLinks = await resolvedLinksForFile(repositoryRoot, pair.english);

    if (!expectsLink(gatewayLinks, pair.arabic)) {
      errors.push('Gateway ' + pair.gateway + ' does not link to ' + pair.arabic);
    }
    if (!expectsLink(gatewayLinks, pair.english)) {
      errors.push('Gateway ' + pair.gateway + ' does not link to ' + pair.english);
    }
    if (!expectsLink(arabicLinks, pair.gateway)) {
      errors.push('Counterpart ' + pair.arabic + ' does not link to ' + pair.gateway);
    }
    if (!expectsLink(arabicLinks, pair.english)) {
      errors.push('Counterpart ' + pair.arabic + ' does not link to ' + pair.english);
    }
    if (!expectsLink(englishLinks, pair.gateway)) {
      errors.push('Counterpart ' + pair.english + ' does not link to ' + pair.gateway);
    }
    if (!expectsLink(englishLinks, pair.arabic)) {
      errors.push('Counterpart ' + pair.english + ' does not link to ' + pair.arabic);
    }
  }

  for (const counterpart of counterpartLinks) {
    if (
      !(await repositoryPathAvailable(repositoryRoot, counterpart.source)) ||
      !(await repositoryPathAvailable(repositoryRoot, counterpart.target))
    ) {
      continue;
    }

    const sourceLinks = await resolvedLinksForFile(repositoryRoot, counterpart.source);
    if (!expectsLink(sourceLinks, counterpart.target)) {
      errors.push('Counterpart ' + counterpart.source + ' does not link to ' + counterpart.target);
    }
  }

  const documentationIndex = 'docs/README.md';
  if (await repositoryPathAvailable(repositoryRoot, documentationIndex)) {
    const indexContent = await readFile(path.join(repositoryRoot, documentationIndex), 'utf8');
    const indexLinks = await resolvedLinksForFile(repositoryRoot, documentationIndex);
    const filesExpectedInIndex =
      indexedFiles ??
      markdownFiles.filter(
        (repositoryPath) =>
          repositoryPath.startsWith('docs/') && repositoryPath !== documentationIndex,
      );

    for (const repositoryPath of filesExpectedInIndex) {
      if (!expectsLink(indexLinks, repositoryPath)) {
        errors.push('Documentation index does not link to ' + repositoryPath);
      }
    }

    const historicalHeading = indexContent.search(
      /^## .*?(أدلة تاريخية|Historical evidence).*$/imu,
    );
    if (historicalHeading < 0) {
      errors.push('Documentation index is missing its Historical evidence section');
    } else {
      const currentSection = indexContent.slice(0, historicalHeading);
      const currentLinks = extractMarkdownLinks(currentSection)
        .map((target) => resolveRepositoryTarget(repositoryRoot, documentationIndex, target))
        .filter(Boolean);
      if (currentLinks.some((link) => link.repositoryPath.startsWith('docs/archive/'))) {
        errors.push('Archive link appears in the current-document section of docs/README.md');
      }
    }
  }

  if (errors.length > 0) {
    throw new Error('Documentation check failed:\n- ' + errors.join('\n- '));
  }

  return {
    markdownFiles: markdownFiles.length,
    requiredFiles: requiredFiles.length,
    relativeLinks: relativeLinkCount,
    indexedFiles:
      indexedFiles?.length ??
      markdownFiles.filter(
        (repositoryPath) =>
          repositoryPath.startsWith('docs/') && repositoryPath !== 'docs/README.md',
      ).length,
    gatewayPairs: gatewayPairs.length,
    counterpartLinks: counterpartLinks.length,
  };
}

async function main() {
  try {
    const result = await checkDocumentation();
    console.log(
      'Documentation check passed: ' +
        result.requiredFiles +
        ' required files, ' +
        result.markdownFiles +
        ' Markdown files, ' +
        result.relativeLinks +
        ' relative links, ' +
        result.indexedFiles +
        ' indexed docs, ' +
        result.gatewayPairs +
        ' bilingual gateway pairs, ' +
        result.counterpartLinks +
        ' reciprocal counterpart links.',
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  await main();
}
