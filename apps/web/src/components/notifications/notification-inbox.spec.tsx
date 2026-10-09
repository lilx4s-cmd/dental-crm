import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationBell, NotificationInbox } from './notification-inbox';
import { useStaffNotifications, useReadNotification } from '@/hooks/use-patient-schedule';
jest.mock('@/hooks/use-patient-schedule', () => ({
  useStaffNotifications: jest.fn(),
  useReadNotification: jest.fn(),
}));
it('shows an unread count and opens the exact travel booking from a reminder', () => {
  const mutate = jest.fn();
  (useReadNotification as jest.Mock).mockReturnValue({ mutate });
  (useStaffNotifications as jest.Mock).mockReturnValue({
    data: {
      unread: 1,
      data: [
        {
          id: 'notice',
          title: 'Patient arrival · Fictional Patient',
          body: 'Arrival tomorrow',
          path: '/travel?bookingId=visit-2',
          createdAt: '2026-10-09T10:00:00Z',
          readAt: null,
        },
      ],
    },
  });
  render(
    <>
      <NotificationBell />
      <NotificationInbox />
    </>,
  );
  expect(screen.getByRole('link', { name: 'Notifications, 1 unread' })).toHaveAttribute(
    'href',
    '/notifications',
  );
  const booking = screen.getByRole('link', { name: /Patient arrival/ });
  expect(booking).toHaveAttribute('href', '/travel?bookingId=visit-2');
  fireEvent.click(booking);
  expect(mutate).toHaveBeenCalledWith('notice');
});
