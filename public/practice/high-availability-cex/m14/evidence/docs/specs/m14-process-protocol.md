# M14 Q1 process protocol and frozen input program

This is the pre-implementation plan `0.17` contract, subordinate to `m14.md` for business
semantics. It does not report measurements or implementation completion. Its workload is
`matching-testkit/src/test/resources/m14/workload-v1.json`; the concrete generated corpus is
`generated-corpus-v1.json` in that directory. Q1 values come only from `profile-q1.json`.
All three exact files, this protocol, the main spec and their schemas belong to the immutable
start inventory. No implementation may change a family distribution, reduce an input or
increase a limit after the start tag to obtain PASS.

## Applied-state boundary and controls

The only matching seam is `submit(M14CommandRequest)`, `applyControl(M14ControlRequest)`,
`stateImage()`, `appliedView()` and pure `read(M14AppliedView, M14OutputRead)`. An M14 command
binds genesis, the exact M13 request and optional accountRef. Controls are `GrantPublisher`,
`Acknowledge` and `InstallMarketSnapshotCursor`, with the fields and outcomes in `m14.md`.
Business, book, Execution, Market and control sequences are separate. Grant/ACK control
admission does not consume pending business output quota. Exact retry returns the original
result without new output, cursor movement or further eviction.

After each complete apply/control/restore, the service installs one deeply immutable
`M14AppliedView` in an `AtomicReference`. Each reader takes one reference and never consults
the mutable runtime again for that response. It includes profile/genesis, complete grants,
business cut, controlRevision, both retention floors/tips/ACKs, original canonical retained
bytes and the complete public shard image. A callback must not publish these pieces separately.

The M14 architecture judge must inspect the **new M14 callback-reachable graph**. All paths
from M14 service business/control/snapshot callbacks may perform deterministic typed apply,
validation, memory publication and Aeron snapshot operations only. TCP, filesystem journal,
consumer calls, blocking wait, sleep, selector and process coordination belong to external
adapter/publisher/sink loops. The old M13 architecture result is inherited evidence, not proof
that new M14 callback paths satisfy this obligation. Existing core remains infrastructure-free;
M11 goldens and the complete inherited M10/M11/M12/M13 semantic boundaries remain required.

## Topology, authority and lifecycle

Two independent groups use shard IDs 1/2, Cluster IDs 141/142 and member IDs 0/1/2. Each member
owns a ten-port block; its output read TCP endpoint is offset **6**. Groups have disjoint blocks,
root directories, Aeron directories, archive files and real child JVM PIDs. The suite also owns
two publisher JVMs (one per shard) and one durable protocol-test sink JVM. During takeover,
the old shard-1 publisher remains alive while a replacement starts: initial children >=9,
takeover children >=10. All are on localhost; this is not cross-host fault isolation.

The sink has one DATA TCP endpoint and one ADMIN stdin inherited from its controller. Only
the controller has ADMIN's write end; a publisher cannot call ADMIN through DATA. DATA never
installs a grant, even if a claimed epoch is greater than the current epoch. This trusted local
administration is not production authentication, TLS or a cryptographic consensus proof.

Takeover order is fixed: (1) successful replicated Grant response; (2) exact grant and
controlRevision observed in every live member applied view; (3) controller sends those exact
fields through ADMIN; (4) sink durably appends/forces the grant record; (5) sink returns
`ADMIN_OK`; (6) replacement publisher may send. The stale-publisher guarantee starts at
`ADMIN_OK`. Cluster grant commit and remote sink installation are not atomic. Crash between
them requires controller reconciliation and idempotent ADMIN installation before DATA opens.

