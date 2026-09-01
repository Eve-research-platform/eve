"""Shared Playwright release-test helpers for Eve."""

from __future__ import annotations

import os
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.request
from contextlib import contextmanager
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "test-artifacts" / "browser"


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def wait_http(url: str, timeout: float = 10.0) -> None:
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if 200 <= response.status < 500:
                    return
        except Exception as exc:
            last = exc
        time.sleep(0.1)
    raise RuntimeError(f"Timed out waiting for {url}: {last}")


def system_browser() -> str | None:
    configured = os.environ.get("EVE_CHROMIUM", "").strip()
    candidates = [
        configured,
        shutil.which("chromium") or "",
        shutil.which("chromium-browser") or "",
        shutil.which("google-chrome") or "",
        shutil.which("google-chrome-stable") or "",
    ]
    return next((x for x in candidates if x and Path(x).exists()), None)


def launch_chromium(pw):
    executable = system_browser()
    kwargs = {
        "headless": os.environ.get("EVE_E2E_HEADED", "").lower() not in {"1", "true", "yes"},
        "args": ["--disable-dev-shm-usage"],
    }
    if os.name != "nt":
        kwargs["args"].append("--no-sandbox")
    if executable:
        kwargs["executable_path"] = executable
    try:
        return pw.chromium.launch(**kwargs)
    except Exception as exc:
        raise RuntimeError(
            "Playwright could not launch Chromium. Install a Playwright Chromium "
            "browser with `python -m playwright install chromium`, install system "
            "Chromium, or set EVE_CHROMIUM to the executable."
        ) from exc


@contextmanager
def eve_server(prefix: str = "eve-browser"):
    port = free_port()
    relay_data = Path(tempfile.mkdtemp(prefix=f"{prefix}-data-"))
    base = f"http://127.0.0.1:{port}"
    env = {
        **os.environ,
        "HOST": "127.0.0.1",
        "PORT": str(port),
        "RESEARCHOS_RELAY_DATA": str(relay_data),
        "EVE_PUBLIC_ORIGIN": base,
    }
    server = subprocess.Popen(
        ["node", "server.js"],
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        wait_http(f"{base}/api/health")
        yield base
    finally:
        server.terminate()
        try:
            server.wait(timeout=2)
        except subprocess.TimeoutExpired:
            server.kill()
        shutil.rmtree(relay_data, ignore_errors=True)


@contextmanager
def eve_browser():
    with sync_playwright() as pw:
        browser = launch_chromium(pw)
        try:
            yield browser
        finally:
            browser.close()


def screenshot(page, name: str) -> None:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(ARTIFACTS / name), full_page=True)


def reset_artifacts() -> None:
    shutil.rmtree(ARTIFACTS, ignore_errors=True)
    ARTIFACTS.mkdir(parents=True, exist_ok=True)


def publish_simple_study(page, base: str, title: str = "Browser release gate study") -> str:
    """Create, preview and publish a valid intro-only study using visible UI."""
    import re
    from playwright.sync_api import expect

    page.goto(base, wait_until="domcontentloaded")
    page.wait_for_function("document.querySelector('.home-dashboard') || document.querySelector('.setup-shell')",timeout=10000)
    if page.locator(".setup-shell").count():
        page.get_by_role("button", name="Use local evaluation mode instead").click()
    expect(page.locator(".home-dashboard")).to_be_visible(timeout=10000)

    page.get_by_role("button", name=re.compile(r"New study")).first.click()
    expect(page.locator(".study-title")).to_be_visible()
    page.locator(".study-title").fill(title)

    page.get_by_role("button", name="Preview", exact=True).click()
    expect(page.locator(".preview-wrap")).to_be_visible()
    expect(page.locator(".preview-wrap")).to_contain_text(title)
    page.locator(".preview-close-button").click()

    page.get_by_role("button", name="Settings →", exact=True).click()
    expect(page).to_have_url(re.compile(r"/settings$"))
    page.get_by_role("button", name="Send →", exact=True).click()
    expect(page).to_have_url(re.compile(r"/send$"))

    page.get_by_role("button", name="Go live", exact=True).click()
    expect(page.locator(".send-status.live")).to_be_visible(timeout=15000)
    participant_url = page.locator("#send-share-link-all").input_value()
    if "#/s/" not in participant_url:
        raise AssertionError("Live study did not expose a participant link")
    return participant_url
