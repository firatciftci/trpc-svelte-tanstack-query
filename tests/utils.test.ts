import { skipToken } from "@tanstack/svelte-query";
import { describe, expect, it } from "vitest";
import {
  getMutationKeyInternal,
  getQueryKeyInternal,
  readQueryKey,
} from "#lib/internals/utils.js";

describe(getQueryKeyInternal, () => {
  it("creates a query key", () => {
    expect(
      getQueryKeyInternal({
        prefix: undefined,
        path: ["a", "b"],
        input: "input value",
        type: "query",
      }),
    ).toEqual([["a", "b"], { input: "input value", type: "query" }]);
  });

  it("creates a query key with a prefix", () => {
    expect(
      getQueryKeyInternal({
        prefix: "prefix",
        path: ["a", "b"],
        input: "input value",
        type: "query",
      }),
    ).toEqual([
      ["prefix"],
      ["a", "b"],
      { input: "input value", type: "query" },
    ]);
  });

  it("creates a router key", () => {
    expect(
      getQueryKeyInternal({ prefix: undefined, path: ["a", "b"], type: "any" }),
    ).toEqual([["a", "b"]]);
  });

  it("creates a router key with a prefix", () => {
    expect(
      getQueryKeyInternal({ prefix: "prefix", path: ["a", "b"], type: "any" }),
    ).toEqual([["prefix"], ["a", "b"]]);
  });

  it("creates an empty key for the root", () => {
    expect(
      getQueryKeyInternal({ prefix: undefined, path: [], type: "any" }),
    ).toEqual([]);
    expect(
      getQueryKeyInternal({ prefix: "prefix", path: [], type: "any" }),
    ).toEqual([["prefix"]]);
  });

  it("splits dot-separated path parts", () => {
    expect(
      getQueryKeyInternal({
        prefix: undefined,
        path: ["a.b", "c"],
        type: "query",
      }),
    ).toEqual([["a", "b", "c"], { type: "query" }]);
  });

  it("creates an infinite query key", () => {
    expect(
      getQueryKeyInternal({
        prefix: undefined,
        path: ["a", "b"],
        input: 1,
        type: "infinite",
      }),
    ).toEqual([["a", "b"], { input: 1, type: "infinite" }]);
  });

  it("creates an infinite query key with a prefix", () => {
    expect(
      getQueryKeyInternal({
        prefix: "prefix",
        path: ["a", "b"],
        input: 1,
        type: "infinite",
      }),
    ).toEqual([["prefix"], ["a", "b"], { input: 1, type: "infinite" }]);
  });

  it("strips the cursor and direction from an infinite query key", () => {
    expect(
      getQueryKeyInternal({
        prefix: undefined,
        path: ["a"],
        input: { cursor: 1, direction: "forward", limit: 10 },
        type: "infinite",
      }),
    ).toEqual([["a"], { input: { limit: 10 }, type: "infinite" }]);
  });

  it("leaves skipToken out of the key", () => {
    expect(
      getQueryKeyInternal({
        prefix: undefined,
        path: ["a"],
        input: skipToken,
        type: "query",
      }),
    ).toEqual([["a"], { type: "query" }]);
  });

  it('keeps falsy inputs in an "any" key', () => {
    for (const input of [0, false, "", null]) {
      expect(
        getQueryKeyInternal({
          prefix: undefined,
          path: ["a", "b"],
          input,
          type: "any",
        }),
      ).toEqual([["a", "b"], { input }]);
    }
  });
});

describe(getMutationKeyInternal, () => {
  it("creates a mutation key", () => {
    expect(
      getMutationKeyInternal({ prefix: undefined, path: ["a.b", "c"] }),
    ).toEqual([["a", "b", "c"]]);
  });

  it("creates a mutation key with a prefix", () => {
    expect(getMutationKeyInternal({ prefix: "prefix", path: ["a"] })).toEqual([
      ["prefix"],
      ["a"],
    ]);
  });
});

describe(readQueryKey, () => {
  type QueryKeyData = ReturnType<typeof readQueryKey>;

  it("reads a query key", () => {
    expect(
      readQueryKey([["a", "b"], { input: "input value", type: "query" }]),
    ).toEqual<QueryKeyData>({
      type: "unprefixed",
      prefix: undefined,
      path: ["a", "b"],
      args: { input: "input value", type: "query" },
    });
  });

  it("reads a prefixed query key", () => {
    expect(
      readQueryKey([
        ["prefix"],
        ["a", "b"],
        { input: "input value", type: "query" },
      ]),
    ).toEqual<QueryKeyData>({
      type: "prefixed",
      prefix: ["prefix"],
      path: ["a", "b"],
      args: { input: "input value", type: "query" },
    });
  });
});
