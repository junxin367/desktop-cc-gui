function stripRelativePrefix(path: string) {
  return path.replace(/^\.\/+/, "");
}

export function isAbsoluteFsPath(path: string) {
  const trimmed = path.trim();
  return (
    trimmed.startsWith("/") ||
    /^[a-zA-Z]:[\\/]/.test(trimmed) ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("\\\\")
  );
}

export function normalizeFsPath(path: string) {
  try {
    return decodeURIComponent(path)
      .replace(/\\/g, "/")
      .replace(/^\/([a-zA-Z]:\/)/, "$1")
      .replace(/\/+$/, "");
  } catch {
    return path
      .replace(/\\/g, "/")
      .replace(/^\/([a-zA-Z]:\/)/, "$1")
      .replace(/\/+$/, "");
  }
}

export function isLikelyWindowsFsPath(path: string) {
  return /^[a-zA-Z]:\//.test(path) || path.startsWith("//");
}

export function normalizeComparablePath(path: string, caseInsensitive: boolean) {
  const normalized = normalizeFsPath(path);
  return caseInsensitive ? normalized.toLowerCase() : normalized;
}

export function normalizeRelativeWorkspacePath(path: string) {
  return path
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .trim();
}

export function resolveWorkspaceRelativePath(
  workspacePath: string | null | undefined,
  path: string,
) {
  const normalizedPath = normalizeFsPath(path).trim();
  if (!workspacePath) {
    return stripRelativePrefix(normalizedPath);
  }
  const normalizedWorkspace = normalizeFsPath(workspacePath).replace(/\/+$/, "");
  if (!normalizedWorkspace) {
    return stripRelativePrefix(normalizedPath);
  }

  const caseInsensitive = isLikelyWindowsFsPath(normalizedWorkspace);
  const comparablePath = normalizeComparablePath(normalizedPath, caseInsensitive);
  const comparableWorkspace = normalizeComparablePath(
    normalizedWorkspace,
    caseInsensitive,
  );
  if (comparablePath === comparableWorkspace) {
    return "";
  }
  if (comparablePath.startsWith(`${comparableWorkspace}/`)) {
    return normalizedPath.slice(normalizedWorkspace.length + 1);
  }
  return stripRelativePrefix(normalizedPath);
}

export function resolveGitRootWorkspacePrefix(
  workspacePath: string,
  gitRoot: string | null | undefined,
) {
  const trimmed = gitRoot?.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = normalizeFsPath(trimmed).replace(/\/+$/, "").trim();
  if (!normalized) {
    return null;
  }

  if (isAbsoluteFsPath(normalized)) {
    const normalizedWorkspace = normalizeFsPath(workspacePath).replace(/\/+$/, "");
    if (!normalizedWorkspace) {
      return null;
    }
    const caseInsensitive = isLikelyWindowsFsPath(normalizedWorkspace);
    const comparablePath = normalizeComparablePath(normalized, caseInsensitive);
    const comparableWorkspace = normalizeComparablePath(
      normalizedWorkspace,
      caseInsensitive,
    );
    if (comparablePath === comparableWorkspace) {
      return null;
    }
    if (!comparablePath.startsWith(`${comparableWorkspace}/`)) {
      return null;
    }
    return normalizeRelativeWorkspacePath(normalized.slice(normalizedWorkspace.length + 1));
  }

  const relative = normalizeRelativeWorkspacePath(normalized.replace(/^\.\/+/, ""));
  if (!relative || relative === ".") {
    return null;
  }
  const segments = relative.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return null;
  }
  return segments.join("/");
}

