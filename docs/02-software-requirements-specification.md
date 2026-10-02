# 02 — Software Requirements Specification

**Document type:** SRS
**Project:** Museum Ticketing & Booking Platform (working title)
**Source material:** Stakeholder interviews — Zoological Natural History Museum site visit (cashier/front-office),
plus follow-up interviews covering payment settlement, the Finance office's constraints, and
policy decisions on refunds, notices, and capacity.

**Scope note:** This document specifies **what** the system must do. Decisions about **how** it is
built — architecture, data model, specific third-party API calls, schema layout — belong in the
Software Design Specification that follows this SRS, not here.

**System model — two parallel tracks, not one merged system:** the manual/counter process (cash,
Cashier-entered sale, government Receipt Voucher) **is not being replaced.** This project adds a
**separate, additive digital option** (online booking + online payment). The two tracks never share
a ledger — money from each reaches the Finance office through its own path, described in §2.7.

**Localization is a first-class requirement, not a later phase.** Amharic and English must both be
fully supported — in every visitor- and staff-facing feature and every document the system
produces — from the first release. See §2.10.

---

## 1. Roles

**System actors (four only):**

- **Visitor** — books and pays online, or walks in and pays cash at the counter.
- **Cashier** — front-counter staff. Handles cash sales (manual track, unchanged), verifies
  headcount and confirms attendance for digital bookings, and initiates settlement transfers for
  the digital track (§2.7).
- **Museum Manager** — approves group/school bookings submitted through non-digital channels,
  oversees Cashiers, views reporting, controls date availability for online booking (§2.3), and
  configures ticket categories/prices (§2.2).
- **Platform Admin** — system-level configuration: staff accounts.

**External parties (not system users):**

- **Payment aggregator** — processes the Visitor's online payment into a bank account the platform
  itself owns and controls.
- **Finance Office** (of the museum's parent public body) — receives money and physical receipts
  from the Cashier and reconciles independently, in its own systems. Confirmed directly: they
  cannot accept payments landing straight into their account, and reconcile from a receipt the
  Cashier brings them in person.
- **IFMIS** — the government financial system the Finance Office uses internally for its own
  ledger and balance management. See §2.9 for the scope decision on this system's relationship to
  IFMIS.

## 2. Functional Requirements

### 2.1 Accounts & Auth

**Design note (supersedes the original password-based design for Visitors):** industry practice for
attraction/museum ticketing (Section references gathered during requirements review: British Museum
Shop's guest checkout, TicketingHub's magic-link booking management, Ticketure's ticket-tied digital
tickets) and the museum's own personas — Hana booking once for a group of four, Ato Girma looking
for a reference code, neither described as wanting a persistent login — point the same direction:
most Visitors book once or twice and have nothing to gain from creating and remembering a password.
Staff, by contrast, are a small group logging into a money-moving system daily and keep a
conventional password login. The requirements below reflect this split.

**There is one Visitor flow, not two.** This is not a "guest checkout vs. account" choice the
Visitor makes — every Visitor verifies with email + phone (FR-ACC-001) every time, and the system
transparently matches that verification to an existing account or creates one. A first-time booker
and a repeat visitor (e.g., a school that books every term, FR-ACC-004) go through the identical
step; the only difference is that the repeat visitor's history is already there once they verify.

- **FR-ACC-001**: A Visitor verifies their identity **passwordlessly** at the point of booking — a
  one-time code (OTP) sent by SMS to their phone, and a confirmation link sent by email — instead of
  registering with a password. No Visitor password exists anywhere in the system.
- **FR-ACC-002**: Cashier and Museum Manager are staff accounts provisioned by the Platform Admin,
  not self-registered, each scoped to their role's permissions, and each authenticated with a
  password (FR-ACC-005/006) — this is unchanged by the Visitor-facing decision above.
- **FR-ACC-003**: A valid, verified email **and** phone number are both required before a Visitor's
  online booking can be paid for — both are needed because booking notices go out on both channels
  (FR-PAY-005), and completing FR-ACC-001's OTP-and-email-link verification is what satisfies this
  requirement; there is no separate account-creation step to complete in addition to it.
- **FR-ACC-004**: A Visitor can look up and view their own booking history and receipts at any time
  by re-verifying the same email or phone used at booking (a fresh OTP or magic link) — no password
  to remember, and no separate "create an account" step, ever. There is only one path: the system
  automatically matches a verification to an existing account by email/phone if one exists, or
  creates one if it doesn't — so a first-time booker and a repeat visitor (e.g., a school
  coordinator who books every term) go through the identical verification step, and the repeat
  visitor simply sees their full history the moment they verify, with nothing to opt into.
