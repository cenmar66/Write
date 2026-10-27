# Statistics: definitions

All numbers are computed on the device from the task records, day placements and the completion ledger ([`src/lib/canvas/stats.ts`](../../src/lib/canvas/stats.ts)), so past days stay explainable and nothing is double-entered. Tested in `tests/canvas/stats.test.ts`.

**Counted task sections**: Must Do, Work, Personal, Emails/Calls. To Buy items are counted separately as "bought". Sub-steps are not tasks.

| Metric | Definition |
|---|---|
| Planned (day D) | Tasks with a (not removed) placement on D |
| Created (D) | Tasks whose first planned day (`origin_date`) is D. Carrying forward never creates |
| Completed (D) | Tasks currently done with `completed_on = D`. A task completes once, on one day. Reopening removes it |
| Completion rate (D) | planned-and-completed-on-D ÷ planned on D. **No rate** on days with nothing planned |
| Average daily completion (period) | Mean of daily rates over days that had a plan |
| Priorities | Placements in Must Do on D; "all done" when every one was completed on D |
| Priority rate | Priority completions ÷ priority placements over the period |
| Work / Personal / Emails completed | Completed on D, by the task's section |
| Carried (D) | Placements on D that were carried from an earlier day |
| Overdue (D) | Planned on D, due before D, and not completed by D |
| Appointments (D) | Local appointments + cached Google events on D |
| Exercise | Sessions and minutes on D; "exercise days" = days with ≥ 1 session |
| Water goal | Met when glasses ≥ that day's target; counted over days you tracked water |
| Good things / Ideas | Non-empty entries on D |
| Planned vs actual | Sum of estimates vs actual minutes for tasks completed on D (only if you enter them) |
| Recurring habits | For each repeat rule: occurrences in range, and how many were done |
| Most postponed | Tasks with the most carried placements |
| Waiting the longest | Open tasks by age since first planned |
| Most productive day | Weekday with the highest average completed per day |
| Last 30 vs previous 30 | Completed totals and average completion for each 30-day window |

The ledger (`canvas_task_events`) keeps every completed/reopened/carried/moved event with time and local date, so "when did I complete this?" has an exact answer in each task's History.

There is deliberately no overall "productivity score".
