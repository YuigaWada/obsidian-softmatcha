import type { SearchConfig, SearchLanguage } from "../../domain/search";
import type { Note } from "./literal-search";
export interface ModelInput {
  language: SearchLanguage;
  vectors: ArrayBuffer;
  vocabulary: string;
  dimensions: number;
  version: string;
}
interface CommonInit {
  dictionaries: Record<string, ArrayBuffer>;
  vault: string;
  mobile?: boolean;
}
export type InitPayload = CommonInit &
  (
    | { models: ModelInput[] }
    | {
        models?: never;
        vectors: ArrayBuffer;
        vocabulary: string;
        dimensions: number;
        version: string;
      }
  );
import type { DocumentVersion } from "../wasm-search-engine";
import type { Catalog } from "../model-pack-installer";
export type WorkerRequest =
  | { id: number; type: "visibility"; payload: boolean }
  | {
      id: number;
      type: "unpack";
      payload: { data: ArrayBuffer; catalog?: Catalog };
    }
  | { id: number; type: "cancel"; payload?: never }
  | {
      id: number;
      type: "model-check";
      payload: { language: SearchLanguage; version: string };
    }
  | { id: number; type: "model"; payload: ModelInput }
  | {
      id: number;
      type: "model-begin";
      payload: Omit<ModelInput, "vectors"> & { size: number };
    }
  | {
      id: number;
      type: "model-page";
      payload: { language: SearchLanguage; vectors: ArrayBuffer };
    }
  | {
      id: number;
      type: "model-end" | "model-abort";
      payload: { language: SearchLanguage };
    }
  | { id: number; type: "dictionary"; payload: Record<string, ArrayBuffer> }
  | { id: number; type: "sync-plan"; payload: DocumentVersion[] }
  | {
      id: number;
      type: "sync-note";
      payload: { file: DocumentVersion; text: string };
    }
  | { id: number; type: "sync-commit"; payload: string[] }
  | { id: number; type: "init"; payload: InitPayload }
  | { id: number; type: "sync"; payload: Note[] }
  | {
      id: number;
      type: "search";
      payload: { query: string; config: SearchConfig };
    };
export interface WorkerReply {
  id: number;
  value?: unknown;
  partial?: boolean;
  error?: string;
  code?: string;
}
