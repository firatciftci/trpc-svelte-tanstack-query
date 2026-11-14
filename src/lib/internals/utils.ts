import type {
  QueryClient,
  QueryFunctionContext,
  QueryKey,
} from "@tanstack/svelte-query";
import type { TRPCRequestOptions } from "@trpc/client";
import {
  skipToken,
  experimental_streamedQuery as streamedQuery,
} from "@tanstack/svelte-query";
import type {
  AnyTRPCMutationKey,
  AnyTRPCQueryKey,
  QueryType,
  TRPCMutationKeyWithoutPrefix,
  TRPCQueryKeyWithoutPrefix,
  TRPCQueryKeyWithPrefix,
  TRPCQueryOptionsResult,
} from "#lib/internals/types.js";

export function isObject(value: unknown): value is Record<string, unknown> {
  return value != null && !Array.isArray(value) && typeof value === "object";
}

export function isAsyncIterable<TValue>(
  value: unknown,
): value is AsyncIterable<TValue> {
  return isObject(value) && Reflect.has(value, Symbol.asyncIterator);
}

export function createTRPCOptionsResult(value: {
  path: Array<string>;
}): TRPCQueryOptionsResult["trpc"] {
  return { path: value.path.join(".") };
}

export function isPrefixedQueryKey(
  queryKey: AnyTRPCQueryKey,
): queryKey is TRPCQueryKeyWithPrefix {
  return queryKey.length >= 3;
}

export type QueryKeyData =
  | {
      type: "prefixed";
      prefix: Array<string>;
      path: Array<string>;
      args: TRPCQueryKeyWithoutPrefix[1];
    }
  | {
      type: "unprefixed";
      prefix: undefined;
      path: Array<string>;
      args: TRPCQueryKeyWithoutPrefix[1];
    };

export function readQueryKey(queryKey: AnyTRPCQueryKey): QueryKeyData {
  if (isPrefixedQueryKey(queryKey)) {
    return {
      type: "prefixed",
      prefix: queryKey[0],
      path: queryKey[1],
      args: queryKey[2],
    };
  }
  return {
    type: "unprefixed",
    prefix: undefined,
    path: queryKey[0],
    args: queryKey[1],
  };
}

export function getClientArgs(
  queryKey: AnyTRPCQueryKey,
  opts: { trpc?: TRPCRequestOptions } | undefined,
  infiniteParams?: { pageParam: unknown; direction: "forward" | "backward" },
): readonly [
  path: string,
  input: unknown,
  opts: TRPCRequestOptions | undefined,
] {
  const queryKeyData = readQueryKey(queryKey);

  let input = queryKeyData.args?.input;
  if (infiniteParams != null) {
    input = {
      ...(isObject(queryKeyData.args?.input) && queryKeyData.args.input),
      ...(infiniteParams.pageParam !== undefined && {
        cursor: infiniteParams.pageParam,
      }),
      direction: infiniteParams.direction,
    };
  }
  return [queryKeyData.path.join("."), input, opts?.trpc] as const;
}

export async function streamIntoQuery(opts: {
  iterable: AsyncIterable<unknown>;
  context: QueryFunctionContext<QueryKey>;
  queryClient: QueryClient;
  abortController: AbortController;
}): Promise<unknown> {
  const context =
    (opts.context as { client?: QueryClient }).client == null
      ? { ...opts.context, client: opts.queryClient }
      : opts.context;
  const progress = { isFinished: false };
  const { iterable } = opts;
  async function* readToEnd(): AsyncGenerator<unknown, void> {
    yield* iterable;
    progress.isFinished = true;
  }
  try {
    return await streamedQuery<unknown>({ streamFn: readToEnd })(context);
  } finally {
    if (!progress.isFinished) {
      opts.abortController.abort();
    }
  }
}

export function getQueryKeyInternal(opts: {
  path: Array<string>;
  input?: unknown;
  type: QueryType;
  prefix: string | undefined;
}): AnyTRPCQueryKey {
  const { input, type } = opts;
  const splitPath = opts.path.flatMap((part) => part.split("."));

  const key = ((): TRPCQueryKeyWithoutPrefix | [] => {
    if (input === undefined && type === "any") {
      return splitPath.length > 0 ? [splitPath] : [];
    }

    if (
      type === "infinite" &&
      isObject(input) &&
      ("direction" in input || "cursor" in input)
    ) {
      const {
        cursor: _cursor,
        direction: _direction,
        ...inputWithoutCursorAndDirection
      } = input;
      return [
        splitPath,
        { input: inputWithoutCursorAndDirection, type: "infinite" },
      ];
    }

    return [
      splitPath,
      {
        ...(input !== undefined && input !== skipToken && { input }),
        ...(type !== "any" && { type }),
      },
    ];
  })();

  if (opts.prefix != null && opts.prefix !== "") {
    return [[opts.prefix], ...key] as TRPCQueryKeyWithPrefix;
  }
  return key as TRPCQueryKeyWithoutPrefix;
}

export function getMutationKeyInternal(opts: {
  prefix: string | undefined;
  path: Array<string>;
}): AnyTRPCMutationKey {
  const key: TRPCMutationKeyWithoutPrefix = [
    opts.path.flatMap((part) => part.split(".")),
  ];

  if (opts.prefix != null && opts.prefix !== "") {
    return [[opts.prefix], ...key];
  }
  return key;
}

export function unwrapLazyArg<T>(valueOrLazy: T | (() => T)): T {
  return typeof valueOrLazy === "function"
    ? (valueOrLazy as () => T)()
    : valueOrLazy;
}
