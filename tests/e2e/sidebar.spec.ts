/**
 * E2E: menu lateral fecha ao clicar em item e navega para rota correta.
 *
 * Como executar (dev server em http://localhost:8080):
 *   bunx playwright install chromium
 *   bunx playwright test tests/e2e/sidebar.spec.ts
 */
import { test, expect, devices } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:8080";

const items: Array<{ name: RegExp; path: string }> = [
  { name: /^Dashboard$/, path: "/pdv" },
  { name: /^Venda$/, path: "/pdv/venda" },
  { name: /^Fechamento$/, path: "/pdv/fechamento" },
  { name: /^Manual do sistema$/, path: "/pdv/manual" },
];

async function sidebarIsOpen(page: import("@playwright/test").Page) {
  // shadcn Sidebar expõe data-state="expanded|collapsed" no wrapper
  const wrapper = page.locator('[data-slot="sidebar-wrapper"], [data-state]').first();
  const state = await wrapper.getAttribute("data-state").catch(() => null);
  return state === "expanded" || state === "open";
}

test.describe("Sidebar navegação — Desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const item of items) {
    test(`fecha o menu e abre ${item.path}`, async ({ page }) => {
      await page.goto(`${BASE}/pdv`);
      await expect(page.getByRole("link", { name: item.name }).first()).toBeVisible();
      await page.getByRole("link", { name: item.name }).first().click();
      await expect(page).toHaveURL(new RegExp(item.path.replace(/\//g, "\\/") + "\\/?$"));
      // Sidebar deve ter colapsado
      await expect
        .poll(async () => await sidebarIsOpen(page), { timeout: 2000 })
        .toBeFalsy();
    });
  }
});

test.describe("Sidebar navegação — Mobile", () => {
  test.use({ ...devices["Pixel 7"] });

  test("fecha o sheet e navega em mobile", async ({ page }) => {
    await page.goto(`${BASE}/pdv`);
    // Abre o menu via trigger
    await page.getByRole("button", { name: /toggle sidebar|menu/i }).first().click();
    const link = page.getByRole("link", { name: /^Venda$/ }).first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/pdv\/venda\/?$/);
    // Sheet fechou → link não deve mais estar visível
    await expect(link).toBeHidden();
  });
});