- **FR-ACC-005**: Staff accounts (Cashier, Museum Manager, Platform Admin) authenticate with a
  password, since these are the same small group of people logging in daily to a system that moves
  money — the current JWT-based staff login is unchanged.
- **FR-ACC-006**: A Staff member who forgets their password can request a reset link by email and
  set a new password; this flow exists only for Staff — there is no equivalent for Visitors, since
  Visitors never have a password to forget (FR-ACC-001).
- **FR-ACC-007**: Every Visitor's booking and verification activity is recorded against their
  verified email and phone, whether they've booked once or many times — the account row and its
  history exist identically either way (FR-ACC-004) — so that reporting (§2.8) can include one-time
  and repeat visitors alike without requiring
  everyone to register.

### 2.2 Ticket Categories & Pricing

- **FR-CAT-001**: The system supports configurable visitor categories with distinct prices, seeded
  from current policy: Student (50 ETB), Adult/Teacher (100 ETB), Foreign Resident (300 ETB),
  Non-Resident (500 ETB), Exempt/Free (e.g., AAU staff, on presentation of ID).
- **FR-CAT-002**: Only the Museum Manager can create, edit, or retire a category or change its
  price; changes do not retroactively affect already-issued tickets.
- **FR-CAT-003**: No category carries an automatic group discount.

### 2.3 Bookings, Reservations & Capacity

- **FR-BOOK-001**: An individual Visitor can self-serve: pick a date, category, and quantity, and
  pay online.
- **FR-BOOK-002**: A Visitor can also walk in unannounced and be processed entirely by the Cashier
  at the counter with cash, exactly as today — untouched by this system.
- **FR-BOOK-003**: A school/group visit is booked the same way as an individual one (FR-BOOK-001) —
  same self-serve flow, same instant `awaiting_payment` outcome — with a group name/contact and a
  headcount instead of a single visitor's details. There is no separate Museum Manager approval
  step: `DateAvailability` (FR-BOOK-008) is the only capacity control, and it applies identically
  to individual and group bookings.
- **FR-BOOK-004**: A paid booking generates a booking reference the Visitor or group
  leader presents at the gate.
- **FR-BOOK-005**: A Visitor can cancel a paid online booking only while its status is `Pending`
  (§2.4) — once the Cashier has begun processing arrival for that booking, it can no longer be
  cancelled by the Visitor.
- **FR-BOOK-006**: Cancelling a `Pending` booking triggers a full, automatic refund (§2.6).
- **FR-BOOK-007**: A Visitor can reschedule a `Pending` booking to a different available date,
  instead of cancelling — same eligibility window as cancellation. A booking can be rescheduled
  **at most once**; a second reschedule attempt is rejected, and the Visitor must cancel and rebook
  instead. This cap exists to prevent open-ended rescheduling from being used to avoid ever
  resolving a booking.
- **FR-BOOK-008**: The Museum Manager can close a specific date to further online booking at any
  time — for example, when she judges that day's total visitor capacity (including visitors who
  arrive outside this platform entirely) has been reached. The system does not calculate or track
  overall museum capacity itself; date availability for online booking is entirely the Museum
  Manager's call. Closing a date does not affect bookings already made for it.

### 2.4 Online Payment & Visit Status Lifecycle

