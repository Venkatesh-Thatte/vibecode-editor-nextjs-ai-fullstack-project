"use server";

import { db } from "@/lib/db";
import { currentUser } from "@/modules/auth/actions";
import { revalidatePath } from "next/cache";

// ─── Existing actions (unchanged) ────────────────────────────────────────────

export const toggleStarMarked = async (
  playgroundId: string,
  isChecked: boolean
) => {
  const user = await currentUser();
  const userId = user?.id;
  if (!userId) throw new Error("User Id is Required");

  try {
    if (isChecked) {
      await db.starMark.create({
        data: { userId: userId!, playgroundId, isMarked: isChecked },
      });
    } else {
      await db.starMark.delete({
        where: { userId_playgroundId: { userId, playgroundId } },
      });
    }
    revalidatePath("/dashboard");
    return { success: true, isMarked: isChecked };
  } catch (error) {
    console.error("Error updating problem:", error);
    return { success: false, error: "Failed to update problem" };
  }
};

export const getAllPlaygroundForUser = async () => {
  const user = await currentUser();
  try {
    const playground = await db.playground.findMany({
      where: { userId: user?.id },
      include: {
        user: true,
        Starmark: {
          where: { userId: user?.id! },
          select: { isMarked: true },
        },
      },
    });
    return playground;
  } catch (error) {
    console.log(error);
  }
};

// ─── New: Create playground from GitHub repo ─────────────────────────────────

interface GithubPlaygroundInput {
  repoUrl: string;
  owner: string;
  repo: string;
  branch: string;
}

interface GithubPlaygroundResult {
  success: boolean;
  playgroundId?: string;
  error?: string;
}

/**
 * GitHub Contents API — recursively fetches every file in a repo
 * and returns a flat list of { path, content } entries.
 */
async function fetchGithubTree(
  owner: string,
  repo: string,
  branch: string
): Promise<Array<{ path: string; content: string }>> {
  // 1. Get the full git tree (recursive)
  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        // Add GITHUB_TOKEN env var to raise rate limits (optional but recommended)
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
      next: { revalidate: 0 },
    }
  );

  if (!treeRes.ok) {
    const msg = await treeRes.text();
    throw new Error(`GitHub API error (${treeRes.status}): ${msg}`);
  }

  const treeData = await treeRes.json();

  // 2. Filter to blobs only (files, not trees/dirs) and skip heavy/binary files
  const SKIP_EXTENSIONS = new Set([
    "png", "jpg", "jpeg", "gif", "webp", "svg", "ico",
    "woff", "woff2", "ttf", "eot", "otf",
    "zip", "tar", "gz", "7z",
    "mp4", "mp3", "wav", "ogg",
    "pdf", "docx", "xlsx",
    "lock",       // package-lock.json, yarn.lock, etc.
  ]);

  const SKIP_DIRS = new Set([
    "node_modules", ".git", ".next", "dist", "build", "out", ".cache",
  ]);

  const blobs: Array<{ path: string; url: string }> = treeData.tree
    .filter((item: any) => {
      if (item.type !== "blob") return false;
      const parts = item.path.split("/");
      if (parts.some((p: string) => SKIP_DIRS.has(p))) return false;
      const ext = item.path.split(".").pop()?.toLowerCase() ?? "";
      if (SKIP_EXTENSIONS.has(ext)) return false;
      if (item.size > 200_000) return false; // skip files > 200 KB
      return true;
    })
    .map((item: any) => ({ path: item.path, url: item.url }));

  // 3. Fetch each blob content in parallel (batched to avoid rate limits)
  const BATCH_SIZE = 10;
  const results: Array<{ path: string; content: string }> = [];

  for (let i = 0; i < blobs.length; i += BATCH_SIZE) {
    const batch = blobs.slice(i, i + BATCH_SIZE);
    const fetched = await Promise.all(
      batch.map(async ({ path, url }) => {
        try {
          const res = await fetch(url, {
            headers: {
              Accept: "application/vnd.github+json",
              ...(process.env.GITHUB_TOKEN
                ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
                : {}),
            },
          });
          if (!res.ok) return null;
          const data = await res.json();
          // GitHub returns base64-encoded content
          const content = Buffer.from(data.content, "base64").toString("utf-8");
          return { path, content };
        } catch {
          return null;
        }
      })
    );
    results.push(...(fetched.filter(Boolean) as Array<{ path: string; content: string }>));
  }

  return results;
}

/**
 * Converts a flat file list into the nested TemplateFolder structure
 * that the playground editor expects.
 */
