import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { GrantKindBadge, KIND_COLORS } from '../GrantKindBadge';
import { contrastRatio } from '../../test-utils/contrast';

const render = async (el: React.ReactElement) => {
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(el); });
  return tree!;
};

describe('GrantKindBadge', () => {
  it('shows the short word on the list and the parts of a mixed offer on the detail view', async () => {
    const short = JSON.stringify((await render(<GrantKindBadge grantType="Vissza nem térítendő és hitel" />)).toJSON());
    expect(short).toContain('"Vegyes"');
    expect(short).not.toContain('"Vegyes: támogatás és hitel"');
    const detail = JSON.stringify((await render(<GrantKindBadge grantType="Vissza nem térítendő és hitel" variant="detail" />)).toJSON());
    expect(detail).toContain('"Vegyes: támogatás és hitel"');
  });

  it('names the kind for a screen reader', async () => {
    const tree = await render(<GrantKindBadge grantType="hitel" />);
    expect(JSON.stringify(tree.toJSON())).toContain('Típus: Hitel');
  });

  it.each([[null], [''], ['Egyéb']])('renders nothing for %p', async (value) => {
    expect((await render(<GrantKindBadge grantType={value} />)).toJSON()).toBeNull();
  });

  // The stale card has opacity 0.75, so both colours land on the white card blended.
  const onWhite = (hex: string, opacity: number) =>
    '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * opacity + 255 * (1 - opacity)).toString(16).padStart(2, '0')).join('');

  it.each(Object.entries(KIND_COLORS))('%s stays at least 4.5:1, under the stale opacity too', (_kind, { bg, fg }) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(onWhite(fg, 0.75), onWhite(bg, 0.75))).toBeGreaterThanOrEqual(4.5);
  });
});