ADMIN is canonical JSON, sorted keys, compact UTF-8 plus LF, no duplicate/unknown fields;
one line, including LF, is <= `maxControlRequestBytes` (8192). `INSTALL_GRANT` requires exactly
`type`, `schemaVersion` (`matching.m14.admin.v1`), `requestId` (UUID), `genesisId`, `profileHash`,
`shardId`, `kind`, `consumerId`, `publisherId`, `epoch`, `controlRevision`,
`committedResponseSha256` and `replicas`. Each replica entry requires `memberId`, `processId`,
`appliedBusinessCut`, `controlRevision` and `appliedViewSha256`; exactly the currently live member
set must appear in ascending member order. `ADMIN_OK` echoes every identity plus
`journalRevision` and `journalRecordSha256`, bounded by `maxControlResponseBytes` (8192).
The controller retains original commit/view bytes as bound artifacts; hashes are trace links,
not signatures. Only controller policy connects these observations to trusted administration.

On sink restart, journal grant/profile/genesis are restored before reading DATA. The controller
must compare restored authority with current committed views and perform any missing exact
installation. A DATA reconnect cannot replace this reconciliation. Idle socket loss is allowed;
the stale publisher must retain real cached bytes and its PID, and may reconnect with the old
grant to demonstrate rejection. Do not claim the old socket survived unless it actually did.

## Exact output frame format

All integers are big-endian. Signed `i64` sequence/revision/cut fields are nonnegative and
cannot overflow; shard is positive. UUID is 16 raw bytes. Hash is 32 raw SHA-256 bytes, not hex.
The fixed header is **512 bytes including its four-byte total-frame-length prefix**. Payload
is <=3584 bytes, so the complete frame is <=4096. Reserved bytes and unused typed fields must
be zero. No Java serialization, reflection encoding, JSON display strings or implicit enum
ordinals form this protocol.

| Offset | Width | Field |
| ---: | ---: | --- |
| 0 | 4 | totalFrameBytes, equals 512 + fragmentPayloadBytes |
| 4 | 4 | magic `0x4d313446` (`M14F`) |
| 8 | 2 | version = 1 |
| 10 | 1 | message type code |
| 11 | 1 | kind: EXECUTION=1, MARKET=2 |
| 12 | 4 | flags = 0 |
| 16 | 16 | requestId UUID |
| 32 | 16 | messageId UUID |
| 48 | 32 | genesisId hash |
| 80 | 32 | profileHash |
| 112 | 8 | shardId |
| 120 | 4 | completeMessagePayloadBytes |
| 124 | 4 | zero-based fragmentIndex |
| 128 | 4 | fragmentCount |
| 132 | 4 | this fragmentPayloadBytes |
| 136 | 32 | SHA-256 of complete canonical payload bytes |
| 168 | 32 | semantic batch contentHash / snapshot digest (zero when unused) |
| 200 | 2 | unsigned metadataBytes |
| 202 | metadataBytes | canonical metadata below |
| 202+metadataBytes | remainder to512 | reserved zero bytes |

Metadata encodes, in order: optional grant (u8 presence;0 has **no** grant bytes;1 has i32
publisher-byte-length,1..64 printable ASCII publisher bytes and epoch i64), sequence/read-after/
snapshot-cut i64, floor i64, tip i64, controlRevision i64, requested max batches u16, requested
max bytes i32, applied business cut i64, sink journal revision i64, sink journal record hash32,
consumer code u8, status code u8, cursor digest kind u8 (NONE=0,BATCH=1,MARKET_SNAPSHOT=2).
Maximum valid metadata is166 bytes, so it fits the header without truncating a64-byte publisher
ID. Absent grant is represented by presence0, never a synthetic publisher or epoch. Unused read
limits and journal fields are zero. Zero pad outside metadata is not part of its encoded grant.
Consumer codes are execution-q1=1 and market-q1=2 and must match stream kind. A rejection
before grant installation uses absent grant; successful batch/page/snapshot/receipt requires it.

Type codes: READ_BATCHES=1, READ_SNAPSHOT=2, BATCH=3, SNAPSHOT=4, PAGE_END=5,
DURABLE_ACK=6, ERROR=7, READ_SINK_FRONTIER=8, SINK_FRONTIER=9. Adapter accepts only types 1/2;
sink DATA accepts only 3/4/8. Publishers accept responses appropriate to the request and
connection role. No DATA type represents Grant or Cluster control submission. Unsupported
type, version, enum, reserved byte, role or shape yields a bounded ERROR and connection close.

