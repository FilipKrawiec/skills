# Issue example

One filled issue body:

````text
Title: feat(auth): expired sessions read as signed out

## Summary
Part of epic #40. An expired session returns 401.

### Acceptance criteria
- [ ] `readSession` returns null once `expiresAt` is past.
- [ ] A live session still returns its user.

```scope
{"paths": ["src/auth/", "test/auth/"], "dependencies": []}
```
````