Every digital booking moves through a defined lifecycle:
`Pending` → `Visited` / `Cancelled` / `Refunded`.

- **FR-PAY-001**: A Visitor pays online; funds settle into a bank account owned by the platform
  itself — never directly into the Finance Office's account, per the Finance Office's explicit
  constraint that they cannot process payments landing straight into their account.
- **FR-PAY-002**: A booking is only confirmed once the payment is verified as successfully
  completed, never on an unconfirmed client-side redirect alone. On confirmation, the system issues
  the Visitor a temporary receipt and sets the booking's status to `Pending`.
- **FR-PAY-003**: `Pending` means: paid, not yet visited, cancellable/reschedulable, and not yet
  final — the receipt is "temporary" because the final outcome depends on what happens at the visit
  date (§2.5) or on the no-response rule below.
- **FR-PAY-004**: Each online payment is uniquely identifiable, and a duplicate or repeated
  confirmation for the same payment must not be applied more than once.
- **FR-PAY-005**: If a booking's visit date has passed and it is still `Pending` (no attendance
  recorded, not cancelled), the system sends the Visitor a notice — by both email and SMS, with
  email as the primary/default channel — asking them to reschedule (FR-BOOK-007), and stating that
  the booking will be automatically refunded if there is no response within one week. **If the
  Visitor takes no action within one week of that notice, the system automatically refunds the
  full paid amount** (per the refund policy in §2.6) to the original payment method, and the
  booking's status becomes `Refunded`.





### 2.5 Entrance, Headcount Reconciliation & Status Resolution

- **FR-TICKET-001**: At the gate, the Cashier looks up the booking by its reference and records the
  actual number of visitors who showed up, which may be less than or equal to the number booked
  (e.g., booked 20, only 15 arrive).
- **FR-TICKET-002**: The booking's status becomes `Visited` for the attended portion. If the
  attended count is less than the booked count, the shortfall is **not** auto-refunded — the
  Visitor/group leader can request a refund for the unattended portion (§2.6), which the system
  then calculates from the recorded attendance.
- **FR-TICKET-003**: Once the Cashier records attendance, the booking is no longer `Pending` and
  can no longer be cancelled or rescheduled by the Visitor.
- **FR-TICKET-004**: If a Visitor cannot present their booking reference, the Cashier can look the
  booking up by name/payment details and confirm it manually.
- **FR-TICKET-005**: If more visitors show up than were booked, the extra visitors are not admitted
  under the original booking — they must book/pay separately, either online or through the existing
  manual/cash counter, exactly as any other new visitor would.
- **FR-TICKET-006** (ID-verification addendum): A Visitor's stated category (Student,
  Foreign Resident, Exempt, etc.) is a self-declared claim at booking time, attested to rather than
  proven with an uploaded document — a teacher booking for 30 students, or a family of 5, should
  never be required to upload ID for every person online. The actual proof is checked in person,
  at the gate, before check-in: if the Cashier finds a booking's category doesn't match the ID
  presented, she corrects the category on a still-`Pending` booking. If the corrected category
  costs more, the booking is reopened for payment (§2.4's `awaiting_payment`, exactly like a fresh
  booking) for just the difference — the Visitor pays it themselves, from their own device, before
  check-in can proceed; nothing is collected as cash by the Cashier. If the corrected category costs
  less, the difference is refunded automatically (§2.6) and check-in proceeds immediately. Either
  way, the booking's `booked_quantity`/`visitor` are unchanged — only the category and its price.

### 2.6 Refunds

- **FR-REFUND-001**: A refund can be triggered by:
  (a) the Visitor cancelling a `Pending` booking — full refund, automatic, no request needed;
  (b) the Visitor/group leader requesting a refund for a partial-attendance shortfall — requires
  the Visitor to ask;
  (c) the system's own no-response refund (FR-PAY-005) — triggered automatically, with no request
  needed, one week after the no-show notice if the Visitor neither rescheduled nor responded; or
  (d) a Cashier's category correction (FR-TICKET-006) finding the Visitor was overcharged — the
  difference is refunded automatically, with no request needed. Unlike (a)/(c), this never changes
  the booking's own status (it's still open, mid check-in) — only (b)'s partial-shortfall refund
  shares that same "booking stays as it is" property, for the same reason: the booking isn't
  actually over.
