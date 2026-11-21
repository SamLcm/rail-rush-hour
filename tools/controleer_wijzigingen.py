"""Controleer gewijzigde tracked bestanden lokaal met Git en Python 3."""

import json
import os
from pathlib import Path
import subprocess
import sys


def git(*args):
    return subprocess.check_output(["git", *args])


def main():
    root = os.fsdecode(git("rev-parse", "--show-toplevel")).rstrip("\n")
    os.chdir(root)
    fouten = 0
    for opties in ([], ["--cached"]):
        opdracht = ["git", "diff", "--no-ext-diff", *opties]
        resultaat = subprocess.run([*opdracht, "--check"])
        fouten |= int(resultaat.returncode != 0)
        namen = subprocess.check_output(
            [*opdracht, "--name-only", "--diff-filter=ACMRT", "-z"]
        )
        for naam in filter(None, namen.split(b"\0")):
            pad = Path(os.fsdecode(naam))
            if pad.suffix.lower() != ".json":
                continue
            try:
                if opties:
                    inhoud = git("show", ":" + str(pad))
                elif pad.is_symlink():
                    continue
                else:
                    inhoud = pad.read_bytes()
                json.loads(inhoud)
            except (ValueError, OSError, subprocess.CalledProcessError) as fout:
                print(f"{pad}: {fout}", file=sys.stderr)
                fouten = 1
    if not fouten:
        print("Git-witruimte en gewijzigde JSON gecontroleerd (index en werkmap).")
    return fouten


if __name__ == "__main__":
    sys.exit(main())
