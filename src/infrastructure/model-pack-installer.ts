import { unzipSync } from "fflate";
import { sha256 } from "@noble/hashes/sha2.js";
import bundledCatalog from "../../resources/model-catalog.json";
import { SearchFault, type SearchLanguage } from "../domain/search";
import { releaseBuffer } from "./worker/mobile/buffers";
export interface AssetStore {
  /** Resolve after persistence; the caller may then detach its input buffer. */
  write(path: string, data: ArrayBuffer): Promise<void>;
  mkdir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}
export interface Catalog {
  schema: number;
  files: Record<string, { size: number; sha256: string; language: string }>;
}
function fileBuffer(bytes: Uint8Array): ArrayBuffer {
  if (
    bytes.buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength
  )
    return bytes.buffer;
  return new Uint8Array(bytes).buffer;
}
interface Pack {
  schema: number;
  languages: SearchLanguage[];
}
export async function validateModelPack(
  data: ArrayBuffer,
  catalog: Catalog = bundledCatalog,
  consumeInput = false,
): Promise<{ files: Record<string, Uint8Array>; languages: SearchLanguage[] }> {
  if (data.byteLength > 160 * 1024 * 1024) throw new SearchFault("invalidPack");
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(data), {
      filter(file) {
        if (file.name === "pack.json") {
          if (file.originalSize > 1024) throw new SearchFault("invalidPack");
          return true;
        }
        const expected = catalog.files[file.name];
        if (!expected || file.originalSize !== expected.size)
          throw new SearchFault("invalidPack");
        total += file.originalSize;
        if (total > 180 * 1024 * 1024) throw new SearchFault("invalidPack");
        return true;
      },
    });
  } finally {
    // unzipSync gives each output its own buffer. Release the transferred ZIP
    // before hashing the unpacked files.
    if (consumeInput) releaseBuffer(data);
  }
  if (!files["pack.json"]) throw new SearchFault("invalidPack");
  const pack = JSON.parse(new TextDecoder().decode(files["pack.json"])) as Pack;
  if (
    pack.schema !== 1 ||
    !Array.isArray(pack.languages) ||
    pack.languages.length < 1 ||
    pack.languages.length > 2 ||
    pack.languages.some((l) => l !== "ja" && l !== "en") ||
    new Set(pack.languages).size !== pack.languages.length
  )
    throw new SearchFault("invalidPack");
  if (
    pack.languages.some(
      (language) =>
        !Object.values(catalog.files).some(
          (file) => file.language === language,
        ),
    )
  )
    throw new SearchFault("invalidPack");
  const expected = Object.entries(catalog.files).filter(
    ([, entry]) =>
      entry.language === "shared" ||
      pack.languages.includes(entry.language as SearchLanguage),
  );
  if (Object.keys(files).length !== expected.length + 1)
    throw new SearchFault("invalidPack");
  for (const [name, entry] of expected) {
    const bytes = files[name];
    if (!bytes) throw new SearchFault("invalidPack");
    // The disposable Worker can hash the existing view directly. WebCrypto
    // snapshots its input, adding a second ~60 MB vector buffer on iOS.
    // Keep the asynchronous native path for callers outside that Worker.
    const digest = consumeInput
      ? sha256(bytes)
      : new Uint8Array(
          await crypto.subtle.digest("SHA-256", fileBuffer(bytes)),
        );
    const hash = [...digest]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("");
    if (hash !== entry.sha256) throw new SearchFault("invalidPack");
  }
  delete files["pack.json"];
  return { files, languages: pack.languages };
}
export class ModelPackInstaller {
  constructor(
    private store: AssetStore,
    private catalog: Catalog = bundledCatalog,
    private validate: typeof validateModelPack = validateModelPack,
    private active: () => boolean = () => true,
    private consumeBuffers = false,
  ) {}
  async install(
    data: ArrayBuffer,
    expectedLanguage?: SearchLanguage,
  ): Promise<SearchLanguage[]> {
    let pack: Awaited<ReturnType<typeof validateModelPack>>;
    try {
      pack = await this.validate(data, this.catalog);
    } catch {
      throw new SearchFault("invalidPack");
    }
    try {
      if (
        expectedLanguage &&
        (pack.languages.length !== 1 || pack.languages[0] !== expectedLanguage)
      )
        throw new SearchFault("invalidPack");
      // Validate the whole archive before any write; publish manifest last.
      for (const name of Object.keys(pack.files).sort(
        (a, b) => Number(a === "manifest.json") - Number(b === "manifest.json"),
      )) {
        if (!this.active()) throw new SearchFault("downloadCancelled");
        const bytes = pack.files[name];
        const parts = name.split("/");
        parts.pop();
        let path = "";
        for (const part of parts) {
          path = path ? `${path}/${part}` : part;
          if (!(await this.store.exists(path))) await this.store.mkdir(path);
        }
        if (!this.active()) throw new SearchFault("downloadCancelled");
        const buffer = fileBuffer(bytes);
        try {
          await this.store.write(name, buffer);
        } finally {
          if (this.consumeBuffers) releaseBuffer(buffer);
        }
        delete pack.files[name];
      }
      return pack.languages;
    } finally {
      if (this.consumeBuffers)
        for (const bytes of Object.values(pack.files)) releaseBuffer(bytes);
    }
  }
}
