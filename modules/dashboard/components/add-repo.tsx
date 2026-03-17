"use client";

import { Button } from "@/components/ui/button";
import { ArrowDown, Github, Loader2, ExternalLink } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPlaygroundFromGithub } from "@/modules/dashboard/actions";

// Parses a GitHub URL into owner/repo/branch
function parseGithubUrl(url: string): {
  owner: string;
  repo: string;
  branch: string;
} | null {
  try {
    const cleaned = url.trim().replace(/\.git$/, "");
    // Matches: https://github.com/owner/repo  or  https://github.com/owner/repo/tree/branch
    const match = cleaned.match(
      /github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+))?/
    );
    if (!match) return null;
    return {
      owner: match[1],
      repo: match[2],
      branch: match[3] || "main",
    };
  } catch {
    return null;
  }
}

const AddRepo = () => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleOpen = () => {
    setRepoUrl("");
    setOpen(true);
  };

  const handleSubmit = async () => {
    const trimmed = repoUrl.trim();
    if (!trimmed) {
      toast.error("Please enter a GitHub repository URL");
      return;
    }

    const parsed = parseGithubUrl(trimmed);
    if (!parsed) {
      toast.error(
        "Invalid GitHub URL. Example: https://github.com/owner/repo"
      );
      return;
    }

    setIsLoading(true);
    try {
      const result = await createPlaygroundFromGithub({
        repoUrl: trimmed,
        owner: parsed.owner,
        repo: parsed.repo,
        branch: parsed.branch,
      });

      if (result.success && result.playgroundId) {
        toast.success(`Opened "${parsed.repo}" successfully!`);
        setOpen(false);
        router.push(`/playground/${result.playgroundId}`);
      } else {
        toast.error(result.error || "Failed to open repository");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !isLoading) handleSubmit();
  };

  return (
    <>
      {/* Card Button */}
      <div
        onClick={handleOpen}
        className="group px-6 py-6 flex flex-row justify-between items-center border rounded-lg bg-muted cursor-pointer 
        transition-all duration-300 ease-in-out
        hover:bg-background hover:border-[#E93F3F] hover:scale-[1.02]
        shadow-[0_2px_10px_rgba(0,0,0,0.08)]
        hover:shadow-[0_10px_30px_rgba(233,63,63,0.15)]"
      >
        <div className="flex flex-row justify-center items-start gap-4">
          <Button
            variant={"outline"}
            className="flex justify-center items-center bg-white group-hover:bg-[#fff8f8] group-hover:border-[#E93F3F] group-hover:text-[#E93F3F] transition-colors duration-300"
            size={"icon"}
            onClick={(e) => {
              e.stopPropagation();
              handleOpen();
            }}
          >
            <ArrowDown
              size={30}
              className="transition-transform duration-300 group-hover:translate-y-1"
            />
          </Button>
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-[#e93f3f]">
              Open Github Repository
            </h1>
            <p className="text-sm text-muted-foreground max-w-[220px]">
              Work with your repositories in our editor
            </p>
          </div>
        </div>

        <div className="relative overflow-hidden">
          <Image
            src={"/github.svg"}
            alt="Open GitHub repository"
            width={150}
            height={150}
            className="transition-transform duration-300 group-hover:scale-110"
          />
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Github size={22} className="text-[#e93f3f]" />
              Open GitHub Repository
            </DialogTitle>
            <DialogDescription>
              Paste a public GitHub repository URL to open it in the editor.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="repo-url">Repository URL</Label>
              <Input
                id="repo-url"
                placeholder="https://github.com/owner/repo"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                autoFocus
                className="focus-visible:ring-[#e93f3f]"
              />
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <ExternalLink size={11} />
                Supports any public GitHub repo URL
              </p>
            </div>

            {/* Preview parsed info */}
            {repoUrl && parseGithubUrl(repoUrl) && (
              <div className="rounded-md bg-muted px-4 py-3 text-sm flex flex-col gap-1">
                {(() => {
                  const parsed = parseGithubUrl(repoUrl)!;
                  return (
                    <>
                      <span>
                        <span className="text-muted-foreground">Repo: </span>
                        <span className="font-medium">
                          {parsed.owner}/{parsed.repo}
                        </span>
                      </span>
                      <span>
                        <span className="text-muted-foreground">Branch: </span>
                        <span className="font-medium">{parsed.branch}</span>
                      </span>
                    </>
                  );
                })()}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isLoading || !repoUrl.trim()}
                className="bg-[#e93f3f] hover:bg-[#c93232] text-white"
              >
                {isLoading ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    Opening...
                  </>
                ) : (
                  <>
                    <Github size={16} className="mr-2" />
                    Open Repository
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AddRepo;