export function resolveGitStatusPathCandidates(
  workspacePath: string,
  gitRootWorkspacePrefix: string | null,
  entryPath: string,
) {
  const candidates = new Set<string>();
  const trimmedEntryPath = entryPath.trim();
  if (!trimmedEntryPath) {
    return [];
  }
  const isAbsoluteEntryPath = isAbsoluteFsPath(trimmedEntryPath);
  const normalizedEntryPath = normalizeRelativeWorkspacePath(trimmedEntryPath);
  const hasGitRootPrefix =
    Boolean(gitRootWorkspacePrefix) &&
    normalizedEntryPath.length > 0 &&
    (normalizedEntryPath === gitRootWorkspacePrefix ||
      normalizedEntryPath.startsWith(`${gitRootWorkspacePrefix}/`));
  const shouldTreatAsRepoRelative =
    Boolean(gitRootWorkspacePrefix) &&
    normalizedEntryPath.length > 0 &&
    !isAbsoluteEntryPath &&
    !hasGitRootPrefix;
  const normalizedWorkspacePath = normalizeRelativeWorkspacePath(
    resolveWorkspaceRelativePath(workspacePath, entryPath),
  );
  if (normalizedWorkspacePath && !shouldTreatAsRepoRelative) {
    candidates.add(normalizedWorkspacePath);
  }

  if (gitRootWorkspacePrefix && normalizedEntryPath && !isAbsoluteEntryPath) {
    if (hasGitRootPrefix) {
      candidates.add(normalizedEntryPath);
    } else {
      candidates.add(`${gitRootWorkspacePrefix}/${normalizedEntryPath}`);
    }
  }

  if (normalizedEntryPath && !shouldTreatAsRepoRelative) {
    candidates.add(normalizedEntryPath);
  }

  return Array.from(candidates);
}

export function resolveWorkspacePathCandidates(workspacePath: string, path: string) {
  const candidates = new Set<string>();
  const trimmedPath = path.trim();
  if (!trimmedPath) {
    return [];
  }
  const normalizedWorkspacePath = normalizeRelativeWorkspacePath(
    resolveWorkspaceRelativePath(workspacePath, trimmedPath),
  );
  if (normalizedWorkspacePath) {
    candidates.add(normalizedWorkspacePath);
  }
  const normalizedPath = normalizeRelativeWorkspacePath(trimmedPath);
  if (normalizedPath) {
    candidates.add(normalizedPath);
  }
  return Array.from(candidates);
}

export function resolveDiffPathFromWorkspacePath(
  rawPath: string,
  availablePaths: string[],
  workspacePath: string | null | undefined,
) {
  const normalizedInput = normalizeFsPath(rawPath).trim();
  const normalizedWorkspace = workspacePath
    ? normalizeFsPath(workspacePath).replace(/\/+$/, "")
    : "";
  const caseInsensitive = isLikelyWindowsFsPath(normalizedWorkspace);
  const comparableAvailable = new Map(
    availablePaths.map((path) => [
      normalizeComparablePath(path, caseInsensitive),
      path,
    ]),
  );

  const candidates = new Set<string>([
    stripRelativePrefix(normalizedInput),
    resolveWorkspaceRelativePath(workspacePath, normalizedInput),
  ]);
  if (normalizedInput.startsWith("/")) {
    candidates.add(normalizedInput.slice(1));
  }

  for (const candidate of candidates) {
    const matched = comparableAvailable.get(
      normalizeComparablePath(candidate, caseInsensitive),
    );
    if (matched) {
      return matched;
    }
  }

  for (const candidate of candidates) {
    const comparableCandidate = normalizeComparablePath(candidate, caseInsensitive);
    const suffixMatch = availablePaths.find((path) =>
      normalizeComparablePath(path, caseInsensitive).endsWith(`/${comparableCandidate}`),
    );
    if (suffixMatch) {
      return suffixMatch;
    }
  }

  const inputBaseName = normalizedInput.split("/").pop() ?? normalizedInput;
  const sameNamePaths = availablePaths.filter((path) => {
    const baseName = path.split("/").pop() ?? path;
    return normalizeComparablePath(baseName, caseInsensitive) ===
      normalizeComparablePath(inputBaseName, caseInsensitive);
  });
  if (sameNamePaths.length === 1) {
    return sameNamePaths[0];
  }

  return resolveWorkspaceRelativePath(workspacePath, normalizedInput);
}

