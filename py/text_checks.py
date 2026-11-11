#!/usr/bin/env python3
"""Checks for product texts before an import file is sent (no shop data inside).

Input: .csv or .xlsx (first sheet, header row). Column names are given on the command line.

  letters  FILE --ua COL[,COL] --ru COL[,COL]   UA fields with Russian-only letters, RU fields with Ukrainian-only letters
  lengths  FILE --col COL --max N [--col COL --max N ...]
  diff     OLD NEW --key COL --cols COL[,COL]    words, numbers and model codes in OLD that are missing in NEW
  html     FILE --cols COL[,COL]                 HTML fields: unclosed tags, empty links, images without alt

Prints one line per problem and a total; exit code 1 when anything is found.
"""
import argparse
import csv
import re
import sys
from html.parser import HTMLParser

RU_ONLY = re.compile(r"[ыэъёЫЭЪЁ]")
UA_ONLY = re.compile(r"[іїєґІЇЄҐ]")
WORD = re.compile(r"[\w'’-]+", re.U)
CODE = re.compile(r"\b(?=[\w./-]*\d)[\w./-]{2,}\b", re.U)  # tokens with a digit: sizes, models, articles


def load(path):
    if path.lower().endswith((".xlsx", ".xlsm")):
        from openpyxl import load_workbook

        ws = load_workbook(path, read_only=True, data_only=True).worksheets[0]
        rows = list(ws.iter_rows(values_only=True))
        head = [str(h) if h is not None else "" for h in rows[0]]
        return [{h: ("" if v is None else str(v)) for h, v in zip(head, r)} for r in rows[1:]]
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def cols(arg):
    return [c for c in (arg or "").split(",") if c]


def strip_html(s):
    return re.sub(r"<[^>]+>", " ", s or "")


def cmd_letters(a):
    n = 0
    for i, r in enumerate(load(a.file), start=2):
        for c in cols(a.ua):
            hit = set(RU_ONLY.findall(strip_html(r.get(c, ""))))
            if hit:
                n += 1
                print(f"row {i} {c}: Russian letters {''.join(sorted(hit))}")
        for c in cols(a.ru):
            hit = set(UA_ONLY.findall(strip_html(r.get(c, ""))))
            if hit:
                n += 1
                print(f"row {i} {c}: Ukrainian letters {''.join(sorted(hit))}")
    return n


def cmd_lengths(a):
    if len(a.col) != len(a.max):
        sys.exit("give one --max per --col")
    n = 0
    for i, r in enumerate(load(a.file), start=2):
        for c, m in zip(a.col, a.max):
            v = r.get(c, "") or ""
            if len(v) > m:
                n += 1
                print(f"row {i} {c}: {len(v)} > {m}")
    return n


def cmd_diff(a):
    old = {r.get(a.key, ""): r for r in load(a.old)}
    new = {r.get(a.key, ""): r for r in load(a.new)}
    n = 0
    for k, ro in old.items():
        rn = new.get(k)
        if rn is None:
            n += 1
            print(f"{k}: missing in new file")
            continue
        for c in cols(a.cols):
            o, w = strip_html(ro.get(c, "")), strip_html(rn.get(c, ""))
            ow = {x.lower() for x in WORD.findall(o)}
            nw = {x.lower() for x in WORD.findall(w)}
            gone_codes = sorted(set(CODE.findall(o)) - set(CODE.findall(w)))
            gone_words = sorted(x for x in ow - nw if len(x) > 2 and not CODE.fullmatch(x))
            if gone_codes:
                n += 1
                print(f"{k} {c}: numbers/codes dropped: {', '.join(gone_codes)}")
            if gone_words:
                n += 1
                print(f"{k} {c}: words dropped: {', '.join(gone_words[:40])}")
    return n


class _Html(HTMLParser):
    VOID = {"br", "img", "hr", "meta", "link", "input", "source", "col", "area", "wbr"}

    def __init__(self):
        super().__init__()
        self.stack, self.issues = [], []

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == "img" and not (d.get("alt") or "").strip():
            self.issues.append("img without alt")
        if tag == "a" and not (d.get("href") or "").strip():
            self.issues.append("link without href")
        if tag not in self.VOID:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag in self.VOID:
            return
        if tag in self.stack:
            while self.stack and self.stack.pop() != tag:
                pass
        else:
            self.issues.append(f"stray </{tag}>")


def cmd_html(a):
    n = 0
    for i, r in enumerate(load(a.file), start=2):
        for c in cols(a.cols):
            p = _Html()
            p.feed(r.get(c, "") or "")
            issues = p.issues + [f"unclosed <{t}>" for t in p.stack]
            if issues:
                n += 1
                print(f"row {i} {c}: {'; '.join(sorted(set(issues)))}")
    return n


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("letters")
    p.add_argument("file")
    p.add_argument("--ua")
    p.add_argument("--ru")
    p = sub.add_parser("lengths")
    p.add_argument("file")
    p.add_argument("--col", action="append", default=[])
    p.add_argument("--max", action="append", type=int, default=[])
    p = sub.add_parser("diff")
    p.add_argument("old")
    p.add_argument("new")
    p.add_argument("--key", required=True)
    p.add_argument("--cols", required=True)
    p = sub.add_parser("html")
    p.add_argument("file")
    p.add_argument("--cols", required=True)
    a = ap.parse_args()
    n = {"letters": cmd_letters, "lengths": cmd_lengths, "diff": cmd_diff, "html": cmd_html}[a.cmd](a)
    print(f"total problems: {n}")
    sys.exit(1 if n else 0)


if __name__ == "__main__":
    main()
