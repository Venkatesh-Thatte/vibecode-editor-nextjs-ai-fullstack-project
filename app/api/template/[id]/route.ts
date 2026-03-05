import {
  readTemplateStructureFromJson,
  saveTemplateStructureToJson,
} from "@/modules/playground/lib/path-to-json";
import { db } from "@/lib/db";
import { templatePaths } from "@/lib/template";
import path from "path";
import fs from "fs/promises";
import { NextRequest } from "next/server";

function validateJsonStructure(data: unknown): boolean {
  try {
    JSON.parse(JSON.stringify(data));
    return true;
  } catch (error) {
    console.error("Invalid JSON structure:", error);
    return false;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return Response.json({ error: "Missing playground ID" }, { status: 400 });
  }

  const playground = await db.playground.findUnique({ where: { id } });

  if (!playground) {
    return Response.json({ error: "Playground not found" }, { status: 404 });
  }

  const templateKey = playground.template as keyof typeof templatePaths;
  const templatePath = templatePaths[templateKey];

  // 👇 ADD LOG #1 HERE
  console.log({ template: playground.template, templateKey, templatePath });

  if (!templatePath) {
    return Response.json({ error: "Invalid template" }, { status: 404 });
  }

  const outputDir = path.join(process.cwd(), "output");
  const outputFile = path.join(outputDir, `${templateKey}-${id}-${Date.now()}.json`);

  try {
    const inputPath = path.join(process.cwd(), templatePath);

    // 👇 ADD LOG #2 HERE
    try {
      await fs.access(inputPath);
    } catch {
      console.error("Input path does not exist:", inputPath);
      return Response.json({ error: `Template path not found: ${inputPath}` }, { status: 500 });
    }

    await fs.mkdir(outputDir, { recursive: true });
    await saveTemplateStructureToJson(inputPath, outputFile);
    const result = await readTemplateStructureFromJson(outputFile);

    if (!validateJsonStructure(result.items)) {
      return Response.json({ error: "Invalid JSON structure" }, { status: 500 });
    }

    return Response.json({ success: true, templateJson: result }, { status: 200 });
  } catch (error) {
    console.error("Error generating template JSON:", error);
    return Response.json({ error: "Failed to generate template" }, { status: 500 });
  } finally {
    await fs.unlink(outputFile).catch(() => {});
  }
}