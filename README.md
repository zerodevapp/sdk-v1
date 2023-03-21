# ZeroDev SDK

https://docs.zerodev.app/

## Build

Installing depenedencies via `lerna` (from the root folder):
```
npx lerna bootstrap
```

Building the `@account-abstraction/utils` package (from the root folder):
```
cd packages/utils
npm run hardhat-compile
npm run tsc
```

Building the `@zerodevapp/sdk` package (from the root folder):
```
cd packages/sdk
npm run tsc
```
Check if the `dist` folder exists inside of `@zerodevapp/sdk`. This package is now ready for local development via `npm link` or equivalent.

## Contributing
All contributions are made via PR over GitHub. They need to pass all previous tests, and require test coverage for new code.
The test suite can be run via `npm run test` inside of `package/sdk`.
