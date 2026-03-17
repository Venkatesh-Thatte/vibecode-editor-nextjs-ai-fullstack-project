"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { TemplateFile } from "../lib/path-to-json";
import { Editor, editor, Monaco } from "@monaco-editor/react";
import {
  configureMonaco,
  defaultEditorOptions,
  getEditorLanguage,
} from "../lib/editor-config";

interface PlaygroundEditorProps {
  activeFile: TemplateFile | undefined;
  content: string;
  onContentChange: (value: string) => void;
  suggestion: string | null;
  suggestionLoading: boolean;
  suggestionPosition: { line: number; column: number } | null;
  onAcceptSuggestion: (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => void;
  onRejectSuggestion: (editor: editor.IStandaloneCodeEditor) => void;
  onTriggerSuggestion: (type: string, editor: editor.IStandaloneCodeEditor) => void;
}

const PlaygroundEditor = ({
  activeFile,
  content,
  onContentChange,
  suggestion,
  suggestionLoading,
  suggestionPosition,
  onAcceptSuggestion,
  onRejectSuggestion,
  onTriggerSuggestion,
}: PlaygroundEditorProps) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const inlineCompletionProviderRef = useRef<{ dispose: () => void } | null>(null);
  const currentSuggestionRef = useRef<{
    text: string;
    position: { line: number; column: number };
    id: string;
  } | null>(null);
  const isAcceptingSuggestionRef = useRef(false);
  const suggestionAcceptedRef = useRef(false);
  const suggestionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tabCommandRef = useRef<{ dispose: () => void } | null>(null);

  const generateSuggestionId = () =>
    `suggestion-${Date.now()}-${Math.random()}`;

  const createInlineCompletionProvider = useCallback(
    (monaco: Monaco) => {
      return {
        provideInlineCompletions: async (model: editor.ITextModel, position: { lineNumber: number; column: number }) => {
          if (!suggestion || !suggestionPosition) return { items: [] };

          const isPositionMatch =
            position.lineNumber === suggestionPosition.line + 1;

          if (!isPositionMatch) {
            return { items: [] };
          }

          const cleanSuggestion = suggestion.replace(/\r/g, "");

          currentSuggestionRef.current = {
            text: cleanSuggestion,
            position: suggestionPosition,
            id: generateSuggestionId(),
          };
          return {
            items: [
              {
                insertText: cleanSuggestion,
                range: new monaco.Range(
                  suggestionPosition.line + 1,
                  suggestionPosition.column,
                  suggestionPosition.line + 1,
                  suggestionPosition.column,
                ),
                kind: monaco.languages.CompletionItemKind.Snippet,
                label: "AI Suggestion",
                insertTextRules:
                  monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              },
            ],
          };
        },
        freeInlineCompletions: (_completions: unknown) => {},
      };
    },
    [suggestion, suggestionPosition],
  );

  const clearCurrentSuggestion = useCallback(() => {
    currentSuggestionRef.current = null;
    suggestionAcceptedRef.current = false;
    if (editorRef.current) {
      editorRef.current.trigger("ai", "editor.action.inlineSuggest.hide", null);
    }
  }, []);

  const acceptCurrentSuggestion = useCallback(() => {
    console.log("acceptCurrentSuggestion called", {
      hasEditor: !!editorRef.current,
      hasMonaco: !!monacoRef.current,
      hasSuggestion: !!currentSuggestionRef.current,
      isAccepting: isAcceptingSuggestionRef.current,
      suggestionAccepted: suggestionAcceptedRef.current,
    });

    if (
      !editorRef.current ||
      !monacoRef.current ||
      !currentSuggestionRef.current
    ) {
      console.log("Cannot accept suggestion - missing refs");
      return false;
    }

    if (isAcceptingSuggestionRef.current || suggestionAcceptedRef.current) {
      console.log("BLOCKED: Already accepting/accepted suggestion, skipping");
      return false;
    }

    isAcceptingSuggestionRef.current = true;
    suggestionAcceptedRef.current = true;

    const editorInstance = editorRef.current;
    const monaco = monacoRef.current;
    const currentSuggestion = currentSuggestionRef.current;

    try {
      const cleanSuggestionText = currentSuggestion.text.replace(/\r/g, "");

      console.log(
        "ACCEPTING suggestion:",
        cleanSuggestionText.substring(0, 50) + "...",
      );

      const currentPosition = editorInstance.getPosition();
      const suggestionPos = currentSuggestion.position;

      if (
        !currentPosition ||
        currentPosition.lineNumber !== suggestionPos.line + 1 ||
        currentPosition.column < suggestionPos.column ||
        currentPosition.column > suggestionPos.column + 5
      ) {
        console.log("Position changed, cannot accept suggestion");
        return false;
      }

      const range = new monaco.Range(
        suggestionPos.line,
        suggestionPos.column,
        suggestionPos.line,
        suggestionPos.column,
      );

      const success = editorInstance.executeEdits("ai-suggestion-accept", [
        {
          range,
          text: cleanSuggestionText,
          forceMoveMarkers: true,
        },
      ]);

      if (!success) {
        console.error("Failed to execute edit");
        return false;
      }

      const lines = cleanSuggestionText.split("\n");
      const endLine = suggestionPos.line + lines.length - 1;
      const endColumn =
        lines.length === 1
          ? suggestionPos.column + cleanSuggestionText.length
          : lines[lines.length - 1].length + 1;

      editorInstance.setPosition({ lineNumber: endLine, column: endColumn });

      console.log(
        "SUCCESS: Suggestion accepted, new position:",
        `${endLine}:${endColumn}`,
      );

      clearCurrentSuggestion();
      onAcceptSuggestion(editorInstance, monaco);

      return true;
    } catch (err) {
      console.error("Error accepting suggestion:", err);
      return false;
    } finally {
      isAcceptingSuggestionRef.current = false;

      setTimeout(() => {
        suggestionAcceptedRef.current = false;
        console.log("Reset suggestionAcceptedRef flag");
      }, 1000);
    }
  }, [clearCurrentSuggestion, onAcceptSuggestion]);

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;

