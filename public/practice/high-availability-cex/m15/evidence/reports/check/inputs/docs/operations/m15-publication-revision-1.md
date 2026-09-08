# M15 publication revision 1

This additive correction follows three failed release CI runs at clean source
`dc818a827a106e5d6117dcd50ef4ca8bcc268c6e`. The same-source candidate CI and local
tagged export passed, but those results do not replace the failed release runs.
The M15 website has not been published. The existing annotated tags
`course/m15-complete` and `matching-1.0.0` retain their original identities;
they must not be moved or described as a completed publication.

## Frozen failure observations

- Product tag run 34206374337: inherited M14 C06 failed after the restarted
  member found an active Cluster mark file. The harness waited for Archive
  liveness only; a later Cluster heartbeat can still be live. Cleanup completed.
- Main run 34206375130: B05 `ISOLATED_COPY_REVALIDATED/P01` launched the real
  selected sink, but the boundary invocation supplied immediate EOF. The observer
  recorded STARTED then FAILED because it had not observed READY before the owner
  exited. The original result remains SYSTEM_ERROR / COMPONENT_FAILURE.
- Course tag run 34206375039: capacity reached the history restart, then directory
  accounting read a disappearing publisher `aeron-20869/publications/3.logbuffer`.
  This transient transport file was never intended to be durable-history input.

Selected original reports, raw records and complete job logs are frozen beside
this document. ZIP members were retrieved through the official artifact API and
validated against their central-directory length and CRC. Raw payload references
retain their original SHA-256. This selected diagnostic set is not the complete
failed-run artifact and makes no replacement qualification claim.

## Narrow corrections and regression obligations

1. Inherited M14 restart keeps the real stopped-PID observation and existing
   Archive predicate, and additionally requires the full native mark liveness
   interval to have elapsed after that process was observed exited. No mark is
   rewritten and no native admission failure is ignored. Existing bounded
   restart deadlines remain. Regression controls cover an older Archive
   heartbeat with a recently stopped process and the strict timeout boundary.
2. The B05 successful boundary probe keeps stdin open until a complete original
   READY record names its actual selected child, run and launch. It then sends
   EOF and still requires real normal close, exit zero and no force cleanup.
   Missing, partial, foreign or wrong-generation READY cannot open this barrier;
   timeout remains SYSTEM_ERROR. Production observer behavior is unchanged.
3. Capacity directory accounting prunes known ephemeral transport directories
   before traversal, including publisher `aeron-<pid>` roots. Durable Archive,
   Cluster, sink journal, output identities and native prior-error logs remain
   measured; unexpected disappearance in those trees still fails. No general
   NoSuchFileException suppression is permitted. Regression controls delete
   volatile buffers and verify durable files and near-miss paths remain measured.

These corrections change qualification tools only. All five production module
trees (the four M14 modules plus matching-operations, including its observer)
remain byte-identical to the failed candidate. The original M15 31-file inventory,
the 47-file mark amendment, Q1/O1, 22 case families, 109 variants, 118 mandatory
probes, 6250 logical arrivals, resource/teardown limits and evidence limits remain
unchanged. SYSTEM_ERROR never becomes a successful negative or mutant kill.

## Corrected release identity and acceptance

The unit remains M15 / PLAN 0.18 with the original start and mark amendment.
This correction is separately frozen as `course/m15-errata-2`. Its inventory and
annotated ancestor identity must be checked by current qualification and export.
The corrected completion tag is `course/m15.1-complete`; the patch product is
`matching-1.0.1`. Both must identify the same exact clean qualified source.
The new check schema is `matching.m15.check.v3`, with releaseTarget matching-1.0.1
and productRelease null; the old v2 schema is retained unchanged. Final evidence
uses the existing common manifest schema and names the corrected product only
after checking both new tags and freshly executing cumulative qualification.

The five lesson permalinks and order remain fixed. The first four titles remain
unchanged; lesson 50 becomes “M15·05：把部署、停止与恢复承诺交付为 matching-1.0.1”.
The old 1.0.0 attempt and its local export remain historical evidence, not current
publication data. Blog registration must consume a new qualified export.

Acceptance requires focused regression controls, a fresh full clean build,
fresh cumulative M14/M13/M15 qualification, same-source candidate CI, both clean
completion tags, a fresh tagged export, all release CI, exact original-byte blog
registration, the complete blog gate, Pages deployment and live route/hash/browser
checks. No failed tag is retargeted and no stale export substitutes for this run.
