import { act, render, screen } from '@testing-library/react';
import InstallPage from './page';

function matchMedia(installed = false) {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: jest.fn(() => ({ matches: installed, addEventListener: jest.fn(), removeEventListener: jest.fn() })) });
}

it('shows Safari Home Screen steps on iPhone instead of a download button', () => {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' });
  matchMedia();
  render(<InstallPage />);
  expect(screen.getByRole('heading', { name: 'iPhone and iPad' })).toBeInTheDocument();
  expect(screen.getByText('Add to Home Screen')).toBeInTheDocument();
  expect(screen.getByText('Open as Web App')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Copy CRM address for Safari' })).toBeInTheDocument();
});

it('recognizes a Home Screen app and keeps installation separate from notifications', () => {
  matchMedia(true);
  render(<InstallPage />);
  expect(screen.getByRole('status')).toHaveTextContent('You are using the installed CRM app.');
  expect(screen.getByRole('link', { name: 'Set up phone notifications' })).toHaveAttribute('href', '/notifications');
  expect(screen.queryByText('Add to Home Screen')).not.toBeInTheDocument();
});

it('offers the browser install prompt only when Android supplies one', () => {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Android Chrome' });
  matchMedia();
  render(<InstallPage />);
  expect(screen.queryByRole('button', { name: 'Install CRM' })).not.toBeInTheDocument();
  act(() => window.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), { prompt: jest.fn(), userChoice: Promise.resolve({ outcome: 'dismissed' }) })));
  expect(screen.getByRole('button', { name: 'Install CRM' })).toBeInTheDocument();
});
