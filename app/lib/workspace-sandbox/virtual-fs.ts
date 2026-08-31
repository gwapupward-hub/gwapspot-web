import type {
  SandboxFileContent,
  SandboxFileEntry,
} from "./types.ts";
import { SandboxOperationError } from "./types.ts";
import { looksBinary } from "../daily-ideas-workspace-core.ts";

export type VirtualNode = {
  path: string;
  kind: "file" | "dir";
  content: string;
  updatedAt: string;
};

function parentPaths(path: string): string[] {
  const segments = path.split("/").filter(Boolean);
  const parents: string[] = [];
  for (let i = 1; i < segments.length; i += 1) {
    parents.push(segments.slice(0, i).join("/"));
  }
  return parents;
}

function nameFor(path: string) {
  return path.split("/").pop() ?? path;
}

/**
 * A minimal, purely functional virtual filesystem used by the in-memory
 * provider (tests) and the Redis-backed degraded provider. Paths are
 * workspace-root-relative and are assumed to be pre-validated by callers.
 */
export class VirtualFilesystem {
  private readonly nodes: Map<string, VirtualNode>;

  constructor(initial: VirtualNode[] = []) {
    this.nodes = new Map(initial.map((node) => [node.path, node]));
  }

  static fromNodes(nodes: VirtualNode[]) {
    return new VirtualFilesystem(nodes);
  }

  toNodes(): VirtualNode[] {
    return [...this.nodes.values()].sort((a, b) => a.path.localeCompare(b.path));
  }

  private ensureParents(path: string, now: string) {
    for (const parent of parentPaths(path)) {
      const existing = this.nodes.get(parent);
      if (existing && existing.kind === "file") {
        throw new SandboxOperationError(
          "A file already exists where a directory is required",
          "conflict",
        );
      }
      if (!existing) {
        this.nodes.set(parent, { path: parent, kind: "dir", content: "", updatedAt: now });
      }
    }
  }

  list(): SandboxFileEntry[] {
    return this.toNodes().map((node) => ({
      path: node.path,
      name: nameFor(node.path),
      kind: node.kind,
      size: node.kind === "file" ? Buffer.byteLength(node.content, "utf8") : undefined,
      updatedAt: node.updatedAt,
    }));
  }

  read(path: string): SandboxFileContent {
    const node = this.nodes.get(path);
    if (!node) throw new SandboxOperationError("File not found", "not_found");
    if (node.kind === "dir") {
      throw new SandboxOperationError("Path is a directory", "invalid");
    }
    return {
      path: node.path,
      content: node.content,
      binary: looksBinary(node.content),
      size: Buffer.byteLength(node.content, "utf8"),
    };
  }

  write(path: string, content: string, now: string) {
    if (!path) throw new SandboxOperationError("A file path is required", "invalid");
    const existing = this.nodes.get(path);
    if (existing && existing.kind === "dir") {
      throw new SandboxOperationError("Path is a directory", "conflict");
    }
    this.ensureParents(path, now);
    this.nodes.set(path, { path, kind: "file", content, updatedAt: now });
  }

  mkdir(path: string, now: string) {
    if (!path) throw new SandboxOperationError("A directory path is required", "invalid");
    const existing = this.nodes.get(path);
    if (existing) {
      if (existing.kind === "dir") return;
      throw new SandboxOperationError("A file already exists at this path", "conflict");
    }
    this.ensureParents(path, now);
    this.nodes.set(path, { path, kind: "dir", content: "", updatedAt: now });
  }

  delete(path: string) {
    if (!path) throw new SandboxOperationError("A path is required", "invalid");
    const node = this.nodes.get(path);
    if (!node) throw new SandboxOperationError("Path not found", "not_found");
    this.nodes.delete(path);
    if (node.kind === "dir") {
      const prefix = `${path}/`;
      for (const key of [...this.nodes.keys()]) {
        if (key.startsWith(prefix)) this.nodes.delete(key);
      }
    }
  }

  rename(from: string, to: string, now: string) {
    if (!from || !to) {
      throw new SandboxOperationError("Both source and destination are required", "invalid");
    }
    const node = this.nodes.get(from);
    if (!node) throw new SandboxOperationError("Source path not found", "not_found");
    if (this.nodes.get(to)) {
      throw new SandboxOperationError("Destination already exists", "conflict");
    }
    this.ensureParents(to, now);
    if (node.kind === "dir") {
      const prefix = `${from}/`;
      const moved: VirtualNode[] = [];
      for (const [key, value] of this.nodes) {
        if (key === from || key.startsWith(prefix)) {
          const nextPath = to + key.slice(from.length);
          moved.push({ ...value, path: nextPath, updatedAt: now });
        }
      }
      this.delete(from);
      for (const value of moved) this.nodes.set(value.path, value);
    } else {
      this.nodes.delete(from);
      this.nodes.set(to, { ...node, path: to, updatedAt: now });
    }
  }
}
