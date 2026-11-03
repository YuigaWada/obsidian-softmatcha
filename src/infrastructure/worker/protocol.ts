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
export type WorkerRequest =
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
  error?: string;
  code?: string;
}