Status codes: OK=0, STALE_GRANT=1, FOREIGN_GENESIS=2, PROFILE_MISMATCH=3,
CURSOR_AHEAD=4, EXECUTION_GAP_UNRECOVERABLE=5, MARKET_SNAPSHOT_REQUIRED=6,
WRONG_CONSUMER=7, SEQUENCE_GAP=8, CONTENT_CONFLICT=9, FRAME_INVALID=10,
LIMIT_EXCEEDED=11, MESSAGE_EXPIRED=12, ADMIN_RECONCILIATION_REQUIRED=13,
BATCH_EXCEEDS_READ_BUDGET=14.
These are output-transport outcomes, not new business rejection codes.

For BATCH, logical payload is exactly one canonical batch <=65536 bytes, including its own
typed header/digest under `m14.md`. For SNAPSHOT it is exactly one canonical whole-shard public
snapshot <=1048576 bytes. Frame envelope never expands those payload limits. All other message
types have an empty payload: length=512, complete length=0, index=0, count=1 and SHA-256(empty).
Unused contentHash is zero. READ_BATCHES has afterSequence plus requested bounds 1..4 batches
and 1..262144 bytes. A page returns zero to four independent BATCH messages in consecutive order,
then one PAGE_END with the final returned sequence, authoritative floor/tip/grant and the **same
view's** business/control cut. The adapter does not combine a page into an unbounded assembly.
MARKET_SNAPSHOT_REQUIRED does not smuggle a snapshot into ERROR; publisher explicitly issues
READ_SNAPSHOT and receives a separately bounded SNAPSHOT message. READ_SNAPSHOT is MARKET only.

For nonempty payloads, fragmentCount = ceil(total/3584), each non-final fragment is exactly3584
bytes and the final fragment is the positive remainder. Every header field except index,
fragment length and total frame length is identical across the message. One requestId binds
one request; fresh messageId is transport-only and does not change stable batch identity.
Receiver validates prefix/header/declared total and expected type before allocating. It rejects
out-of-order/duplicate index, mixed IDs, missing tail at deadline, changed identity, hash mismatch
or profile overflow. It supports short reads/writes and never assumes one TCP call is a frame.

Only complete reassembly plus final hash, canonical typed decode, identity and sequence checks
can reach sink durable acceptance. Partial bytes never advance a cursor. Expected malformed
frame negative tests PASS only when the production endpoint rejects them as specified; an
unexpected malformed report, parser crash or missing evidence is SYSTEM_ERROR.

## Resource inventories and durable journal

Each adapter has <=2 connections, sink <=4, each connection <=1 incomplete assembly. A work
cycle handles <=16 frames. Idle=2000ms, assembly=5000ms and request=10000ms deadlines are Q1
values, not alternative permission to exceed the suite deadline. Assembly allocation is bounded
by the validated logical message type: 64KiB batch or 1MiB snapshot. An adapter read request is
an empty-payload header and cannot allocate an ingress-sized legacy business buffer.

Publisher queue is <=4 batches and <=262144 encoded bytes. Snapshot is a **separate** <=1MiB
immutable image/assembly, never inserted into this queue. Adapter streams from one captured
image through a <=4096-byte workspace. Publisher validates one snapshot, then streams from the
same image without creating a second queued copy; at most one snapshot image per publisher.
Release old snapshot references on success/failure before requesting another. Report distinct
queue count/bytes, snapshot image count/bytes, assembly count/bytes, connections and frame
workspace high-water marks. Do not call 256KiB a total-memory bound.

