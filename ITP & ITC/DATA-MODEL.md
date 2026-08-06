# Data model — why it's shaped this way

Short notes on the decisions that aren't obvious from the schema.
Read before changing anything structural.

## Sign-offs are insert-only

`signoffs` has a unique key on `(itc_id, step_index, author_id)`. One row
per person per step. Several people can sign the same step.

This is the single most important property in the system:

- Two workers signing at once → two rows, nothing to merge.
- An offline device replaying its queue → an insert, which cannot
  clobber work done since.
- The history *is* the table, so the audit trail can't drift from it.

Post-signing changes go in `signoff_edits` with a mandatory reason and
the previous text. There is deliberately **no delete policy** on
`signoffs`.

## Photos hang off the ITC, not the step

Nine required photos per ITC — trench, bedding, service, haunching,
cover, tape, backfill, compaction, reinstatement.

Originally these were attached to inspection steps. That was wrong: the
photos are an ITC-level record the client asks for as a set, and tying
them to steps meant a photo taken late had nowhere to go. Slot lives on
the photo row; the ITC's `na_slots` records the ones that don't apply
(haunching, usually).

A slot only counts as a *gap* once something has been signed on the ITC.
An untouched ITC isn't missing photos, it just hasn't started.

## Compaction tests are their own records

One test in a shared trench covers several ITCs, so a test is not a
property of an ITC. `compaction_tests` holds it once; `itc_tests` links
it to every ITC it covers. Location is a point on the site plan
(`mark_x`, `mark_y` as 0–1 fractions), because runs curve and a
chainage along a straight line was meaningless.

## Form definitions are versioned

`form_versions` → `form_steps` → `form_requirements`. An ITC stores
`form_version_id`, so amending a template never rewrites an issued
certificate.

**Never edit a version that issued ITCs point at.** Create a new version,
mark it current, leave the old one alone.

`field_spec` on a step is JSON because the extra fields differ per step —
rover pickers, test links, CCTV outcome with its conditional reason.
Modelling those as columns would mean a migration every time a step
needs a new field.

## Drawings carry the revision, ITCs carry what they were built to

`drawings.current_rev` is the live issue. `itcs.drawing_rev` is what the
work was actually built to. When they differ, the ITC flags red and
can't be issued until someone confirms it against the current revision.

HV and LV share `dwg_group = 'elec'`, so they resolve to the same sheet.
Comms and Comms Mains share `'comms'`. That's why services have a
`dwg_group` rather than a drawing each.

## Pin positions are fractions

Zone pins and test marks store 0–1 fractions of the plan image, not
pixels. Re-export the drawing at a different size and every pin still
lands correctly.

## Conduits are JSON

`itcs.conduits` is `[{"n":4,"size":"100mm"},{"n":2,"size":"50mm"}]`.
A run usually carries several sizes and the count varies, so a pair of
columns wouldn't hold it. Hydraulic and stormwater use the plain `size`
field instead.

## Progress is a chainage log

`progress_log` records how far along the run someone reached on a given
day — not metres done that day. The daily figure falls out of the
difference between consecutive entries, which means a correction to
yesterday automatically fixes today rather than double-counting.

One row per person per ITC per day, upserted, so re-logging replaces
rather than stacking.
