/** The editor's optimistic list rules (src/components/profile/items-state.ts): order, moves, positions, rollback inputs. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { globalOrder, isTempId, itemsOfKind, moveWithinKind, nextPosition, placeOf, removeItem, replaceItem, tempId, type EditorItem } from '../src/components/profile/items-state.ts';

let n = 0;
function item(kind: EditorItem['kind'], position: number, id = `id-${++n}`): EditorItem {
  return { id, profileId: 'p', kind, position, content: { name: id }, tags: [], createdAt: `2026-10-22T00:00:0${n % 10}Z`, updatedAt: '' };
}

test('items of a kind come in position order, then creation order, then id', () => {
  const items = [item('skill', 2, 's2'), item('experience', 0, 'e0'), item('skill', 1, 's1'), item('skill', 1, 's1b')];
  assert.deepEqual(itemsOfKind(items, 'skill').map((i) => i.id), ['s1', 's1b', 's2']);
  assert.deepEqual(itemsOfKind(items, 'link'), []);
});

test('global order groups kinds in the editor order (experience before skills), each in its own order', () => {
  const items = [item('skill', 0, 's'), item('experience', 5, 'e2'), item('experience', 1, 'e1'), item('link', 3, 'l')];
  assert.deepEqual(globalOrder(items), ['e1', 'e2', 's', 'l']);
});

test('a move swaps neighbours of the same kind only and renumbers positions 0..n-1 in global order', () => {
  const items = [item('experience', 0, 'a'), item('experience', 1, 'b'), item('experience', 2, 'c'), item('skill', 3, 'x')];
  const moved = moveWithinKind(items, 'c', -1);
  assert.ok(moved);
  assert.deepEqual(itemsOfKind(moved, 'experience').map((i) => i.id), ['a', 'c', 'b']);
  assert.deepEqual(globalOrder(moved), ['a', 'c', 'b', 'x']);
  assert.deepEqual(
    moved.map((i) => [i.id, i.position]),
    [
      ['a', 0],
      ['c', 1],
      ['b', 2],
      ['x', 3],
    ],
  );
  assert.equal(moveWithinKind(items, 'a', -1), null, 'first cannot go up');
  assert.equal(moveWithinKind(items, 'c', 1), null, 'last cannot go down');
  assert.equal(moveWithinKind(items, 'x', 1), null, 'a skill does not cross into another kind');
  assert.equal(moveWithinKind(items, 'nope', 1), null);
  assert.deepEqual(items.map((i) => i.id), ['a', 'b', 'c', 'x'], 'the input is never mutated (it is the rollback snapshot)');
});

test('place, next position, temp ids, replace and remove', () => {
  const items = [item('award', 4, 'w1'), item('award', 9, 'w2')];
  assert.deepEqual(placeOf(items, 'w2'), { place: 2, of: 2 });
  assert.equal(placeOf(items, 'zzz'), null);
  assert.equal(nextPosition(items), 10);
  assert.equal(nextPosition([]), 0);
  assert.equal(isTempId(tempId(3)), true);
  assert.equal(isTempId('0b6f3c1e-8a4d-4f7e-9c2a-1d5e6f7a8b9c'), false);
  const replaced = replaceItem(items, 'w1', { ...items[0]!, tags: ['x'] });
  assert.deepEqual(replaced[0]?.tags, ['x']);
  assert.deepEqual(items[0]?.tags, []);
  assert.deepEqual(removeItem(items, 'w1').map((i) => i.id), ['w2']);
});