- **FR-REFUND-002**: Whenever a refund is triggered, the system determines the refundable amount by
  checking the booking's recorded visit status first (booked quantity vs. attended quantity) — this
  calculation must not depend on a person working it out by hand.
- **FR-REFUND-003**: A refund is returned to the Visitor's original online payment method, **net of
  the payment aggregator's own transaction charge** — that charge is not refundable to the platform,
  so it is not refunded to the Visitor either.
- **FR-REFUND-004**: Every refund is its own recorded transaction, so a booking's final net amount
  is always traceable: original charge minus aggregator fee minus refunded amount.
- **FR-REFUND-005**: A refund issued after a booking's amount has already been included in a
  settlement transfer to the Finance Office (§2.7) must be deducted from a future settlement
  transfer — the Finance Office must see the net figure (revenue minus refunds), never an
  overstated gross figure.

### 2.7 Cashier → Finance Settlement (digital track)

There is no Audit/Finance role in this system — this is a physical hand-off the Cashier performs,
mirroring how the existing cash track already works.

- **FR-SETTLE-001**: Settlement transfers happen in batches, on the Cashier's own timeline — not
  per booking or per payment. A Cashier accumulates `Visited` bookings and transfers their combined
  value together, typically alongside the existing manual-track cash audit, rather than on a fixed
  schedule the system enforces.
- **FR-SETTLE-002**: The Cashier initiates a batch transfer with a single action, covering all
  `Visited` bookings not yet included in a prior transfer, net of any refunds processed against
  them. On completion, the system produces a Transfer Receipt documenting the net amount, the
  bookings it covers, and a reference number.
- **FR-SETTLE-003**: The Cashier physically carries two receipts to the Finance Office for
  reconciliation: the Transfer Receipt from the digital track, and the existing manual-track cash
  deposit slip. The system does not need to unify these into one record; it only needs to produce a
  Transfer Receipt complete enough to stand next to the existing paper one.
- **FR-SETTLE-004**: The Transfer Receipt must carry the same information the Finance Office
  already expects on a formal receipt: amount in figures and in words, purpose/description, date,
  and a reference number.










### 2.8 Reporting & Dashboard

- **FR-REPORT-001**: Museum Manager and Platform Admin can view a dashboard showing revenue,
  visitor counts by category, group vs. individual split, and the current status mix (`Pending` /
  `Visited` / `Cancelled` / `Refunded`) of digital bookings.
- **FR-REPORT-002**: Reports are available at daily, weekly, monthly, and yearly granularity,
  broken down by category and by school/group. "Yearly" follows the organization's budget/fiscal
  calendar (see NFR-RETENTION-001).
  *UAT round 1 clarification:* every report takes one date range (a preset such as today, this
  week, this month, this/last quarter, this fiscal year, last 30 days, or a custom from-to), and
  the granularity of its time series is chosen from the range length. Figures count only
  checked-in (`Visited`) bookings by visit date in Africa/Addis_Ababa time; "visitors" means people
  who actually attended, shown beside the number booked. Revenue is completed payments minus
  completed refunds. No-shows (paid, visit date passed, never checked in) are reported separately
  from shortfall (checked in with fewer people than booked). Each report states these definitions
  on screen, exports to CSV, and prints cleanly for the ministry's quarterly submission.
- **FR-REPORT-003**: The Cashier can see which `Visited` bookings have and haven't yet been
  included in a settlement transfer, so nothing is missed or double-transferred.

### 2.9 Relationship to IFMIS

