import { expect, test } from "@playwright/test";
import { addTask, fakeSpeech, idbCount, openPlanner } from "./helpers";

const desktopOnly = (name: string) => test.skip(name !== "desktop", "covered on desktop");

test.describe("layout on every device size", () => {
  test("today's planner shows every original section", async ({ page }, info) => {
    await openPlanner(page);
    const names = ["Must Do Today", "Appointments", "Work To-Dos", "Emails / Calls", "Good Things That Happened", "To Buy", "Personal To-Dos", "Exercise", "Meals / Calories", "8 Glasses a Day", "Big Ideas", "Notes"];
    if (info.project.name === "iphone") {
      // Phone: a list of sections that each open on their own.
      for (const n of names) await expect(page.getByRole("button", { name: n, exact: false }).first()).toBeVisible();
      await page.getByRole("button", { name: /Must Do Today/ }).click();
      await expect(page.getByPlaceholder("What matters most today?")).toBeVisible();
      await page.getByRole("button", { name: "All sections" }).click();
    } else {
      for (const n of names) await expect(page.getByRole("heading", { name: n, exact: true })).toBeVisible();
    }
    // No sideways scrolling at any size.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `test-results/layout-${info.project.name}.png` });
  });

  test("phone has a thumb-reachable quick add", async ({ page }, info) => {
    test.skip(info.project.name !== "iphone");
    await openPlanner(page);
    await page.getByRole("button", { name: "Quick add" }).click();
    await page.getByLabel("What do you want to add?").fill("buy oat milk");
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: /To Buy/ }).click();
    await expect(page.getByText("Oat milk")).toBeVisible();
  });
});

test.describe("tasks", () => {
  test("add, check off with undo, reopen, and it persists", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await openPlanner(page);
    await addTask(page, "What matters most today?", "Finish project proposal");
    const box = page.getByRole("checkbox", { name: /Finish project proposal/ });
    await box.click();
    await expect(box).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(/Checked off/)).toBeVisible();
    // Stays on the page after checking.
    await expect(page.getByRole("button", { name: "Edit Finish project proposal" })).toBeVisible();
    await expect(page.getByText("Your priorities are complete. Well done.")).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(box).toHaveAttribute("aria-checked", "false");
    await box.click();
    await page.reload();
    await expect(page.getByRole("checkbox", { name: /Finish project proposal/ })).toHaveAttribute("aria-checked", "true");
    // The ledger keeps both completions and the reopen.
    expect(await idbCount(page, "canvas_task_events", '"kind":"completed"')).toBe(2);
    expect(await idbCount(page, "canvas_task_events", '"kind":"reopened"')).toBe(1);
  });

  test("keyboard: focus a checkbox and press space", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await openPlanner(page);
    await addTask(page, "Add a work to-do…", "Keyboard task");
    const box = page.getByRole("checkbox", { name: /Keyboard task/ });
    await box.focus();
    await page.keyboard.press("Space");
    await expect(box).toHaveAttribute("aria-checked", "true");
  });

  test("details: priority, move section, delete with undo", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await openPlanner(page);
    await addTask(page, "Add a work to-do…", "Send contract");
    await page.getByRole("button", { name: "Details for Send contract" }).click();
    await page.getByRole("dialog").getByLabel("Priority").selectOption("3");
    await page.getByRole("dialog").getByLabel("Section").selectOption("personal");
    await page.getByRole("button", { name: "Close" }).click();
    const personal = page.locator("#section-personal");
    await expect(personal.getByText("Send contract")).toBeVisible();
    await expect(personal.getByLabel("High priority")).toBeVisible();
    await personal.getByRole("button", { name: "Details for Send contract" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(personal.getByText("Send contract")).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(personal.getByText("Send contract")).toBeVisible();
  });

  test("subtasks stay hidden until expanded", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await openPlanner(page);
    await addTask(page, "Add a work to-do…", "Launch site");
    await page.getByRole("button", { name: "Details for Launch site" }).click();
    const step = page.getByPlaceholder("Add a step…");
    await step.fill("Write copy");
    await step.press("Enter");
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByText("0/1 steps")).toBeVisible();
    await expect(page.locator("#section-work").getByText("Write copy")).toHaveCount(0);
    await page.getByText("0/1 steps").click();
    await expect(page.locator("#section-work").getByText("Write copy")).toBeVisible();
  });
});

