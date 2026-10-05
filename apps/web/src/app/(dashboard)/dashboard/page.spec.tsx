import { render, screen } from '@testing-library/react';
import DashboardPage from './page';
import { useDashboardStats } from '../../../hooks/use-dashboard';
import { pipelineFiltersFromSearch } from '../../../lib/pipeline-filters';

jest.mock('../../../components/coaching/team-attention', () => ({ TeamAttention: () => null }));
jest.mock('next/dynamic', () => () => () => null);
jest.mock('../../../hooks/use-dashboard', () => ({ useDashboardStats: jest.fn(), usePipelineGroups: () => ({ data: [{ stage: 'NEW_DEAL', count: 3 }], isLoading: false }) }));

describe('dashboard navigation on desktop and phone', () => {
  beforeEach(() => {
    (useDashboardStats as jest.Mock).mockReturnValue({ data: { todayStart: '2026-10-05T00:00:00.000Z', todayEnd: '2026-10-06T00:00:00.000Z', todayDate: '2026-10-05', leadsToday: 3, leadsTotal: 7, patientsTotal: 2, appointmentsToday: 1, conversionRate: 20 }, isLoading: false });
  });
  it('makes the entire today card a link with the same date window as its count', () => {
    render(<DashboardPage />);
    const card = screen.getByRole('link', { name: 'View Leads Today' });
    expect(card).toContainElement(screen.getByText('Leads Today'));
    const url = new URL(card.getAttribute('href')!, 'https://crm.test.invalid');
    expect(url.pathname).toBe('/pipeline');
    expect(pipelineFiltersFromSearch(url.searchParams)).toEqual({ createdFrom: '2026-10-05T00:00:00.000Z', createdBefore: '2026-10-06T00:00:00.000Z', status: 'ALL' });
  });
  it('opens the other cards and stage totals in the corresponding views', () => {
    render(<DashboardPage />);
    expect(screen.getByRole('link', { name: 'View Total Leads' })).toHaveAttribute('href', '/pipeline');
    expect(screen.getByRole('link', { name: 'View Active Patients' })).toHaveAttribute('href', '/patients');
    expect(screen.getByRole('link', { name: 'View Appts Today' })).toHaveAttribute('href', '/appointments?view=day&date=2026-10-05');
    expect(screen.getByRole('link', { name: 'View Conversion Rate' })).toHaveAttribute('href', '/pipeline?status=WON');
    expect(screen.getByRole('link', { name: /New Deal/ })).toHaveAttribute('href', '/pipeline?stage=NEW_DEAL');
  });
  it('waits for the count before enabling the dashboard card links', () => {
    (useDashboardStats as jest.Mock).mockReturnValue({ isLoading: true });
    render(<DashboardPage />);
    expect(screen.queryByRole('link', { name: 'View Leads Today' })).not.toBeInTheDocument();
  });
});
