// Vitest 5 types Assertion as Assertion<R, T>. jest-dom 7.0.1 still augments
// the old one-parameter Assertion, so those matchers never merge and `tsc`
// (which `yarn build` runs) rejects toHaveAttribute and the rest.
// Matchers<R, T> is the extension point Vitest 5 documents for this.
import type {TestingLibraryMatchers} from "@testing-library/jest-dom/matchers"

declare module "vitest" {
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    T = unknown
  > extends TestingLibraryMatchers<unknown, R> {}
}
