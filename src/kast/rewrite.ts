import { KApply, KInner, KRewrite, KToken, bottomUp } from "./inner";

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

  while (newKast === null || !origKast.equals(newKast)) {
    if (newKast === null) {
      newKast = origKast;
    } else {
      origKast = newKast;
    }
    newKast = bottomUp(applyRewritesInner, newKast);
  }

  return newKast;
}
