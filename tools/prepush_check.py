#!/usr/bin/env python3
"""Run before every push: blocks anything that looks like shop data or a secret.

This repo is public and holds generic code only. A line that must stay as it is can end
with the marker  prepush:allow  (use rarely, and never for real data).
Exit code 1 and a list of file:line:reason when something is found.
"""
import pathlib
import re
import subprocess
import sys

CHECKS = [
    ("phone number", re.compile(r"\+?380\d{9}|\b0\s?\(?800\)?[\s-]?\d{2}[\s-]?\d{2}[\s-]?\d{2}\b|\b\d{3}[\s-]\d{3}[\s-]\d{2}[\s-]\d{2}\b")),
    ("email", re.compile(r"[\w.+-]+@[\w-]+\.[A-Za-z]{2,}")),
    ("secret word", re.compile(r"(?i)\b(csrf|cookie|bearer|access_token|refresh_token|api[_-]?key|passw(or)?d|authorization|session_?id)\b")),
    ("long number (ids, orders, accounts)", re.compile(r"(?<![\w.#-])\d{6,}(?![\w.])")),
    ("product id", re.compile(r"\bp\d{8,}\b")),
    ("price", re.compile(r"\d[\d\s.,]*\s?(₴|грн|UAH)\b", re.I)),
    ("shop name or domain", re.compile(r"(?i)tactical\s?shop|tacticalshop|\bTSU\s?Club\b")),
]
DATA_EXT = {".csv", ".xlsx", ".xls", ".json", ".gz", ".zip", ".txt", ".xml", ".html", ".png", ".jpg", ".pdf"}
ALLOWED_DATA = {"README.md"}
SELF = pathlib.Path(__file__).name


def files():
    try:
        out = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard"], capture_output=True, text=True, check=True).stdout
        return [pathlib.Path(p) for p in out.splitlines() if p]
    except Exception:
        return [p for p in pathlib.Path(".").rglob("*") if p.is_file() and ".git" not in p.parts]


def main():
    hits = []
    for f in files():
        if f.suffix.lower() in DATA_EXT and f.name not in ALLOWED_DATA:
            hits.append(f"{f}: data file type {f.suffix} (code only in this repo)")
            continue
        if f.name == SELF:
            continue
        try:
            lines = f.read_text(encoding="utf-8").splitlines()
        except Exception:
            hits.append(f"{f}: not a text file")
            continue
        for n, line in enumerate(lines, 1):
            if "prepush:allow" in line:
                continue
            for name, rx in CHECKS:
                if rx.search(line):
                    hits.append(f"{f}:{n}: {name}")
    if hits:
        print("PUSH BLOCKED:")
        print("\n".join(hits))
        sys.exit(1)
    print("prepush check: clean")


if __name__ == "__main__":
    main()
