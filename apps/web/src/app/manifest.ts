import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Venedik CRM',
    short_name: 'Venedik CRM',
    description: 'Clinic leads, conversations and follow-up',
    start_url: '/my-day',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#12665d',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
