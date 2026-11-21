/**
 * Minimum-cost assignment (the Hungarian algorithm, Kuhn–Munkres with
 * potentials, O(n²m)). Matches detected lights to fingers in Dark mode and
 * targets to lights in pattern scoring.
 */

/**
 * For a cost matrix of `rows` × `cols`, the column each row gets so the total
 * cost is least: -1 for the rows left over when there are more rows than
 * columns. Every row and column is used at most once.
 */
export function assign(cost: readonly (readonly number[])[]): number[] {
  const rows = cost.length;
  if (rows === 0) return [];
  const cols = (cost[0] as readonly number[]).length;
  if (cols === 0) return cost.map(() => -1);
  if (rows > cols) {
    // Solve the transpose, then read it back by row
    const transposed = Array.from({ length: cols }, (_, c) => cost.map(row => row[c] as number));
    const byCol = assign(transposed);
    const byRow = cost.map(() => -1);
    byCol.forEach((row, col) => {
      byRow[row] = col;
    });
    return byRow;
  }

  // 1-based arrays, as in the classic formulation; column 0 is the virtual start
  const u = new Array<number>(rows + 1).fill(0);
  const v = new Array<number>(cols + 1).fill(0);
  const owner = new Array<number>(cols + 1).fill(0); // the row each column is matched to
  const way = new Array<number>(cols + 1).fill(0);
  for (let row = 1; row <= rows; row++) {
    owner[0] = row;
    let col0 = 0;
    const minv = new Array<number>(cols + 1).fill(Number.POSITIVE_INFINITY);
    const used = new Array<boolean>(cols + 1).fill(false);
    do {
      used[col0] = true;
      const row0 = owner[col0] as number;
      let delta = Number.POSITIVE_INFINITY;
      let col1 = 0;
      for (let col = 1; col <= cols; col++) {
        if (used[col]) continue;
        const reduced = (cost[row0 - 1] as readonly number[])[col - 1]! - (u[row0] as number) - (v[col] as number);
        if (reduced < (minv[col] as number)) {
          minv[col] = reduced;
          way[col] = col0;
        }
        if ((minv[col] as number) < delta) {
          delta = minv[col] as number;
          col1 = col;
        }
      }
      for (let col = 0; col <= cols; col++) {
        if (used[col]) {
          u[owner[col] as number] = (u[owner[col] as number] as number) + delta;
          v[col] = (v[col] as number) - delta;
        } else {
          minv[col] = (minv[col] as number) - delta;
        }
      }
      col0 = col1;
    } while (owner[col0] !== 0);
    do {
      const col1 = way[col0] as number;
      owner[col0] = owner[col1] as number;
      col0 = col1;
    } while (col0 !== 0);
  }

  const result = new Array<number>(rows).fill(-1);
  for (let col = 1; col <= cols; col++) {
    const row = owner[col] as number;
    if (row !== 0) result[row - 1] = col - 1;
  }
  return result;
}

/** The total cost of an assignment from `assign`. */
export function totalCost(cost: readonly (readonly number[])[], assignment: readonly number[]): number {
  return assignment.reduce((sum, col, row) => (col < 0 ? sum : sum + (cost[row] as readonly number[])[col]!), 0);
}
