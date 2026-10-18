# NOTICE

WireLens is a modified version of **HTTP Toolkit**, created by Tim Perry / Toolshed Labs SLU
(https://httptoolkit.com), and built from these AGPL-3.0-or-later repositories:

| WireLens folder | Upstream source @ commit |
|---|---|
| `desktop/` | https://github.com/httptoolkit/httptoolkit-desktop @ `6eceea5b6796f2a9c4f690975e374174da2c2287` |
| `server/`  | https://github.com/httptoolkit/httptoolkit-server @ `d8c7492cf7450317efcf536b9bafa71a25065464` |
| `ui/`      | https://github.com/httptoolkit/httptoolkit-ui @ `07b48ffb61c80b5b78d466d89c3ce17d2228d057` |
| `android/` | https://github.com/httptoolkit/httptoolkit-android @ `53d7e356b1872d9ad20716113fc01b9388bdf4c3` |

The exact WireLens changes against each of those upstream commits are in `patches/`.

The server also bundles HTTP Toolkit's Frida interception scripts (`server/overrides/frida/`,
from https://github.com/httptoolkit/frida-interception-and-unpinning).

All upstream copyright notices and license files are kept. WireLens's modifications are
distributed under the same license, **AGPL-3.0-or-later** (see each folder's `LICENSE`).
If you distribute WireLens, or run it as a network service for others, you must make the
complete corresponding source code, including these modifications, available to its users.

"HTTP Toolkit" and its logo are the upstream author's trademarks. WireLens uses its own name
and artwork, and is not affiliated with or endorsed by HTTP Toolkit.

Upstream asks users who rely on its paid features to support its development:
https://httptoolkit.com/pricing/
