# SHIP Phase Run

Use one SHIP run to prepare the Candidate Result, suspend in `AWAITING_ACCEPTANCE`, and finalize delivery after approval. Acceptance Decision binds to candidate artifact ID and digest.

Recover delivery/infrastructure friction locally without discarding reviewed implementation. After the bounded Recovery Window, enter `WAITING_FOR_HUMAN`. Human Intervention starts a fresh window; these HIL-gated cycles may repeat. Approval remains valid only while the candidate digest is unchanged. Rejection cancels SHIP, rejects Task Execution, and moves Task to IMPROVE.