Sink acceptance is an append-only transaction with a fixed 512-byte journal header, canonical
payload, 32-byte record SHA-256 and 8-byte commit marker `0x4d3134434f4d4d31` (`M14COMM1`).
Header fields are fixed: magic `M14J`(4), version i32=1(4), total record bytes i32(4),
kind i32 (GRANT=1,BATCH=2,SNAPSHOT=3)(4), journal revision i64(8), previous record hash(32),
payload bytes i32(4), genesis hash(32), profile hash(32), shard i64(8), stream kind i32(4),
publisher string(i32 length +1..64 printable ASCII bytes), epoch i64(8), accepted sequence/cut i64(8), consumer code i32(4),
prior frontier i64(8), new frontier i64(8), content hash(32), control revision i64(8),
committed-response hash(32), then zero padding to512. First previous hash is zero. Record hash
covers header plus payload; marker is excluded. Every record <=maxSinkJournalRecordBytes
(1049600). Payload is empty for GRANT and full canonical bytes for BATCH/SNAPSHOT.

Write complete record, force(true), update in-memory accepted frontier, then return durable ACK
with journal revision/hash. A sink cannot ACK a batch merely because socket writes or parsing
finished. Same identity/same content under the **current installed grant** is duplicate delivery:
return the existing durable frontier without another acceptance record. Same sequence/different
content fails. Old grant is checked before duplicate handling. A grant record carries unchanged
prior/new frontier; no data is invented. Snapshot journal validation applies MARKET cut rules;
Execution never accepts a snapshot record.

Recovery validates all complete records and reconstructs grants, frontiers and public projection.
Only an EOF tail lacking a complete final transaction may be truncated to the last valid record;
record the exact discarded bytes. A complete bad-hash/bad-marker/noncanonical/illegal-sequence
record is not a torn tail and fails closed. Middle corruption cannot be skipped. After recovery,
ADMIN reconciliation precedes DATA. Journal, M13 identity history and M14 operation history
remain retained; pending-output bounds do not imply bounded total history or recovery time.

## Frozen input program

Workload operation names are a finite test DSL, not production endpoints. Each fixed scenario
starts from its declared fresh/imported fixture; matrix branches independently reset to fresh
genesis unless explicitly testing a suffix. Default instrument BTC-USDT, OPEN bootstrap book,
positive unique IDs, account `acct-0`, GTC, group0/NONE. Every generated history independently
starts from route version1/owner `ops-m14`, BTC/ETH→1 and SOL→2, empty resting M13 books and four
accounts. A deterministic deployment UUID is name-derived from `m14-v1/history/<historyId>`;
fixed/process fixtures use their case ID instead. Use UUID.nameUUIDFromBytes(UTF-8 key), without
randomness. Command/control keys append identityPrefix and ascending macro operation ordinal;
correlation keys append attempt ordinal. Slots use producer `m14-producer-<shard>`, epoch1 and
ascending new-command ordinal per shard. Retries preserve commandId and slot; conflicts change
only the explicitly indicated field. `accountRef` is never producer or group identity.

Expected route hashes, book application sequence, current mode/rule and control revision are
bound immediately before the operation from the **independent reference state**, never guessed
from an observed production response. They are dependent identity inputs, not adaptive choice
of a different workload. Core M05 rule fixture versions2/3 use price bands [90,110]/[95,105],
not a new tick-size feature. Mode names are OPEN/CANCEL_ONLY/HALTED; reopen HALTED through
CANCEL_ONLY→OPEN. Every implicit mode transition counts as a concrete business request in the
report. Newly emitted ordinary requests must fit65536 bytes; exact imported old identities use
the separately frozen legacy2097152-byte body /2097265-byte M14 envelope ceiling.

Generator is unsigned SplitMix64 with one global state initially6414. In history-major,
action-minor order consume **exactly four draws per action**, even if a family ignores them.
Each draw adds `0x9e3779b97f4a7c15` modulo2^64; then z=(z xor(z>>>30))*
`0xbf58476d1ce4e5b9`, z=(z xor(z>>>27))*`0x94d049bb133111eb`, return z xor(z>>>31),
all modulo2^64. Family is actionIndex modulo8, never chosen adaptively. The committed corpus
stores all3840 concrete action rows and all15360 unsigned draw words. Execute that corpus and
verify its hash; seed regeneration is only a cross-check and cannot replace frozen rows.

