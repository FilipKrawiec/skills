# Design-system gate

One design system per project, no cross-project kit: feature code composes the project's own component library, and a missing primitive is added to the library first, never inline in the feature.

`init --library PATH` (the directory of that library, relative to the project root) copies `scripts/design-system-gate.mjs` into the project and adds a `design-system-gate` justfile recipe that runs it with the path.

- The gate fails a raw React `<button>`, `<input>` or `<select>` (also when its attributes start on the next lines) in `.jsx` and `.tsx` feature code, and a raw Flutter Material widget (`ElevatedButton`, `TextField` and the like) in `.dart` feature code, outside the library path. The same element inside the path passes. Test files are skipped.
- Add `design-system-gate` to the project's `verify` recipe yourself: `init` does not edit existing recipes and lists the step among what it could not do, because a gate outside `verify` never fails a pull request.
- Without `--library`, `init` installs no gate and lists the missing setting among what it could not do.
