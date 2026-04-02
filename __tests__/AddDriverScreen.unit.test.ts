// __tests__/AddDriverScreen.unit.test.ts
import { closeModal } from '../app/(modals)/add-driver-closeModal';

describe('closeModal', () => {
  it('navigates to finance tab', () => {
    const mockRouter = { replace: jest.fn() };
    closeModal(mockRouter);
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/finance');
  });
});
