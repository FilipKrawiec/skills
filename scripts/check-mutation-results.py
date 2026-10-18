#!/usr/bin/env python3
"""Fail closed on incomplete Cosmic Ray 8.7 sessions before checking kill rate."""
import argparse
from sqlite3 import Error, connect
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("session", type=Path)
    parser.add_argument("minimum", type=float, help="minimum kill percentage")
    args = parser.parse_args()
    if not 0 <= args.minimum <= 100:
        parser.error("minimum must be between 0 and 100")
    try:
        with connect(args.session.resolve().as_uri() + "?mode=ro", uri=True) as db:
            rows = db.execute("SELECT worker_outcome, test_outcome FROM work_items "
                              "LEFT JOIN work_results USING (job_id)").fetchall()
            count = db.execute("SELECT COUNT(*) FROM work_results").fetchone()[0]
        if (not rows or count != len(rows)
                or any(worker != "NORMAL" or outcome not in ("KILLED", "SURVIVED")
                       for worker, outcome in rows)):
            raise ValueError("incomplete or invalid mutation session")
        score = 100 * sum(outcome == "KILLED" for _, outcome in rows) / len(rows)
        print(f"{len(rows)} completed mutations; killed {score:.2f}%")
        if score < args.minimum:
            raise ValueError(f"mutation score below {args.minimum}%")
    except (Error, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


sys.exit(main())
