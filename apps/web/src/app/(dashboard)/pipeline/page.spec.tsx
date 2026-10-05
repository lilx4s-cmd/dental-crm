import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PipelinePage from './page';
import { apiRequest } from '../../../lib/api-client';

let mockParams = new URLSearchParams();
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({ useSearchParams: () => mockParams, useRouter: () => ({ replace: mockReplace }) }));
jest.mock('../../../context/auth-context', () => ({ useAuth: () => ({ user: { sub: 'example-owner', role: 'SUPER_ADMIN' }, accessToken: 'test-token' }) }));
jest.mock('../../../lib/api-client', () => ({ apiRequest: jest.fn() }));
jest.mock('../../../hooks/use-users', () => ({ useUsers: () => ({ data: [] }) }));
jest.mock('../../../hooks/use-tags', () => ({ useTags: () => ({ data: [] }) }));
jest.mock('../../../components/pipeline/lead-card', () => ({ LeadCard: () => null }));
jest.mock('../../../components/pipeline/virtual-card-list', () => ({ VirtualCardList: () => null }));
jest.mock('../../../components/pipeline/bulk-action-bar', () => ({ BulkActionBar: () => null }));
jest.mock('../../../components/pipeline/new-lead-dialog', () => ({ NewLeadDialog: () => null }));
jest.mock('../../../components/pipeline/import-leads-dialog', () => ({ ImportLeadsDialog: () => null }));
jest.mock('../../../components/pipeline/duplicates-dialog', () => ({ DuplicatesDialog: () => null }));
jest.mock('../../../components/pipeline/lost-reason-dialog', () => ({ LostReasonDialog: () => null }));
jest.mock('../../../components/pipeline/lead-detail-sheet', () => ({ LeadDetailSheet: () => null }));
jest.mock('../../../components/tags/tag-picker', () => ({ TagPicker: () => null }));

describe('dashboard links open the filtered mobile lead list', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = new URLSearchParams({ createdFrom: '2026-10-05T00:00:00.000Z', createdBefore: '2026-10-06T00:00:00.000Z', status: 'ALL' });
    (apiRequest as jest.Mock).mockResolvedValue([{ stage: 'NEW_DEAL', leads: [{ id: 'synthetic-lead', firstName: 'Example', lastName: 'Lead', stage: 'NEW_DEAL', status: 'ACTIVE' }] }]);
  });
  function show() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><PipelinePage /></QueryClientProvider>);
  }
  it('applies the date window to the first request and displays the returned leads on mobile', async () => {
    show();
    const list = await screen.findByLabelText('Mobile lead list');
    expect(list).toHaveTextContent('Example Lead');
    const request = (apiRequest as jest.Mock).mock.calls.find(([url]) => url.startsWith('/api/leads/by-stage'))![0];
    const params = new URL(request, 'https://crm.test.invalid').searchParams;
    expect(params.get('createdFrom')).toBe('2026-10-05T00:00:00.000Z');
    expect(params.get('createdBefore')).toBe('2026-10-06T00:00:00.000Z');
    expect(params.get('status')).toBe('ALL');
    expect(screen.getByText(/New leads ·/)).toBeInTheDocument();
  });
  it('removes dashboard filters through the visible clear control', async () => {
    show();
    await screen.findByLabelText('Mobile lead list');
    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(mockReplace).toHaveBeenCalledWith('/pipeline', { scroll: false });
  });
  it('reacts to a different dashboard link without reloading the page', async () => {
    const view = show();
    await screen.findByLabelText('Mobile lead list');
    mockParams = new URLSearchParams({ stage: 'CONTACTED' });
    view.rerender(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PipelinePage /></QueryClientProvider>);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/api/leads/by-stage?stage=CONTACTED', {}, 'test-token'));
  });
});
