import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  // بدون هذا التكامل لا تُنقل نتائج react-query من الخادم إلى المتصفح،
  // فيظهر HTML الخادم مختلفاً عن أول تصيير في المتصفح (React #418).
  setupRouterSsrQueryIntegration({ router, queryClient });

  return router;
};
