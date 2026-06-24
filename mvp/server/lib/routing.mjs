const EPSILON = 1e-9;

function partition(reps) {
  const pinned = reps.filter((rep) => rep.weightPct != null);
  const flexible = reps.filter((rep) => rep.weightPct == null);
  const sumPinned = pinned.reduce((sum, rep) => sum + rep.weightPct, 0);
  return { pinned, flexible, sumPinned };
}

export function computeEffectiveWeights(reps) {
  const { flexible, sumPinned } = partition(reps);
  const remainder = Math.max(0, 100 - sumPinned);
  const flexShare = flexible.length > 0 ? remainder / flexible.length : 0;

  const weights = new Map();
  for (const rep of reps) {
    const pct = rep.weightPct != null ? rep.weightPct : flexShare;
    weights.set(rep.id, pct / 100);
  }
  return weights;
}

export function validateWeights(reps) {
  const { pinned, flexible, sumPinned } = partition(reps);

  const outOfRange = pinned.find((rep) => rep.weightPct < 0 || rep.weightPct > 100);
  if (outOfRange) {
    return { ok: false, error: "Un pourcentage épinglé doit être compris entre 0 et 100." };
  }
  if (sumPinned > 100 + EPSILON) {
    return { ok: false, error: `La somme des pourcentages épinglés (${sumPinned}) dépasse 100.` };
  }
  if (flexible.length === 0 && Math.abs(sumPinned - 100) > EPSILON) {
    return {
      ok: false,
      error: `Tous les reps sont épinglés mais la somme (${sumPinned}) n'est pas égale à 100.`,
    };
  }
  if (flexible.length > 0 && Math.abs(sumPinned - 100) <= EPSILON) {
    return { ok: true, warning: "benched" };
  }
  return { ok: true };
}

export function selectRep(availableReps) {
  if (availableReps.length === 0) {
    return null;
  }

  const total = availableReps.reduce((sum, rep) => sum + rep.rollingCount, 0);
  const chosen = [...availableReps]
    .map((rep) => ({ rep, deficit: (total + 1) * rep.effectiveWeight - rep.rollingCount }))
    .sort((left, right) => {
      if (Math.abs(right.deficit - left.deficit) > EPSILON) {
        return right.deficit - left.deficit;
      }
      if (left.rep.sortOrder !== right.rep.sortOrder) {
        return left.rep.sortOrder - right.rep.sortOrder;
      }
      return left.rep.id.localeCompare(right.rep.id);
    })[0].rep;

  return {
    rep: chosen,
    reason: {
      candidateRepIds: availableReps.map((rep) => rep.id),
      effectiveWeights: Object.fromEntries(
        availableReps.map((rep) => [rep.id, rep.effectiveWeight]),
      ),
      rollingCounts: Object.fromEntries(
        availableReps.map((rep) => [rep.id, rep.rollingCount]),
      ),
    },
  };
}
