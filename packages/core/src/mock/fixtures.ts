/**
 * Deterministic, synthetic fixtures. All ids, names and numbers are invented;
 * no customer data. Ids use the 9xxxxxxxx range to make them obviously fake.
 */
export const MOCK_ACCESS_TOKEN = 'EAAMOCKUSERTOKEN000000000000000000000000DONOTUSE';
export const MOCK_APP_ID = '900000000000001';
export const mockPageToken = (pageId: string): string => `EAAMOCKPAGETOKEN${pageId}DONOTUSE`;

export interface MockPage {
  id: string;
  name: string;
  category: string;
  link: string;
  fan_count: number;
  followers_count: number;
  verification_status: string;
  tasks: string[];
}

export const MOCK_PAGES: MockPage[] = Array.from({ length: 3 }, (_, i) => ({
  id: `90000000000010${i + 1}`,
  name: ['Example Realty Page', 'Sample Homes Page', 'Demo Listings Page'][i]!,
  category: 'Real Estate',
  link: `https://www.facebook.com/90000000000010${i + 1}`,
  fan_count: 1000 * (i + 1),
  followers_count: 1100 * (i + 1),
  verification_status: 'not_verified',
  tasks: ['ADVERTISE', 'ANALYZE', 'CREATE_CONTENT', 'MODERATE'],
}));

export const MOCK_BUSINESSES = [
  {
    id: '900000000000201',
    name: 'Example Business Portfolio',
    verification_status: 'not_verified',
    created_time: '2024-01-15T10:00:00+0000',
  },
  {
    id: '900000000000202',
    name: 'Sample Agency Portfolio',
    verification_status: 'verified',
    created_time: '2023-06-01T08:30:00+0000',
  },
];

export const MOCK_AD_ACCOUNTS = Array.from({ length: 30 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return {
    id: `act_9000000000003${n}`,
    account_id: `9000000000003${n}`,
    name: `Example Ad Account ${n}`,
    account_status: i % 10 === 9 ? 2 : 1,
    currency: i % 2 === 0 ? 'USD' : 'EUR',
    timezone_name: 'America/Los_Angeles',
    amount_spent: String(12345 * (i + 1)),
    business: { id: MOCK_BUSINESSES[0]!.id, name: MOCK_BUSINESSES[0]!.name },
  };
});

export const MOCK_CAMPAIGNS = Array.from({ length: 4 }, (_, i) => ({
  id: `90000000000040${i + 1}`,
  name: `Example Campaign ${i + 1}`,
  status: i === 3 ? 'PAUSED' : 'ACTIVE',
  effective_status: i === 3 ? 'PAUSED' : 'ACTIVE',
  objective: 'OUTCOME_LEADS',
  created_time: '2026-01-10T12:00:00+0000',
  start_time: '2026-01-11T00:00:00+0000',
  daily_budget: '5000',
}));

export const MOCK_LEAD_FORMS = [
  {
    id: '900000000000501',
    name: 'Example Buyer Inquiry Form',
    status: 'ACTIVE',
    locale: 'en_US',
    created_time: '2026-02-01T09:00:00+0000',
  },
  {
    id: '900000000000502',
    name: 'Example Valuation Request Form',
    status: 'ARCHIVED',
    locale: 'en_US',
    created_time: '2025-11-20T09:00:00+0000',
  },
];

export const MOCK_SCOPES = [
  'public_profile',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
  'ads_read',
  'leads_retrieval',
];