    const editorInstance = editorRef.current;
    const monaco = monacoRef.current;

    console.log("Suggestion changed", {
      hasSuggestion: !!suggestion,
      hasPosition: !!suggestionPosition,
      isAccepting: isAcceptingSuggestionRef.current,
      suggestionAccepted: suggestionAcceptedRef.current,
    });

    if (isAcceptingSuggestionRef.current || suggestionAcceptedRef.current) {
      console.log("Skipping update - currently accepting/accepted suggestion");
      return;
    }

    if (inlineCompletionProviderRef.current) {
      inlineCompletionProviderRef.current.dispose();
      inlineCompletionProviderRef.current = null;
    }

    currentSuggestionRef.current = null;

    if (suggestion && suggestionPosition) {
      console.log("Registering new inline completion provider");

      const language = getEditorLanguage(activeFile?.fileExtension || "");
      const provider = createInlineCompletionProvider(monaco);

      inlineCompletionProviderRef.current =
        monaco.languages.registerInlineCompletionsProvider(language, provider);

      setTimeout(() => {
        if (
          editorRef.current &&
          !isAcceptingSuggestionRef.current &&
          !suggestionAcceptedRef.current
        ) {
          console.log("Triggering inline suggestions");
          editorInstance.trigger("ai", "editor.action.inlineSuggest.trigger", null);
        }
      }, 50);
    }

