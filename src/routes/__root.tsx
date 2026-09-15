import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { StorefrontCartProvider } from "@/lib/pdv-storefront-cart";
import ksLogo from "@/assets/ks-makeup-logo.jpg.asset.json";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "apple-touch-icon", href: ksLogo.url },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://xclgqgnykhcbmbxofgfq.supabase.co", crossOrigin: "anonymous" },
      { rel: "dns-prefetch", href: "https://xclgqgnykhcbmbxofgfq.supabase.co" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600&display=swap" },
    ],
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#c07f5a" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Estratégia" },
      { title: "Estratégia — Gestão Completa em suas mãos" },
      { name: "description", content: "Estratégia Multistore: plataforma omnichannel com PDV, vitrine online, estoque por lote, CRM, fidelidade, WhatsApp Business e marketplaces." },
      { name: "author", content: "Estratégia" },
      { property: "og:title", content: "Estratégia — Gestão Completa em suas mãos" },
      { property: "og:description", content: "Estratégia Multistore: plataforma omnichannel com PDV, vitrine online, estoque por lote, CRM, fidelidade, WhatsApp Business e marketplaces." },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Estratégia" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@estrategia" },
      { name: "twitter:title", content: "Estratégia — Gestão Completa em suas mãos" },
      { name: "twitter:description", content: "Estratégia Multistore: plataforma omnichannel com PDV, vitrine online, estoque por lote, CRM, fidelidade, WhatsApp Business e marketplaces." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/ed7f48f0-c7ef-4854-bd43-68175a9fb4cc" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/ed7f48f0-c7ef-4854-bd43-68175a9fb4cc" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Estratégia",
          url: "https://project--2e19146c-07b2-4136-9e0a-69efed8cdf20.lovable.app",
          logo: `https://project--2e19146c-07b2-4136-9e0a-69efed8cdf20.lovable.app${ksLogo.url}`,
          sameAs: ["https://instagram.com/estrategia"],
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Estratégia",
          url: "https://project--2e19146c-07b2-4136-9e0a-69efed8cdf20.lovable.app",
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <StorefrontCartProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
      </StorefrontCartProvider>
    </QueryClientProvider>
  );
}
