import { TemplateFile, TemplateFolder } from "@/modules/playground/lib/path-to-json";

interface WebContainerFile {
  file: {
    contents: string;
  };
}

interface WebContainerDirectory {
  directory: {
    [key: string]: WebContainerFile | WebContainerDirectory;
  };
}

type WebContainerFileSystem = Record<string, WebContainerFile | WebContainerDirectory>;

function processItem(item: TemplateFile | TemplateFolder): WebContainerFile | WebContainerDirectory {
  if ("folderName" in item && item.items) {
    const directoryContents: WebContainerFileSystem = {};

    item.items.forEach((subItem) => {
      const key =
        "fileExtension" in subItem
          ? `${subItem.filename}.${subItem.fileExtension}`
          : subItem.folderName;
      directoryContents[key] = processItem(subItem);
    });

    return { directory: directoryContents };
  } else {
    const file = item as TemplateFile;
    return {
      file: {
        contents: file.content ?? "",
      },
    };
  }
}

export function transformToWebContainerFormat(
  template: TemplateFolder,
): WebContainerFileSystem {
  const result: WebContainerFileSystem = {};

  template.items.forEach((item) => {
    const key =
      "fileExtension" in item
        ? `${item.filename}.${item.fileExtension}`
        : item.folderName;
    result[key] = processItem(item);
  });

  return result;
}