test.describe("days and rollover", () => {
  test("moving between days, and back to today", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await page.clock.setFixedTime(new Date("2026-10-27T17:00:00Z"));
    await openPlanner(page);
    await expect(page.getByRole("heading", { name: "Tuesday, October 27, 2026" })).toBeVisible();
    await page.getByRole("button", { name: "Next day" }).click();
    await expect(page.getByRole("heading", { name: "Wednesday, October 28, 2026" })).toBeVisible();
    await expect(page.getByText(/Planning ahead/)).toBeVisible();
    await page.getByRole("button", { name: "Previous day" }).click();
    await page.getByRole("button", { name: "Previous day" }).click();
    await expect(page.getByText(/A past page/)).toBeVisible();
    await page.getByRole("button", { name: "Back to today" }).click();
    await expect(page.getByRole("heading", { name: "Tuesday, October 27, 2026" })).toBeVisible();
  });

  test("unfinished tasks carry forward once after days away", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await page.clock.setFixedTime(new Date("2026-10-24T17:00:00Z"));
    await openPlanner(page);
    await addTask(page, "Add a work to-do…", "Carry me");
    await addTask(page, "Add a work to-do…", "Done already");
    await page.getByRole("checkbox", { name: /Done already/ }).click();
    await page.waitForTimeout(300);
    // Three days later, open the planner twice.
    await page.clock.setFixedTime(new Date("2026-10-27T17:00:00Z"));
    await page.reload();
    await openPlanner(page);
    await page.reload();
    await openPlanner(page);
    const work = page.locator("#section-work");
    await expect(work.getByText("Carry me")).toHaveCount(1);
    await expect(work.getByText("Done already")).toHaveCount(0);
    await expect(work.getByTitle(/Carried forward 1 time/)).toBeVisible();
    expect(await idbCount(page, "canvas_task_placements", "2026-10-27")).toBe(1);
    expect(await idbCount(page, "canvas_tasks")).toBe(2); // nothing duplicated or deleted
    // The old page still shows what happened that day.
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Previous day" }).click();
    await expect(page.locator("#section-work").getByText("Done already")).toBeVisible();
  });
});

test.describe("the rest of the page", () => {
  test("water, good things, ideas, notes, meals, exercise persist", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await openPlanner(page);
    await page.getByRole("button", { name: "Fill glass 3" }).click();
    await expect(page.locator("#section-water").getByText("3/8")).toBeVisible();
    await addTask(page, "Something good that happened…", "Lunch with an old friend");
    await addTask(page, "Capture a big idea… (#tags welcome)", "A book on discipline #writing");
    await page.getByLabel("Notes for the day").fill("Remember to stretch.");
    await page.getByLabel("Breakfast description").fill("Greek yogurt");
    await page.getByLabel("Breakfast description").blur();
    await page.getByLabel("New activity").fill("Tennis");
    await page.locator("#section-exercise").getByLabel("Minutes").last().fill("60");
    await page.getByRole("button", { name: "Add exercise" }).click();
    await page.waitForTimeout(900); // notes autosave
    await page.reload();
    await openPlanner(page);
    await expect(page.locator("#section-water").getByText("3/8")).toBeVisible();
    await expect(page.getByLabel("Good thing", { exact: true }).first()).toHaveValue("Lunch with an old friend");
    await expect(page.getByLabel("Idea", { exact: true }).first()).toHaveValue("A book on discipline #writing");
    await expect(page.getByLabel("Notes for the day")).toHaveValue("Remember to stretch.");
    await expect(page.getByLabel("Breakfast description")).toHaveValue("Greek yogurt");
    await expect(page.locator("#section-exercise").getByText("60 min")).toBeVisible();
  });

  test("quick capture understands a sentence and asks before saving", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await page.clock.setFixedTime(new Date("2026-10-27T17:00:00Z"));
    await openPlanner(page);
    await page.keyboard.press("n");
    await page.getByLabel("What do you want to add?").fill("Call John tomorrow morning about the proposal");
    await expect(page.getByRole("radio", { name: "Task" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("dialog").getByLabel("Section")).toHaveValue("comms");
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: "Next day" }).click();
    await expect(page.locator("#section-comms").getByText("Call John about the proposal")).toBeVisible();
  });

  test("unrecognised text is kept, not discarded", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await openPlanner(page);
    await page.keyboard.press("n");
    await page.getByLabel("What do you want to add?").fill("purple elephants dancing");
    await expect(page.getByText(/Not sure where this goes/)).toBeVisible();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.locator("#section-personal").getByText("Purple elephants dancing")).toBeVisible();
  });
});

test.describe("dictation", () => {
  test("transcript is shown and editable before it is saved", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await page.addInitScript(fakeSpeech("ok", "pick up dry cleaning"));
    await openPlanner(page);
    await page.getByRole("button", { name: "Dictate a task" }).first().click();
    await expect(page.getByText("pick up dry cleaning")).toBeVisible();
    await page.getByRole("button", { name: "Insert" }).click();
    const field = page.getByPlaceholder("What matters most today?");
    await expect(field).toHaveValue("pick up dry cleaning");
    expect(await idbCount(page, "canvas_tasks")).toBe(0); // not saved yet
    await field.fill("Pick up dry cleaning by 5");
    await field.press("Enter");
    await expect(page.getByText("Pick up dry cleaning by 5")).toBeVisible();
  });

  test("microphone permission denied shows a helpful message", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await page.addInitScript(fakeSpeech("denied"));
    await openPlanner(page);
    await page.getByRole("button", { name: "Dictate a task" }).first().click();
    await expect(page.getByText(/Microphone access is blocked/)).toBeVisible();
    await page.getByRole("button", { name: "Cancel dictation" }).click();
    await expect(page.getByText(/Microphone access is blocked/)).toHaveCount(0);
  });

  test("cancelling dictation inserts nothing", async ({ page }, info) => {
    desktopOnly(info.project.name);
    await page.addInitScript(fakeSpeech("ok", "should not appear"));
    await openPlanner(page);
    await page.getByRole("button", { name: "Dictate a task" }).first().click();
    await expect(page.getByText("should not appear")).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByPlaceholder("What matters most today?")).toHaveValue("");
  });
});
