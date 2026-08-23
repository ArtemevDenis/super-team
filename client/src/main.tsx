import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from './app';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Локальная база, один пользователь: перезапрашивать при каждом фокусе
      // окна незачем, а вот свежесть после мутаций обеспечивает инвалидация.
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 10_000,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
