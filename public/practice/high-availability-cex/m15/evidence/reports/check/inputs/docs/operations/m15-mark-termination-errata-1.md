# M15 mark termination errata 1

This amendment corrects the mark interpretation in PLAN 0.18 before M15 qualification.
The original `course/m15-start` contract, its 31 frozen files and its RED report remain
unchanged. This amendment and its original observations have a separate frozen inventory
and the annotated identity `course/m15-errata-1`. M15 completion must verify both inventories.

## Observed discrepancy

The operational run at source `6ece6a8` reached the nonempty cut A and normally closed
all nine runtime roles. Its qualification failed when the first stopped mark was read.
All eighteen complete headers were subsequently read twice from their unchanged files:
the activity timestamp was `-1`, while the schema version and original member PID remained
valid. The retained development diagnostic remains `SYSTEM_ERROR`; this amendment does
not turn that failed run into a passing qualification.

The original pinned Aeron 1.52.2 jars explain these bytes. `ArchiveConductor.onClose()`
calls `ArchiveMarkFile.signalTerminated()`, which calls `signalReady(-1)` and forces the
mark. `ClusterMarkFile.signalTerminated()` writes `-1` to the activity timestamp and forces
the mark; ConsensusModuleAgent and ClusteredServiceAgent call this termination path.
Inspecting only the mark object's `close()` method missed the caller's termination signal.
The original jar hashes, extracted bytecode, live headers, stopped headers, independent
read times and original role/stop traces are retained in `m15-errata-1/observation.json`
and its bound files. The post-run read times are separate from the original stop times.

## Corrected stopped-mark contract

The emitted stop receipt uses `matching.m15.stop-receipt.v2`. Its other fields, ordering,
identities, artifact references and all-role deadlines preserve the original contract.
Each of its eighteen mark observations additionally records `lastLiveActivityTimestamp`
and `inactiveReason`. The old v1 schema remains immutable and is not used to validate v2.

Live observations still require a positive timestamp and the actual current PID. After
the role's original EOF, successful component close and exit zero, a stopped header may
contain either a positive heartbeat or the exact Aeron termination sentinel `-1`.
Zero, other negative values, failed-start version values and changed component/PID
identities fail validation.

For `EXPIRED_HEARTBEAT`, the stopped timestamp must not precede the live timestamp and
the final observed wall clock must exceed that stopped timestamp by more than 10,000 ms.
For `TERMINATED_SENTINEL`, both stopped reads must contain `-1`; the final observed wall
clock must exceed the bound positive live timestamp by more than 10,000 ms. Subtracting
`-1` from the wall clock is never evidence of expiration. Both complete stopped headers
must have equal original bytes, and their controller read times remain at least 100 ms
apart. These rules also govern the separate expired-mark check after C04's expected kill.

The nine-role normal-close proofs, actual PID/startInstant exit observations, no-force
requirement, ninety-second all-stop deadline, eighteen member/component identities and
two independent complete durable-tree inventories remain required. A sentinel alone
does not authorize switching, copying or restoring a live root. No process or validator
may rewrite a mark timestamp to make this check pass.

The backup v1 envelope continues to bind the original cut and stop bytes by length and
SHA-256. Its stopped-state validator recognizes the amended v2 stop representation.
This amendment changes no M14 business, wire, application, snapshot or runtime module,
no original N-1 jar, no named cut program and no capacity input or denominator.

## Freeze and validation

Before the corrected decoder is implemented, `m15Errata1Start` must verify this inventory,
accept all eighteen original live headers and report the existing decoder's rejection of
all eighteen actual terminated headers as `MARK_TERMINATION_NOT_IMPLEMENTED`. It exits
one and emits a bounded structured report. That RED is an amendment start gate only.

After implementation, fresh tests must accept the exact terminated-header representation
only with the full context above and reject malformed, changed-PID, too-recent, mismatched
or incomplete stop observations. Fresh complete M14 and M15 runs, all existing variants,
the final clean completion/product tags, original-byte export and publication gates are
still required. The amendment supplies no operational PASS or product release by itself.
