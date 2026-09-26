import type { AdminSpaceDetail, AdminSpaceRow, SubSpaceRequestType } from './api/apex';

/*
 * Space hierarchy rules for the Apex hierarchy screen, ported from Apex web.
 * Every action files a sub-space request that is then reviewed in the queue.
 *  - A REGULAR space must become SUPER before it can hold children.
 *  - A SUPER space can drop back to REGULAR only once it has no children.
 *  - A space has at most one parent, and a parent must be SUPER (picking a
 *    REGULAR parent files CONVERT_AND_JOIN, which promotes it first).
 */

export type HierarchyAction =
  | 'CONVERT_TO_SUPER'
  | 'CONVERT_TO_REGULAR'
  | 'ASSIGN_PARENT'
  | 'ASSIGN_CHILD'
  | 'REMOVE_CHILD'
  | 'REMOVE_PARENT';

export const ACTION_LABEL: Record<HierarchyAction, string> = {
  CONVERT_TO_SUPER: 'Convert to parent space',
  CONVERT_TO_REGULAR: 'Convert back to regular',
  ASSIGN_PARENT: 'Put under a parent space',
  ASSIGN_CHILD: 'Add a child space',
  REMOVE_CHILD: 'Remove a child space',
  REMOVE_PARENT: 'Detach from parent',
};

export const needsPicker = (a: HierarchyAction | null) => a === 'ASSIGN_PARENT' || a === 'ASSIGN_CHILD' || a === 'REMOVE_CHILD';

export function availableActions(space: AdminSpaceDetail): HierarchyAction[] {
  const isSuper = space.type === 'SUPER';
  const hasParent = Boolean(space.parentSpaceId ?? space.parentSpace);
  const children = space._count?.childSpaces ?? 0;
  const list: HierarchyAction[] = [];
  if (!isSuper) list.push('CONVERT_TO_SUPER');
  if (!hasParent) list.push('ASSIGN_PARENT');
  if (isSuper) {
    list.push('ASSIGN_CHILD');
    list.push(children > 0 ? 'REMOVE_CHILD' : 'CONVERT_TO_REGULAR');
  }
  if (hasParent) list.push('REMOVE_PARENT');
  return list;
}

/** True when `candidate` sits somewhere under `spaceId` (picking it as parent would make a cycle). */
function isDescendant(candidate: AdminSpaceRow, spaceId: string, byId: Map<string, AdminSpaceRow>): boolean {
  let cursor = candidate.parentSpace?.id ?? null;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === spaceId) return true;
    if (seen.has(cursor)) break;
    seen.add(cursor);
    cursor = byId.get(cursor)?.parentSpace?.id ?? null;
  }
  return false;
}

/** Spaces the picker should offer for `action`. */
export function pickerOptions(action: HierarchyAction, spaceId: string, all: AdminSpaceRow[]): AdminSpaceRow[] {
  const others = all.filter((s) => s.id !== spaceId);
  if (action === 'ASSIGN_CHILD') return others.filter((s) => !s.parentSpace);
  if (action === 'REMOVE_CHILD') return others.filter((s) => s.parentSpace?.id === spaceId);
  if (action === 'ASSIGN_PARENT') {
    const byId = new Map(all.map((s) => [s.id, s]));
    return others.filter((s) => !isDescendant(s, spaceId, byId));
  }
  return [];
}

/** Map the chosen action (+ picked space) to the backend request body. */
export function buildRequest(
  action: HierarchyAction,
  space: AdminSpaceDetail,
  picked: AdminSpaceRow | null,
): { requestType: SubSpaceRequestType; targetSpaceId: string; subSpaceId?: string } {
  switch (action) {
    case 'CONVERT_TO_SUPER':
    case 'CONVERT_TO_REGULAR':
      return { requestType: action, targetSpaceId: space.id };
    case 'ASSIGN_PARENT':
      return { requestType: picked?.type === 'SUPER' ? 'JOIN_SUPER' : 'CONVERT_AND_JOIN', targetSpaceId: picked!.id, subSpaceId: space.id };
    case 'ASSIGN_CHILD':
      return { requestType: 'JOIN_SUPER', targetSpaceId: space.id, subSpaceId: picked!.id };
    case 'REMOVE_CHILD':
      return { requestType: 'REMOVE_CHILD', targetSpaceId: space.id, subSpaceId: picked!.id };
    case 'REMOVE_PARENT':
      return { requestType: 'REMOVE_PARENT', targetSpaceId: (space.parentSpaceId ?? space.parentSpace?.id)!, subSpaceId: space.id };
  }
}
