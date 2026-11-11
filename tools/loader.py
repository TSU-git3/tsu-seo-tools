#!/usr/bin/env python3
"""Print the browser loader for the current commit: fetches each script by commit hash,
checks its SHA-256 and only then runs it. Paste the printed line into the notes.

  python3 tools/loader.py [js/core.js js/crawl.js ...]   (default: every file in js/, core first)
"""
import hashlib
import pathlib
import subprocess
import sys

REPO = "TSU-git3/tsu-seo-tools"


def main():
    commit = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    paths = sys.argv[1:] or sorted((str(p) for p in pathlib.Path("js").glob("*.js")), key=lambda p: (p != "js/core.js", p))
    pairs = [[p, hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()] for p in paths]
    js = (
        "await (async (c, files) => { const out = []; for (const [p, h] of files) { "
        "const t = await (await fetch('https://raw.githubusercontent.com/" + REPO + "/' + c + '/' + p)).text(); "
        "const d = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map(b => b.toString(16).padStart(2, '0')).join(''); "
        "if (d !== h) throw new Error('hash mismatch ' + p); (0, eval)(t); out.push(p); } return 'loaded ' + out.join(' '); })"
        "('" + commit + "', " + str(pairs).replace(" ", "") + ")"
    )
    print(f"commit {commit}")
    for p, h in pairs:
        print(f"{p} sha256 {h}")
    print("\nLOADER:\n" + js)


if __name__ == "__main__":
    main()
