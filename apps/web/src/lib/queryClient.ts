import { QueryClient } from '@tanstack/react-query';
import { CACHE_TIMES } from '@sensads/core';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: CACHE_TIMES.default,
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});
