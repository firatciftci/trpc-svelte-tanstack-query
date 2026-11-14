import type { TRPCClientError, TRPCClientErrorLike } from "@trpc/client";
import type {
  AnyTRPCRouter,
  TRPC_ERROR_CODE_KEY,
  TRPCDefaultErrorShape,
  TRPCError,
} from "@trpc/server";
import { isTRPCClientError } from "@trpc/client";
import { getTRPCErrorFromUnknown } from "@trpc/server";
import type { FeatureFlags, ResolverDef } from "#lib/internals/types.js";
import { isObject } from "#lib/internals/utils.js";

export type ErrorOf<TDef extends ResolverDef> = TRPCClientErrorLike<{
  transformer: TDef["transformer"];
  errorShape: TDef["errorShape"];
}>;

type DefaultEntryDef = {
  input: unknown;
  output: unknown;
  transformer: boolean;
  errorShape: TRPCDefaultErrorShape;
  featureFlags: FeatureFlags;
};

/**
What `loadHandles()` rejects with when a fetch or ensure entry fails. It names the entry, and keeps the request's
error as `cause`.
*/
export class TRPCEntryError<
  TDef extends ResolverDef = DefaultEntryDef,
> extends Error {
  /**
  The entry's key in the object passed to `loadHandles()`.
  */
  readonly key: string;
  /**
  The procedure's path, such as `post.byId`.
  */
  readonly path: string;
  /**
  The tRPC error code, such as `NOT_FOUND`, when the error has one.
  */
  readonly code: TRPC_ERROR_CODE_KEY | undefined;
  /**
  The request's error: a `TRPCError` on a proxy created with `router`, and a `TRPCClientError` on one created with
  `client`.
  */
  override readonly cause: ErrorOf<TDef> | TRPCError;

  constructor(opts: {
    key: string;
    path: string;
    code: TRPC_ERROR_CODE_KEY | undefined;
    cause: ErrorOf<TDef> | TRPCError;
  }) {
    super(`Entry "${opts.key}" (${opts.path}) failed: ${opts.cause.message}`);
    this.name = "TRPCEntryError";
    this.cause = opts.cause;
    this.key = opts.key;
    this.path = opts.path;
    this.code = opts.code;
  }
}

function codeOfShape(data: unknown): TRPC_ERROR_CODE_KEY | undefined {
  const code = isObject(data) ? data.code : undefined;
  return typeof code === "string" ? (code as TRPC_ERROR_CODE_KEY) : undefined;
}

export function entryCause(error: unknown): {
  cause: TRPCClientError<AnyTRPCRouter> | TRPCError;
  code: TRPC_ERROR_CODE_KEY | undefined;
} {
  if (isTRPCClientError<AnyTRPCRouter>(error)) {
    return { cause: error, code: codeOfShape(error.data) };
  }
  const cause = getTRPCErrorFromUnknown(error);
  return { cause, code: cause.code };
}
