#!/usr/bin/env python3
"""Per-study GDS theme reaches Preview and the isolated participant runtime."""

from __future__ import annotations

import re
from playwright.sync_api import expect
from playwright_support import eve_browser, eve_server


def main() -> None:
    with eve_server("eve-study-theme") as base, eve_browser() as browser:
        researcher=browser.new_context(viewport={"width":1280,"height":900})
        page=researcher.new_page()
        page.goto(base,wait_until="domcontentloaded")
        expect(page.locator(".home-dashboard")).to_be_visible(timeout=10000)

        page.get_by_role("button",name=re.compile(r"New study")).first.click()
        page.locator(".study-title").fill("GDS themed study")

        page.get_by_role("button",name="Settings →",exact=True).click()
        gds=page.get_by_role("button",name=re.compile(r"GDS"))
        expect(gds).to_be_visible()
        gds.click()
        expect(gds).to_have_attribute("aria-pressed","true")

        page.get_by_role("button",name="← Build",exact=True).click()
        page.get_by_role("button",name="Preview",exact=True).click()
        preview=page.locator(".preview-participant-shell")
        expect(preview).to_have_class(re.compile(r"study-theme-gds"))
        header=preview.locator(".participant-top")
        expect(header).to_have_css("background-color","rgb(11, 12, 12)")
        page.locator(".preview-close-button").click()

        page.get_by_role("button",name="Settings →",exact=True).click()
        page.get_by_role("button",name="Send →",exact=True).click()
        page.get_by_role("button",name="Go live",exact=True).click()
        expect(page.locator(".send-status.live")).to_be_visible(timeout=15000)
        participant_url=page.locator("#send-share-link-all").input_value()

        participant_context=browser.new_context(viewport={"width":390,"height":844})
        participant=participant_context.new_page()
        participant.goto(participant_url,wait_until="domcontentloaded")
        shell=participant.locator(".participant-shell")
        expect(shell).to_have_class(re.compile(r"study-theme-gds"),timeout=15000)
        expect(shell.locator(".participant-top")).to_have_css("background-color","rgb(11, 12, 12)")
        primary=shell.locator(".btn.primary").first
        expect(primary).to_have_css("background-color","rgb(0, 112, 60)")

        participant_context.close()
        researcher.close()

    print("v57.1 Playwright per-study GDS theme journey passed")


if __name__=="__main__":
    main()