function normalizeExtendedFsPath(path: string) {
  const normalized = normalizeFsPath(path).trim();
  if (normalized.startsWith("//?/UNC/")) {
    return `//${normalized.slice("//?/UNC/".length)}`;
  }
  if (normalized.startsWith("//?/")) {
    return normalized.slice("//?/".length);
  }
  return normalized;
}

function normalizeRootPath(path: string | null | undefined) {
  if (!path) {
    return "";
  }
  return normalizeExtendedFsPath(path).replace(/\/+$/, "");
}

function isPathInsideRoot(path: string, root: string, caseInsensitive: boolean) {
  const comparablePath = normalizeComparablePath(path, caseInsensitive);
  const comparableRoot = normalizeComparablePath(root, caseInsensitive);
  if (comparablePath === comparableRoot) {
    return true;
  }
  return comparablePath.startsWith(`${comparableRoot}/`);
}

type WorkspaceFileReadTarget = {
  domain: "workspace";
  normalizedInputPath: string;
  workspaceRelativePath: string;
};

type ExternalSpecFileReadTarget = {
  domain: "external-spec";
  normalizedInputPath: string;
  workspaceRelativePath: string;
  externalSpecLogicalPath: string;
};

type ExternalAbsoluteFileReadTarget = {
  domain: "external-absolute";
  normalizedInputPath: string;
  workspaceRelativePath: string;
};

type InvalidFileReadTarget = {
  domain: "invalid";
  normalizedInputPath: string;
  workspaceRelativePath: string;
};

export type FileReadTarget =
  | WorkspaceFileReadTarget
  | ExternalSpecFileReadTarget
  | ExternalAbsoluteFileReadTarget
  | InvalidFileReadTarget;

export function resolveFileReadTarget(
  workspacePath: string | null | undefined,
  inputPath: string,
  customSpecRoot?: string | null,
): FileReadTarget {
  const normalizedInputPath = normalizeExtendedFsPath(inputPath);
  if (!normalizedInputPath) {
    return {
      domain: "invalid",
      normalizedInputPath,
      workspaceRelativePath: "",
    };
  }
  const workspaceRelativePath = resolveWorkspaceRelativePath(
    workspacePath,
    normalizedInputPath,
  );
  const normalizedWorkspaceRoot = normalizeRootPath(workspacePath);
  if (normalizedWorkspaceRoot) {
    const workspaceCaseInsensitive = isLikelyWindowsFsPath(normalizedWorkspaceRoot);
    if (
      isPathInsideRoot(
        normalizedInputPath,
        normalizedWorkspaceRoot,
        workspaceCaseInsensitive,
      )
    ) {
      return {
        domain: "workspace",
        normalizedInputPath,
        workspaceRelativePath,
      };
    }
  }

  const normalizedSpecRoot = normalizeRootPath(customSpecRoot);
  if (normalizedSpecRoot) {
    const specCaseInsensitive = isLikelyWindowsFsPath(normalizedSpecRoot);
    if (isPathInsideRoot(normalizedInputPath, normalizedSpecRoot, specCaseInsensitive)) {
      const suffix = normalizedInputPath.slice(normalizedSpecRoot.length).replace(/^\/+/, "");
      let externalSpecLogicalPath = "openspec";
      if (suffix) {
        const normalizedSuffix = suffix.toLowerCase();
        if (normalizedSuffix === "openspec") {
          externalSpecLogicalPath = "openspec";
        } else if (normalizedSuffix.startsWith("openspec/")) {
          externalSpecLogicalPath = `openspec/${suffix.slice("openspec/".length)}`;
        } else {
          externalSpecLogicalPath = `openspec/${suffix}`;
        }
      }
      return {
        domain: "external-spec",
        normalizedInputPath,
        workspaceRelativePath,
        externalSpecLogicalPath,
      };
    }
  }

  if (isAbsoluteFsPath(normalizedInputPath)) {
    return {
      domain: "external-absolute",
      normalizedInputPath,
      workspaceRelativePath,
    };
  }

  return {
    domain: "workspace",
    normalizedInputPath,
    workspaceRelativePath,
  };
}
