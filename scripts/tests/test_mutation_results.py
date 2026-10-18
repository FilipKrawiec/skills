"""A mutation score is usable only when the whole requested session completed."""
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

CLI = Path(__file__).resolve().parents[1] / "check-mutation-results.py"


class MutationResultsTests(unittest.TestCase):
    def gate(self, outcomes, minimum="50", jobs=2):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "session.sqlite"
            with sqlite3.connect(path) as db:
                db.execute("CREATE TABLE work_items (job_id TEXT PRIMARY KEY)")
                db.execute("CREATE TABLE work_results (job_id TEXT PRIMARY KEY, worker_outcome TEXT, test_outcome TEXT)")
                db.executemany("INSERT INTO work_items VALUES (?)", [(str(i),) for i in range(jobs)])
                db.executemany("INSERT INTO work_results VALUES (?, ?, ?)",
                               [(str(i), worker, test) for i, (worker, test) in enumerate(outcomes)])
            return subprocess.run([sys.executable, str(CLI), str(path), minimum], capture_output=True, text=True)

    def test_complete_score_passes_at_boundary_and_fails_above_it(self):
        outcomes = [("NORMAL", "KILLED"), ("NORMAL", "SURVIVED")]
        accepted = self.gate(outcomes)
        self.assertEqual(accepted.returncode, 0, accepted.stderr)
        self.assertIn("50.00%", accepted.stdout)
        refused = self.gate(outcomes, minimum="50.01")
        self.assertEqual(refused.returncode, 1)
        self.assertIn("below", refused.stderr)

    def test_score_is_fraction_of_all_completed_jobs(self):
        outcomes = [("NORMAL", "KILLED"), ("NORMAL", "KILLED"), ("NORMAL", "SURVIVED")]
        accepted = self.gate(outcomes, minimum="66.66", jobs=3)
        self.assertEqual(accepted.returncode, 0, accepted.stderr)
        self.assertIn("66.67%", accepted.stdout)
        self.assertEqual(self.gate(outcomes, minimum="66.67", jobs=3).returncode, 1)
        zero = [("NORMAL", "SURVIVED"), ("NORMAL", "SURVIVED")]
        self.assertEqual(self.gate(zero, minimum="0").returncode, 0)
        self.assertEqual(self.gate(zero, minimum="0.01").returncode, 1)

    def test_missing_pending_empty_or_invalid_results_never_pass(self):
        for outcomes, jobs in (([], 0), ([], 2), ([("NORMAL", "KILLED")], 2),
                               ([("CRASH", "KILLED"), ("NORMAL", "KILLED")], 2),
                               ([("TIMEOUT", "KILLED"), ("NORMAL", "KILLED")], 2),
                               ([("NORMAL", None), ("NORMAL", "KILLED")], 2),
                               ([("NORMAL", "INCOMPETENT"), ("NORMAL", "KILLED")], 2),
                               ([("NORMAL", "KILLED"), ("NORMAL", "KILLED")], 1)):
            with self.subTest(outcomes=outcomes, jobs=jobs):
                refused = self.gate(outcomes, minimum="0", jobs=jobs)
                self.assertEqual(refused.returncode, 1)
                self.assertIn("incomplete", refused.stderr)

    def test_invalid_threshold_or_missing_database_fails(self):
        for minimum in ("-1", "101", "nan"):
            with self.subTest(minimum=minimum):
                result = self.gate([("NORMAL", "KILLED")], minimum, jobs=1)
                self.assertEqual(result.returncode, 2)
                self.assertIn("minimum must be between 0 and 100", result.stderr)
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / "missing.sqlite"
            result = subprocess.run([sys.executable, str(CLI), str(missing), "0"], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(missing.exists())
