import * as React from 'react';
import { useInterstitialAd } from '../useInterstitialAd';
import { useBilling } from '../../context/BillingContext';
import { InterstitialAd } from 'react-native-google-mobile-ads';
import renderer from 'react-test-renderer';

const act = renderer.act;

jest.mock('../../context/BillingContext');
jest.mock('react-native-google-mobile-ads', () => ({
  InterstitialAd: {
    createForAdRequest: jest.fn(() => ({
      addAdEventListener: jest.fn(),
      load: jest.fn(),
      show: jest.fn().mockResolvedValue(undefined)
    })),
  },
  AdEventType: {
    LOADED: 'loaded',
    CLOSED: 'closed',
    ERROR: 'error',
  },
}));

function HookTester({ isPro, onHookResult }: { isPro: boolean, onHookResult: (res: any) => void }) {
  (useBilling as jest.Mock).mockReturnValue({ isPro });
  const result = useInterstitialAd();

  React.useEffect(() => {
    onHookResult(result);
  }, [result, onHookResult]);

  return null;
}

describe('useInterstitialAd', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not load ad when user is Pro', () => {
    act(() => {
      renderer.create(<HookTester isPro={true} onHookResult={() => {}} />);
    });
    expect(InterstitialAd.createForAdRequest).not.toHaveBeenCalled();
  });

  it('immediately calls onAdFinished when user is Pro on showAdIfAvailable', () => {
    let hookResult: any;
    act(() => {
      renderer.create(
        <HookTester
          isPro={true}
          onHookResult={(res) => { hookResult = res; }}
        />
      );
    });

    const onAdFinished = jest.fn();
    hookResult.showAdIfAvailable(onAdFinished);

    expect(onAdFinished).toHaveBeenCalled();
  });

  it('loads ad when user is not Pro', () => {
    act(() => {
      renderer.create(<HookTester isPro={false} onHookResult={() => {}} />);
    });
    expect(InterstitialAd.createForAdRequest).toHaveBeenCalled();
  });
});
