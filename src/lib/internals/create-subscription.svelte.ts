import { hashKey } from "@tanstack/svelte-query";
import { untrack } from "svelte";
import type {
  TRPCSubscriptionOptionsOut,
  TRPCSubscriptionResult,
  TRPCSubscriptionStatus,
} from "#lib/internals/subscription-options.js";
import type { FeatureFlags } from "#lib/internals/types.js";

/**
Runs a subscription while the component that calls it is mounted. Pass a function that returns the options, so the
subscription restarts when its input or `enabled` changes.

@example
```svelte
<script lang="ts">
  const trpc = useTRPC();
  const subscription = createSubscription(() => trpc.chat.onMessage.subscriptionOptions({ roomId }));
</script>

{#if subscription.status === "pending"}
  <p>{subscription.data?.text}</p>
{/if}
```
*/
const noop = (): void => {};

export function createSubscription<TOutput, TError>(
  options: () => TRPCSubscriptionOptionsOut<TOutput, TError, FeatureFlags>,
): TRPCSubscriptionResult<TOutput, TError> {
  type State = {
    status: TRPCSubscriptionStatus;
    data: TOutput | undefined;
    error: TError | null;
  };

  const opts = $derived(options());
  const queryHash = $derived(hashKey(opts.queryKey));
  const isEnabled = $derived(opts.enabled);

  const initialState = (isEnabled: boolean): State => ({
    status: isEnabled ? "connecting" : "idle",
    data: undefined,
    error: null,
  });

  let state = $state.raw<State>(initialState(untrack(() => isEnabled)));
  let stop: () => void = noop;

  const latest = (): TRPCSubscriptionOptionsOut<
    TOutput,
    TError,
    FeatureFlags
  > => untrack(() => opts);

  const teardown = (): void => {
    stop();
    stop = noop;
  };

  function reset(): void {
    teardown();
    const current = latest();
    state = initialState(current.enabled);
    if (!current.enabled) {
      return;
    }

    let isUnsubscribed = false;
    let isEnded = false;
    const setEnded = (): void => {
      if (isEnded) {
        return;
      }
      isEnded = true;
      state = { status: "idle", data: undefined, error: null };
    };

    const subscription = current.subscribe({
      onStarted: () => {
        latest().onStarted?.();
        state = { ...state, status: "pending", error: null };
      },
      onData: (data) => {
        latest().onData?.(data);
        state = { status: "pending", data: data as TOutput, error: null };
      },
      onError: (error) => {
        latest().onError?.(error);
        state = { ...state, status: "error", error };
      },
      onStopped: () => {
        if (isUnsubscribed) {
          return;
        }
        setEnded();
        latest().onStopped?.();
      },
      onComplete: () => {
        if (isUnsubscribed) {
          return;
        }
        setEnded();
        latest().onComplete?.();
      },
      onConnectionStateChange: (result) => {
        latest().onConnectionStateChange?.(result);
        if (result.state === "connecting") {
          state = { ...state, status: "connecting", error: result.error };
        } else if (result.state === "idle") {
          state = { status: "idle", data: undefined, error: null };
        }
      },
    });

    stop = () => {
      isUnsubscribed = true;
      subscription.unsubscribe();
    };
  }

  $effect(() => {
    void queryHash;
    void isEnabled;
    untrack(reset);
    return teardown;
  });

  return {
    get status() {
      return state.status;
    },
    get data() {
      return state.data;
    },
    get error() {
      return state.error;
    },
    reset,
  } as TRPCSubscriptionResult<TOutput, TError>;
}
