import { deepEqual } from "fast-equals";
import {
  KApply,
  KInner,
  KRewrite,
  KToken,
  bottomUp,
  bottomUpAsync,
} from "./inner";

export function indexedRewrite(
  kast: KInner,
  rewrites: Iterable<KRewrite>
): KInner {
  const tokenRewrites: KRewrite[] = [];
  const applyRewrites: Record<string, KRewrite[]> = {};
  const otherRewrites: KRewrite[] = [];

  for (const r of rewrites) {
    if (r.lhs instanceof KToken) {
      tokenRewrites.push(r);
    } else if (r.lhs instanceof KApply) {
      const labelName = r.lhs.label.name;
      if (labelName in applyRewrites) {
        applyRewrites[labelName]!.push(r);
      } else {
        applyRewrites[labelName] = [r];
      }
    } else {
      otherRewrites.push(r);
    }
  }

  function applyRewritesInner(kast: KInner): KInner {
    let result = kast;

    if (result instanceof KToken) {
      for (const tr of tokenRewrites) {
        result = tr.applyTop(result);
      }
    } else if (result instanceof KApply) {
      const labelName = result.label.name;
      if (labelName in applyRewrites) {
        for (const ar of applyRewrites[labelName]!) {
          result = ar.applyTop(result);
        }
      }
    } else {
      for (const or of otherRewrites) {
        result = or.applyTop(result);
      }
    }

    return result;
  }

  let origKast: KInner = kast;
  let newKast: KInner | null = null;

  while (newKast === null || !deepEqual(origKast, newKast)) {
    if (newKast === null) {
      newKast = origKast;
    } else {
      origKast = newKast;
    }
    newKast = bottomUp(applyRewritesInner, newKast);
  }

  return newKast;
}

/**
 * Async version of indexedRewrite that yields control periodically to prevent stack overflow.
 */
export async function indexedRewriteAsync(
  kast: KInner,
  rewrites: Iterable<KRewrite>,
  yieldFrequency: number = 100
): Promise<KInner> {
  console.log("indexedRewriteAsync: Starting, about to process rewrites");
  const tokenRewrites: KRewrite[] = [];
  const applyRewrites: Record<string, KRewrite[]> = {};
  const otherRewrites: KRewrite[] = [];

  let rewriteCount = 0;
  for (const r of rewrites) {
    rewriteCount++;
    if (r.lhs instanceof KToken) {
      tokenRewrites.push(r);
    } else if (r.lhs instanceof KApply) {
      const labelName = r.lhs.label.name;
      if (labelName in applyRewrites) {
        applyRewrites[labelName]!.push(r);
      } else {
        applyRewrites[labelName] = [r];
      }
    } else {
      otherRewrites.push(r);
    }
  }
  console.log(
    "indexedRewriteAsync: Processed",
    rewriteCount,
    "rewrites. Tokens:",
    tokenRewrites.length,
    "Apply:",
    Object.keys(applyRewrites).length,
    "Other:",
    otherRewrites.length
  );

  function applyRewritesInner(kast: KInner): KInner {
    let result = kast;

    if (result instanceof KToken) {
      for (const tr of tokenRewrites) {
        result = tr.applyTop(result);
      }
    } else if (result instanceof KApply) {
      const labelName = result.label.name;
      if (labelName in applyRewrites) {
        for (const ar of applyRewrites[labelName]!) {
          result = ar.applyTop(result);
        }
      }
    } else {
      for (const or of otherRewrites) {
        result = or.applyTop(result);
      }
    }

    return result;
  }

  console.log("indexedRewriteAsync: Starting rewrite loop");
  let origKast: KInner = kast;
  let newKast: KInner | null = null;
  let iterations = 0;

  while (newKast === null || !deepEqual(origKast, newKast)) {
    iterations++;
    console.log("indexedRewriteAsync: Iteration", iterations);
    if (newKast === null) {
      newKast = origKast;
    } else {
      origKast = newKast;
    }
    console.log("indexedRewriteAsync: About to call bottomUpAsync");
    newKast = await bottomUpAsync(applyRewritesInner, newKast, yieldFrequency);
    console.log(
      "indexedRewriteAsync: Finished bottomUpAsync, checking for changes"
    );

    // Add safety check for infinite loops
    if (iterations > 1000) {
      console.error(
        "indexedRewriteAsync: Too many iterations, breaking to prevent infinite loop"
      );
      break;
    }
  }

  console.log("indexedRewriteAsync: Finished after", iterations, "iterations");
  return newKast || kast; // Return original if newKast is null
}