- **FR-GOV-001**: This system does **not** integrate directly with IFMIS in this phase. The
  Finance Office continues to receive and reconcile the digital track's revenue the same way it
  already reconciles the manual track's — from a physical receipt (§2.7) — and enters it into
  IFMIS through its own existing process.
- **FR-GOV-002**: If a future phase confirms IFMIS offers the museum's parent institution a
  supported way to receive transaction data directly, revisiting this decision is out of scope for
  the current SRS and would be defined separately.

_Rationale (context, not a requirement): IFMIS is a closed, internal government financial system
operated by Finance staff, not a platform documented as open to third-party revenue systems. The
Finance Office's own stated process — reconciling from a receipt a person hands them — confirms
this is the working assumption to build against, not a gap to close later._

### 2.10 Localization (Amharic & English)

- **FR-LOC-001**: Every piece of Visitor- and Cashier-facing text — booking flow, category names,
  status labels, notices, and error messages — is available in both Amharic and English from the
  first release, with the user able to switch language at any time.
- **FR-LOC-002**: Every document the system generates (booking reference/temporary receipt,
  Transfer Receipt, no-show warning) presents its content in both Amharic and English together on
  the same document, not as two separate single-language versions.
- **FR-LOC-003**: Any amount expressed in words on a formal receipt must be rendered in both
  Amharic and English.
- **FR-LOC-004**: Any text content that staff can create or edit — category names, booking
  purpose, notices — must be maintainable in both languages independently, so an update to one
  language does not require guessing or auto-translating the other.

## 3. Non-Functional Requirements

| ID                 | Requirement                                                                                                                                                                                                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NFR-SEC-001        | Payment confirmation is only ever accepted from a verified, authenticated source — never from an unauthenticated client-side signal alone.                                                                                                                                                                                       |
| NFR-IDEMPOTENT-001 | Payment confirmation and settlement actions are safe to retry or repeat without side effects beyond the first successful application.                                                                                                                                                                                            |
| NFR-CONSIST-001    | Every state-changing money operation (payment, refund, settlement transfer) is atomic — it either fully completes or has no effect; partial application must be impossible.                                                                                                                                                      |
| NFR-AUDIT-001      | Every refund and every settlement transfer is logged with the acting Cashier, amount, affected booking(s), and timestamp.                                                                                                                                                                                                        |
| NFR-TEST-001       | Every function that moves money or changes booking status has a defined happy-path and failure-path test case (e.g., partial attendance, already-refunded booking, duplicate payment confirmation).                                                                                                                              |
| NFR-PERF-001       | The dashboard reflects a new sale or status change within a few seconds.                                                                                                                                                                                                                                                         |
| NFR-AVAIL-001      | Connectivity at the museum is reliable enough that no offline/degraded mode is required at this stage.                                                                                                                                                                                                                           |
| NFR-LOCALE-001     | Amharic and English are supported as parallel, equally complete languages across every user-facing feature and generated document from the first release — not a post-launch addition.                                                                                                                                           |
| NFR-RETENTION-001  | Booking, payment, refund, and settlement records are retained for at least one year, aligned to the organization's budget/fiscal calendar. Ethiopian federal government fiscal years conventionally run Hamle 1 to Sene 30 (≈ July 8 to July 7 Gregorian); the exact boundary dates should be confirmed with the Finance Office. |

## 4. Explicitly out of scope for this phase

- Direct technical integration with IFMIS (§2.9) — deliberately excluded, not merely undiscovered.
- Any merging of the manual (cash) track's data into the digital track's records — they stay
  independent per the system model note above.
- Automated, system-calculated museum capacity limits — capacity is managed manually by the Museum
  Manager (FR-BOOK-008).
- Automated group-size discounts.
- Offline/degraded-mode ticket validation at the gate.
- Multi-venue support.

## 5. Open Questions

1. **Exact fiscal-year boundary (NFR-RETENTION-001).** Confirm with the Finance Office whether the
   organization's budget year matches the standard Ethiopian federal cycle (Hamle 1–Sene 30) or
   runs on a different boundary specific to this institution.