Each history first executes its literal one-command prelude: BTC SELL3 at100 by acct-0. It is
applied **after** empty-resting genesis import and is counted as an extra primitive, not one
of the80 macro-actions. Cycle0 PLACE is fixed to BTC BUY2 at100/GTC/acct-1, guaranteeing at
least48 actual generated Trade records with different maker/taker account assertions. The four
draws are still consumed; all other PLACE parameters remain literal draw-derived corpus values.
CANCEL selects among prelude, previous/current Place actions and an explicit missing ID using
draw0 modulo(cycle+3):0=prelude,1..cycle+1=Place action8*(selection-1),cycle+2=missing.
Its corpus row contains the exact target instrument/order/source/index; terminal targets remain
valid cancellation-rejection cases. It does not automatically erase every new maker.
BOOK_OR_ROUTE_CONTROL appends exactly the declared instrument to both
groups independently at cycle0 for histories divisible by4; otherwise it issues the literal
mode target. Exact retry/conflict alternates by cycle parity. Generated actions are macro-actions,
not a claim of3840 individual business commands: report actual commands, controls, reads,
snapshots, rejections and expanded steps separately, including failed attempts.

`GRANT_AND_DRAIN_ALL_STREAMS` processes shard1 Execution, shard1 Market, shard2 Execution,
shard2 Market in that order: install next publisher grant, validate all retained contiguous
batches with the independent sink projection and ACK the resulting tip. An empty stream needs
no ACK. A Market floor gap requires current whole-shard snapshot installation followed by its
typed cursor control. A local semantic sink must preserve the same logical durable-before-ACK
order; it cannot satisfy a real-process durability witness.

`SATURATE_DRAIN` first drains all streams, then emits exactly32 distinct BTC Place requests with
quantity0, valid price100/order/account: they are applied typed no-effect field rejections with
one Execution batch each. The33rd distinct request must be OUTPUT_BACKPRESSURED with complete
state equality. Replay the first identity while full; install new grants/ACKs while full;
apply a distinct SOL command on shard2 during that window. Drain exactly the contiguous output,
retry the unchanged33rd identity and require its first single apply. No rejected identity was
reserved. Corpus saturation occurs only at action36 in histories0,8,16,24,32,40.

`MARKET_REBUILD` first saves BTC mode, drains output and puts BTC in OPEN through valid transitions. Ten literal
BUY1-lot at price1 / immediate Cancel pairs create20 real public changes with unique IDs from
the corpus. The public cursor saved before those pairs must fall behind the actual16-batch
Market ring. Obtain current whole-shard snapshot, validate every book/status/level, install it
durably, then execute the one declared suffix pair and consume cut+1 onward. Restore the saved
mode before the final drain. All preparation/restoration transitions count as business commands;
all grant/ACK/snapshot-cursor operations count as controls. At most3 mode commands plus22 pair
commands=25 new batches fit32, so drain Execution only at the fixed initial/end boundaries.
`READ_CURSOR_BOUNDARIES` sends the five declared reads against each applicable stream; zero
after eviction must return the explicit kind-specific gap, and above-tip/foreign/wrong consumer
must reject without mutation. `SNAPSHOT_RESTORE_BOTH_SHARDS` roundtrips full snapshots and retries
the most recent original PLACE identity, comparing original response/output references.

Byte-capacity fixture uses16 shard1 books (BTC/ETH plus B00-USDT..B13-USDT),128 distinct SELL
levels100..227 per book, one lot each, 64-byte literal maker/taker accounts. ACK each preload;
then retain one BUY227/128-lot full sweep per book until the **first** byte-bound refusal, with
at most16 attempts. Each successful Market batch has128 trades+128 level deletions=256 records.
The first refusal must be due to pending encoded bytes before batch count32, with unchanged
state; no loop may alter limits or payloads. A separate128-maker BUY227/129-lot GTC adds its
remaining level:257 Market records and OUTPUT_PROFILE_LIMIT. These obligations use actual
typed encoded bytes, not claimed estimates or oversized fake JSON.

