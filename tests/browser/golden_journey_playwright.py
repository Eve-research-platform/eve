#!/usr/bin/env python3
"""Golden Build → Live → Participate → Review → Insight → Off browser journey."""

from __future__ import annotations

import re

from playwright.sync_api import expect

from playwright_support import (
    eve_browser,
    eve_server,
    publish_simple_study,
    reset_artifacts,
    screenshot,
)


def main() -> None:
    reset_artifacts()
    with eve_server("eve-golden") as base, eve_browser() as browser:
        researcher_context = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = researcher_context.new_page()

        participant_url = publish_simple_study(page, base)
        screenshot(page, "01-send-live.png")

        # A separate browser context proves this is using the encrypted relay,
        # not the researcher's IndexedDB copy.
        participant_context = browser.new_context(viewport={"width": 390, "height": 844})
        participant = participant_context.new_page()
        participant.goto(participant_url, wait_until="domcontentloaded")
        expect(participant.locator(".participant-card")).to_be_visible(timeout=15000)
        expect(participant.locator("body")).to_contain_text("Browser release gate study")
        screenshot(participant, "02-participant-mobile.png")

        complete = participant.get_by_role(
            "button", name=re.compile(r"Complete study|Submit response|Finish")
        )
        expect(complete).to_be_visible()
        complete.click()
        expect(participant.locator("body")).to_contain_text(
            "RESPONSE RECORDED", timeout=15000
        )
        expect(participant.locator("body")).to_contain_text("Thank you")
        screenshot(participant, "03-participant-complete.png")

        # Researcher retrieves and decrypts the relay response.
        page.get_by_role("button", name="Review →", exact=True).click()
        expect(page).to_have_url(re.compile(r"/review$"))
        refresh = page.get_by_role("button", name="Refresh responses")
        if refresh.count():
            refresh.click()

        response_metric = page.locator(".metric-card").filter(has_text="Responses")
        expect(response_metric).to_contain_text(re.compile(r"\b1\b"), timeout=15000)
        screenshot(page, "04-review-response.png")

        # Evidence → Insight.
        page.get_by_role("button", name="+ Add insight", exact=True).click()
        modal = page.locator(".insight-capture-modal")
        expect(modal).to_be_visible()
        modal.get_by_label("Insight title").fill("Browser gate insight")
        modal.get_by_label("Insight", exact=True).fill(
            "The end-to-end browser journey completed successfully."
        )
        modal.get_by_role("button", name="Save insight", exact=True).click()
        expect(modal).to_have_count(0)
        expect(page.locator(".review-evidence-tray")).to_contain_text(
            "1 saved insight", timeout=8000
        )

        # Turn off and prove a new participant cannot enter.
        page.get_by_role("button", name="Turn off", exact=True).click()
        expect(page.locator("body")).to_contain_text("Study turned off", timeout=12000)

        closed_context = browser.new_context(viewport={"width": 390, "height": 844})
        closed = closed_context.new_page()
        closed.goto(participant_url, wait_until="domcontentloaded")
        expect(closed.locator("body")).to_contain_text(
            re.compile(r"Study unavailable|closed|turned off", re.I), timeout=12000
        )
        screenshot(closed, "05-participant-closed.png")

        # Researcher state survives a full reload.
        page.reload(wait_until="domcontentloaded")
        expect(page.locator("body")).to_contain_text(
            "Browser release gate study", timeout=10000
        )

        closed_context.close()
        participant_context.close()
        researcher_context.close()

    print("v57 Playwright golden journey passed")


if __name__ == "__main__":
    main()
