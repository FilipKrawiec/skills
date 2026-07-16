# SHIP Phase

`sdlc-execute` owns this Phase inside the EXECUTE Stage. Prepare the Candidate Result, suspend for human acceptance when required, and record the acceptance decision in the completed Lifecycle result. Approval binds to the candidate artifact ID and digest.

Recover delivery or infrastructure friction without discarding a reviewed, unchanged candidate. If the candidate changes, append correction work and a fresh REVIEW before requesting acceptance again. Rejection ends delivery and requests IMPROVE; it does not rewrite the SHIP Phase.
