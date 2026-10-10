# Hot Paths

Signal → fix. Confirm each by reading a sample.

- Derivable data rebuilt per keystroke, frame or render → cache it on the value; debounce.
- An immutable collection copied per append → buffer and commit once; store deltas.
- An equality check building strings or lists → compare fields or a version counter.
- A wall-clock timer moving animation or scroll → the frame clock.
- One item's change rebuilds the whole list → per-item subscriptions.
- Independent startup work awaited in sequence → start it together; defer the rest.
