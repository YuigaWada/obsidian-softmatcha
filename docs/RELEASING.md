# Release and community submission

This repository prepares artifacts and a **draft** GitHub release. It does not
submit or publish an Obsidian Community directory entry automatically.

## Local release preparation

1. Run `npm ci` and `npm run check` from a clean checkout.
2. Update the changelog and `docs/RELEASE_NOTES.md`. Use
   `npm run version:bump -- 0.3.1` for the next version; it updates package,
   manifest, lockfile, and `versions.json` together, without committing or tagging.
3. For a model-bearing release, prepare public models as described in
   [DEVELOPMENT.md](DEVELOPMENT.md). Run `npm run package:models`; otherwise
   `npm run package` creates only the small plugin distribution.
4. Check `dist/SHA256SUMS` and the generated files. The three required release
   attachments are `main.js`, `manifest.json`, and `styles.css`. Optional model
   packs are separate attachments, not part of the standard plugin download.
5. Test a fresh three-file installation, exact search, each model import, and
   per-language opt-out. Check that failed ZIP validation writes nothing.
   Re-test on the OS/app combinations you intend to claim as tested.

## Public repository and GitHub release

The intended repository is `YuigaWada/SoftMatcha-for-Obsidian`. Create/configure
the public repository and push the plugin repository only, never its enclosing
vault. This source directory has its own `.git`; verify `git rev-parse --show-toplevel`
before adding a remote. Review the source/history and ensure no vault content,
credentials, models, or indices are being published.

After committing and pushing reviewed source, create a tag **exactly** matching
`manifest.json`'s version, e.g. `0.3.0` (no `v` prefix). The release workflow
runs checks, obtains public model data, validates it against the committed
catalog, and creates a draft release with the three plugin files, model packs,
manual-install ZIP, and checksums. It can also be dispatched for an existing
tag; `include_models` controls the optional data packaging.

Review the draft and its attachments, then publish it in GitHub. The workflow
has only the repository `contents: write` permission needed for this draft;
no separate personal token is required. A workflow run or local check passing
does not establish that Obsidian has approved the plugin.

## Submit to the current Obsidian Community directory

The official flow is documented in
[Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin)
and [Set up and claim](https://docs.obsidian.md/community-directory/set-up-and-claim).
As checked on 2026-11-04:

1. Have the public GitHub repository and matching published release ready.
2. Sign in to [community.obsidian.md](https://community.obsidian.md) with an
   Obsidian account and link the GitHub account that owns the repository.
3. Add the plugin using its public repository URL. The directory reads the
   default branch's committed manifest.
4. The maintainer must review and accept the developer policies and maintenance
   commitment themselves before submitting.
5. Review the directory's automated findings. Its **Review branch** feature
   can preview scans. Fix issues, increment the version, and create a new
   release as required. Publication in the directory remains subject to review.

Do not use an obsolete pull-request-only submission guide. Policies and the
submission interface may change; recheck the official links when submitting.

## Naming, compatibility, and disclosures

- The community display name is **SoftMatcha Search**. The repository may remain
  **SoftMatcha-for-Obsidian**. Current manifest naming rules exclude “Obsidian”
  from plugin display names; the internal ID remains `softmatcha-search`.
- No default hotkey is shipped. Existing user-configured `softmatcha-search:search`
  shortcuts still work. README recommends Cmd/Ctrl+Shift+O if available.
- `minAppVersion` is 1.8.7 because the UI language API requires it. The settings
  tab supports the imperative fallback and provides a render definition for
  Obsidian 1.13+ settings search. `versions.json` stays synchronized.
- macOS / Obsidian 1.15.0 has been manually tested. Mobile and other Obsidian
  platforms must remain described as unverified until actual testing.
- Model downloads, local storage, free/no-account status, and
  third-party/model licenses are disclosed in both READMEs and privacy docs.

Sources: [manifest](https://docs.obsidian.md/Reference/Manifest),
[developer policies](https://docs.obsidian.md/community-directory/developer-policies),
[submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins),
[review FAQ](https://docs.obsidian.md/community-directory/faq).
