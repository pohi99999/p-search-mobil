import * as React from 'react';
import { useInterstitialAd } from '../useInterstitialAd';
import { useBilling } from '../../context/BillingContext';
import { InterstitialAd, AdEventType } from 'react-native-google-mobile-ads';
import renderer from 'react-test-renderer';

const act = renderer.act;

jest.mock('../../context/BillingContext');
let mockAdListeners: Record<string, ((event?: any) => void)[]> = {};
let mockShow: jest.Mock;

jest.mock('react-native-google-mobile-ads', () => {
  mockShow = jest.fn().mockResolvedValue(undefined);
  return {
    InterstitialAd: {
      createForAdRequest: jest.fn(() => ({
        addAdEventListener: jest.fn((event: string, callback: (event?: any) => void) => {
          if (!mockAdListeners[event]) {
            mockAdListeners[event] = [];
          }
          mockAdListeners[event].push(callback);
          return () => {
            mockAdListeners[event] = mockAdListeners[event].filter(cb => cb !== callback);
          };
        }),
        load: jest.fn(),
        show: mockShow
      })),
    },
    AdEventType: {
      LOADED: 'loaded',
      CLOSED: 'closed',
      ERROR: 'error',
    },
  };
});

const fireAdEvent = (event: string, payload?: any) => {
  if (mockAdListeners[event]) {
    mockAdListeners[event].forEach(cb => cb(payload));
  }
};

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
    mockAdListeners = {};
    // Suppress logger warnings and errors in tests
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  it('updates isLoaded to true when ad is loaded', () => {
    let hookResult: any;
    act(() => {
      renderer.create(<HookTester isPro={false} onHookResult={(res) => { hookResult = res; }} />);
    });

    expect(hookResult.isLoaded).toBe(false);

    act(() => {
      fireAdEvent(AdEventType.LOADED);
    });

    expect(hookResult.isLoaded).toBe(true);
  });

  it('calls show when ad is loaded and showAdIfAvailable is called', () => {
    let hookResult: any;
    act(() => {
      renderer.create(<HookTester isPro={false} onHookResult={(res) => { hookResult = res; }} />);
    });

    act(() => {
      fireAdEvent(AdEventType.LOADED);
    });

    const onAdFinished = jest.fn();
    hookResult.showAdIfAvailable(onAdFinished);

    expect(mockShow).toHaveBeenCalled();
    expect(onAdFinished).not.toHaveBeenCalled(); // Should not be called immediately if showing
  });

  it('calls onAdFinished and reloads when ad is closed', () => {
    let hookResult: any;
    act(() => {
      renderer.create(<HookTester isPro={false} onHookResult={(res) => { hookResult = res; }} />);
    });

    act(() => {
      fireAdEvent(AdEventType.LOADED);
    });

    const onAdFinished = jest.fn();
    hookResult.showAdIfAvailable(onAdFinished);

    const initialLoadCalls = (InterstitialAd.createForAdRequest as jest.Mock).mock.calls.length;

    act(() => {
      fireAdEvent(AdEventType.CLOSED);
    });

    expect(onAdFinished).toHaveBeenCalled();
    expect(hookResult.isLoaded).toBe(false);
    // Should have called load again
    expect((InterstitialAd.createForAdRequest as jest.Mock).mock.calls.length).toBe(initialLoadCalls + 1);
  });

  it('calls onAdFinished and resets when ad encounters error', () => {
    let hookResult: any;
    act(() => {
      renderer.create(<HookTester isPro={false} onHookResult={(res) => { hookResult = res; }} />);
    });

    act(() => {
      fireAdEvent(AdEventType.LOADED);
    });

    const onAdFinished = jest.fn();
    hookResult.showAdIfAvailable(onAdFinished);

    act(() => {
      fireAdEvent(AdEventType.ERROR, new Error('Ad Error'));
    });

    expect(onAdFinished).toHaveBeenCalled();
    expect(hookResult.isLoaded).toBe(false);
  });

  it('calls onAdFinished immediately when show() rejects', async () => {
    mockShow.mockRejectedValueOnce(new Error('Show Error'));

    let hookResult: any;
    act(() => {
      renderer.create(<HookTester isPro={false} onHookResult={(res) => { hookResult = res; }} />);
    });

    act(() => {
      fireAdEvent(AdEventType.LOADED);
    });

    const onAdFinished = jest.fn();
    await act(async () => {
      hookResult.showAdIfAvailable(onAdFinished);
      // Let promises resolve
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(onAdFinished).toHaveBeenCalled();
  });
});
