#!/usr/bin/env python3
"""Participant submission failure/recovery through the real browser UI."""

from __future__ import annotations

import re

from playwright.sync_api import expect

from playwright_support import eve_browser, eve_server, publish_simple_study


def main() -> None:
    with eve_server("eve-participant-recovery") as base, eve_browser() as browser:
        researcher = browser.new_context(viewport={"width": 1280, "height": 900})
        rpage = researcher.new_page()
        participant_url = publish_simple_study(
            rpage, base, "Browser recovery gate study"
        )

        participant_context = browser.new_context(viewport={"width": 390, "height": 844})
        participant = participant_context.new_page()

        # Fail every response submission until Eve has exhausted its automatic
        # transient retries and presents its recoverable completed-response state.
        failures = {"count": 0}

        def fail_response(route):
            if "/responses" in route.request.url and route.request.method == "POST":
                failures["count"] += 1
                route.fulfill(
                    status=503,
                    content_type="application/json",
                    body='{"reason":"Injected browser-gate outage"}',
                )
            else:
                route.continue_()

        participant.route("**/api/studies/**", fail_response)
        participant.goto(participant_url, wait_until="domcontentloaded")
        expect(participant.locator(".participant-card")).to_be_visible(timeout=15000)

        participant.get_by_role(
            "button", name=re.compile(r"Complete study|Submit response|Finish")
        ).click()

        expect(participant.locator("body")).to_contain_text(
            "Response waiting to send", timeout=15000
        )
        expect(participant.get_by_role("button", name="Retry sending")).to_be_visible()
        if failures["count"] < 2:
            raise AssertionError("Transient response retry policy was not exercised")

        # Restore the network. The participant does not repeat the study.
        participant.unroute("**/api/studies/**", fail_response)
        participant.get_by_role("button", name="Retry sending").click()
        expect(participant.locator("body")).to_contain_text(
            "RESPONSE RECORDED", timeout=15000
        )
        expect(participant.locator("body")).to_contain_text("Thank you")

        # The researcher must still see exactly one logical response.
        rpage.get_by_role("button", name="Review →", exact=True).click()
        refresh = rpage.get_by_role("button", name="Refresh responses")
        if refresh.count():
            refresh.click()
        response_metric = rpage.locator(".metric-card").filter(has_text="Responses")
        expect(response_metric).to_contain_text(re.compile(r"\b1\b"), timeout=15000)

        participant_context.close()
        researcher.close()

    print("v57 Playwright participant recovery journey passed")


if __name__ == "__main__":
    main()