    return () => {
      if (inlineCompletionProviderRef.current) {
        inlineCompletionProviderRef.current.dispose();
        inlineCompletionProviderRef.current = null;
      }
    };
  }, [
    suggestion,
    suggestionPosition,
    activeFile,
    createInlineCompletionProvider,
  ]);

  const hasActiveSuggestionAtPosition = useCallback(() => {
    if (!editorRef.current || !currentSuggestionRef.current) return false;

    const position = editorRef.current.getPosition();
    const currentSuggestion = currentSuggestionRef.current;

    if (!position) return false;

    return (
      position.lineNumber === currentSuggestion.position.line + 1 &&
      position.column >= currentSuggestion.position.column &&
      position.column <= currentSuggestion.position.column + 2
    );
  }, []);

  const updateEditorLanguage = useCallback(() => {
    if (!activeFile || !monacoRef.current || !editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;

    const language = getEditorLanguage(activeFile.fileExtension || "");
    try {
      monacoRef.current.editor.setModelLanguage(model, language);
    } catch (err) {
      console.warn("Failed to set editor language:", err);
    }
  }, [activeFile]);

  const handleEditorDidMount = (
    editorInstance: editor.IStandaloneCodeEditor,
    monaco: Monaco,
  ) => {
    editorRef.current = editorInstance;
    monacoRef.current = monaco;
    console.log("Editor instance mounted:", !!editorRef.current);

    editorInstance.updateOptions({
      ...defaultEditorOptions,
      inlineSuggest: {
        enabled: true,
        mode: "prefix",
        suppressSuggestions: false,
      },
      suggest: {
        preview: false,
        showInlineDetails: false,
        insertMode: "replace",
      },
      quickSuggestions: {
        other: true,
        comments: false,
        strings: false,
      },
      cursorSmoothCaretAnimation: "on",
    });

    configureMonaco(monaco);

    editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
      console.log("Ctrl+Space pressed, triggering suggestion");
      onTriggerSuggestion("completion", editorInstance);
    });

    if (tabCommandRef.current) {
      tabCommandRef.current.dispose();
    }

    tabCommandRef.current = editorInstance.addCommand(
      monaco.KeyCode.Tab,
      () => {
        console.log("TAB PRESSED", {
          hasSuggestion: !!currentSuggestionRef.current,
          hasActiveSuggestion: hasActiveSuggestionAtPosition(),
          isAccepting: isAcceptingSuggestionRef.current,
          suggestionAccepted: suggestionAcceptedRef.current,
        });

        if (isAcceptingSuggestionRef.current) {
          console.log("BLOCKED: Already in the process of accepting, ignoring Tab");
          return;
        }

        if (suggestionAcceptedRef.current) {
          console.log("BLOCKED: Suggestion was just accepted, using default tab");
          editorInstance.trigger("keyboard", "tab", null);
          return;
        }

        if (currentSuggestionRef.current && hasActiveSuggestionAtPosition()) {
          console.log("ATTEMPTING to accept suggestion with Tab");
          const accepted = acceptCurrentSuggestion();
          if (accepted) {
            console.log("SUCCESS: Suggestion accepted via Tab, preventing default behavior");
            return;
          }
          console.log("FAILED: Suggestion acceptance failed, falling through to default");
        }

        console.log("DEFAULT: Using default tab behavior");
        editorInstance.trigger("keyboard", "tab", null);
      },
      "editorTextFocus && !editorReadonly && !suggestWidgetVisible",
    ) as { dispose: () => void } | null;

    editorInstance.addCommand(monaco.KeyCode.Escape, () => {
      console.log("Escape pressed");
      if (currentSuggestionRef.current) {
        onRejectSuggestion(editorInstance);
        clearCurrentSuggestion();
      }
    });

    editorInstance.onDidChangeCursorPosition((e: editor.ICursorPositionChangedEvent) => {
      if (isAcceptingSuggestionRef.current) return;

      const newPosition = e.position;

      if (currentSuggestionRef.current && !suggestionAcceptedRef.current) {
        const suggestionPos = currentSuggestionRef.current.position;

        if (
          newPosition.lineNumber !== suggestionPos.line ||
          newPosition.column < suggestionPos.column ||
          newPosition.column > suggestionPos.column + 10
        ) {
          console.log("Cursor moved away from suggestion, clearing");
          clearCurrentSuggestion();
          onRejectSuggestion(editorInstance);
        }
      }

      if (!currentSuggestionRef.current && !suggestionLoading) {
        if (suggestionTimeoutRef.current) {
          clearTimeout(suggestionTimeoutRef.current);
        }

        suggestionTimeoutRef.current = setTimeout(() => {
          onTriggerSuggestion("completion", editorInstance);
        }, 1500);
      }
    });

    editorInstance.onDidChangeModelContent((e: editor.IModelContentChangedEvent) => {
      if (isAcceptingSuggestionRef.current) return;

      if (
        currentSuggestionRef.current &&
        e.changes.length > 0 &&
        !suggestionAcceptedRef.current
      ) {
        const change = e.changes[0];

        if (
          change.text === currentSuggestionRef.current.text ||
          change.text === currentSuggestionRef.current.text.replace(/\r/g, "")
        ) {
          console.log("Our suggestion was inserted, not clearing");
          return;
        }

        console.log("User typed while suggestion active, clearing");
        clearCurrentSuggestion();
      }

      if (e.changes.length > 0 && !suggestionAcceptedRef.current) {
        const change = e.changes[0];

        if (
          change.text === "\n" ||
          change.text === "{" ||
          change.text === "." ||
          change.text === "=" ||
          change.text === "(" ||
          change.text === "," ||
          change.text === ":" ||
          change.text === ";"
        ) {
          setTimeout(() => {
            if (
              editorRef.current &&
              !currentSuggestionRef.current &&
              !suggestionLoading
            ) {
              onTriggerSuggestion("completion", editorInstance);
            }
          }, 100);
        }
      }
    });

    updateEditorLanguage();
  };

  useEffect(() => {
    updateEditorLanguage();
  }, [updateEditorLanguage]);

  useEffect(() => {
    return () => {
      if (suggestionTimeoutRef.current) {
        clearTimeout(suggestionTimeoutRef.current);
      }
      if (inlineCompletionProviderRef.current) {
        inlineCompletionProviderRef.current.dispose();
        inlineCompletionProviderRef.current = null;
      }
      tabCommandRef.current = null;
    };
  }, []);

  return (
    <div className="h-full relative">
      {suggestionLoading && (
        <div className="absolute top-2 right-2 z-10 bg-red-100 dark:bg-red-900 px-2 py-1 rounded text-xs text-red-700 dark:text-red-300 flex items-center gap-1">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
          AI thinking...
        </div>
      )}

      {currentSuggestionRef.current && !suggestionLoading && (
        <div className="absolute top-2 right-2 z-10 bg-green-100 dark:bg-green-900 px-2 py-1 rounded text-xs text-green-700 dark:text-green-300 flex items-center gap-1">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          Press Tab to accept
        </div>
      )}
 
      <Editor
        height={"100%"}
        value={content}
        onChange={(value) => onContentChange(value || "")}
        onMount={handleEditorDidMount}
        language={
          activeFile
            ? getEditorLanguage(activeFile.fileExtension || "")
            : "plaintext"
        }
        options={defaultEditorOptions}
      />
    </div>
  );
};

export default PlaygroundEditor;
