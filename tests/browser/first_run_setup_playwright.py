#!/usr/bin/env python3
"""Fresh Eve install opens setup; evaluation escape hatch reaches workspace."""

from playwright.sync_api import expect
from playwright_support import eve_browser,eve_server

def main():
    with eve_server("eve-first-run") as base,eve_browser() as browser:
        context=browser.new_context(viewport={"width":1280,"height":900})
        page=context.new_page()
        page.goto(base,wait_until="domcontentloaded")
        expect(page.locator(".setup-shell")).to_be_visible(timeout=10000)
        expect(page.locator("body")).to_contain_text("Your research stays under your organisation’s control.")
        page.get_by_role("button",name="Use local evaluation mode instead").click()
        expect(page.locator(".home-dashboard")).to_be_visible(timeout=10000)
        context.close()
    print("v58 Playwright first-run setup journey passed")

if __name__=="__main__":main()
