import { unzipSync } from "fflate";
import bundledCatalog from "./model-catalog.json";
import { SearchFault, type SearchLanguage } from "../domain/search";
export interface AssetStore {
  write(path: string, data: ArrayBuffer): Promise<void>;
  mkdir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}
interface Catalog {
  schema: number;
  files: Record<string, { size: number; sha256: string; language: string }>;
}
interface Pack {
  schema: number;
  languages: SearchLanguage[];
}
export async function validateModelPack(
  data: ArrayBuffer,
  catalog: Catalog = bundledCatalog,
): Promise<{ files: Record<string, Uint8Array>; languages: SearchLanguage[] }> {
  if (data.byteLength > 160 * 1024 * 1024) throw new SearchFault("invalidPack");
  let total = 0;
  const files = unzipSync(new Uint8Array(data), {
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
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new Uint8Array(bytes).buffer,
    );
    const hash = [...new Uint8Array(digest)]
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
  ) {}
  async install(data: ArrayBuffer): Promise<SearchLanguage[]> {
    let pack: Awaited<ReturnType<typeof validateModelPack>>;
    try {
      pack = await validateModelPack(data, this.catalog);
    } catch {
      throw new SearchFault("invalidPack");
    }
    // Validate the whole archive before any write; publish manifest last.
    for (const [name, bytes] of Object.entries(pack.files).sort(
      ([a], [b]) =>
        Number(a === "manifest.json") - Number(b === "manifest.json"),
    )) {
      const parts = name.split("/");
      parts.pop();
      let path = "";
      for (const part of parts) {
        path = path ? `${path}/${part}` : part;
        if (!(await this.store.exists(path))) await this.store.mkdir(path);
      }
      await this.store.write(name, new Uint8Array(bytes).buffer);
    }
    return pack.languages;
  }
}
