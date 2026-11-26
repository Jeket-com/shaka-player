# Jeket's build of Shaka Player

This fork carries Jeket's fixes on top of an upstream Shaka Player release and
publishes one build, `@jeket-cloud/shaka-player`, for every Jeket player:
- the JSS console;
- the website;
- any full-size player in the JBS console.

Epic: Jeket-com/JSS#1560.

## Branches

- **`jeket/<upstream version>`**: the upstream release tag, plus our fixes, each merged by pull request. The current branch is `jeket/5.3.6`, from upstream `v5.3.6`.
- **Moving to a newer upstream release:** create a new `jeket/<version>` branch from that tag, then carry each fix over (already fixed upstream, port, or no longer applicable).

## What is built

The `experimental` bundle, which is the only one with MoQ/MSF, in release and debug forms:

```
python3 build/build.py --name experimental +@complete --force
python3 build/build.py --name experimental --debug +@complete --force
node jeket/pack.mjs
```

`jeket/pack.mjs` produces the package:
- `vendor/shaka-player.experimental{,.debug}.{js,d.ts}`;
- `PIN.json`, with the commit, toolchain, commands and sha256 of every file.

Its exports are `@jeket-cloud/shaka-player` (release) and `@jeket-cloud/shaka-player/debug`.

## Releasing

`.github/workflows/jeket.yaml` builds, packs and runs the tests in Chrome on every push and pull request to a `jeket/*` branch. To release, push a tag:

```
git tag v5.3.6-jeket.1 origin/jeket/5.3.6
git push origin v5.3.6-jeket.1
```

The tag must name the branch's upstream version. The workflow then attaches `jeket-cloud-shaka-player-5.3.6-jeket.1.tgz` to a GitHub release, and the release notes give the install line and npm integrity.

## Using it

```json
"@jeket-cloud/shaka-player": "https://github.com/Jeket-com/shaka-player/releases/download/v5.3.6-jeket.1/jeket-cloud-shaka-player-5.3.6-jeket.1.tgz"
```

The lockfile pins the tarball's integrity. Moving to a new release is a one-line change in each repo.