Static pre-implementation budget for the exact8-byte names BTC-USDT/ETH-USDT/B00-USDT..B13-USDT:
Trade record =1 variant +6*8 numeric +3*(8+32) rules +1 role count +2*(1+4+64)
accounts =308 bytes; Accepted=154; Execution header/trailer=205; full128-trade sweep=39783.
Six pending sweeps=238698, seven=278481>262144 before count32. Public sweep=128*(34+30)+93
=8285 bytes/256 records. The16-book populated snapshot is35853 bytes. These are derivations,
not measurements; qualification must still assert actual bytes and actual first refusal. No
instrument in this byte fixture has a different length. A changed codec breaking these numbers
must fail the fixed contract rather than silently adjusting the fixture.

`MARKET_LEVEL_SUM_LIMIT_REFUSAL` uses exact decimal strings for i64 lots: first BUY100 quantity
9223372036854775807, then a different order at the same side/price with quantity1. The first
fits the public aggregate; the second cannot be represented as signed i64 and must return
OUTPUT_PROFILE_LIMIT with full state/identity/output unchanged, not SYSTEM_ERROR. Do not parse
these JSON strings through binary64 floating point.

Cumulative ACK0→2 is valid when batches1/2 were generated and the sink durably validated both.
The ACK mutant accepts an **ungenerated future** position, not this valid cumulative jump. Its
production control must refuse future sequence without cursor/eviction delta. Wrong digest,
foreign identity and partial-frame-before-ACK are separate negative obligations.

Large transfer fixture preloads128 distinct levels on each of BTC/ETH, ACKing preload. Capture
actual whole-shard snapshot >4096 bytes; then halt one book and MassCancel its128 orders to
produce an actual Execution batch >4096 bytes. Both must be <=their Q1 payload limit and cross
at least two **application** frames; TCP packet splitting alone is not evidence. Protocol negative
matrices mutate exactly the named field/index/hash in otherwise valid captured canonical input.
Snapshot corruption matrices mutate the named semantic fact and recompute outer checksums;
every candidate must reject before state installation.

## Real fault witnesses, reports and classification

Execute all seven `M14-C01`..`M14-C07` programs in workload order, possibly in one continuously
owned topology. Their independent barriers/proof obligations cannot be merged into one vague
PASS. Publisher/sink pause hooks are external loops, default NONE. Controller observes a
milestone before releasing or killing; elapsed sleep never proves the window. C03 specifically
means durable ACK received **before Cluster ACK submit**, not offered-but-uncommitted consensus.
C04 requires old PID alive at old DATA and old-grant/new-control-ID ACK attempts after ADMIN_OK.
C06 requires six actual Archive completion observations and six snapshot loads plus suffix.

Step deadline45000ms, suite360000ms, teardown45000ms. All per-stage/network deadlines are capped
by remaining suite time. Pump both Aeron clients while waiting on either group. Keep raw process
identity/args, endpoints, component errors, milestone receipts, grant observations, frame bytes,
journal bytes, direct/replica checkpoints, snapshot sidecars and resource high-water counters.
Source payloads are bound by producer-stage relative path+SHA-256, and final inventory preserves
those originally judged bytes. Evidence cannot silently rebind changed files at export time.

New callback reachability evidence, all12 local cases, all3840 generated actions, all7 real
witnesses, eight specified semantic mutants with passing production controls, and throwing
SYSTEM_ERROR control are separately required. The independent oracle uses M07 linear books
and separately written typed account/public/output/cursor projection; Direct/Cluster equality
alone is not that oracle. Unexpected timeout, process/port/protocol/schema/artifact failure or
failed teardown is SYSTEM_ERROR, never a mutant kill. A valid typed behavior differing from
the frozen expectation is STUDENT_FAILURE. A missing/unexecuted obligation cannot count PASS.

Cleanup terminates only owned PIDs, closes their endpoints and proves ports reusable; retain
data/evidence directories. Reports distinguish configured limits from observed high-water marks
and do not infer durability from a returned offer. UNKNOWN never discards pending output.
Completion is finite Q1 only: no Counter/REST, settlement, network exactly-once, total-history
bound, cross-host resilience, production performance, backup/upgrade or M15 release claim.
