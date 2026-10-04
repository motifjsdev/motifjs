# Contributing to MotifJS

Thanks for taking the time to help. Bug reports, fixes, tests and documentation improvements are all welcome.

For anything larger than a small fix, please open an issue or a discussion first so we can agree on the direction before you spend time on it.

## Setup

You need Node.js 18 or newer.

```bash
npm install
npm run build
npm test
```

| Package | Path |
| --- | --- |
| `@motifx/core` | [`packages/motifjs`](packages/motifjs) |
| `@motifx/compiler` | [`packages/compiler`](packages/compiler) |
| Core test suite | [`packages/tests`](packages/tests) |

## Running tests

The core test suite runs against the built `dist` output of both packages, not against the sources. After changing anything in `packages/motifjs` or `packages/compiler`, build that package again before running the tests. All commands below run from the repository root:

```bash
npm run build -w @motifx/core
npm test -w motifjs-tests
```

Useful variations:

```bash
# one file or folder
npm test -w motifjs-tests -- src/store/reactive-map

# memory and leak tests (run with --expose-gc)
npm run test:memory -w motifjs-tests

# compiler tests
npm test -w @motifx/compiler
```

## Making a change

- Keep a pull request focused on one thing. Two unrelated fixes are easier to review as two pull requests.
- Add a test that fails without your change and passes with it.
- If the change is visible to users, describe the before and after in the pull request.
- New development warnings and reported errors get an `MJX` code and a message in [`diagnostics.ts`](packages/motifjs/src/common/diagnostics.ts).
- Write commit messages as a short summary line in the imperative ("Fix list reorder after splice"), with a body that explains why when it is not obvious.

## Reporting bugs

Please use the bug report form and include a minimal reproduction: the smallest component or snippet that shows the problem, what you expected and what happened instead.

Security issues should not be reported in public issues. See [SECURITY.md](SECURITY.md).

## Code of conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md). By taking part you agree to follow it.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE) of this repository.
