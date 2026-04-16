// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModeSelect } from "./ModeSelect";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

describe("ModeSelect", () => {
  it("allows selecting plan mode for gemini provider", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ModeSelect value="default" onChange={onChange} provider="gemini" />,
    );

    const trigger = container.querySelector(".selector-button");
    expect(trigger).toBeTruthy();
    fireEvent.click(trigger as HTMLElement);

    const planOption = container.querySelector(
      '.selector-option[data-mode-id="plan"]',
    ) as HTMLElement | null;
    expect(planOption).toBeTruthy();
    expect(planOption?.classList.contains("disabled")).toBe(false);

    fireEvent.click(planOption as HTMLElement);
    expect(onChange).toHaveBeenCalledWith("plan");
  });

  it("allows plan mode for claude provider but keeps default disabled", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ModeSelect value="bypassPermissions" onChange={onChange} provider="claude" />,
    );

    const trigger = container.querySelector(".selector-button");
    expect(trigger).toBeTruthy();
    fireEvent.click(trigger as HTMLElement);

    const planOption = container.querySelector(
      '.selector-option[data-mode-id="plan"]',
    ) as HTMLElement | null;
    const defaultOption = container.querySelector(
      '.selector-option[data-mode-id="default"]',
    ) as HTMLElement | null;

    expect(planOption).toBeTruthy();
    expect(defaultOption).toBeTruthy();
    expect(planOption?.classList.contains("disabled")).toBe(false);
    expect(defaultOption?.classList.contains("disabled")).toBe(true);

    fireEvent.click(planOption as HTMLElement);
    expect(onChange).toHaveBeenCalledWith("plan");

    fireEvent.click(defaultOption as HTMLElement);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("keeps plan mode disabled for non-gemini providers", () => {
    const onChange = vi.fn();
    const { container } = render(
      <ModeSelect value="bypassPermissions" onChange={onChange} provider="codex" />,
    );

    const trigger = container.querySelector(".selector-button");
    expect(trigger).toBeTruthy();
    fireEvent.click(trigger as HTMLElement);

    const planOption = container.querySelector(
      '.selector-option[data-mode-id="plan"]',
    ) as HTMLElement | null;
    expect(planOption).toBeTruthy();
    expect(planOption?.classList.contains("disabled")).toBe(true);

    fireEvent.click(planOption as HTMLElement);
    expect(onChange).not.toHaveBeenCalled();
  });
});
