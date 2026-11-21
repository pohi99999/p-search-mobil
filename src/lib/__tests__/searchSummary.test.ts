import { searchSummaryText } from '../searchSummary';

describe('searchSummaryText (vc23 L3)', () => {
  it('names the open grants weighed and the ones that fit', () => {
    expect(searchSummaryText({ matchesFound: 6, candidatesConsidered: 60 })).toBe('60 nyitott kiírást néztünk át, 6 illik a cégedhez.');
  });
  it('says so when none fits', () => {
    expect(searchSummaryText({ matchesFound: 0, candidatesConsidered: 52 })).toBe('52 nyitott kiírást néztünk át, most egyik sem illik a cégedhez.');
  });
  it('claims no count the server did not send', () => {
    expect(searchSummaryText({ matchesFound: 3, candidatesConsidered: 0 })).toBe('Lefuttattuk a keresést, 3 illik a cégedhez.');
  });
});
