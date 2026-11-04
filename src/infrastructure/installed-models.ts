import bundledCatalog from "../../resources/model-catalog.json";
import type { ModelInventory } from "../application/automatic-models";
import type { SearchLanguage } from "../domain/search";
import type { Catalog } from "./model-pack-installer";
interface AssetPresence {
  exists(path: string): Promise<boolean>;
  text(path: string): Promise<string>;
}
/** Imported data was hash-validated. Check its manifest and complete file set on startup. */
export class InstalledModels implements ModelInventory {
  constructor(
    private store: AssetPresence,
    private catalog: Catalog = bundledCatalog,
  ) {}
  async has(language: SearchLanguage): Promise<boolean> {
    try {
      if (!(await this.store.exists("manifest.json"))) return false;
      const manifest = new TextEncoder().encode(
        await this.store.text("manifest.json"),
      );
      const digest = await crypto.subtle.digest("SHA-256", manifest);
      const hash = [...new Uint8Array(digest)]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("");
      if (hash !== this.catalog.files["manifest.json"].sha256) return false;
      for (const [path, entry] of Object.entries(this.catalog.files))
        if (
          (entry.language === language || entry.language === "shared") &&
          !(await this.store.exists(path))
        )
          return false;
      return true;
    } catch {
      return false;
    }
  }
}
