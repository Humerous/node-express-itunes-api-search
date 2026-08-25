'use client';

import { useCallback } from 'react';

export const ROUTE_VIEWS = ['search', 'results', 'saved'] as const;
export type RouteView = (typeof ROUTE_VIEWS)[number];

const ROUTES: Record<RouteView, string> = {
  search: '/',
  results: '/results',
  saved: '/shelf',
};

export function useRouteNavigation() {
  const navigateTo = useCallback((view: RouteView) => {
    const route = ROUTES[view];

    if (window.location.pathname === route) {
      window.scrollTo({
        top: 0,
        behavior: 'auto',
      });
      return;
    }

    window.location.assign(route);
  }, []);

  return { navigateTo };
}