function buildTemplateTree(
  files: Array<{ path: string; content: string }>
): any {
  const root: any = { folderName: "Root", items: [] };

  for (const file of files) {
    const parts = file.path.split("/");
    let current = root;

    // Walk/create intermediate folder nodes
    for (let i = 0; i < parts.length - 1; i++) {
      const folderName = parts[i];
      let folder = current.items.find(
        (item: any) => "folderName" in item && item.folderName === folderName
      );
      if (!folder) {
        folder = { folderName, items: [] };
        current.items.push(folder);
      }
      current = folder;
    }

    // Add file node using the correct TemplateFile shape
    const fullName = parts[parts.length - 1];         // e.g. "index.tsx"
    const dotIndex = fullName.lastIndexOf(".");
    const filename =
      dotIndex !== -1 ? fullName.slice(0, dotIndex) : fullName;   // "index"
    const fileExtension =
      dotIndex !== -1 ? fullName.slice(dotIndex + 1) : "";        // "tsx"

    current.items.push({
      filename,
      fileExtension,
      content: file.content,
    });
  }

  return root;
}

export const createPlaygroundFromGithub = async (
  input: GithubPlaygroundInput
): Promise<GithubPlaygroundResult> => {
  const user = await currentUser();
  if (!user?.id) {
    return { success: false, error: "You must be logged in" };
  }

  const { owner, repo, branch, repoUrl } = input;

  try {
    // 1. Fetch all files from GitHub
    const files = await fetchGithubTree(owner, repo, branch);

    if (files.length === 0) {
      return {
        success: false,
        error:
          "No files found. Make sure the repository is public and the branch exists.",
      };
    }

    // 2. Build the template tree
    const templateTree = buildTemplateTree(files);

    // 3. Create the Playground record in DB
    //    We use REACT as a generic template type for GitHub repos
    const playground = await db.playground.create({
      data: {
        title: `${owner}/${repo}`,
        description: `Imported from ${repoUrl}`,
        template: "REACT", // closest generic option in your enum
        userId: user.id,
        templateFiles: {
          create: {
            content: JSON.stringify(templateTree),
          },
        },
      },
    });

    revalidatePath("/dashboard");

    return { success: true, playgroundId: playground.id };
  } catch (error: any) {
    console.error("createPlaygroundFromGithub error:", error);

    if (error?.message?.includes("404")) {
      return {
        success: false,
        error: `Repository not found. Make sure "${owner}/${repo}" is public and the branch "${branch}" exists.`,
      };
    }
    if (error?.message?.includes("rate limit") || error?.message?.includes("403")) {
      return {
        success: false,
        error:
          "GitHub API rate limit reached. Add a GITHUB_TOKEN env variable to increase the limit.",
      };
    }

    return { success: false, error: "Failed to import repository. Please try again." };
  }
};

// ─── Other existing actions (keep yours below) ────────────────────────────────

export const deleteProjectById = async (id: string) => {
  const user = await currentUser();
  if (!user?.id) throw new Error("Unauthorized");
  await db.playground.delete({ where: { id, userId: user.id } });
  revalidatePath("/dashboard");
};

export const editProjectById = async (
  id: string,
  data: { title?: string; description?: string }
) => {
  const user = await currentUser();
  if (!user?.id) throw new Error("Unauthorized");
  await db.playground.update({ where: { id, userId: user.id }, data });
  revalidatePath("/dashboard");
};

export const duplicateProjectById = async (id: string) => {
  const user = await currentUser();
  if (!user?.id) throw new Error("Unauthorized");

  const original = await db.playground.findUnique({
    where: { id },
    include: { templateFiles: true },
  });

  if (!original) throw new Error("Playground not found");

  await db.playground.create({
    data: {
      title: `${original.title} (copy)`,
      description: original.description,
      template: original.template,
      userId: user.id,
      templateFiles: original.templateFiles[0]
        ? {
            create: {
              content: original.templateFiles[0].content,
            },
          }
        : undefined,
    },
  });

  revalidatePath("/dashboard");
};

export const createPlayground = async (data: {
  title: string;
  template: "REACT" | "NEXTJS" | "EXPRESS" | "VUE" | "HONO" | "ANGULAR";
  description?: string;
}) => {
  const user = await currentUser();
  if (!user?.id) throw new Error("Unauthorized");

  const playground = await db.playground.create({
    data: {
      title: data.title,
      description: data.description,
      template: data.template,
      userId: user.id,
    },
  });

  revalidatePath("/dashboard");
  return playground;
};