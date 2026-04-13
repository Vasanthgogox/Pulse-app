// __tests__/AddDriverScreen.unit.test.ts
import { closeModal } from '../app/(modals)/add-driver-closeModal';

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));

describe('closeModal', () => {
  it('calls back when navigation history exists', () => {
    const mockRouter = { canGoBack: () => true, back: jest.fn(), replace: jest.fn() };
    closeModal(mockRouter as never);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it('replaces with Network tab when there is nothing to pop', () => {
    const mockRouter = { canGoBack: () => false, back: jest.fn(), replace: jest.fn() };
    closeModal(mockRouter as never);
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/network');
  });
});
